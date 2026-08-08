# Sesión 2026-08-08 — PDF de cotización + envío por correo (MailerSend)

## Punto de partida

El dueño del proyecto pidió, en `/dashboard/ventas/cotizaciones/[id]`, dos
capacidades nuevas: (1) generar/ver/imprimir un PDF de la cotización con el
diseño de marca RTB, y (2) mandarlo por correo al cliente adjunto, usando la
API de MailerSend (cuenta y dominio ya verificados por el dueño del
proyecto). Proporcionó una plantilla HTML de ejemplo completa (paleta,
tipografías, layout de tabla de partidas, totales) — pero esa plantilla
venía de **otro sistema**: nombres de campo tipo `C.nombre_de_cotizacion`,
`C.po`, `C.pr`, interés, envío, que no son columnas de `ventas_cotizaciones`.
Había que adaptarla a los datos reales, no copiarla literal.

Decisiones cerradas con el dueño del proyecto antes de implementar
(`AskUserQuestion`):

1. **Motor de PDF: Chromium headless vía Puppeteer dentro de Docker** —
   fidelidad total al HTML/CSS dado, sobre `@react-pdf/renderer` (perdería
   el degradado y el layout de grid) o una API externa de pago (dependencia
   externa + información saliendo del servidor de RTB).
2. El envío de correo es un **botón independiente "Enviar por correo"**,
   usable en cualquier estado (sirve para reenviar) — no toca el botón
   "Enviar" existente (`ventas_cotizacion_enviar()`, 030, que sólo
   transiciona `borrador→enviada` y hoy no manda nada real; sigue así).
3. MailerSend ya tenía cuenta y dominio verificado — sólo hacía falta dejar
   la integración lista esperando las variables de entorno.
4. El destinatario se prellena con el contacto principal de la entidad (o
   `entidades.correo_principal` de respaldo), editable.

## 1. Infra — Chromium en Docker

`Dockerfile`: `apk add chromium nss freetype harfbuzz ca-certificates
ttf-freefont font-noto` en los stages `dev` y `runner` (nunca en `builder`,
ahí sólo se compila Next; en `runner` va **antes** de `USER nextjs`, porque
`apk` necesita root). `ENV PUPPETEER_SKIP_DOWNLOAD=true` +
`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser` — verificado el path
real dentro del contenedor (`which chromium-browser chromium`), no asumido.
`app/package.json`: `puppeteer-core` (nunca `puppeteer` completo — jamás
debe intentar descargar su propio Chromium). Lockfile regenerado dentro de
`node:20-alpine` con `--legacy-peer-deps` (gotcha ya documentado).
`next.config.js`: `experimental.serverComponentsExternalPackages:
['puppeteer-core']` para que el output tracing del standalone lo incluya
correctamente — verificado que `puppeteer-core` aparece en
`.next/standalone/node_modules` sin necesidad de ningún `COPY` manual
adicional en el stage `runner`.

Smoke test real dentro del contenedor (`puppeteer-core.launch()` +
`page.pdf()`) antes de escribir una sola línea de la plantilla — confirmó
7525 bytes de PDF real. Nota operativa: el volumen anónimo de
`node_modules` de `docker-compose.yml` no ve una dependencia nueva sin
`docker compose up -d --force-recreate -V` (recrear también el volumen
anónimo, no sólo el contenedor) — gotcha nuevo, ya se había documentado el
equivalente para `env_file` pero no para `node_modules`.

## 2. Migración `042_ventas_cotizacion_envios.sql`

Bitácora append-only de cada intento de envío (éxito **y** fallo — un
envío que no llegó debe quedar visible, no desaparecer). **Sin** función
`SECURITY DEFINER` a propósito: a diferencia de enviar/aprobar/rechazar/
cancelar, esto no transiciona ningún estado ni toca kardex, es sólo
auditoría — el `INSERT` lo hace el cliente del propio usuario con `GRANT`
por columna (`id`/`enviado_por`/`enviado_at` fuera, tienen default — mismo
mecanismo que impide la escalada de privilegios en `profiles`). Política de
`insert` espejo exacto de `ventas_cotizaciones_update` (037):
`super_admin`/`direccion`/`gerente_comercial` sin restricción, `ventas`
sólo sobre sus propias cotizaciones — deliberadamente **no** copia la
exclusión de `gerente_comercial` que tiene `ventas_cotizacion_enviar()`
(esa exclusión es de la transición de estado, no de mandar un correo). Sin
`GRANT UPDATE`/`DELETE` para `authenticated` bajo ninguna circunstancia.
`cotizacion_id` es `on delete cascade` (coherente con
`ventas_cotizacion_eliminar()`, que borra borradores — el rastro sigue en
`audit_log`, que no cae en cascada).

