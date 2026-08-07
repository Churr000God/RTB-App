# CLAUDE.md — RTB Sistema

Instrucciones que se cargan en cada sesión de Claude Code para este proyecto.

## Qué es el proyecto

Sistema ERP interno modular para **Refacciones Tomás Badillo, S.A. de C.V.** Reemplaza
Notion como herramienta de gestión interna. Parte de un módulo base (Autenticación y
Permisos) generado con AbacusAI y adoptado como punto de partida el 2026-08-04.

## Stack y cómo correrlo

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/Radix
- **Backend/DB:** Supabase (Auth email/password + PostgreSQL + RLS) — proyecto
  `RTB-App` (ref `dgafffpbhktxadiqmmwl`, región ca-central-1)
- **Contenedor:** Docker + docker-compose
- **No usa NextAuth ni Prisma** — usa Supabase SSR con cookies directamente. Ambas
  librerías (y `lib/db.ts`, `prisma/schema.prisma`) venían del generador sin usarse
  y se retiraron por completo el 2026-08-04 (ver Historial de decisiones)

Arranque:
```bash
docker compose up --build          # http://localhost:3000
```

Desarrollo sin reconstruir la imagen cada vez: `docker compose up` reutiliza el
`target: dev` del Dockerfile con bind mount y hot-reload.

Variables de entorno: `app/.env` (nunca versionado — ver `.gitignore`). Plantilla en
`app/.env.example`.

## Arquitectura y módulos

```
app/
├── app/                  # rutas (App Router): /login, /dashboard, /api/admin,
│   │                     # /api/entidades, /api/proveedores, /api/ubicaciones,
│   │                     # /api/solicitudes-cambio, /api/productos, /api/catalogos,
│   │                     # /api/proveedor-productos, /api/precios-referencia,
│   │                     # /api/redefiniciones-unidad, /api/inventario/*,
│   │                     # /api/mapa/{config,puntos}, /api/geocodificacion, /logout
├── components/
│   ├── auth/             # LoginForm
│   ├── entidades/        # EstadoBadge (RTB-ENT-01)
│   ├── inventario/       # EstadoBadge de producto/conteo/ajuste/discrepancia (RTB-INV-01)
│   ├── mapas/             # MapaPunto, MapaMultiple (mapbox-gl, next/dynamic ssr:false),
│   │                     # CampoCoordenada, PropuestaDireccion
│   ├── layout/           # Sidebar, Header, DashboardShell, AuthProvider
│   └── ui/                # shadcn/Radix
├── lib/
│   ├── supabase/         # client.ts, server.ts, middleware.ts (solo redirects,
│   │                     # sin DB), admin.ts (service_role, server-only),
│   │                     # guards.ts (requireActiveUser/requireRole/requireApiRole)
│   ├── rbac/             # configuración de roles, permisos y hooks
│   ├── entidades/        # config.ts, permisos.ts, schemas.ts (zod), validaciones.ts,
│   │                     # http.ts — capa compartida de RTB-ENT-01
│   ├── inventario/       # config.ts, permisos.ts, schemas.ts (zod), validaciones.ts
│   │                     # — capa compartida de RTB-INV-01 (reutiliza entidades/http.ts)
│   └── mapas/             # config.ts (tokens, server-only), mapbox.ts (Geocoding v6),
│                         # schemas.ts — geocodificación y mapa (entidades + ubicaciones)
├── types/                # tipos TypeScript del sistema (database.ts, entidades.ts,
│                         # inventario.ts)
└── middleware.ts         # protección de rutas con Supabase SSR
db/migrations/            # SQL versionado, aplicado vía MCP apply_migration
contexto/                 # documentos de negocio, marca y specs de cada módulo
```

### Roles (8)
`super_admin`, `direccion`, `ventas`, `compras`, `almacen`, `logistica`,
`facturacion`, `finanzas`

### Módulos
| # | Módulo | Estado |
|---|---|---|
| 1 | Autenticación y Permisos | ✅ Base funcional (auditado 2026-08-04) |
| 2 | RTB-ENT-01 Gestión de Entidades (clientes/proveedores/ubicaciones) | ✅ Base funcional (auditado 2026-08-05) |
| 3 | RTB-INV-01 Productos, Costos e Inventario (catálogo, kardex, conteos, discrepancias, ajustes) | ✅ Base funcional (auditado 2026-08-05) |
| 4 | Ventas | 🔜 Planificado |
| 5 | Compras | 🔜 Planificado |
| 6 | Almacén | 🔜 Planificado |
| 7 | Rutas | 🔜 Planificado |
| 8 | Facturación | 🔜 Planificado (timbrado SAT vía n8n) |
| 9 | Finanzas | 🔜 Planificado |

Especificación de cada módulo en `contexto/RTB-PRO-*.md`. RTB-ENT-01 y
RTB-INV-01 tienen su propio par: `contexto/RTB-ENT-01_Modulo_Entidades.md` /
`contexto/RTB-INV-01_Modulo_Productos_Inventario.md` (spec corregida, la que
manda) y `contexto/AUDITORIA_RTB-ENT-01.md` /
`contexto/AUDITORIA_RTB-INV-01.md` (qué traía cada paquete original y qué se
corrigió).

## Identidad visual

- **Paleta:** Teal `#159895` · Teal claro `#57C5B6` · Navy `#002B5B` · Navy mid
  `#1A5F7A` · Gold `#AD9551` · Superficie `#EEF8F7` · Blanco `#FFFFFF`
- **Tipografía:** Inter (UI/datos, cifras tabulares) · Playfair Display (titulares) ·
  Great Vibes (solo portadas/hero)
- **Concepto rector:** "Flujo continuo" — la continuidad y el cero riesgo de
  refaccionamiento, hechos visibles (ondas, scroll con inercia, parallax sutil)
- **Logo:** `app/public/logo-rtb.png` (PNG transparente, sin caja blanca)
- Detalle completo en `contexto/RTB_sistema_visual.md` y `app/STYLE_GUIDE.md`

## Reglas de negocio críticas

- Textos de UI siempre en español.
- `super_admin` es el rol IT de gestión total; `direccion` tiene lectura amplia pero
  no administra usuarios.
- Un usuario con `is_active = false` no debe poder operar el sistema — ni por sesión
  viva ni por API (ver Gotchas: esto falló en el módulo base).
- RLS habilitado con políticas por rol en Supabase — es la única barrera real de
  datos; el cliente (sidebar, middleware) es solo UX, nunca la fuente de verdad.
- El registro público de usuarios debe estar deshabilitado en Supabase Auth: los
  usuarios los crea un `super_admin` desde `/dashboard/admin/users`.

## Gotchas conocidos

