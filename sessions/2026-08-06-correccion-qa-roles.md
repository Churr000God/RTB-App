# Sesión 2026-08-06 — Corrección de la campaña de QA por rol

## Punto de partida

Sesión anterior del mismo día había dejado `contexto/AUDITORIA_QA_ROLES_2026-08-06.md`:
primera verificación de la app con sesiones de navegador reales de los 8
roles (hasta entonces sólo se había probado con `super_admin` y SQL
simulando `authenticated`). Encontró que **Conteos Físicos era inoperable
desde la interfaz, para cualquier rol** — no se podía congelar, capturar
ni aplicar un conteo — más 8 errores menores (E-04 a E-11), 9 mejoras de
fricción (M-01 a M-09) y 8 pantallas que faltaban aunque su API ya
existiera (§4). El dueño del proyecto pidió corregir todo.

## 1. Investigación y plan

Lectura completa del documento de auditoría, más tres agentes Explore en
paralelo sobre conteos (rutas API + migración 012), UI de conteos/ajustes/
catálogos, y entidades/sidebar/404. Verificación directa contra Supabase
real (`information_schema.column_privileges`, no sólo
`role_table_grants`) reveló que **la causa raíz que la propia auditoría
atribuye a E-02 estaba mal**: decía "sin ningún GRANT" para
`inventario_conteo_detalles`; el GRANT sí existía, restringido por
columna (es la vista ciega). El bug real era un `select('*')`, que exige
SELECT sobre *todas* las columnas — el fix que insinúa el HINT de
Postgres (ampliar el GRANT) habría destruido la vista ciega. La causa
raíz común de E-01/E-02/E-03 resultó ser la misma: las rutas
`congelar`/`aplicar` usaban `service_role` (sin JWT) para saltarse ese
GRANT restringido, pero eso deja `auth.uid()` en NULL y rompe la autoría.

Plan aprobado: corregir los 11 errores, 9 mejoras y 8 gaps de UI
completos, y limpiar los datos QA atascados conservando la semilla.

## 2. Implementación (8 fases)

- **Fase 0 — `016_qa_correcciones.sql`:** `inventario_congelar_conteo()`
  e `inventario_aplicar_conteo()`, funciones `SECURITY DEFINER` invocadas
  por el cliente del **propio usuario** (no `service_role`) — mismo
  patrón que `inventario_congelamiento_activo()`; congelar quedó además
  atómico (antes 4 escrituras HTTP sueltas). `coalesce` defensivo en los
  triggers de autoría, `GRANT INSERT` de `inventario_congelamientos`
  restringido por columna, liberación automática de congelamientos al
  aplicar/cancelar. Verificado con simulación de rol real por SQL
  (`set local role authenticated` + `set_config`) antes de tocar la API
  — incluida la atomicidad ante un fallo a mitad de camino (0 líneas
  huérfanas). Encontró y corrigió, en el camino, un bug no documentado en
  la auditoría original: `cantidad_fisica` nunca se calculaba al capturar
  (`017_conteo_captura_conversion.sql`) — enmascarado por E-01/E-02,
  nadie había llegado vivo hasta intentar una captura real.
- **Fase 1 — rutas/UI de conteos:** `congelar`/`aplicar`/`detalles`/
  `estado` reescritas sobre las funciones nuevas; botón dedicado
  "Aplicar al inventario" (excluye `congelado`/`aplicado` del generador
  genérico de transiciones); pantalla de liberar congelamiento con
  `MotivoDialog` reutilizable (reemplaza el primer `window.prompt`).
- **Fase 2 — Entidades:** sincronizar `tipo` con el rol al resolver
  `useAuth()`; aprobación de crédito real vía `solicitudes_cambio` (antes
  el aviso era decorativo); `PATCH /api/entidades/[id]/cliente` nuevo
  para editar crédito de una entidad ya existente (regla huérfana:
  `REGLAS_APROBACION.limite_credito` existía y el resolver la aplicaba,
  pero ningún endpoint la originaba) — encontró que `clientes.limite_credito`
  nunca tuvo `GRANT UPDATE` para `authenticated`
  (`019_clientes_limite_credito_grant.sql`).
- **Fase 3 — permisos de UI y navegación:** gate de "Nuevo Conteo"/"Nuevo
  Ajuste"; columna "Nombre" duplicada en catálogos (una línea); módulos
  futuros deshabilitados con "Próximamente" en el sidebar (antes
  `<Link>` real a un 404) + `not-found.tsx` en español; corrección del
  doble resaltado del sidebar y de "Módulos Activos" mal etiquetado.
- **Fase 4 — fricción:** `window.prompt` de "Asignar capturista"
  reemplazado por `<select>` real — encontró que el payload mandaba
  `familia_id`/`ubicacion_id` ambos `null`, algo que el `CHECK` de la
  tabla siempre habría rechazado; `ProductoCombobox`/`UbicacionSelect`
  nuevos (primeros consumidores de `cmdk` en el proyecto, ya estaba en
  `package.json` sin usar); contraseña unificada a 8 caracteres.
