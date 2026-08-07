-- ==========================================
-- RTB Sistema — 025: el puente que faltaba entre "conteo aplicado" y
-- "teórico corregido" (hallazgo B-00, contexto/QA_INTEGRAL_2026-08-06.md,
-- primer punto del TODO de CLAUDE.md).
--
-- El problema, dicho corto: inventario_aplicar_conteo() (016:259-302) pasa
-- el conteo a 'aplicado' y copia cantidad_fisica a inventario_existencias,
-- pero nunca toca cantidad_teorica ni genera kardex. Eso NO era un bug —
-- es CIE-DIS-01 literal ("una diferencia sin causa identificada no se
-- ajusta: se declara como hallazgo", ver la cabecera de 013). El bug real
-- era que no había puente: el usuario veía "Aplicado" y tenía que capturar
-- a mano, una por una, cada discrepancia y cada línea de ajuste.
--
-- Lo que hace esta migración: al aplicar un conteo, además de lo de
-- siempre, deja armado el expediente (una inventario_discrepancias por
-- diferencia) y la PROPUESTA (un inventario_ajustes en 'borrador' con sus
-- líneas). El teórico sigue sin moverse ni un gramo aquí. Se mueve cuando
-- ese ajuste recorre enviar → autorizar (por OTRA persona,
-- aju_no_autoaprobacion_chk, 013:197) → aplicar, y esa última ruta es la
-- que escribe inventario_movimientos, el único escritor legítimo de
-- cantidad_teorica (012:144-149, auditado por
-- inventario_verificar_consistencia(), 014:189-202).
--
-- Lo que esta migración NO hace, a propósito:
--   * NO escribe cantidad_teorica (rompería la invariante del kardex).
--   * NO pone salida ni causa_presunta en la discrepancia: eso es juicio
--     humano y dis_causa_chk existe justamente para exigirlo.
--   * NO pone discrepancias.ajuste_id — dis_ajuste_chk (013:387) es una
--     EQUIVALENCIA: ajuste_id sin salida='aju' viola el CHECK, y
--     salida='aju' sin causa+banda viola dis_causa_chk. La liga se hace en
--     el sentido contrario: inventario_ajuste_lineas.discrepancia_id, que
--     no tiene CHECK asociado. La discrepancia se cierra al resolverla
--     (POST /api/inventario/discrepancias/[id]/resolver).
--   * NO autoriza nada. El ajuste nace 'borrador', sin autorizador_id
--     (aju_no_autoaprobacion_chk sigue intacto).
--
-- `language plpgsql` a propósito (gotcha ya documentado en CLAUDE.md:
-- `language sql` valida los objetos referenciados en el CREATE, plpgsql
-- no) y porque el cuerpo tiene control de flujo real.
-- ==========================================


-- =========================================
-- 1. inventario_conteo_generar_ajuste() — el puente, en función propia.
--
--    No va embebido dentro de aplicar_conteo() por dos motivos concretos:
--
--    (a) BACKFILL. Ya hay conteos en 'aplicado' de antes de esta migración
--        (campaña de QA del 2026-08-06). 'aplicado' es un estado terminal
--        (inventario_conteos_before_update(), 016:56-60, no permite
--        ninguna transición desde ahí) — nunca se podría "volver a
--        aplicar" para generarles el puente. Esta función acepta
--        'cerrado' O 'aplicado' y es idempotente: es la puerta de repesca
--        para esos conteos.
--
--    (b) Se puede probar el puente sobre un conteo 'cerrado' sin gastar la
--        transición irreversible a 'aplicado'.
-- =========================================
create or replace function public.inventario_conteo_generar_ajuste(p_conteo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conteo         public.inventario_conteos%rowtype;
  v_actor          uuid := auth.uid();
  v_ajuste_id      uuid;
  v_ajuste_folio   varchar(16);
  v_ajuste_estado  public.ajuste_estado;
  v_discrepancias  integer := 0;
  v_reubicacion    integer := 0;
  v_lineas         integer := 0;
  v_hay_ajustables boolean;
begin
  -- Mismo umbral de rol que aplicar un conteo (E-04: el chequeo vive en la
  -- función, no en la ruta HTTP — así ningún otro camino lo evade).
  if public.current_user_role() not in ('super_admin', 'direccion') then
    raise exception 'Sólo super_admin/direccion generan el ajuste de un conteo.' using errcode = '42501';
  end if;

  -- Guardia explícito: SECURITY DEFINER no aporta JWT. Si alguien la
  -- invoca desde service_role, auth.uid() es NULL y reventaría más
  -- adelante contra el NOT NULL de solicitante_id con un error críptico
  -- (exactamente el modo de fallo de E-03). Mejor fallar aquí y claro.
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;

  -- FOR UPDATE = el punto de serialización. Dos clics simultáneos en
  -- "Aplicar" no generan dos ajustes: el segundo espera aquí y luego ve
  -- el estado ya cambiado.
  select * into v_conteo from public.inventario_conteos where id = p_conteo_id for update;
  if not found then
    raise exception 'Conteo % no encontrado', p_conteo_id using errcode = 'P0002';
  end if;
  if v_conteo.estado not in ('cerrado', 'aplicado') then
    raise exception
      'El puente conteo→ajuste sólo corre sobre un conteo cerrado o ya aplicado (estado actual: %).',
      v_conteo.estado using errcode = '42501';
  end if;

  -- ----- IDEMPOTENCIA (1/3): ¿ya hay un ajuste de este conteo? -----
  -- Sin índice único a propósito: un segundo ajuste manual tipo 'conteo'
  -- sobre el mismo conteo (p.ej. tras un rechazo) es legítimo. La
  -- protección contra el duplicado accidental es el FOR UPDATE de arriba.
  select a.id, a.folio, a.estado
    into v_ajuste_id, v_ajuste_folio, v_ajuste_estado
    from public.inventario_ajustes a
   where a.conteo_id = p_conteo_id
     and a.tipo = 'conteo'
     and a.estado <> 'cancelado'
   order by a.created_at
   limit 1;

  -- ----- 1. Discrepancias, una por línea con diferencia real -----
  -- estado/salida/ajuste_id/hallazgo_id/resuelto_* NO se escriben: la
  -- discrepancia nace 'abierta' y sin resolución (default de la tabla).
  -- Dentro de SECURITY DEFINER el GRANT por columna de 013:529-532 ya no
  -- protege (el owner puede escribirlo todo), así que la restricción se
  -- reproduce a mano aquí: sólo se listan las columnas del snapshot.
  --
  -- Se incluye 'ubicacion_incorrecta' — Paso 0 · Reubicación (CIE-DIS-01
  -- §IV): una pieza mal ubicada genera DOS discrepancias que alguien tiene
  -- que emparejar con discrepancia_par_id. Que aparezca en el registro es
  -- justo lo contrario de "hacer que el problema desaparezca de la
  -- vista". (Pero NO entra en el ajuste — ver el filtro más abajo.)
  --
  -- IDEMPOTENCIA (2/3): not exists por conteo_detalle_id.
  insert into public.inventario_discrepancias (
    conteo_id, conteo_detalle_id, producto_id, ubicacion_id,
    cantidad_teorica, cantidad_fisica, costo_unitario_snapshot
  )
  select d.conteo_id, d.id, d.producto_id, d.ubicacion_id,
         d.cantidad_teorica, d.cantidad_fisica, d.costo_unitario_snapshot
    from public.inventario_conteo_detalles d
   where d.conteo_id = p_conteo_id
     and d.estado_conteo in ('contada', 'recontada', 'no_localizada', 'ubicacion_incorrecta')
     and d.diferencia is not null
     and d.diferencia <> 0
     and not exists (
       select 1 from public.inventario_discrepancias x where x.conteo_detalle_id = d.id
     );

  get diagnostics v_discrepancias = row_count;

  -- Cuántas de las de este conteo son de reubicación: la UI las cuenta
  -- aparte porque NO llevan línea de ajuste y hay que decir por qué.
  select count(*) into v_reubicacion
    from public.inventario_discrepancias x
    join public.inventario_conteo_detalles d on d.id = x.conteo_detalle_id
   where x.conteo_id = p_conteo_id
     and d.estado_conteo = 'ubicacion_incorrecta';

  -- ----- 2. ¿Hay algo que ajustar? -----
  -- El filtro de líneas ajustables es EXACTAMENTE el mismo que usa el
  -- UPDATE de existencias en inventario_aplicar_conteo() (016:281-287): lo
  -- que se aplicó al físico es lo que se propone corregir en el teórico,
  -- ni una línea más. 'ubicacion_incorrecta' queda fuera de los dos: un
  -- ajuste de cantidad sobre la celda equivocada corregiría el número
  -- mintiendo sobre dónde está la pieza.
  select exists (
    select 1 from public.inventario_conteo_detalles d
     where d.conteo_id = p_conteo_id
       and d.estado_conteo in ('contada', 'recontada', 'no_localizada')
       and d.diferencia is not null
       and d.diferencia <> 0
  ) into v_hay_ajustables;

  -- Conteo perfecto (o sólo con reubicaciones): no se crea un ajuste
  -- vacío. inventario_ajustes sin líneas es basura que además el endpoint
  -- /enviar rechaza ("El ajuste necesita al menos una línea").
  if not v_hay_ajustables then
    return jsonb_build_object(
      'discrepancias_generadas',    v_discrepancias,
      'discrepancias_reubicacion',  v_reubicacion,
      'ajuste_id',                  null,
      'ajuste_folio',               null,
      'lineas_ajuste',              0
    );
  end if;

  -- ----- 3. El ajuste, en 'borrador' -----
  -- estado se omite (default 'borrador'); autorizador_id/autorizado_at ni
  -- se mencionan. aju_soporte_chk (013:198-202) se satisface por su
  -- tercera rama (`or estado = 'borrador'`): el soporte documental se
  -- exige al ENVIAR a autorización, no al capturar — y el soporte natural
  -- aquí es el acta firmada del propio conteo, que sube el usuario.
  -- solicitante_id = quien aplica: es quien luego puede pulsar "Enviar"
  -- (enviar/route.ts exige solicitante_id === auth.userId) y quien NO
  -- podrá autorizarlo (aju_no_autoaprobacion_chk, 013:197).
  if v_ajuste_id is null then
    insert into public.inventario_ajustes (tipo, motivo, conteo_id, solicitante_id, created_by)
    values (
      'conteo',
      format(
        'Ajuste propuesto automáticamente al aplicar el conteo %s (%s). Una línea por cada diferencia '
        'medida, ligada a su discrepancia. El inventario teórico NO cambia con este borrador: cambia '
        'cuando este ajuste se envíe, lo autorice otra persona y se aplique (ahí se generan los '
        'movimientos de kardex). Clasifica antes la causa de cada discrepancia — CIE-DIS-01: "una '
        'diferencia sin causa identificada no se ajusta".',
        v_conteo.folio, v_conteo.nombre
      ),
      p_conteo_id, v_actor, v_actor
    )
    returning id, folio, estado into v_ajuste_id, v_ajuste_folio, v_ajuste_estado;
  end if;

  -- ----- 4. Líneas del ajuste -----
  -- IDEMPOTENCIA (3/3) y, sobre todo, INTEGRIDAD: si el ajuste ya salió de
  -- 'borrador' no se le añade nada. ajustes_before_update() congela su
  -- contenido y la política ajuste_lineas_insert lo exigiría — pero
  -- dentro de SECURITY DEFINER esa política no aplica (bypass de RLS por
  -- ser owner), así que la condición se comprueba aquí a mano. Sin esto,
  -- un backfill sobre un conteo cuyo ajuste ya está 'autorizado' le
  -- inyectaría líneas que nadie autorizó.
  if v_ajuste_estado = 'borrador' then
    insert into public.inventario_ajuste_lineas (
      ajuste_id, producto_id, ubicacion_id, discrepancia_id, cantidad_ajuste, costo_unitario
    )
    select v_ajuste_id, d.producto_id, d.ubicacion_id, x.id,
           -- Signada y en unidad base: cantidad_fisica y cantidad_teorica
           -- de conteo_detalles ya lo están (unidad_base_id + conversión
           -- en conteo_detalles_before_update(), 017). Ambas son
           -- numeric(16,4) igual que cantidad_ajuste — la resta es exacta,
           -- así que el CHECK `cantidad_ajuste <> 0` nunca puede saltar
           -- por redondeo dado el filtro `diferencia <> 0`.
           d.cantidad_fisica - d.cantidad_teorica,
           d.costo_unitario_snapshot
      from public.inventario_conteo_detalles d
      join public.inventario_discrepancias x on x.conteo_detalle_id = d.id
     where d.conteo_id = p_conteo_id
       and d.estado_conteo in ('contada', 'recontada', 'no_localizada')
       and d.diferencia is not null
       and d.diferencia <> 0
       and not exists (
         select 1 from public.inventario_ajuste_lineas l
          where l.ajuste_id = v_ajuste_id and l.discrepancia_id = x.id
       );

    get diagnostics v_lineas = row_count;
  end if;

  return jsonb_build_object(
    'discrepancias_generadas',   v_discrepancias,
    'discrepancias_reubicacion', v_reubicacion,
    'ajuste_id',                 v_ajuste_id,
    'ajuste_folio',              v_ajuste_folio,
    'lineas_ajuste',             v_lineas
  );
end;
$$;

comment on function public.inventario_conteo_generar_ajuste(uuid) is
  'Puente conteo→discrepancias→ajuste borrador (CIE-DIS-01). Idempotente: '
  'se puede invocar sobre un conteo cerrado o ya aplicado sin duplicar '
  'nada. NO escribe cantidad_teorica ni clasifica causa/salida — el ajuste '
  'nace en borrador y sin autorizador.';

revoke execute on function public.inventario_conteo_generar_ajuste(uuid) from public, anon;
grant execute on function public.inventario_conteo_generar_ajuste(uuid) to authenticated;


-- =========================================
-- 2. inventario_aplicar_conteo() — mismo contrato de negocio de siempre,
--    ahora con puente y con retorno rico.
--
--    DROP obligatorio: Postgres no permite `create or replace` cambiando
--    el tipo de retorno (42P13: cannot change return type). Verificado que
--    nada en el catálogo depende de ella (ninguna vista, trigger, default
--    ni política la referencia); el único consumidor es la ruta
--    app/app/api/inventario/conteos/[id]/aplicar/route.ts, que la invoca
--    por nombre vía RPC. OJO: el DROP se lleva también los GRANT, por eso
--    se reemiten abajo.
-- =========================================
drop function if exists public.inventario_aplicar_conteo(uuid);

create or replace function public.inventario_aplicar_conteo(p_conteo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conteo    public.inventario_conteos%rowtype;
  v_actor     uuid := auth.uid();
  v_aplicadas integer;
  v_puente    jsonb;
begin
  if public.current_user_role() not in ('super_admin', 'direccion') then
    raise exception 'Sólo super_admin/direccion aplican un conteo al inventario.' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception
      'auth.uid() es NULL: invoca esta función con el cliente del usuario autenticado, no con service_role.'
      using errcode = '28000';
  end if;

  select * into v_conteo from public.inventario_conteos where id = p_conteo_id for update;
  if not found then
    raise exception 'Conteo % no encontrado', p_conteo_id using errcode = 'P0002';
  end if;
  if v_conteo.estado <> 'cerrado' then
    raise exception 'Sólo se aplica un conteo en estado cerrado.' using errcode = '42501';
  end if;

  -- (1) Sin cambios respecto de 016: el físico medido pasa a la columna
  --     física. cantidad_teorica sigue intacta — su único escritor es
  --     inventario_movimientos_before_insert().
  update public.inventario_existencias e
     set cantidad_fisica = d.cantidad_fisica,
         fecha_ultimo_conteo = now(),
         conteo_id_ultimo = p_conteo_id
    from public.inventario_conteo_detalles d
   where d.conteo_id = p_conteo_id
     and d.estado_conteo in ('contada', 'recontada', 'no_localizada')
     and e.producto_id = d.producto_id
     and e.ubicacion_id is not distinct from d.ubicacion_id;

  get diagnostics v_aplicadas = row_count;

  -- (2) NUEVO: expediente + propuesta. Antes del cambio de estado, para
  --     que el helper vea el conteo todavía 'cerrado' y para que, si algo
  --     falla, no quede un conteo 'aplicado' sin puente (todo es una sola
  --     transacción, pero el orden mantiene el invariante legible).
  v_puente := public.inventario_conteo_generar_ajuste(p_conteo_id);

  -- (3) Al final: el cambio de estado dispara after_update_conteos_liberar
  --     (016:335-337), que libera los congelamientos. Nada de lo anterior
  --     inserta inventario_movimientos, así que no hay carrera contra
  --     inventario_congelamiento_activo(). aplicado_at lo estampa
  --     inventario_conteos_before_update() (016:95-98) — es lo que
  --     satisface cnt_aplicado_chk.
  update public.inventario_conteos
     set estado = 'aplicado', aplicado_por = v_actor
   where id = p_conteo_id;

  return v_puente || jsonb_build_object(
    'existencias_actualizadas', v_aplicadas,
    'conteo_folio',             v_conteo.folio
  );
end;
$$;

comment on function public.inventario_aplicar_conteo(uuid) is
  'Aplica un conteo cerrado: copia cantidad_fisica a inventario_existencias, '
  'genera una discrepancia abierta por diferencia y UN ajuste borrador con '
  'sus líneas (025). El teórico NO cambia aquí — cambia al autorizar y '
  'aplicar ese ajuste, único camino que genera kardex. Devuelve jsonb: '
  '{existencias_actualizadas, discrepancias_generadas, discrepancias_reubicacion, '
  'ajuste_id, ajuste_folio, lineas_ajuste, conteo_folio}.';

revoke execute on function public.inventario_aplicar_conteo(uuid) from public, anon;
grant execute on function public.inventario_aplicar_conteo(uuid) to authenticated;

-- El cambio de firma (integer → jsonb) invalida la caché de esquema de
-- PostgREST. Supabase normalmente la recarga sola por event trigger, pero
-- forzarlo evita un 404/PGRST202 intermitente en /rest/v1/rpc/ durante el
-- primer minuto tras la migración.
notify pgrst, 'reload schema';