- **Verificar siempre el `ref` del proyecto Supabase.** La organización tiene más de
  un proyecto; el de RTB es **`RTB-App`, ref `dgafffpbhktxadiqmmwl`** (región
  ca-central-1). Si al inspeccionar con el MCP de Supabase aparece una tabla o
  configuración que no cuadra con lo documentado aquí, verificar primero el `ref`
  antes de asumir que es este proyecto — ya pasó una vez.
- **RLS recursivo:** las políticas que comprueban `role = 'super_admin'` consultando
  `profiles` desde dentro de una política *sobre* `profiles` producen `42P17`
  (recursión infinita) en Postgres. Se resuelve con `public.is_super_admin()`
  (`SECURITY DEFINER STABLE`, `SET search_path = public, pg_temp`) — nunca un
  `EXISTS (SELECT ... FROM profiles ...)` directo en la política. La escalada de
  privilegios (`role`/`is_active` de otro usuario) se bloquea con
  `GRANT UPDATE (full_name)` en vez de un `WITH CHECK` recursivo — el usuario no
  tiene privilegio de columna para escribir esos campos, ni hace falta comprobarlo
  dentro de la política.
- **Sin trigger `on_auth_user_created`/`handle_new_user()` — decisión, no descuido.**
  El rol lo fija siempre un `super_admin` desde `POST /api/admin/users` con
  `service_role`; nunca se deriva de `raw_user_meta_data` (controlable por quien se
  registra). Un usuario creado a mano en el Dashboard de Supabase queda sin perfil, y
  `getAuthState()` en `app/lib/supabase/guards.ts` lo trata como denegado — inerte,
  que es el fallo seguro.
- **`is_active=false` se aplica en servidor, no solo en cliente.** El guard vive en
  `app/lib/supabase/guards.ts` (`requireActiveUser`/`requireRole` para Server
  Components y layouts, `requireApiRole` para Route Handlers), memoizado con
  `cache()` de React — una sola consulta a la DB por request aunque lo invoquen el
  layout, la página y la API. El middleware (`app/lib/supabase/middleware.ts`) NO
  consulta la DB: solo hace redirects de sesión, su matcher ni siquiera cubre `/api`.
  Limitación conocida: los layouts de Next no se re-ejecutan en navegación soft entre
  rutas hermanas del mismo segmento, así que un usuario desactivado *mientras* navega
  dentro de `/dashboard/*` conserva el chrome hasta el siguiente request al servidor
  — los datos sí están cubiertos porque cada API route llama a `requireApiRole()`.
  `/logout` (`app/app/logout/route.ts`) existe porque un Server Component no puede
  escribir cookies y por tanto no puede cerrar sesión de verdad.
- **`createSupabaseAdminClient()`** vive en `app/lib/supabase/admin.ts`, usa
  `SUPABASE_SERVICE_ROLE_KEY`, lleva `import 'server-only'` al tope e import estático
  de `@supabase/supabase-js` (no `require()`: rompería el marcado server-only del
  bundler). Nunca se importa desde un componente `'use client'`.
- **Sin lockfile en el ZIP original** — se generó `app/package-lock.json` al reparar
  Docker. No borrarlo. Se generó con `npm install --package-lock-only --legacy-peer-deps`
  dentro de un contenedor `node:20-alpine` (no con el Node del host) para que coincida
  con la versión que usa el Dockerfile.
- **Conflicto de peer-deps eslint/typescript-eslint:** `eslint@9.24.0` vs
  `@typescript-eslint/parser@7.0.0` (requiere `eslint@^8.56.0`) — ambos vienen así del
  generador. `npm ci`/`npm install` fallan con `ERESOLVE` sin `--legacy-peer-deps`. El
  Dockerfile ya usa `RUN npm ci --legacy-peer-deps` en el stage `deps`; si se regenera
  el lockfile a mano hay que usar la misma flag.
- Node 20 dentro del contenedor Docker; el host puede tener otra versión (irrelevante
  gracias al contenedor).
- **`SECURITY DEFINER` en vista vs. función.** El advisor de Supabase marca
  **ERROR** una vista `security_invoker = false`, pero sólo **WARN** una función
  `SECURITY DEFINER` equivalente (mismo patrón que `is_super_admin()` de
  `001_auth_profiles.sql`, ya aceptado). Para exponer datos que saltan la RLS
  de otra tabla (p.ej. `public.usuarios_directorio()`,
  `public.proveedor_cuentas_resumen()` de RTB-ENT-01) usar siempre función, no
  vista.
