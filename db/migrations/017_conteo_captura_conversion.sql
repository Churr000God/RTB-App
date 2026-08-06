-- ==========================================
-- RTB Sistema — 017: cantidad_fisica nunca se calculaba al capturar
--
-- Hallazgo propio, no listado en contexto/AUDITORIA_QA_ROLES_2026-08-06.md
-- porque E-02 lo enmascaraba por completo: nadie llegó a intentar un PATCH
-- real de captura a través de la UI (permission denied primero). Al
-- corregir E-01/E-02/E-03 (016) y simular el flujo completo con el rol
-- almacen antes de tocar la capa de API, `det_estado_cantidad_chk` rechazó
-- la transición a 'contada' — la app sólo manda `cantidad_capturada` +
-- `unidad_captura_id` (conteoDetalleCapturaSchema, captura/page.tsx), pero
-- `cantidad_fisica` (la columna real que exige el CHECK, que alimenta
-- `diferencia`/`valor_diferencia`, y que `inventario_aplicar_conteo()`
-- copia a existencias) nunca se escribía. La conversión de unidad de
-- captura a unidad base existe ya para el kardex
-- (inventario_movimientos_before_insert(), 011/012) pero nunca se portó
-- a esta tabla porque conteo_detalles_before_update() sólo estampaba
-- autoría.
--
-- Confirmado con los datos QA reales: la única línea 'contada' que existe
-- hoy (CNT-000004 / QA-PROD-B) tiene cantidad_fisica=38 sólo porque el
-- equipo de QA la escribió a mano por SQL durante la campaña (documentado
-- en AUDITORIA_QA_ROLES_2026-08-06.md §6, advertencia 4) — nunca a través
-- de este PATCH.
--
-- 'recontada' queda fuera a propósito: recontar/route.ts ya manda
-- cantidad_fisica explícito (= cantidad_fisica_recuento, sin unidad —
-- el recuento siempre es en unidad base), y ese camino nunca estuvo roto.
-- 'no_localizada' es un caso aparte: det_estado_cantidad_chk exige
-- cantidad_fisica = 0 exacto, no derivado, y unidad_captura_id puede venir
-- vacío en ese botón (línea recién cargada, sin captura previa).
-- ==========================================

create or replace function public.conteo_detalles_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_factor numeric;
  v_unidad_contenido uuid;
begin
  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.estado_conteo is distinct from old.estado_conteo then
    if new.estado_conteo = 'no_localizada' then
      new.cantidad_fisica := 0;
    elsif new.estado_conteo in ('contada', 'ubicacion_incorrecta') then
      if new.cantidad_capturada is null or new.unidad_captura_id is null then
        raise exception 'Captura la cantidad y la unidad para este estado.' using errcode = '23514';
      end if;
      if new.unidad_captura_id = new.unidad_base_id then
        v_factor := 1;
      else
        select p.unidad_contenido_id into v_unidad_contenido
          from public.productos p where p.id = new.producto_id;
        if v_unidad_contenido is not null and new.unidad_captura_id = v_unidad_contenido then
          v_factor := coalesce(new.contenido_por_unidad_snapshot, 1);
        else
          raise exception
            'Unidad de captura incompatible con el producto (base %, contenido %).',
            new.unidad_base_id, v_unidad_contenido using errcode = '22023';
        end if;
      end if;
      new.cantidad_fisica := new.cantidad_capturada * v_factor;
    end if;
    -- 'recontada': cantidad_fisica ya viene explícito en el payload
    -- (recontar/route.ts). 'bloqueada': cantidad_fisica sigue NULL.

    if new.estado_conteo in ('contada', 'no_localizada', 'ubicacion_incorrecta') and old.contado_por is null then
      new.contado_por := auth.uid();
      new.contado_at := now();
    elsif new.estado_conteo = 'recontada' then
      if old.contado_por is null then
        new.contado_por := auth.uid();
        new.contado_at := now();
      else
        new.contado_por := old.contado_por;
        new.contado_at := old.contado_at;
      end if;
      new.recontado_por := auth.uid();
      new.recontado_at := now();
    else
      new.contado_por := old.contado_por;
      new.contado_at := old.contado_at;
      new.recontado_por := old.recontado_por;
      new.recontado_at := old.recontado_at;
    end if;
  else
    new.contado_por := old.contado_por;
    new.contado_at := old.contado_at;
    new.recontado_por := old.recontado_por;
    new.recontado_at := old.recontado_at;
  end if;

  return new;
end;
$$;