- **Fase 5 — los 8 gaps de UI de §4:** pantallas nuevas para crear
  discrepancia, hallazgos (con `HallazgoEstadoBadge`), soporte documental
  de ajuste (subida real con URL firmada al bucket `soportes-inventario`,
  ruta nueva), costo de producto, cuenta bancaria de proveedor (subida
  real, mismo patrón), redefiniciones de unidad, y solicitudes de cambio
  (`/dashboard/solicitudes`, con resolución de nombre de entidad
  server-side ya que `registro_id` es polimórfico).
- **Fase 6 — limpieza de datos QA:** liberar el congelamiento, aplicar
  `AJU-000004` y aprobar la solicitud pendiente, las tres **desde la app
  real** con sesión de `super_admin`/`direccion` — verificación en sí
  misma de las pantallas nuevas, no un `UPDATE` por SQL. Sólo 2 líneas
  huérfanas de un conteo cancelado se limpiaron por SQL directo (no tiene
  sentido una pantalla para eso).
- **Fase 7 — verificación final y documentación** (ver abajo).

## 3. Verificación

1. SQL, simulando cada rol real, incluida la atomicidad de
   `inventario_congelar_conteo()` y el bloqueo de
   `inventario_aplicar_conteo()` para `almacen` a nivel de función, no
   sólo de ruta.
2. **Clic a clic con sesiones reales de navegador** de `almacen` y
   `direccion` — cierra el TODO que llevaba pendiente el proyecto desde
   RTB-INV-01 (nunca se había probado con ese rol). Circuito completo de
   un conteo nuevo (`CNT-000012`) de principio a fin: crear → congelar →
   asignar capturista (selects reales) → capturar (vista ciega real, sin
   teórico) → conciliar → firmar supervisor y gerente de operaciones →
   cerrar → aplicar al inventario. Confirmado por SQL que
   `cantidad_fisica`/`fecha_ultimo_conteo`/`conteo_id_ultimo` quedaron
   escritos y que `aplicado_por` no es NULL. Spot-checks adicionales:
   E-09 (columna Nombre una sola vez en catálogos), E-11 (404 en español
   y con marca).
3. `npx tsc --noEmit` limpio, `docker build --no-cache --target builder`
   (TypeScript real, `ignoreBuildErrors: false`) exitoso, `get_advisors`
   sin `ERROR` nuevo.

Durante la verificación por navegador aparecieron dos interrupciones no
relacionadas con el propio trabajo: un error de compilación transitorio
en un archivo que la sesión concurrente estaba editando en ese momento
(se resolvió solo en cuanto esa sesión terminó su edición), y varias
caídas de la sesión de `qa.almacen` en pleno flujo (401 inesperados) —
ambas se manejaron reintentando, sin necesidad de tocar código propio.

## 4. Trabajo concurrente

Otra sesión trabajó en paralelo sobre el mismo repositorio (siglas de
entidad, imágenes de producto — ver entrada correspondiente en
`CLAUDE.md`). Se verificó tras cada colisión detectada (mismo archivo
tocado por ambas) que ningún cambio se perdiera, y se resolvió una
colisión de numeración de migraciones: el número 018 lo tomaron ambas
sesiones en algún momento; la de esta corrección quedó en
`019_clientes_limite_credito_grant.sql`, la de siglas se renombró aparte
a `020_entidades_siglas.sql` (sin efecto funcional — Supabase versiona
cada migración aplicada por timestamp, no por el nombre del archivo
local).

## 5. Documentación

- `contexto/AUDITORIA_QA_ROLES_2026-08-06.md` — nota de estado al inicio,
  corrección puntual de la causa raíz de E-02 en su lugar original, y
  sección §8 nueva con el resumen completo de la corrección.
- `contexto/CORRECCION_QA_ROLES_2026-08-06.md` (nuevo) — registro
  detallado de la corrección: migraciones, causa raíz real, fases, y la
  nota de trabajo concurrente.
- `db/ESQUEMA.md` — 3 funciones nuevas en la tabla de funciones
  auxiliares, `inventario_congelamientos`/`inventario_conteo_detalles`
  actualizadas (GRANT restringido, cálculo de `cantidad_fisica`, causa
  real de la vista ciega), `clientes.limite_credito` ya no es "sólo
  `service_role`".
- `db/procesos/conteo-fisico.md` — secciones "Congelar"/"Capturar"/
  "Aplicar" actualizadas con la corrección real (antes decían
  "con `service_role`", ya no es cierto).
- `db/procesos/bloqueo-y-aprobaciones.md`,
  `db/procesos/redefinicion-unidad-medida.md`,
  `db/procesos/discrepancias-y-ajustes.md`,
  `db/procesos/alta-producto.md`,
  `db/procesos/cuenta-bancaria-proveedor.md` — sección "Pantalla" nueva
  en cada uno, documentando el gap de UI cerrado.
- `CLAUDE.md` — entrada en "Historial de decisiones"; TODO actualizado
  (se cierran los dos pendientes de RTB-INV-01: recorrido con `almacen`
  y subida real a `soportes-inventario`).
- Memoria del usuario: `rtb-inv01-conteos-roto.md` reescrito de "roto"
  a "corregido" con la causa raíz real; `rtb-project-overview.md` con
  la entrada de esta sesión y el pendiente cerrado.
