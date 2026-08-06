# Sesión 2026-08-06 — Siglas en entidades + imágenes de producto con galería

## Punto de partida

Dos pedidos del dueño del proyecto, en paralelo al trabajo de corrección
de la auditoría QA que corría en otra sesión sobre el mismo repositorio:

1. Poder localizar clientes por **siglas** ("TMEX", "AT&T") — la razón
   social completa o el folio `ENT-000123` no son cómo ventas identifica
   a un cliente en la práctica.
2. Guardar una **imagen de producto** para mostrarla en pantalla, en
   documentos impresos y en cotizaciones, evaluando además si conviene
   una vista de **galería** para el catálogo, y si la imagen debía vivir
   como URL externa o dentro de Supabase.

## 1. Exploración y plan

Dos agentes Explore en paralelo (módulo de entidades, módulo de
productos) mapearon el patrón exacto a replicar: índices únicos parciales
(`uq_contacto_principal_entidad`), triggers de normalización
(`entidades_before_insert/update`), el patrón `revoke update` + lista
completa de `015`, y los dos buckets de Storage existentes
(`comprobantes-bancarios`, `soportes-inventario`) — ambos privados con
URL firmada de 60s.

Antes de escribir el plan se resolvieron cuatro decisiones con el dueño
del proyecto vía `AskUserQuestion` (todas la opción recomendada):

- **Bucket público**, no privado — la razón decisiva: una URL firmada
  caduca, y la foto tiene que seguir funcionando dentro de un PDF, una
  impresión o un correo archivado. Sería el primer bucket público del
  repo; se documentó la regla derivada (dato de tercero → privado, foto
  de catálogo → público).
- **Varias imágenes por producto con una principal**, no una sola.
- `siglas`: opcional, única, MAYÚSCULAS, editable libremente.
- Construir el **formulario de edición de datos generales** de entidad,
  que no existía — la pantalla de detalle era sólo lectura pese a que el
  `PATCH` de la API ya aceptaba esos campos.

Un agente Plan diseñó la implementación completa contra ese contexto y
levantó un riesgo verificado antes de escribir código:
`NEXT_PUBLIC_SUPABASE_URL` no llega al stage `builder` del Dockerfile
(`.dockerignore` excluye los `.env`, el stage no declara `ARG`/`ENV`) —
en un build de producción real cualquier `process.env.NEXT_PUBLIC_*`
leído en código de cliente quedaría `undefined`. Decisión adoptada: todas
las URL públicas de Storage se calculan en servidor y viajan resueltas en
el payload, nunca se arman en el navegador.

## 2. Implementación — Parte A (siglas)

- **`020_entidades_siglas.sql`**: columna `siglas varchar(12)`, `CHECK`
  de formato, índice único parcial + trigram, normalización en los dos
  triggers existentes con `nullif(upper(btrim(...)), '')` — sin el
  `nullif`, un `''` capturado y borrado en el formulario habría chocado
  contra el índice único (`btrim('')` es `''`, no `NULL`). GRANT UPDATE
  reafirmado completo (patrón de `015`).
- Zod (`siglasSchema`), tipo TS, y un mensaje de error de duplicado
  corregido: el regex anterior (`/uq_entidades_rfc|duplicate key/i`)
  habría reportado "Ya existe una entidad con ese RFC" ante cualquier
  colisión, incluida una de siglas — nuevo `lib/entidades/errores.ts`
  que ramifica por nombre de constraint.
- UI: campo en el alta, chip en el listado, avatar y búsqueda; **nuevo**
  `DatosGeneralesCard` editable en la pestaña General del detalle
  (calcado del patrón `GeneralTab` de `producto-detalle.tsx`), con el
  mismo cuidado de convertir `'' → null` antes de enviar el PATCH que ya
  documentaba ese archivo para `marca_id`.

## 3. Implementación — Parte B (imágenes de producto)

- **`021_producto_imagenes.sql`**: tabla con índice único parcial "como
  máximo una principal activa", dos triggers `SECURITY DEFINER` para el
  "al menos una", `GRANT INSERT`/`UPDATE` restringidos por columna
  (`es_principal`/`activo` fuera — gotcha de `inventario_conteos`), RLS
  espejo de `productos`, y el bucket público `productos-imagenes` con
  cero políticas de escritura para `authenticated` sobre
  `storage.objects`.
- API: `POST/GET /api/productos/[id]/imagenes` (subida por `FormData`
  directo al Route Handler, no URL firmada — el servidor deriva
  mime/bytes/extensión del archivo real), `PATCH/DELETE .../[imagenId]`.
- UI: `ImagenUploader` (redimensiona con `<canvas>` a 1600/400px,
  `imageOrientation: 'from-image'` para no invertir fotos de celular),
  toggle tabla/galería en `productos-explorer.tsx`, pestaña "Imágenes" en
  el detalle con marcar-principal/reordenar/quitar.

### El bug real, encontrado verificando antes de que hubiera datos en riesgo