Verificado con 8 escenarios de SQL simulando rol real
(`set_config('request.jwt.claims', ...)` + `set local role authenticated`,
todo en transacciones con `rollback`):

1. `ventas` dueño de la cotización → `insert` pasa, `enviado_por`/
   `enviado_at` resuelven al actor real por default.
2. `ventas` **no** dueño → `42501` (política RLS).
3. `gerente_comercial` sobre cotización de **otro** vendedor → pasa
   (diferencia deliberada con `/enviar`).
4. `almacen` → `select` ve filas (política role-agnostic), `insert` →
   `42501`.
5. Intento de falsear `enviado_por` con el UUID de otro usuario → `42501`
   **de privilegio de columna** (`GRANT INSERT` restringido), no de RLS —
   confirmado por el mensaje distinto de Postgres.
6. `update`/`delete` sobre una fila propia recién insertada → `42501`
   (sin `GRANT`, ni siquiera llega a evaluar una política).
7. `insert` con `resultado='fallido'` sin `error_detalle` → viola
   `envio_error_chk` (`23514`).
8. Borrar un borrador con un envío ya registrado
   (`ventas_cotizacion_eliminar()`) → no falla, cascada limpia, y
   `audit_log` conserva el `insert` original del envío (confirmado con un
   rol de lectura amplia — `ventas` no ve `audit_log`, comportamiento
   preexistente de esa tabla, no un bug de esta migración).

`get_advisors` sin `ERROR` nuevo (sólo los `WARN` preexistentes del patrón
RPC de todo el repo).

## 3. Capa de datos — `lib/ventas/documento-cotizacion.ts`

Una función `armarDocumentoCotizacion(supabase, cotizacionId)` que arma
todo lo necesario para el documento y hace de guard de acceso (`null` ⇒
404, cubre "no existe" y "RLS no la deja ver" sin distinguir). Cabecera +
entidad + `clientes` (crédito) en una sola query con embed anidado; líneas
activas con `productos`/`unidades_medida`; contacto y dirección principal
de la entidad; vendedor resuelto por **`usuarios_directorio()`** (RPC,
nunca un embed a `profiles` — `profiles_select` limita cada usuario a su
propia fila, un embed dejaría el nombre en blanco para `gerente_comercial`/
`dirección` viendo la cotización de otro vendedor). Imágenes de producto
reutilizando **tal cual** `adjuntarImagenPrincipal()` de
`lib/inventario/imagenes.ts`, convertidas a **data URI inlineado** (nunca
una URL remota — el render de Puppeteer debe ser offline y determinista).
Totales (`subtotal`/`iva`/`total`) calculados con la nueva constante
`IVA_TASA = 0.16` en `lib/ventas/config.ts` — el esquema no tiene columna de
IVA, se calcula sólo para el render (el CFDI real es RTB-PRO-FAC-01, módulo
futuro).

**Bug real encontrado en la primera prueba, no visible leyendo el código a
simple vista**: `productos.marca` (texto libre) se retiró en la migración
`015` a favor de `marca_id → producto_marcas` — la consulta seguía pidiendo
`productos.marca`, PostgREST respondía `42703 column productos_1.marca does
not exist`, y como el código no revisaba `error` (mismo patrón del gotcha
ya documentado sobre `.update()`/`.select()` sin mirar `error`), **toda
cotización con líneas devolvía cero líneas en silencio**. Corregido con el
mismo embed que ya usa `GET /api/productos`
(`productos(codigo_interno, nombre, modelo, producto_marcas(nombre))`).

## 4. Plantilla — `lib/ventas/plantilla-cotizacion.ts`

Adaptación del HTML de ejemplo a los campos reales: PO/PR/interés/envío
eliminados (no existen en este esquema); la rejilla de referencias pasó a
Vendedor/Canal/Vigencia (`vigencia_hasta` real, sin calcular "+15 días" —
si es `null`, "Sujeta a confirmación")/Crédito (`tipo_cliente` +
`dias_credito`). Logo: **no hardcodeado** — leído de
`app/public/logo-rtb.png` y codificado a base64 al vuelo, con caché de
módulo (el blob que pegó el dueño del proyecto en su ejemplo podía estar
desactualizado tras la regeneración con transparencia real del
2026-08-07). Tipografías: Inter + Playfair Display **auto-hospedadas**
(`.woff2` variables descargados de Google Fonts, ~48 KB y ~38 KB, guardados
en `app/public/fonts/` e inlineados en base64) en vez de cargarlas de
Google Fonts en tiempo de render — offline, determinista, sin carrera.
Escape de HTML obligatorio (`escaparHtml()`) en todo campo de texto libre —
Chromium corre con `--no-sandbox`, así que no es cosmético; complementado
con `page.setJavaScriptEnabled(false)` en la generación.