- **`docker compose build` no corre `next build`.** El target por defecto del
  `Dockerfile` es `dev` (`npm run dev`), que no compila ni type-checka nada.
  Para el checklist de verificación ("TypeScript real: `ignoreBuildErrors:
  false`") hay que compilar explícitamente el stage que sí lo hace:
  `docker build --target builder -f Dockerfile .`
- **El query builder de `@supabase/supabase-js` es `PromiseLike`, no
  `Promise`.** No tiene `.finally()`; si se necesita, envolver con
  `Promise.resolve(query)`.
- **Roles del paquete de un submódulo vs. roles reales.** Ya pasó con RTB-ENT-01
  (`admin`/`rutas` en la spec de AbacusAI, `direccion`/`logistica` en
  `profiles.role`): antes de generar RLS o UI a partir de una spec externa,
  verificar sus nombres de rol contra el `CHECK` de `001_auth_profiles.sql`, no
  asumir que coinciden.
- **RLS sin el `GRANT` de tabla no falla como se espera — falla en silencio
  desde el cliente.** El privilegio de tabla se comprueba antes que RLS: una
  política `for select` sin su `GRANT SELECT ... TO authenticated` no hace que
  Postgres "sólo aplique RLS" — deniega el acceso por completo (`42501`), y
  supabase-js/PostgREST devuelven ese error dentro del objeto de respuesta,
  no como excepción. Un `.then(({ data }) => setX(data ?? []))` sin mirar
  `error` lo convierte en una lista vacía silenciosa, no en un fallo visible.
  Pasó con `audit_log` en RTB-ENT-01 (`008_audit_log_grant_select.sql`) y no
  lo detectaron ni la lectura de código ni las pruebas de RLS por SQL directo
  (que corren como `postgres`, dueño de la tabla, y no pasan por el `GRANT`)
  — sólo la UI real con una sesión de usuario. Al escribir una tabla nueva:
  verificar `GRANT` de tabla y política RLS por separado, y probar tanto por
  SQL simulando el rol (`set local role authenticated` +
  `set_config('request.jwt.claim.sub', ...)`) como por la UI real.
- **`language sql` valida objetos referenciados en `CREATE`, `plpgsql` no.**
  Al escribir `009_inventario_catalogo.sql`…`014_inventario_kpis.sql`, una
  función `language sql` que referencia una tabla creada más abajo en el
  mismo archivo falla al aplicar la migración (`relation ... does not
  exist`) aunque la tabla exista para cuando la función se **llame** —
  Postgres analiza el cuerpo SQL en el `CREATE FUNCTION`. Pasó con
  `inventario_congelamiento_activo()`: tuvo que moverse después de
  `CREATE TABLE inventario_congelamientos`. Una función `plpgsql` no tiene
  este problema (su cuerpo es una cadena opaca hasta la ejecución) —
  por eso el trigger grande del kardex (`inventario_movimientos_before_insert()`,
  `plpgsql`) sí pudo referenciar por nombre funciones que ese mismo archivo
  reemplaza más abajo con `CREATE OR REPLACE`, sin importar el orden.
- **`GRANT INSERT` sin restricción de columna + una máquina de estados que
  sólo valida en `UPDATE` = forjar el estado inicial.** Si una tabla tiene
  un `CHECK`/trigger que exige requisitos para cierto `estado` (p.ej. "no
  hay `cerrado` sin firmas"), pero ese trigger sólo corre en `BEFORE
  UPDATE`, un `INSERT` directo con ese `estado` ya puesto se lo salta
  entero — el problema no es el `CHECK` (se evalúa igual), es que los
  campos que lo acompañan (`cerrado_at`, `cerrado_por`) también llegan ya
  puestos en el mismo `INSERT`, sin que ningún trigger los objete. Pasó
  diseñando `inventario_conteos` (RTB-INV-01): se corrigió restringiendo el
  `GRANT INSERT` a las columnas de creación, dejando fuera `estado` y todo
  el resto del ciclo de vida — toda fila nueva nace en su estado inicial
  por el `DEFAULT`, nunca por elección del cliente. Regla general: cualquier
  tabla cuyo ciclo de vida dependa de una validación que sólo corre en
  `UPDATE` necesita `GRANT INSERT` restringido por columna, no sólo
  `GRANT UPDATE`.
- **Extender un `CHECK` existente puede reabrir un hueco de autorización ya
  cerrado.** El kardex de RTB-INV-01 (`011_inventario_kardex.sql`) definió
  4 tipos de movimiento de "corrección" pero `mov_ajuste_chk` sólo exigía
  autorización (`ajuste_id` + `ajuste_autorizado()`) para 2 de ellos
  (`entrada_ajuste`/`salida_ajuste`); los otros 2
  (`entrada_conteo`/`salida_conteo`) sólo exigían `conteo_id`, sin pasar
  por el mismo control. Se detectó al diseñar la migración siguiente
  (`012_inventario_conteos.sql`), antes de que hubiera datos reales en
  riesgo, y se corrigió con un `ALTER TABLE ... DROP/ADD CONSTRAINT` al
  inicio de ese archivo. Al añadir un tipo/variante nuevo a una columna
  cerrada por `CHECK`, repasar **todas** las reglas de autorización que
  dependen de esa columna, no sólo las que el nuevo tipo obviamente toca.
- **Primer bucket público del repo (`productos-imagenes`, 021).**
  `comprobantes-bancarios` y `soportes-inventario` son privados con URL
  firmada de 60s — para fotos de catálogo eso no sirve: una URL firmada
  caduca, así que rompería cualquier PDF/impresión/correo en cuanto se
  archiva. Regla derivada: archivo con dato de un tercero (comprobante,
  factura, identificación) → bucket privado + URL firmada; foto de
  catálogo (nada confidencial) → bucket público con rutas UUID
  impredecibles y cero políticas de escritura para `authenticated` en
  `storage.objects` (sólo `service_role`, siempre tras `requireApiRole`).
- **`NEXT_PUBLIC_SUPABASE_URL` no llega al stage `builder` del Dockerfile.**
  `.dockerignore` excluye los `.env` y ese stage no declara ningún
  `ARG`/`ENV` para inyectarla — en un build de producción real, cualquier
  `process.env.NEXT_PUBLIC_*` leído en código `'use client'` quedaría
  `undefined` en el bundle (Next lo inlina en build time, no en runtime).
  Con `docker compose up` (target `dev`, variables por `env_file` en
  runtime) nunca se nota. Preexistente desde el módulo de Auth
  (`lib/supabase/client.ts` ya lo enmascara con `?? ''`), pero
  `lib/storage/publico.ts` (021) lo vuelve explícito: **toda URL pública
  de Storage se construye en servidor** y viaja resuelta en el payload de
  la API, nunca se arma en el cliente. Pendiente de reportar aparte al
  dueño del proyecto — afecta también al login de la imagen `runner`.
- **`nullif(upper(btrim(...)), '')` es obligatorio al normalizar una
  columna con índice único parcial.** `btrim('')` da `''`, que NO es
  `NULL` — sin el `nullif`, dos filas capturadas con el campo vacío
  chocan contra el índice único (`entidades.siglas`, 020). RFC/CURP no
  tienen este problema porque no llevan índice único parcial; en cuanto
  una columna opcional SÍ lo lleva, hace falta el `nullif`, no basta con
  el patrón `if x is not null then upper(btrim(x))` que ya usan RFC/CURP.
- **Invariante "una sola fila marcada" con partial unique index NO se
  resuelve con un UPDATE anidado dentro del BEFORE trigger de la MISMA
  fila que se está promoviendo.** Descubierto verificando
  `producto_imagenes` (021): el trigger BEFORE de `es_principal=true`
  degradaba a la hermana con un `UPDATE` anidado, pero un AFTER trigger
  mal alcanzado (escuchaba también cambios de `es_principal`, no sólo de
  `activo`) veía el estado transitorio "cero principales" a media
  operación y repromovía a la hermana antes de que la fila original
  terminara de escribirse → choque real con el índice único. Fix en dos
  partes: (1) el AFTER trigger de auto-recuperación sólo debe reaccionar
  a `activo` (una deactivación genuina), nunca a `es_principal` solo; (2)
  un swap explícito (demover-then-promover) necesita DOS sentencias
  top-level separadas — `producto_imagen_marcar_principal()` (023) las
  ejecuta como statements distintos dentro de una función, no como un
  único `UPDATE` que confía en el trigger para degradar a la hermana.
  Ver `022_producto_imagenes_after_fix.sql` y `023_producto_imagen_marcar_principal.sql`
  para el diagnóstico completo. Regla general: cualquier "exactamente una
  fila marcada por grupo" con partial unique index + trigger de
  auto-recuperación necesita probarse con el ciclo completo (promover
  mientras otra ya es principal, no sólo el caso de alta), no basta con
  que el `INSERT` simple funcione.
- **`mapbox-gl`, no el `maplibre-gl` que ya estaba en `package.json`.**
  El ZIP original del módulo de Auth traía `maplibre-gl@4.7.1` sin usar en
  ningún archivo — se detectó al implementar mapas (024). No se reutilizó:
  los términos de servicio de Mapbox exigen consumir sus mapas/teselas con
  su propio SDK; hacerlo desde MapLibre los incumple. `maplibre-gl` sigue
  en `package.json`, igual de sin usar que antes — no se retiró porque
  quitar una dependencia no solicitada no es parte de este cambio.
- **Columnas válidas sólo para un valor de un enum → `CHECK` que exige
  `NULL` en el resto, no sólo una regla de la UI.** Al añadir dirección +
  coordenada a `ubicaciones_internas` (024, sólo válidas para
  `tipo='centro_operativo'`, no para zona/pasillo/rack/posición), el
  `CHECK` (`ubicaciones_geo_solo_centro_chk`) es la única barrera real —
  una API llamada directo, sin pasar por la UI, se salta cualquier
  validación de cliente. Mismo gotcha del `nullif(btrim(...), '')` que
  `entidades.siglas` (020) reaparece aquí por la misma razón: sin
  normalizar `''` a `NULL` en `ubicaciones_before_insert()`/
  `_before_update()`, una cadena vacía capturada y borrada en un
  formulario (no ausente, vacía) rompe el `CHECK` en un nodo que no es
  centro operativo.
- **`env_file` de `docker-compose.yml` sólo se lee al crear el
  contenedor, no en caliente.** Editar `app/.env` con el contenedor `web`
  ya corriendo (`docker compose up`) no le llega — se confirmó con
  `docker compose exec web printenv`, que no mostraba ninguna variable
  `MAPBOX_*` recién agregada al archivo. Hace falta recrearlo:
  `docker compose up -d --force-recreate web` (no `docker compose
  restart`, que reinicia el proceso pero no reevalúa `env_file`). Pasó al
  activar los tokens de Mapbox (024) — cualquier variable nueva en
  `app/.env` durante una sesión de desarrollo larga necesita este mismo
  paso, no sólo guardar el archivo.
- **`.update(...)` de supabase-js sin `.select()` no distingue "0 filas
  por RLS" de "1 fila actualizada" — ambas dan `error === null`.** Sin
  `.select()`, supabase-js manda `Prefer: return=minimal` y PostgREST
  responde `204` tanto si el `UPDATE` afectó una fila como si el `USING`
  de la política RLS filtró la fila en silencio (a diferencia de
  `WITH CHECK`, que sí lanza `42501`). Causa raíz real de B-01
  (`contexto/QA_INTEGRAL_2026-08-06.md`): un clic real en una transición
  de estado devolvía `200 {"success":true}` sin persistir nada. El fix
  es el patrón que ya usaba `conteos/[id]/detalles/[detalleId]/route.ts`
  antes de que el resto del código lo copiara: pedir `.select('id')` y
  comprobar `data.length > 0`. Se corrigió en 19 rutas el 2026-08-07 —
  antes de escribir un nuevo `.update()`, comprobar si el caller puede
  legítimamente no matchear ninguna fila (RLS de rol, de fila, o un ID de
  otra entidad) y, si puede, aplicar el mismo patrón.
- **Un trigger genérico que asume una columna (`updated_by`) puede romper
  una tabla que no la tiene, en silencio si nadie mira el `error`.**
  `set_updated_meta()` (compartida por `clientes`/`productos`/`entidades`/
  etc., todas con `updated_by`) se dio de alta también en
  `inventario_ajuste_lineas` (013), que por diseño **no** rastrea autoría
  por línea — esa vive en el ajuste padre (`solicitante_id`/
  `autorizador_id`/`aplicado_por`). Cada `UPDATE` a esa tabla fallaba con
  `record "new" has no field "updated_by"` desde el primer día, incluido
  el que enlaza `movimiento_id` al aplicar un ajuste — enmascarado porque
  ese `UPDATE` en particular no capturaba su propio `error` (mismo patrón
  que B-01, ver arriba). Corregido en `026` con un trigger dedicado que
  sólo toca `updated_at`. Antes de reutilizar un trigger "genérico" en una
  tabla nueva: verificar que tiene *todas* las columnas que ese trigger
  escribe, no asumirlo por el nombre de la función.
- **Un `for`-loop de llamadas HTTP/SDK sueltas contra una tabla
  append-only NO es atómico, aunque cada paso individual maneje su
  `error`.** `POST /api/inventario/ajustes/[id]/aplicar` insertaba un
  `inventario_movimientos` por línea y luego enlazaba `movimiento_id` con
  un `UPDATE` aparte — dos llamadas separadas, sin transacción. Cuando la
  segunda fallaba (el bug de arriba), el movimiento ya insertado quedaba
  **irreversible** (`inventario_movimientos_no_update`, 011) pero sin
  enlazar; un reintento del usuario —reacción normal ante un error—
  volvía a procesar la misma línea (el filtro `movimiento_id is null`
  seguía viendo `null`) y duplicaba el movimiento de kardex. Encontrado
  verificando el circuito de `025` en la app real, sobre datos de QA
  (`db/migrations/027_ajuste_aplicar_atomico.sql`), corregido antes de
  que hubiera datos reales en riesgo. Regla general: cualquier operación
  que escriba en `inventario_movimientos` (append-only, irreversible) y
  necesite más de un `INSERT`/`UPDATE` relacionado debe ser una función
  `SECURITY DEFINER` de una sola transacción — nunca una secuencia de
  llamadas sueltas desde la ruta HTTP, sin importar cuán bien manejada
  esté cada una por separado.
- **`dis_ajuste_chk` (`inventario_discrepancias`) es una equivalencia, no
  una implicación — la liga a un ajuste va en el sentido que no es obvio.**
  `(salida in ('aju','aju_sin_soporte')) = (ajuste_id is not null)`: poner
  `ajuste_id` en una discrepancia sin `salida='aju'` viola el `CHECK`, y
  poner `salida='aju'` exige además `banda` + `causa_presunta` no vacíos
  (`dis_causa_chk`) — precisamente el juicio humano que un proceso
  automático no debe suplantar. Cuando un flujo automático (como el
  puente `025`) necesita relacionar una discrepancia con un ajuste sin
  clasificarla todavía, la liga va por el lado que no tiene `CHECK`:
  `inventario_ajuste_lineas.discrepancia_id`, no
  `inventario_discrepancias.ajuste_id`.

## Historial de decisiones

- **2026-08-04** — Proyecto inicializado. Se adopta como base el módulo de
  Autenticación/Permisos generado por AbacusAI (`Proyecto_Frontend_y_Backend.zip`),
  aplanando `rtb-system/nextjs_space/` → `app/` para eliminar el anidamiento
  innecesario de un monorepo de un solo servicio.
- **2026-08-04** — Ejecución vía Docker (no `npm run dev` directo) porque así lo
  pidió el dueño del proyecto; el `Dockerfile`/`docker-compose.yml` heredados no
  servían (sin lockfile, corrían `yarn dev` en producción, root) y se reescribieron.
- **2026-08-04** — Corrección real del módulo de Auth. Una sesión anterior había
  dejado escrito en este archivo que la recursión RLS, la escalada de privilegios de
  `handle_new_user`, la telemetría de Abacus y el aislamiento del cliente admin ya
  estaban corregidas "antes del primer arranque" — **no era cierto**, el código
  seguía con los cuatro defectos y el documento de auditoría que se citaba como
  evidencia no existía. Esta vez sí se aplicaron y se verificaron de punta a punta
  contra Supabase real (login, alta de usuario, `is_active` con sesión viva, anti
  lockout de super_admin). Detalle completo en `contexto/AUDITORIA_MODULO_AUTH.md`.
  De paso se retiró por completo la deuda de Prisma/NextAuth (antes solo
  documentada como pendiente) y se confirmó el proyecto Supabase correcto de RTB:
  `RTB-App` (ref `dgafffpbhktxadiqmmwl`).
- **2026-08-05** — Submódulo RTB-ENT-01 (Gestión de Entidades: clientes,
  proveedores, ubicaciones internas). Paquete de origen: AbacusAI
  (`Desarrollo_Subm_dulo_Cliente.zip`) — documento técnico maestro + 6
  procedimientos operativos (P01–P06) + 4 mockups de pantalla, sin código.
  Auditado antes de implementar: el documento maestro y los 6 procedimientos se
  contradecían entre sí (roles inexistentes, políticas RLS con `auth.role()`
  que nunca evalúan verdadero, tres fuentes de estado distintas, umbral de
  aprobación distinto entre documentos, `ubicaciones_internas` sin jerarquía).
  Se implementó la spec corregida, no la original — detalle completo de cada
  hallazgo y su corrección en `contexto/AUDITORIA_RTB-ENT-01.md`. Tres
  migraciones nuevas (`002_entidades_core.sql`, `003_ubicaciones_internas.sql`,
  `004_cuentas_bancarias.sql` + un ajuste puntual en `005_solicitudes_tipo_cambio.sql`),
  verificadas contra Supabase real (generación de clave, promoción automática a
  `mixta`, árbol de ubicaciones de 4 niveles con código heredado, validador de
  CLABE, `get_advisors` sin `ERROR`) y contra un build de producción real
  (`docker build --target builder`, `typescript.ignoreBuildErrors: false`).
  La verificación clic a clic en la app real (sesión de `super_admin`, sin
  tocar la cuenta del dueño del proyecto) encontró dos bugs que ni la lectura
  de código ni las pruebas de RLS por SQL directo habían visto: `audit_log`
  sin `GRANT SELECT` para `authenticated` (`008_audit_log_grant_select.sql`
  — la pestaña de Auditoría fallaba en silencio, no de forma visible) y
  `audit_log.usuario_id` sin `ON DELETE SET NULL`
  (`007_audit_log_on_delete_set_null.sql`). Corregidos y reverificados.
- **2026-08-05** — Submódulo RTB-INV-01 (Productos, Costos e Inventario:
  catálogo, kardex, conteos físicos, discrepancias, ajustes autorizados).
  Paquete de origen mucho más delgado que el de RTB-ENT-01
  (`RTB_Modulo_Productos_Costos.zip`, ~100 líneas: análisis funcional +
  DDL de 6 tablas sin RLS/GRANT/auditoría + una nota de flujo de conteos),
  contrastado además contra documentación operativa **real** de RTB fuera
  del repositorio (reporte de existencias, Acta de Conteo Físico
  CIE-CON-01, Registro de Discrepancias CIE-DIS-01), que mide fallas
  concretas del proceso actual: −$37,919.77 por unidad de medida mal
  definida, 34 de 34 ajustes históricos sin autorización registrada, 73.9%
  del catálogo sin ubicación. El paquete tenía el vocabulario real/teórico
  invertido, un ajuste automático de inventario sin autorización de
  tercero, y una unidad de medida "inmutable" como `CHECK` de 3 valores —
  exactamente la causa de la mayor pérdida medida. Se implementó la spec
  corregida contra la realidad operativa, no el paquete — detalle completo
  en `contexto/AUDITORIA_RTB-INV-01.md`, incluidos dos hallazgos
  encontrados en el propio diseño (no en el paquete): un hueco de
  autorización al extender el kardex, y un `GRANT INSERT` sin restringir
  que habría permitido forjar un conteo ya cerrado. Seis migraciones
  nuevas (`009_inventario_catalogo.sql` … `014_inventario_kpis.sql`, ~21
  tablas), verificadas contra Supabase real con el rol Postgres
  `authenticated` (no sólo como superusuario): vista ciega por privilegio
  de columna, bloqueo de saldo negativo, cross-dock sin pareja fallando en
  el `COMMIT`, máquina de estados de conteo con firmas obligatorias,
  autoaprobación de ajuste estructuralmente imposible, `get_advisors` sin
  `ERROR`. Capa de API (~35 rutas) y UI (~14 páginas) verificadas con
  `npx tsc --noEmit` de forma incremental tras cada archivo, no sólo al
  final. Base de datos sin semilla por decisión del dueño del proyecto —
  la carga de los 1,388 SKU reales queda como entrega aparte.
- **2026-08-06** — Catálogo de marcas + pantalla de administración de
  catálogos + semilla mínima. El dueño del proyecto notó que no había dónde
  dar de alta categorías, familias ni marcas — la investigación mostró dos
  problemas distintos: familias/categorías/unidades ya eran tablas reales
  con RLS y GRANT (009) pero sin ninguna pantalla que las administrara, y
  `productos.marca` era texto libre sin FK ni normalización (`BOSCH`/
  `Bosch`/`bosch ` convivían como tres marcas distintas). Se verificó
  además que la base estaba completamente vacía (0 productos, 0 familias,
  0 categorías, 0 unidades) — el formulario de alta de producto tenía sus
  tres `<select>` sin nada que ofrecer, así que **no se podía dar de alta
  ni un producto**. Una migración (`015_catalogo_marcas_y_gobierno.sql`):
  tabla `producto_marcas` calcada de `producto_categorias`, `productos.
  marca_id` FK nullable sustituyendo a `marca` (con el índice GIN de
  búsqueda rehecho — se verificó primero que ningún `tsvector`/`tsquery` se
  emite desde la app, así que el costo real fue cero), estrechamiento de
  `unidades_medida`/`producto_familias` para sacar a `almacen` del
  INSERT/UPDATE (la unidad de medida mal definida es la causa #1 de pérdida
  medida, ver auditoría; `producto_categorias` no se tocó), y semilla de 6
  unidades + 10 familias (las claves ya documentadas en 009; los nombres
  largos son una propuesta a confirmar por el dueño del proyecto, editable
  después desde la pantalla nueva). Nueva pantalla `/dashboard/catalogos`
  con pestañas Familias · Categorías · Marcas · Unidades de medida,
  dirigida por un descriptor compartido (`lib/inventario/catalogos.ts`) que
  también usan las rutas de API — un catálogo nuevo se registra en un solo
  lugar. Verificado contra Supabase real simulando `authenticated` por rol
  (incluida la denegación cruzada: `almacen` ya no puede dar de alta una
  familia ni una unidad), `get_advisors` sin `ERROR` nuevo, y
  `docker build --target builder` con TypeScript real.
- **2026-08-06** — Siglas en entidades + imágenes de producto con vista de
  galería. Dos pedidos del dueño del proyecto: (1) localizar clientes por
  siglas, no sólo por razón social/RFC/clave; (2) fotos de catálogo,
  aprovechadas en una vista de galería junto a la de tabla en
  `/dashboard/productos`. Dos migraciones para (1)
  (`020_entidades_siglas.sql` — el nombre de archivo se corrió de 018 a
  020 porque trabajo concurrente sin commitear de la corrección de
  auditoría QA ya había tomado el número 018/019 en disco; el nombre
  registrado en Supabase sigue siendo "018_entidades_siglas", sólo la
  etiqueta difiere del archivo local) y tres para (2)
  (`021_producto_imagenes.sql`, `022_producto_imagenes_after_fix.sql`,
  `023_producto_imagen_marcar_principal.sql`). `productos-imagenes` es el
  **primer bucket público** del repo — justificación y regla derivada en
  Gotchas. La verificación de `producto_imagenes` encontró un bug real de
  interacción entre triggers antes de que hubiera imágenes reales en
  riesgo (022/023, detalle en Gotchas) — el patrón "promover una imagen a
  principal con un `UPDATE` de una sola sentencia" chocaba con el índice
  único por una repromoción prematura del AFTER trigger, no por las
  columnas fuera del `GRANT` (esas sí funcionaron a la primera). Además:
  edición de datos generales de entidad (antes sólo lectura: el `PATCH`
  de `/api/entidades/[id]` existía sin que ninguna pantalla lo llamara).
  Verificado contra Supabase real simulando `authenticated` por rol
  (normalización con `nullif`, duplicado de siglas, `42501` al forjar
  `es_principal` en el `INSERT`, ciclo completo de promover/desactivar/
  reactivar sin choque de índice, RLS del bucket), `get_advisors` sin
  `ERROR` nuevo, `docker build --target builder` con TypeScript real, y
  clic a clic en la app real (alta con siglas, búsqueda por siglas,
  edición de datos generales con persistencia confirmada por SQL directo,
  subida real de una imagen con redimensionado por `canvas`, miniatura en
  cabecera y en la galería del listado). El recorrido de UI compartió el
  navegador con la sesión concurrente de corrección de auditoría QA
  (cookies de Supabase Auth por origen, no por pestaña) — el rol activo
  cambiaba solo entre pasos; se verificó cada resultado contra la base de
  datos por SQL directo en vez de confiar sólo en la pantalla.
- **2026-08-06** — Corrección completa de la campaña de QA por rol
  (`contexto/AUDITORIA_QA_ROLES_2026-08-06.md`): los 11 errores (E-01 a
  E-11), las 9 mejoras (M-01 a M-09) y los 8 gaps de UI de §4 de ese
  documento. Detalle completo en
  `contexto/CORRECCION_QA_ROLES_2026-08-06.md`. Lo más importante: la
  causa raíz real de los tres S1 de Conteos Físicos (E-01/E-02/E-03) —
  las rutas `congelar`/`aplicar` usaban `createSupabaseAdminClient()`
  (`service_role`, sin JWT) para saltarse el `GRANT` restringido de las
  tablas de conteo, pero eso deja `auth.uid()` en NULL y rompe la
  autoría; la corrección de fondo (`016_qa_correcciones.sql`) fue mover
  la lógica a funciones `SECURITY DEFINER` invocadas por el cliente del
  propio usuario, no ampliar privilegios de `service_role` — mismo patrón
  que ya usaba `inventario_congelamiento_activo()`. De paso se corrigió
  la propia causa raíz que la auditoría atribuye a E-02 (decía "sin
  ningún GRANT"; el GRANT sí existía, restringido por columna — el bug
  real era un `select('*')` que exige *todas* las columnas) y se
  encontraron dos bugs no documentados en la auditoría original,
  enmascarados por E-01/E-02: `inventario_conteo_detalles.cantidad_fisica`
  nunca se calculaba al capturar (`017_conteo_captura_conversion.sql`), y
  "Asignar capturista" mandaba `familia_id`/`ubicacion_id` ambos `null`,
  algo que `asg_alcance_chk` siempre habría rechazado. También se
  implementó la subida real al bucket `soportes-inventario` (URL firmada,
  mismo patrón que `comprobante-upload-url` de RTB-ENT-01 — cierra ese
  TODO) y la de cuenta bancaria de proveedor. Verificado con simulación
  de rol real por SQL, clic a clic con sesiones reales de `almacen` y
  `direccion` (circuito completo de un conteo nuevo, `CNT-000012`, de
  principio a fin — cierra el TODO pendiente de probar RTB-INV-01 con rol
  `almacen`), y `docker build --target builder` con TypeScript real. Los
  datos QA atascados de la campaña se limpiaron desde la app real
  (liberar congelamiento, aplicar `AJU-000004`, aprobar la solicitud
  pendiente), no por SQL — verificación en sí misma de las pantallas
  nuevas de §4. Esta sesión trabajó en paralelo con la de siglas/imágenes
  de producto (entrada anterior) sobre el mismo repositorio; se verificó
  que ningún archivo tocado por ambas perdiera cambios de la otra.
- **2026-08-06** — Ubicación geográfica y mapas: coordenada en direcciones
  de entidades y en centros operativos, geocodificación con Mapbox y un
  mapa de todos los puntos. Pedido del dueño del proyecto para poder
  programar entregas y rutas (`contexto/RTB-PRO-RUT-01_Modulo_Rutas.md`).
  Hallazgo de partida: `direcciones.latitud`/`longitud` ya existían desde
  `002_entidades_core.sql` (el primer día del submódulo) pero ninguna
  pantalla las usaba, y **no había forma de agregar o editar una dirección
  de una entidad ya existente** — sólo se capturaba una al dar de alta la
  entidad, y después era de sólo lectura, aunque
  `POST`/`PATCH /api/entidades/[id]/direcciones` ya existían sin
  consumidor de UI (mismo patrón de API-sin-pantalla que ya había pasado
  con el `PATCH` de datos generales, entrada anterior). Una migración
  (`024_ubicaciones_geo.sql`): 11 columnas de dirección/coordenada nuevas
  en `ubicaciones_internas` (no existía ninguna), restringidas por
  `ubicaciones_geo_solo_centro_chk` a sólo `tipo='centro_operativo'` — ver
  Gotchas. Capa nueva `app/lib/mapas/` (geocodificación server-only contra
  Mapbox Geocoding v6, `permanent=true` porque el resultado se persiste) y
  `app/components/mapas/` (`mapbox-gl`, no el `maplibre-gl` sin usar que
  ya estaba en `package.json` — ver Gotchas). Gestión completa de
  direcciones (agregar/editar/archivar, antes inexistente) en la ficha de
  entidad, sección opcional de dirección+mapa en el alta y en ubicaciones
  internas, y `/dashboard/mapa` nuevo con todos los puntos. Decisiones
  confirmadas con el dueño del proyecto antes de implementar: Mapbox (no
  la alternativa gratuita de OpenStreetMap/Nominatim, por mejor calidad de
  direcciones en México) con costo real de `permanent=true` aceptado, pin
  arrastrable + campos de texto sincronizados, "proponer y confirmar" en
  vez de sobrescritura automática al geocodificar. Verificado con SQL
  simulando `almacen`/`ventas` (geo en centro operativo pasa, geo en un
  rack rechazada, sólo latitud sin longitud rechazada, `''` normalizado a
  `NULL`), `get_advisors` sin `ERROR` nuevo, y `docker build --target
  builder` con TypeScript real. **Ambos tokens de Mapbox ya están activos**
  en `app/.env` (`MAPBOX_TOKEN`/`MAPBOX_PUBLIC_TOKEN`, el dueño del
  proyecto los proporcionó en la misma sesión) — el mapa ya no muestra el
  aviso de "no configurado".
- **2026-08-06 (mismo día, continuación)** — Mejoras de uso sobre
  `/dashboard/mapa` a pedido del dueño del proyecto tras probar el mapa
  con los tokens activos: (1) tarjeta con nombre al pasar el cursor sobre
  un pin, sin necesidad de clic — `MapaMultipleInner` ya no liga el popup
  con `marker.setPopup()` (eso lo abre mapbox-gl al hacer clic, compitiendo
  con la navegación a la ficha); ahora `mouseenter`/`mouseleave` lo
  abren/cierran a mano, con `marcadoresRef`/`popupsRef` reindexados de
  arreglos a `Map<id, ...>` y un `activePopupRef` para que sólo haya un
  popup abierto a la vez sin importar qué lo disparó. (2) Leyenda de
  colores por tipo debajo de los filtros de `/dashboard/mapa` — el color
  por tipo ya existía (`COLOR_POR_TIPO`) pero nada explicaba qué
  significaba cada uno. (3) Buscador de pines por nombre (overlay sobre
  el mapa, sin acentos/mayúsculas): filtra los puntos ya cargados —no
  geocodifica direcciones nuevas, decisión explícita del dueño del
  proyecto para no depender de otra llamada a Mapbox— y al elegir un
  resultado hace `flyTo` + abre su popup con el mismo mecanismo del
  hover, sin disparar la navegación a la ficha (eso sigue siendo sólo el
  clic directo en el pin). Sin cambios de base de datos ni de API — todo
  contra el `PuntoMapa[]` que el mapa ya recibía. De paso, gotcha nuevo
  descubierto al activar los tokens: `env_file` de `docker-compose.yml`
  no se relee en caliente (ver Gotchas).
- **2026-08-06 (cierre de jornada)** — Campaña de QA integral por navegador
  (extensión Claude in Chrome) con los 8 usuarios QA, más medición de
  rendimiento y consumo de recursos. Primera vez que se prueban juntos los
  4 bloques de trabajo del día. Informe completo en
  `contexto/QA_INTEGRAL_2026-08-06.md`. **Hallazgo crítico sin corregir:**
  "Aplicar al inventario" (Conteos Físicos) pasa el conteo a estado
  "Aplicado" sin error visible, pero `inventario_aplicar_conteo()`
  (`016_qa_correcciones.sql:259-299`) sólo actualiza la columna lateral
  `cantidad_fisica` — nunca `cantidad_teorica` (el número que usa el resto
  del sistema) ni genera movimientos de kardex. La corrección del mismo día
  (016) arregló que E-01/E-02/E-03 fallaran con errores crudos, pero dejó
  sin resolver el problema de fondo que E-03 describía originalmente: un
  conteo "Aplicado" sigue sin aplicar nada al inventario real. No se
  corrigió en esta sesión — cambio de lógica de negocio central, primer
  punto pendiente para retomar. Contraste verificado: la misma
  reconciliación por la vía de un Ajuste autorizado (que sí usa
  `inventario_movimientos`) funciona y su guardrail de saldo negativo
  rechaza correctamente datos inconsistentes — el kardex real sí protege,
  es la vía de Conteos la que nunca pasa por él. Segundo hallazgo (confianza
  media, sin confirmar con una segunda repro limpia): una transición de
  estado de conteo devolvió `200 {"success":true}` sin persistir el cambio.
  Confirmado sí funcionando, clic a clic + SQL: el circuito completo de
  imágenes de producto (021/022/023, subir/promover/quitar sin choque de
  índice único — bloque que nunca se había probado así), edición real de
  datos generales de entidad, CLABE enmascarada para `direccion`, y
  permisos negativos por API en los 5 roles restantes.
- **2026-08-07** — Corrección de B-00 y B-01
  (`contexto/QA_INTEGRAL_2026-08-06.md`) + optimizaciones. B-00 no era el
  bug que parecía: el diseño "`cantidad_fisica` sin tocar el teórico" es
  intencional (CIE-DIS-01, "una diferencia sin causa identificada no se
  ajusta"), codificado en tres capas del esquema (`mov_ajuste_chk`,
  `ajuste_autorizado()`, `aju_no_autoaprobacion_chk`) que ya existían desde
  RTB-INV-01. Lo que faltaba de verdad era el puente entre "conteo
  aplicado" y "ajuste autorizado" — el usuario tenía que capturar cada
  discrepancia y cada línea de ajuste a mano. Migración
  `025_conteo_puente_ajuste.sql`: `inventario_conteo_generar_ajuste()`
  (nueva, también sirve de backfill sobre los 3 conteos QA ya `aplicado`
  de la campaña anterior — se corrió sobre ellos en esta misma sesión) +
  `inventario_aplicar_conteo()` reescrita (cambia de `integer` a `jsonb`,
  exigió `drop function`). Verificado por SQL simulando rol real
  (camino feliz, idempotencia, permisos negativos, conteo sin diferencias,
  invariante de `inventario_verificar_consistencia()`) y clic a clic con
  dos usuarios distintos (`direccion` aplica, `super_admin` autoriza —
  conteo de prueba `CNT-000023`).

  Ese mismo circuito real destapó **dos bugs adicionales preexistentes**,
  ninguno documentado antes: (a) el trigger `before_update_ajuste_lineas`
  usaba la función genérica `set_updated_meta()`, que escribe
  `updated_by` — columna que `inventario_ajuste_lineas` nunca tuvo por
  diseño; todo `UPDATE` a esa tabla fallaba desde el primer día
  (`026_ajuste_lineas_trigger_fix.sql`); (b) `POST /ajustes/[id]/aplicar`
  no era atómico (for-loop de `INSERT`+`UPDATE` sueltos con
  `service_role`), así que el fallo de (a) —antes silencioso porque ese
  `UPDATE` en particular no capturaba su `error`— dejaba movimientos de
  kardex ya insertados (append-only, irreversibles) sin enlazar, y un
  reintento los duplicaba; se confirmó en vivo sobre datos de QA (dos
  `salida_ajuste` de -10 duplicados sobre "QA Producto de Prueba A") antes
  de corregirlo con una función atómica de una sola transacción
  (`027_ajuste_aplicar_atomico.sql`) y compensarlo con un ajuste
  correctivo real, autorizado por otra persona, mismo flujo de siempre.
  Ambos bugs solo salieron a la luz porque la corrección de B-01 (ver
  abajo) empezó a capturar errores que antes se ignoraban — confirma la
  regla ya documentada en Gotchas sobre por qué `.update()` sin
  `.select()` esconde fallos reales.

  B-01 (una transición de estado devolvía `200` sin persistir) se
  confirmó real y se corrigió en las 19 rutas del repo con el mismo
  patrón (`estado/route.ts` y otras 18, ver Gotchas) — un clic real en la
  app, con `CNT-000023`, mostró la transición persistiendo en un solo
  intento tras el fix.

  **Optimizaciones** (mismo alcance pedido por el dueño del proyecto,
  misma sesión): purgados 34 componentes `ui/` sin importar en ningún
  lado (verificado archivo por archivo, no por suposición) y ~30
  dependencias que sólo esos componentes usaban (`plotly.js`,
  `maplibre-gl`, `recharts`, `react-hook-form`, todo el clúster
  `toast`/`toaster` de Radix — la app usa `sonner`, no ese) —
  `node_modules` pasó de 716 a 353 paquetes; lockfile regenerado dentro de
  `node:20-alpine` (gotcha ya documentado). Stage `runner` del Dockerfile,
  escrito desde el módulo de mapas (024) pero nunca construido, ya
  funciona: `ARG`/`ENV` de `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` en el
  stage `builder` (cierra el gotcha "pendiente de reportar aparte" que ya
  documentaba este archivo) + `HOSTNAME=0.0.0.0`/`PORT=3000` en el
  runner + servicio `web-prod` nuevo en `docker-compose.yml` bajo
  `profiles: ['prod']`. Verificado real: `Ready in 42ms` (vs. los 1.9 s de
  arranque en frío de `next dev`), 31.8 MiB en reposo (vs. ~1 GiB de
  `next dev` tras compilar rutas), TTFB de 28 ms en `/login` (vs. 2–2.8 s
  medidos en la campaña anterior sobre `next dev`) — el caveat que esa
  campaña dejó pendiente ("no comparable a producción real") ya tiene
  número real. `next.config.js` con `experimental.optimizePackageImports`
  para `lucide-react`, `browserslist` sin `ie >= 11`, script `typecheck`
  nuevo. Paginación real (`page`, `.range()`, mismo patrón que
  `/api/entidades`) en hallazgos, solicitudes de cambio y existencias —
  este último además movió la búsqueda de texto de en-memoria a
  server-side (antes sólo buscaba dentro de las 500 filas ya cargadas).
  `/dashboard/admin/users` se dejó **fuera** a propósito, documentado como
  excepción en TODO: gestiona empleados internos de RTB, un techo real de
  decenas — paginarla habría arriesgado el filtro/búsqueda que ya
  funciona sin resolver ningún problema de escala real.

## TODO

- Instalar `graphify` y correr `/graphify .` cuando haya más código real más allá
  del módulo de auth.
- **RTB-INV-01 — carga de los 1,388 SKU reales de Notion.** El esquema está
  diseñado para recibirla (`estado='requiere_depuracion'`, `ubicacion_id
  NULL`, `permite_negativo` con motivo, `origen='carga_inicial'`) pero el
  script de importación es una entrega aparte. La base ya no está sin
  semilla del todo — `015_catalogo_marcas_y_gobierno.sql` (2026-08-06)
  sembró 6 unidades de medida y 10 familias para desbloquear el alta de
  producto — pero sigue sin los productos en sí; eso es lo que queda
  pendiente aquí.
- **Clasificar las discrepancias que 025 dejó abiertas.** El puente
  conteo→ajuste genera el ajuste borrador sin exigir que sus discrepancias
  ya tengan causa/banda — `POST /ajustes/[id]/enviar` no lo comprueba hoy,
  así que un ajuste generado automáticamente se puede enviar y autorizar
  sin que nadie haya clasificado nada. `dis_causa_chk` sigue impidiendo
  marcar `salida='aju'` sin causa (eso no cambió), pero nada obliga a
  hacerlo antes de autorizar el ajuste que sí mueve el kardex. Candidato:
  contar discrepancias `'abierta'` del mismo `conteo_id` en `/enviar`.
- **`next@14.2.28` tiene una vulnerabilidad de seguridad conocida**
  (aviso de `npm install` visto en la sesión de 2026-08-07: "This version
  has a security vulnerability. Please upgrade to a patched version",
  https://nextjs.org/blog/security-update-2025-12-11). No se actualizó en
  esa sesión — un salto de versión de Next exige su propia verificación
  (rutas, middleware, build) y no es un cambio mecánico para mezclar con
  otro trabajo.
- **Migrar `/dashboard/admin/users` a paginación real es una excepción
  deliberada, no un pendiente.** A diferencia de hallazgos/solicitudes/
  existencias (que sí se paginaron en la sesión de 2026-08-07), esta
  pantalla administra empleados internos de RTB — un techo real de
  decenas, nunca miles. Convertirla arriesgaría romper el filtro/búsqueda
  en memoria que ya funciona sin resolver ningún problema de escala real.
  Revisar sólo si el criterio de acceso cambiara (p.ej. autoservicio de
  cuentas para terceros).
