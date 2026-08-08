-- ==========================================
-- RTB Sistema — 042: auditoría de envíos por correo de cotizaciones
-- (RTB-VEN-01, "Enviar por correo" con PDF adjunto vía MailerSend)
--
-- NO sustituye ni depende de ventas_cotizacion_enviar() (030): esa función
-- transiciona borrador→enviada y no manda nada real — sigue siendo así,
-- fuera de alcance de esta migración. Este registro es del correo físico:
-- se puede repetir (reenvío) en cualquier estado de la cotización, y guarda
-- también los FALLOS — un envío que no llegó tiene que quedar visible en el
-- detalle, no desaparecer.
--
-- Sin función SECURITY DEFINER a propósito: a diferencia de enviar/aprobar/
-- rechazar/cancelar, esto no es una transición de estado ni toca kardex. El
-- INSERT lo hace el cliente del PROPIO usuario (nunca admin/service_role —
-- RLS es la barrera real, no la UI) con GRANT por columna: id/enviado_por/
-- enviado_at quedan fuera (tienen default), el mismo mecanismo con el que
-- 002 impide la escalada de privilegios en profiles.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

create type public.ventas_envio_resultado as enum ('exitoso', 'fallido');

create table public.ventas_cotizacion_envios (
  id uuid primary key default gen_random_uuid(),
  -- on delete cascade a propósito: ventas_cotizacion_eliminar() (040/041)
  -- borra borradores, y un `restrict` aquí repetiría el mismo bug que 041
  -- corrigió con ventas_consultas_compras (violación de FK cruda al
  -- eliminar). El rastro no se pierde: audit_row() ya dejó la fila completa
  -- en audit_log, que es append-only.
  cotizacion_id uuid not null references public.ventas_cotizaciones(id) on delete cascade,
  para varchar(320) not null,
  cc varchar(320)[] not null default '{}',
  asunto varchar(300) not null,
  mensaje text,
  adjunto_nombre varchar(200),
  resultado public.ventas_envio_resultado not null,
  proveedor varchar(30) not null default 'mailersend',
  -- Header X-Message-Id de la respuesta 202 de MailerSend: es la única
  -- forma de rastrear el correo en su panel si el cliente dice "no me
  -- llegó". NULL si el envío falló o si el proveedor no lo devolvió.
  mensaje_id varchar(120),
  error_detalle text,
  enviado_por uuid references public.profiles(id) default auth.uid(),
  enviado_at timestamptz not null default now(),

  constraint envio_para_chk check (para ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint envio_error_chk check (
    (resultado = 'fallido') = (length(btrim(coalesce(error_detalle, ''))) > 0)
  )
);

comment on table public.ventas_cotizacion_envios is
  'Bitácora append-only de cada intento de envío por correo del PDF de una '
  'cotización (exitoso y fallido). Sin GRANT UPDATE/DELETE bajo ninguna '
  'circunstancia: un envío no se corrige, se repite. MailerSend no está '
  'conectado por webhook: "exitoso" significa que el proveedor ACEPTÓ el '
  'envío (HTTP 202), no que el cliente lo recibió — un rebote posterior no '
  'se ve reflejado aquí. Si eso llega a importar, es una entrega aparte '
  '(endpoint de webhook + columna de estado de entrega).';

comment on column public.ventas_cotizacion_envios.mensaje_id is
  'Header X-Message-Id de la respuesta 202 de MailerSend.';

create index idx_ventas_cot_envios_cotizacion
  on public.ventas_cotizacion_envios (cotizacion_id, enviado_at desc);
create index idx_ventas_cot_envios_enviado_por
  on public.ventas_cotizacion_envios (enviado_por);

-- Privilegios: la barrera previa a RLS (gotcha ya documentado — RLS sin
-- GRANT de tabla falla con 42501, no con "cero filas" en silencio).
revoke all on public.ventas_cotizacion_envios from anon, authenticated;
grant select on public.ventas_cotizacion_envios to authenticated;
-- id/enviado_por/enviado_at quedan FUERA a propósito: tienen default y
-- nadie debe poder falsear quién envió ni cuándo.
grant insert (cotizacion_id, para, cc, asunto, mensaje, adjunto_nombre,
              resultado, proveedor, mensaje_id, error_detalle)
  on public.ventas_cotizacion_envios to authenticated;
-- Sin GRANT UPDATE ni DELETE para authenticated: append-only.
grant all on public.ventas_cotizacion_envios to service_role;

alter table public.ventas_cotizacion_envios enable row level security;

-- SELECT: mismo criterio que ventas_cotizaciones_select (030) — cualquier
-- rol con perfil ve la bitácora de una cotización que ya puede ver. Quién
-- ENTRA a la pantalla lo decide ACCESO_PANTALLA.cotizaciones
-- (lib/ventas/permisos.ts), no esta política.
create policy ventas_cotizacion_envios_select on public.ventas_cotizacion_envios
  for select to authenticated
  using (public.current_user_role() is not null);

-- INSERT: espejo exacto de ventas_cotizaciones_update (037) —
-- super_admin/direccion/gerente_comercial sin restricción, 'ventas' sólo
-- sobre sus propias cotizaciones. Deliberadamente NO se copia la exclusión
-- de gerente_comercial que tiene ventas_cotizacion_enviar() (030): esa
-- exclusión es de la TRANSICIÓN de estado, no de mandar un correo.
create policy ventas_cotizacion_envios_insert on public.ventas_cotizacion_envios
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ventas_cotizaciones c
       where c.id = ventas_cotizacion_envios.cotizacion_id
         and (
           public.current_user_role() = any (array['super_admin', 'direccion', 'gerente_comercial'])
           or (public.current_user_role() = 'ventas' and c.vendedor_id = (select auth.uid()))
         )
    )
  );

-- Sin política de UPDATE/DELETE: no hay GRANT para authenticated en esas
-- acciones, así que ninguna política llegaría a evaluarse — Postgres
-- deniega en el privilegio de tabla antes de llegar a RLS.

create trigger audit_ventas_cotizacion_envios
  after insert or update on public.ventas_cotizacion_envios
  for each row execute function public.audit_row();