Dos bugs de layout encontrados en la verificación visual (no en la lectura
de código):

- **Paginación**: una cotización de una sola línea se desbordaba a una
  segunda hoja casi en blanco — el pie ornamental repetía el nombre de la
  marca en texto, redundante con el footer real de Puppeteer
  (`generar-pdf.ts`, que ya imprime "RTB Refacciones · Página X de Y" en
  cada hoja), y ese texto extra empujaba el contenido unos milímetros más
  allá de una hoja Letter. Se quitó, dejando sólo la voluta dorada como
  remate.
- **Línea `en_consulta`**: mostraba `$0.00` en precio/importe — cambiado a
  `—`: no tiene precio porque Compras no ha respondido, no porque sea
  gratis.

## 5. Generación de PDF — `lib/ventas/generar-pdf.ts`

Un browser de Puppeteer **por request**, no un pool/singleton — justificado
en el propio archivo: ERP interno de bajo volumen, un pool añade
complejidad permanente (reconexión tras crash, fugas de página,
invalidación en el hot-reload de `next dev`) para ahorrar ~1-2s que el
usuario ya percibe como "generando documento". `--no-sandbox
--disable-setuid-sandbox --disable-dev-shm-usage` (contenedor no-root, sin
`CAP_SYS_ADMIN`). `printBackground:true` (obligatorio o se pierden los
degradados) + `preferCSSPageSize:true` (respeta el `@page` de la
plantilla) + footer real con numeración de página.

## 6. MailerSend — `lib/ventas/mailersend.ts`

`fetch` directo a `POST https://api.mailersend.com/v1/email` (sin SDK, una
sola operación no lo justifica). Éxito = **202 sin cuerpo JSON** — nunca
`.json()` sobre una respuesta vacía; el rastro es el header
`X-Message-Id`. 401/403/422/429 mapeados a mensajes en español. Nunca
lanza: si falta `MAILERSEND_API_KEY`/`MAILERSEND_FROM_EMAIL`, devuelve un
fallo tipado (`configuracion:true`) para que la ruta pueda registrar el
intento en la bitácora en vez de un 500 crudo.

## 7. Rutas API

`GET .../[id]/pdf` (+ `?html=1` para depurar sin Chromium, y plan B si
Puppeteer resultara inviable en algún hosting futuro — el usuario podría
imprimir con Ctrl+P del navegador) — disponible en cualquier estado, mismos
roles que ver la pantalla (`ACCESO_PANTALLA.cotizaciones`). `POST`/`GET
.../[id]/correo` — `POST` con los mismos roles que **editar** la cotización
(`rolesQuePueden('cotizaciones','update')`, deliberadamente distinto del
set más angosto de `/enviar`; la barrera real de fila sigue siendo la
política RLS de `042`). Registra **siempre** en la bitácora, éxito y
fallo, con el cliente del propio usuario — si el propio `insert` de
bitácora falla, sólo se loguea (nunca convertir un correo que ya salió en
un 500 que provoque un reenvío duplicado).

## 8. UI

`[id]/page.tsx`: contacto principal + `ventas_cotizacion_envios` (últimos
10) + nombres de quien envió (vía `usuarios_directorio()`) resueltos en el
Server Component, pasados como props — mismo patrón ya establecido
("el servidor manda", sin `useState(prop)` espejo). `cotizacion-detalle.tsx`:
ancla real `<a target="_blank">` para "Ver / Imprimir PDF" (no
`fetch`+blob, así el visor nativo del navegador da imprimir/descargar
gratis); diálogo "Enviar por correo" (`EnviarCorreoDialog`, calcado de
`AprobarDialog`) usando `useAccionServidor`; sección "Envíos por correo"
con ✅/❌ por intento.

## 9. Verificación

- `npx tsc --noEmit` limpio de forma incremental tras cada archivo (no sólo
  al final).
- `docker build --target builder -f Dockerfile .` (TypeScript real,
  `ignoreBuildErrors:false`) limpio.