Promover una imagen a principal con un `UPDATE` de una sola sentencia
chocaba con `23505` contra el índice único, pese a que el trigger BEFORE
sí degradaba a la hermana correctamente. Se descartó primero la hipótesis
de un problema de visibilidad MVCC de Postgres reproduciendo el caso en
una tabla temporal aislada — ahí funcionaba bien, lo que apuntó a algo
específico de esta tabla. Causa real: el AFTER trigger de
auto-recuperación escuchaba cambios de `es_principal` **y** de `activo`;
el `UPDATE` anidado que degrada a la hermana (disparado desde dentro del
BEFORE trigger de la fila que se está promoviendo, antes de que esa fila
termine de escribirse) disparaba su propio AFTER trigger, que veía el
estado transitorio "cero principales" y repromovía a la hermana — cuando
la fila original por fin se escribía, la hermana ya había vuelto a `true`.

Corrección en dos migraciones adicionales:
- **`022_producto_imagenes_after_fix.sql`** — el AFTER trigger se
  estrecha a escuchar sólo `activo` (una deactivación genuina), nunca
  `es_principal` solo.
- **`023_producto_imagen_marcar_principal.sql`** — función
  `SECURITY DEFINER` que hace el swap como dos sentencias top-level
  separadas (demover, luego promover), en vez de confiar en que el
  trigger lo resuelva dentro de un único `UPDATE`. El `PATCH` de la API
  la invoca por RPC en vez de hacer `.update({es_principal:true})`
  directo.

Detalle técnico completo (por qué las dos correcciones son necesarias
juntas, no una sola) en `CLAUDE.md` → Gotchas.

## 4. Verificación

- SQL simulando el rol `authenticated` (no como superusuario): duplicado
  de siglas, `nullif` con `''` dos veces sin violar el índice, `42501` al
  forjar `es_principal` en el `INSERT`, ciclo completo de
  promover/desactivar/reactivar sin choque, RLS denegando a roles sin
  permiso, `CHECK` de tamaño de imagen, lectura pública del bucket vs.
  denegación de escritura.
- `get_advisors` sin `ERROR` nuevo tras cada una de las cuatro
  migraciones.
- `docker build --target builder` (TypeScript real,
  `ignoreBuildErrors: false`) exitoso con las rutas nuevas.
- **Clic a clic en la app real**: alta de entidad con siglas → aparece en
  el listado y el avatar; búsqueda por siglas; edición de datos generales
  con persistencia confirmada por SQL directo; subida real de una
  imagen (archivo real, redimensionado por `canvas`) → aparece marcada
  como principal, miniatura visible en la cabecera del producto y en la
  galería del listado.

La sesión de navegador (Claude in Chrome) es compartida con cualquier
otra sesión activa — en este caso, la de corrección QA que corría en
paralelo. El rol logueado cambiaba solo entre pasos (otra sesión haciendo
login/logout con distintos usuarios QA sobre el mismo origen). Cada
resultado de UI se confirmó por SQL directo contra Supabase en vez de
confiar sólo en la pantalla; no se alcanzó a probar clic a clic "quitar
imagen" ni "cambiar principal entre varias fotos" (sí verificados
exhaustivamente por SQL) — queda como repaso rápido pendiente para cuando
no haya otra sesión activa. Detalle de esta interferencia y cómo
detectarla en memoria: `rtb-sesiones-concurrentes`.

## 5. Numeración de migraciones

`018` y `019` ya estaban tomados en disco por trabajo sin commitear de la
sesión de corrección QA (con un desfase adicional: lo aplicado a Supabase
como "018_clientes_limite_credito_grant" está en disco como
`019_clientes_limite_credito_grant.sql`). La migración de siglas se aplicó
a Supabase antes de notar la colisión (quedó registrada como
"018_entidades_siglas"); el archivo local se renombró a `020` después del
hecho para no romper la secuencia en disco, dejando la discrepancia
documentada en la cabecera del propio archivo.

## 6. Documentación

- `CLAUDE.md` — 4 gotchas nuevos (bucket público, `NEXT_PUBLIC_*` ausente
  en `builder`, `nullif` obligatorio con índice único parcial, invariante
  "una sola principal" con partial unique index + trigger), entrada de
  historial, TODO de `soportes-inventario` matizado.
- `db/ESQUEMA.md` — `siglas` en `entidades`, tabla `producto_imagenes`
  completa, sección nueva "Buckets de Storage" (no existía pese a que ya
  había tres).
- `db/procesos/alta-cliente.md` (siglas + edición de datos generales),
  `alta-proveedor.md` (referencia cruzada), `alta-producto.md` (sección
  "Fotos del producto" con tabla de fallos), `README.md` de procesos.
- `contexto/RTB-ENT-01_Modulo_Entidades.md` y
  `RTB-INV-01_Modulo_Productos_Inventario.md` — filas de tabla, rutas de
  UI y notas de fecha actualizadas.
- Memoria: nueva entrada en `rtb-project-overview`, memoria nueva
  `rtb-sesiones-concurrentes` (lección reutilizable: numeración de
  migraciones y sesión de navegador compartida), `MEMORY.md` actualizado.

## Pendiente

- Recorrido clic a clic de "quitar imagen" y "cambiar principal entre
  varias fotos" cuando no haya otra sesión activa sobre el mismo
  navegador (verificado por SQL, no por UI, en esta sesión).
- Reportar aparte al dueño del proyecto el hallazgo de
  `NEXT_PUBLIC_SUPABASE_URL` ausente en el stage `builder` — preexistente,
  fuera de alcance de esta entrega, pero afecta también al login de la
  imagen `runner`.