- `docker compose --profile prod up --build web-prod`: confirmado
  `puppeteer-core` trazado en el standalone sin `COPY` manual, y Chromium
  lanzando correctamente bajo el usuario no-root `nextjs`.
- PDF real generado dentro del contenedor (no sólo leído en código) para
  tres escenarios: 1 línea; 2 líneas (una con foto real de
  `producto_imagenes`, descuento 10%, y una línea `en_consulta` sin
  producto); **45 líneas** para forzar paginación real — 4 páginas,
  cabecera de tabla repetida en cada una (`thead{display:table-header-group}`
  confirmado), 45/45 SKU presentes en el texto extraído del PDF
  (`pdftotext`), totales exactos ($16,672.50 + $2,667.60 = $19,340.10).
  Datos de prueba (cotizaciones + precios de referencia temporales)
  limpiados después, no eran evidencia QA real.
- Prueba de escape: `<script>alert(1)</script><img src=x onerror=alert(1)>`
  en `observaciones` de una cotización real (`COT-000068`) → se renderiza
  como texto plano en `?html=1`, sin diálogo de alerta. Restaurado el valor
  original después.
- Clic a clic real con `qa.ventas`, vía *magic link* de
  `admin.generateLink({type:'magiclink'})` (sin tocar contraseñas de
  nadie): botón "Ver / Imprimir PDF" abre el documento real en el visor del
  navegador (`Content-Disposition: inline`); diálogo "Enviar por correo"
  prellena destinatario (`qa-siglas@example.com`, correo de la entidad — no
  había contacto principal) y asunto; sin `MAILERSEND_API_KEY` configurada,
  el envío falla con el mensaje esperado en español y queda registrado
  `fallido` en la bitácora, visible en "Envíos por correo" tras recargar.

  Nota: el navegador se compartió con la sesión concurrente del día
  (`sesiones concurrentes`, gotcha ya documentado) — un envío quedó
  registrado con `enviado_por` de la cuenta real de `super_admin`
  ("Administrador RTB") en vez de `qa.ventas`, por mezcla de cookies de
  Supabase Auth por origen entre pestañas de las dos sesiones activas al
  mismo tiempo. No es un defecto del código: la política RLS habría
  bloqueado igual a un rol no autorizado, como ya confirmaron los 8
  escenarios de SQL — sólo confirma, de paso, que un `super_admin` real
  puede insertar sin restricción por la rama esperada de la política.

## 10. Cierre — MailerSend real, mismo día

El dueño del proyecto proporcionó la `MAILERSEND_API_KEY` real más tarde en
la misma sesión. Antes de fijar el remitente se consultó la propia API de
MailerSend (`GET /v1/domains`, `GET /v1/identities`) en vez de asumir:
confirmó que `refacrtb.com.mx` ya estaba verificado (DKIM/SPF activos) y
con historial real de envíos (14,345 totales, 14,128 entregados — **no**
era una cuenta nueva con el límite de "sólo al dueño de la cuenta" que se
había anotado como riesgo), y que no había ninguna identidad de remitente
preconfigurada. Preguntado el correo exacto por `AskUserQuestion`
(proponiendo `cotizaciones@refacrtb.com.mx` como recomendado): el dueño
del proyecto pidió `tbadillob@refacrtb.com.mx` en su lugar — se usó ese.

`app/.env` actualizado (`MAILERSEND_API_KEY`, `MAILERSEND_FROM_EMAIL=
tbadillob@refacrtb.com.mx`) y contenedor recreado (`docker compose up -d
--force-recreate web` — `env_file` sólo se lee al crear el contenedor, no
en caliente). **Envío real confirmado de punta a punta** desde la propia
interfaz (misma cotización `COT-000068`, destinatario el correo personal
del dueño del proyecto como receptor seguro de prueba): MailerSend
respondió `202`, `mensaje_id` real capturado
(`6a777a040053773e125cc7ae`), bitácora con `resultado='exitoso'` y el
✅ visible en "Envíos por correo" tras el refresco automático de
`useAccionServidor`. El envío `fallido` anterior (sin la clave
configurada) se dejó en la bitácora como evidencia de ambos caminos, no
se purgó.

## Pendiente para el dueño del proyecto

- Ninguno de alcance — MailerSend quedó configurado y verificado con un
  envío real. Sin webhook conectado: `resultado='exitoso'` en la bitácora
  significa "el proveedor aceptó el envío" (HTTP 202), no "el cliente lo
  recibió" — un rebote posterior no se refleja. Documentado en el
  comentario de la tabla `042` y en el TODO de `CLAUDE.md`.
