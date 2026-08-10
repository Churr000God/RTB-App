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

### Roles (10)
`super_admin`, `direccion`, `ventas`, `compras`, `almacen`, `logistica`,
`facturacion`, `finanzas`, `gerente_comercial`, `cobranza` (los últimos 2,
`037_roles_comerciales.sql`, 2026-08-07 — `gerente_comercial` es
`direccion` sólo dentro de Ventas; `cobranza` es sólo lectura, precursor
de RTB-PRO-FAC-01)

### Módulos
| # | Módulo | Estado |
|---|---|---|
| 1 | Autenticación y Permisos | ✅ Base funcional (auditado 2026-08-04) |
| 2 | RTB-ENT-01 Gestión de Entidades (clientes/proveedores/ubicaciones) | ✅ Base funcional (auditado 2026-08-05) |
| 3 | RTB-INV-01 Productos, Costos e Inventario (catálogo, kardex, conteos, discrepancias, ajustes) | ✅ Base funcional (auditado 2026-08-05) |
| 4 | RTB-VEN-01 Ventas (cotización, Compras-ligero, NR/despacho, PO por Vía B o Vía A) | ✅ Base funcional (auditado 2026-08-07, hallazgo crítico y defectos de UX corregidos el mismo día) — Vía B cerrada 2026-08-08 (043/044); Vía A (PO tardía, tablero de NR) cerrada 2026-08-08 (046-051) |
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
corrigió). RTB-VEN-01 tiene `contexto/RTB-VEN-01_Modulo_Ventas.md` (spec
corregida, la que manda sobre `RTB-PRO-VEN-01_Modulo_Ventas.md`); a
diferencia de RTB-ENT-01/RTB-INV-01, su diseño se cerró en vivo con el
dueño del proyecto vía preguntas dirigidas, no auditando un paquete
externo con contradicciones — ese detalle vive en
`sessions/2026-08-07-modulo-ventas.md`. Sí tiene, en cambio,
`contexto/AUDITORIA_RTB-VEN-01.md` (2026-08-07, mismo día): una auditoría
end-to-end del módulo YA CONSTRUIDO (no del paquete de origen, que no
existía), con un hallazgo crítico confirmado por reproducción en vivo
contra Supabase — ver TODO.

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
- **Un `new.col := old.col` incondicional en un `BEFORE UPDATE` revierte
  también las escrituras legítimas de una función `SECURITY DEFINER` —
  "defensa en profundidad" que en realidad rompe la defensa principal.**
  `ventas_cotizacion_before_update()` (030) congelaba `estado`/`enviada_at`/
  `enviada_por`/etc. con una asignación incondicional, "por si acaso",
  aunque esas columnas ya estaban fuera de todo `GRANT UPDATE` (la barrera
  real). Resultado: `ventas_cotizacion_enviar()` hacía su `UPDATE ... SET
  estado='enviada'`, el trigger disparaba, y el mismo trigger revertía
  `estado` a `'borrador'` antes de guardar — la función devolvía
  `{success:true}` sin haber cambiado nada. Encontrado verificando el
  flujo real con SQL (el estado seguía en `'borrador'` tras un "envío"
  supuestamente exitoso). Regla general: si una columna ya está protegida
  por privilegio de columna (GRANT), un trigger **no** necesita
  congelarla de nuevo con una asignación ciega — sólo debe rechazar con
  `RAISE` los cambios que sí lleguen por una vía con permiso (columnas de
  cabecera editables), nunca reasignar en silencio columnas que las
  funciones de confianza necesitan poder escribir.
- **Un `CASE WHEN ... THEN 'texto' ELSE 'texto' END` sin cast explícito
  falla con `42804` al asignarse a una columna enum, aunque un literal
  suelto (`SET col = 'valor'`) funcione sin problema en el mismo
  contexto.** `ventas_nr_despachar()` (032) tenía
  `set estado = case when v_pendientes = 0 then 'entregada_sin_po' else
  'parcialmente_entregada' end` sobre una columna `nr_estado` — Postgres
  no resuelve el tipo `unknown` de los literales de un `CASE` usando el
  tipo de la columna destino como si fuera una asignación simple. Se
  corrige casteando cada rama: `... end::public.nr_estado`. Regla general:
  cualquier `CASE` con literales de texto que se asigne a una columna
  enum dentro de un `UPDATE ... SET` necesita el cast explícito en el
  `CASE` completo (o en cada rama), no basta con que la columna ya tenga
  el tipo correcto.
- **`<Tooltip>` de Radix (`components/ui/tooltip.tsx`) exige un
  `<TooltipProvider>` ancestro — ni global ni implícito.** El proyecto no
  tiene ningún `TooltipProvider` en `app/layout.tsx` ni en
  `app/dashboard/layout.tsx`; el único uso previo
  (`app/dashboard/admin/users/page.tsx`) lo envuelve localmente. Al
  auditar RTB-VEN-01 clic a clic (`contexto/AUDITORIA_RTB-VEN-01.md`,
  2026-08-07) se encontró `cotizacion-detalle.tsx` usando `<Tooltip>` sin
  envolverlo — crash inmediato (`Error: Tooltip must be used within
  TooltipProvider`) al elegir cualquier producto en "Agregar línea",
  bloqueando por completo esa pantalla desde el navegador aunque
  `npx tsc`/`docker build` nunca lo habrían atrapado (es un error sólo en
  tiempo de ejecución del cliente). Corregido en el momento envolviendo
  ese `<Tooltip>` en un `<TooltipProvider>` local. Regla general:
  cualquier `<Tooltip>` nuevo necesita su propio `<TooltipProvider>`
  local (o uno global habría que agregarlo a los layouts) — no asumir que
  ya existe uno más arriba en el árbol.
- **`created_at` no desempata filas hermanas creadas en el mismo `INSERT
  ... SELECT` — `now()` es constante dentro de una transacción.**
  `ventas_cotizacion_aprobar()` (031) inserta todas las reservas de un
  pedido con un solo `INSERT ... SELECT`; las filas resultantes de
  `inventario_apartados` comparten el mismo `created_at` al microsegundo,
  no una secuencia. `ventas_nr_despachar()` (032) confiaba en `order by
  created_at limit 1` para elegir el apartado a consumir cuando un pedido
  tenía dos líneas del mismo producto — no era una elección "la más
  antigua primero", era arbitraria entre filas indistinguibles por esa
  columna (hallazgo crítico #1 de RTB-VEN-01, corregido en `035` con
  `pedido_linea_id`, ver Historial). Regla general: `order by created_at`
  no es un desempate confiable sobre cualquier conjunto de filas que
  pudieron nacer en el mismo `INSERT` multi-fila o la misma función
  `SECURITY DEFINER` — hace falta una columna que identifique la relación
  real (aquí, la línea de origen), no un timestamp que dentro de la misma
  transacción no avanza.
- **Una segunda FK entre las mismas dos tablas rompe el embed implícito de
  PostgREST — en silencio si nadie mira `error`.** Al añadir
  `ventas_po_partidas_po_pedido_fkey (po_id, pedido_id) → (id, pedido_id)`
  (043, para que la partida no pueda apuntar a un pedido distinto del de su
  PO), `ventas_po_partidas` quedó con **dos** FK hacia
  `ventas_ordenes_compra_cliente` (la original `po_id → id`, más esta
  compuesta). Un embed implícito sin desambiguar
  (`partidas:ventas_po_partidas(...)`) desde el lado de la PO/pedido pasó a
  ser ambiguo para PostgREST (PGRST201) — y como el código desestructuraba
  sólo `{ data }` sin mirar `error` (mismo patrón ya documentado del
  gotcha de `.update()`/`.select()`), el síntoma no fue un error visible
  sino un botón que simplemente nunca aparecía ("Surtir PO" en el detalle
  del pedido, encontrado en la verificación clic a clic de 043/044). Se
  corrige con el hint de relación explícito:
  `partidas:ventas_po_partidas!ventas_po_partidas_po_id_fkey(...)`. Una
  consulta **directa** a la tabla hija filtrando por la columna
  (`.from('ventas_po_partidas').eq('po_id', ...)`, sin atravesar la
  relación) no sufre esto — sólo el embed que PostgREST tiene que resolver
  solo. Regla general: añadir una FK compuesta nueva entre dos tablas que
  ya tenían una FK simple obliga a revisar cada embed implícito existente
  entre ellas, en ambos sentidos.
- **Una condición "count = 0 en un conjunto opcional" es una verdad vacía
  cuando ese conjunto simplemente no existe — no confundir "nada
  pendiente" con "nunca hubo nada que hacer".** `ventas_po_recalcular_estado()`
  (048, Vía A) promovía una PO a `'vinculada'` en cuanto
  `compromiso_pendientes = 0 and respaldo_pendiente = 0` — pero una PO sin
  **ninguna** partida de respaldo (todo Vía B, o Vía A puramente de
  compromiso) también cumple `respaldo_pendiente = 0` por conteo vacío,
  así que **toda** PO de Vía B llegaba a `'vinculada'` en cuanto terminaba
  de surtirse, saltándose `'surtida'` — el estado que su propia UI/KPI
  siempre había usado como terminal. Encontrado en la verificación clic a
  clic de esta misma entrega (escenario mixto caso C + caso N, sin
  respaldo), no por la matriz de SQL previa (que sí probó una PO con
  respaldo, donde el comportamiento es correcto). Corregido añadiendo
  `exists(select 1 from ... where tipo='respaldo')` como condición
  explícita adicional (`050_ventas_po_vinculada_fix.sql`) — `'vinculada'`
  sólo aplica si hubo algo que vincular. Regla general: antes de tratar
  "count(*) sobre una condición = 0" como "ya se cumplió", comprobar por
  separado si el conjunto que cuenta pudo estar vacío por diseño, no sólo
  por progreso — un `exists()` aparte, no el mismo `count`, es lo único
  que distingue los dos casos.

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
- **2026-08-07 (continuación)** — Dos quejas de UX del dueño del proyecto sobre
  la barra lateral: logo cuadrado (pedía que fuera circular) y latencia al
  cambiar de pestaña, a veces con doble clic necesario. El logo circular
  destapó que `app/public/logo-rtb.png` **no** era transparente pese a que
  este mismo archivo lo documentaba así desde el principio ("Identidad
  visual" arriba) — confirmado con PIL (`mode == 'RGB'`, esquinas
  `(255,255,255)` sólidas, sin canal alfa). Se regeneró con transparencia
  real (umbral de distancia-a-blanco + de-halo por "unpremultiply" contra el
  fondo blanco conocido, para no dejar halo blanco en los bordes
  antialiaseados al mostrarlo sobre el navy del sidebar) — el archivo
  original queda documentado como "PNG transparente, sin caja blanca" y esta
  vez sí lo es. `components/layout/sidebar.tsx`: contenedor circular
  (`rounded-full overflow-hidden bg-white`, `p-3`/`p-5` colapsado/expandido)
  con el logo transparente encima — círculo blanco visiblemente más grande
  que el emblema, con margen entre el borde y las letras (ajustado a pedido
  del dueño del proyecto tras dos iteraciones). La latencia resultó ser que
  la app **no tenía ningún `loading.tsx`** en todo el árbol de rutas —
  confirmado en los logs del contenedor (`○ Compiling /dashboard/... ✓
  Compiled ... in 700-1400ms` por ruta nueva en `next dev`, más las llamadas
  a Supabase de cada página) — sin ninguna señal visual entre el clic y el
  cambio de página, de ahí el hábito de doble clic. Se agregó
  `app/dashboard/loading.tsx` (spinner sólo en el área de contenido; sidebar
  y header no se desmontan, ver estructura de layouts anidados de
  `app/dashboard/layout.tsx`). No se tocó `requireActiveUser()` ni
  `dynamic = 'force-dynamic'` (decisión de seguridad ya documentada arriba)
  ni el fetch cliente redundante de `useAuth()` en `AuthProvider` (sólo
  corre una vez al montar, no en cada navegación — no era la causa de esta
  queja en concreto, pendiente si se quiere optimizar la carga inicial).
  Recordatorio para el dueño del proyecto: `next dev` recompila cada ruta la
  primera vez que se visita y React StrictMode duplica los efectos de
  cliente — ambos normales sólo en modo dev (confirmado en logs:
  `/api/mapa/puntos` y `/api/catalogos/unidades-medida` se piden dos veces
  seguidas); el perfil `web-prod` (ver entrada anterior) no tiene ninguno de
  los dos. Nota operativa sin relación con código: al revisar cómo se veía
  el logo en la pantalla de login se navegó por error a `/logout`, que cerró
  la sesión activa — la cookie de Supabase Auth es por origen, no por
  pestaña (ver Gotchas), así que cualquier otra sesión abierta en el mismo
  navegador se desconectó también.
- **2026-08-07 (sesión aparte)** — Primer submódulo de RTB-VEN-01 (Ventas):
  cotización con snapshot de precio, Compras-ligero formalizado, reserva/
  compromiso de inventario, Nota de Remisión con despacho al kardex, y
  validación de PO del cliente contra la NR por partida. Punto de partida:
  documento de reglas de negocio del dueño del proyecto que amplía
  `contexto/RTB-PRO-VEN-01_Modulo_Ventas.md` (proceso puro, sin modelo de
  datos) con la decisión técnica central — "PO↔NR no es una llave foránea
  directa, es una tabla de asignación por partida" — y una serie de
  decisiones confirmadas vía `AskUserQuestion` antes de implementar: el
  Costo de Venta es una fórmula viva (costo base ponderado × margen de
  FAMILIA) con override manual que congela; el precio elegido en una
  línea se fotografía y nunca cambia después, sin importar qué pase con
  el costo/margen; Compras-ligero es precondición dura (un producto sin
  costo no se cotiza); el congelamiento de cartera vive en tablas nuevas,
  separado de `entidades.estado`; reserva/compromiso son un solo nivel
  nuevo sobre `inventario_apartados` (no dos tablas ni dos acumuladores);
  una sola partida de PO con costo distinto bloquea la PO completa, sin
  excepción salvo subtotal coincidente autorizado por Dirección. Siete
  migraciones nuevas (`028_ventas_precios.sql` … `034_ventas_tablero.sql`,
  ~20 tablas, ~30 funciones `SECURITY DEFINER`), cada una verificada con
  SQL simulando rol real (`set local role authenticated` +
  `set_config('request.jwt.claim.sub', ...)` — el UUID debe ser un
  literal resuelto ANTES de cambiar de rol, porque una subconsulta contra
  `profiles` bajo RLS sin `auth.uid()` todavía puesto devuelve cero filas
  en silencio) contra datos reales insertados y luego revertidos con
  `rollback`, nunca sólo contra la lectura del código. La verificación
  encontró y corrigió dos bugs reales antes de que hubiera datos en
  riesgo (ver Gotchas): un trigger que revertía en silencio las propias
  transiciones de estado que sus funciones `SECURITY DEFINER` intentaban
  escribir, y un `CASE` sin cast explícito que fallaba `42804` al
  asignarse a una columna enum. De paso: se cerró el TODO histórico de
  `public.tiene_operaciones_abiertas()` (002, siempre `false` desde el
  primer día) y se estrechó `producto_precios_referencia` (010) para que
  `ventas` deje de poder editar dos de los tres precios que el propio
  vendedor elige al cotizar. Capa de API (~35 rutas) y UI (~20 pantallas)
  verificadas con `docker build --target builder` (TypeScript real,
  `ignoreBuildErrors: false`) y `get_advisors` sin `ERROR` nuevo. **Alcance
  explícitamente dejado fuera** (ver TODO): la Vía B de RTB-PRO-VEN-01
  (PO directa del cliente, sin NR) no tiene una función de despacho
  dedicada — el pedido se aprueba y libera igual, pero su entrega/kardex
  queda pendiente de diseño; y el reloj de cobranza/CFDI/pagos son
  RTB-PRO-FAC-01, módulo futuro (`nr_estado` ya incluye
  `facturada`/`pagada_cerrada`, pero ninguna función de este módulo los
  escribe). Detalle completo de la sesión en
  `sessions/2026-08-07-modulo-ventas.md`.
- **2026-08-07 (sesión aparte, auditoría posterior)** — Auditoría de punta
  a punta de RTB-VEN-01 pedida por el dueño del proyecto, en dos fases:
  (1) lectura completa de las 7 migraciones + capa compartida + API +
  pantallas de mayor complejidad, con reproducción por SQL
  (`BEGIN`/`ROLLBACK`, sin datos persistidos) del hallazgo #1; (2) a
  petición explícita del dueño del proyecto, verificación clic a clic con
  la extensión Claude in Chrome y los 8 usuarios QA (nunca la cuenta real
  del dueño), creando datos de prueba **desde la interfaz** porque el
  catálogo seguía vacío (familia con margen, producto, existencia real
  vía un Ajuste autorizado end-to-end, cotización con 2 líneas del mismo
  producto, pedido, NR, despacho). La fase 2 confirmó el hallazgo #1 con
  datos reales y persistidos (`COT-000039`/`PED-000019`/`NR-000014`) —
  mismo resultado exacto que la simulación por SQL — y encontró un
  defecto más grave en severidad práctica: `cotizacion-detalle.tsx`
  usaba `<Tooltip>` de Radix sin `<TooltipProvider>` (ningún layout del
  proyecto lo provee globalmente), lo que tronaba la pantalla completa al
  elegir cualquier producto en "Agregar línea" — bloqueaba por completo
  el alta de líneas de cotización desde el navegador, en cualquier rol.
  Corregido en el momento (una línea + un `TooltipProvider` local,
  `npx tsc --noEmit` limpio) por ser trivial y bloquear el resto de la
  verificación — ver gotcha nuevo en Gotchas conocidos. Hallazgos
  adicionales, todos menores: la UI no refresca tras una mutación exitosa
  en al menos 3 puntos del ciclo (agregar línea, aprobar cotización, y en
  Ajustes de RTB-INV-01: enviar/autorizar/aplicar — mismo patrón, código
  2xx pero pantalla sin actualizar sin recargar); el UUID crudo del
  producto se muestra en vez de su nombre en cotización/pedido/NR; la
  tarjeta "Ventas" del dashboard principal seguía con badge
  "Próximamente" pese a estar ya activo; "Costo vigente" en producto no
  se refresca tras registrar un costo nuevo. Detalle completo de cada
  hallazgo, con reproducción paso a paso, en
  `contexto/AUDITORIA_RTB-VEN-01.md` — actualizado también
  `db/ESQUEMA.md` (nota en `inventario_apartados`) y
  `db/procesos/ciclo-de-venta.md` (nota en §5 y en "Qué puede fallar").
  Los datos `QA-*`/`COT-000039`/`PED-000019`/`NR-000014`/`AJU-000016..18`
  creados durante la verificación quedaron persistidos como evidencia,
  mismo criterio que otras campañas QA del proyecto — no se purgaron.
- **2026-08-07 (sesión aparte, corrección del hallazgo crítico #1)** —
  `inventario_apartados` no ligaba cada reserva a la línea de pedido que
  la originó (sólo a `producto_id`/`pedido_id`), así que
  `ventas_nr_despachar()` (`032`) emparejaba con `order by created_at
  limit 1` — arbitrario cuando un pedido tiene 2+ líneas del mismo
  producto, y `ventas_cotizacion_aprobar()` inserta todas las reservas de
  un pedido en el mismo `INSERT ... SELECT`, así que ni siquiera
  desempataba por orden real de creación (mismo `created_at` al
  microsegundo — ver gotcha nuevo). Migración
  `035_apartados_pedido_linea.sql`: columna `pedido_linea_id` con FK
  compuesta `(pedido_linea_id, pedido_id)` → `ventas_pedido_lineas (id,
  pedido_id)` (`MATCH SIMPLE`, no se evalúa si alguna columna es NULL —
  así el apartado libre de Almacén sin pedido sigue sin verse afectado),
  poblada desde `ventas_cotizacion_aprobar()` al nacer la reserva y
  propagada al remanente en `ventas_nr_despachar()` cuando el despacho es
  parcial; `apartados_before_update()` la congela igual que `pedido_id`;
  `uq_apartados_pedido_linea_activo` (índice único parcial) garantiza como
  máximo una reserva activa por línea — es lo que permite que el despacho
  resuelva con una sola fila sin ambigüedad, en vez de sólo esperar que
  así fuera. Los 3 apartados históricos de `PED-000019` (la evidencia
  persistida del propio hallazgo, campaña QA anterior) se backfillearon en
  la misma migración con dos reglas deterministas (match directo por
  perfil `producto_id`+`cantidad` único, y remanente de despacho parcial
  heredado del apartado padre vía el `inventario_movimientos` que lo
  originó) — la incoherencia que el bug había dejado (línea de 5 piezas
  sub-reservada, línea de 3 con un apartado huérfano) se dejó tal cual,
  documentada, sin sanear el pedido histórico. Verificado con matriz SQL
  completa (rol real simulado, `BEGIN/ROLLBACK`: caso de 2 líneas
  repetidas despachadas fuera de orden, despacho parcial, línea única,
  rechazo legítimo, atomicidad ante error de kardex, permisos negativos) y
  clic a clic con usuarios QA reproduciendo el escenario exacto que había
  fallado, con datos nuevos y persistidos. Actualizados
  `contexto/AUDITORIA_RTB-VEN-01.md` (hallazgo #1 marcado como corregido,
  sin borrar la descripción original), `db/ESQUEMA.md` y
  `db/procesos/ciclo-de-venta.md`. Sin cambios de RLS ni uso de
  `service_role` — el `GRANT INSERT` por columna de `031` ya no incluía
  `pedido_linea_id` en la lista escribible por `authenticated`, así que
  sigue sin serlo.

- **2026-08-07 (sesión aparte, §3 de la auditoría — rendimiento y
  operación de RTB-VEN-01)** — Cerró los seis hallazgos de
  `contexto/AUDITORIA_RTB-VEN-01.md` §3, en paralelo con la sesión que
  corrigió el hallazgo crítico #1 (mismo repositorio, migración `035` ya
  tomada por esa sesión — ésta usó `036`). §3.1: `ordenes-compra/[id]/page.tsx`
  dejó de traer `ventas_po_nr_vinculos` completa (`select('*')` sin
  filtro) — ahora dos oleadas de `Promise.all`, la segunda con
  `.in('po_partida_id', partidaIds)`. §3.2: los 6 endpoints
  (`ordenes-compra`, `consultas`, `congelamientos`, `excepciones`,
  `autorizaciones`, `pedidos`) pasaron al contrato ya establecido en el
  repo (`{data,count,page,pageSize}`, `PAGE_SIZE` local, `.range()`) —
  `cotizaciones`/`notas-remision` recibieron de paso el `page`/`pageSize`
  que les faltaba y el `|| 1` que ya tenían las otras 8 rutas paginadas
  del proyecto (sin él, `?page=abc` producía `NaN` en `.range()`).
  `consultas` fue el caso difícil: sus pestañas Abiertas/Resueltas
  filtraban en memoria el universo completo — ahora `estado` acepta una
  lista separada por comas (`.in()`) y el endpoint devuelve un `abiertas`
  aparte (count con `head:true`) para que el badge de la pestaña siga
  correcto aunque la pestaña activa sea Resueltas. Componente nuevo
  `components/ui/paginacion.tsx` (el bloque "Mostrando X–Y de N / Anterior
  / Siguiente" estaba copiado literal en 5 pantallas sin ninguno
  compartido) usado sólo en las 4 pantallas nuevas — las 5 existentes no
  se tocaron. §3.3: `costo_venta_detalle()` evaluaba
  `costo_promedio_global()` hasta **7** veces por llamada en el caso común
  (el hallazgo original decía 4) — Postgres no memoiza una función
  `stable` dentro del mismo `SELECT`; bajó a 1 con `cross join lateral`,
  verificado idéntico en 7 escenarios comparativos (`old` vs `new`,
  transacción con `ROLLBACK`). §3.4: el campo "ID de autorización" de
  `po-detalle.tsx` (texto libre para copiar/pegar un UUID) pasó a un
  `<select>` poblado desde `GET /api/ventas/autorizaciones` filtrado por
  las cuatro condiciones exactas que exige `ventas_po_validar()`
  (`tipo=excepcion_subtotal`, `estado=autorizada`,
  `documento_tipo=purchase_order`, `documento_id=po.id`) — con exactamente
  una vigente se preselecciona sola. §3.5: `ventas_vinculo_cancelar()`
  (`036`) — el enum `vinculo_estado` ya tenía `'cancelado'` desde `033`
  pero ninguna función lo escribía. Nunca borra la fila; bloqueada si el
  vínculo ya está `aprobado_para_facturacion`/`facturado`; recalcula el
  estado de la PO y de la NR **hacia atrás** (el `CASE` de
  `ventas_po_validar()` sólo avanza) — con cero vínculos activos en toda
  la PO el estado vuelve a `en_validacion`, no `parcialmente_vinculada`
  (que con cero cobertura mentiría). Se le agregó también el trigger
  `audit_row()` que le faltaba desde `033`. §3.6: **sin cambiar** —
  `ventas_ordenes_compra_cliente` no tiene `vendedor_id` y
  `ventas_po_validar()` sólo valida por rol, pero no hay una regla
  inequívoca en código ni en proceso que diga si eso es correcto o un
  hueco; se documentó como pregunta pendiente para el dueño del proyecto
  en `db/procesos/ciclo-de-venta.md` y aquí abajo, sin tocar autorización
  por suposición.

  Verificado con SQL simulando rol real (`set_config('request.jwt.claim.sub', ...)`
  — sin `set local role`, porque `current_user_role()`/`ventas_vinculo_cancelar()`
  sólo dependen de `auth.uid()`, no del rol de sesión de Postgres; las
  funciones `SECURITY DEFINER` corren como su dueño de cualquier forma):
  camino feliz de cancelación con escalado de estado (2 vínculos → cancelar
  uno → `parcialmente_vinculada`/`parcialmente_respaldada` → cancelar el
  otro → `en_validacion`/`entregada_sin_po` con cero activos → re-vincular
  el mismo par sin chocar contra `uq_vinculo_par`), cancelar un
  `facturado`/`aprobado_para_facturacion` (ambos `42501`), doble
  cancelación (`42501`), motivo vacío (`23514`), rol sin permiso
  (`42501`, y el vínculo no se toca), CHECK directo, `audit_log` con
  ambas filas (`insert`/`update`). Y clic a clic real con usuarios QA
  (`QA Ventas` valida con subtotal coincidente y unitarios distintos →
  solicita autorización → `QA Dirección` la aprueba desde
  `/dashboard/ventas/autorizaciones` → `QA Ventas` vuelve a la PO y la ve
  preseleccionada sin teclear ningún UUID → valida con éxito, PO
  `POC-000016` vinculada → cancela un vínculo con motivo → PO baja a
  `parcialmente_vinculada`, NR baja a `parcialmente_respaldada`,
  confirmado por SQL directo). El navegador se compartió con la sesión
  concurrente del hallazgo #1 (mismo perfil de Chrome, cookie de Supabase
  Auth por origen) — varias veces una sesión pisó el login de la otra a
  media acción ("No autenticado" en un submit que sí llegó a ejecutarse
  bajo el usuario anterior); se resolvió reintentando y confirmando cada
  resultado contra la base de datos por SQL directo en vez de confiar sólo
  en la pantalla, mismo criterio ya documentado para sesiones concurrentes.
  `npx tsc --noEmit` y `docker build --target builder` (TypeScript real)
  limpios. Detalle completo en
  `sessions/2026-08-07-ventas-optimizaciones.md`.
- **2026-08-07 (sesión aparte, corrección de UX/refresco de
  RTB-VEN-01 — §7.1, 7.3–7.6 de la auditoría)** — Tercera sesión del día
  sobre el mismo repositorio, en paralelo con las dos anteriores
  (hallazgo #1 y §3). Cerró los defectos de experiencia detectados en la
  verificación clic a clic de `contexto/AUDITORIA_RTB-VEN-01.md`, sin
  tocar SQL/RLS ni contratos de API salvo un embed additivo. §7.1
  (`Tooltip` sin `TooltipProvider`): ya venía corregido de la propia
  sesión de auditoría; se dejó documentada la convención en
  `components/ui/tooltip.tsx` (el repo no monta un provider global, cada
  uso envuelve el suyo local). §7.3 (la UI no refrescaba tras una
  mutación exitosa): causa raíz doble — las pantallas de detalle de
  Ventas espejaban las props del Server Component en `useState(prop)`
  (`router.refresh()` trae props frescas, pero un `useState` sólo lee su
  argumento en el primer render, así que el espejo nunca las veía), y el
  refetch de cliente que sí existía no se esperaba antes de reactivar el
  botón y tragaba sus propios errores. Se retiró el espejo en las 4
  pantallas de detalle (`cotizacion-detalle.tsx`, `pedido-detalle.tsx`,
  `nr-detalle.tsx`, `po-detalle.tsx`) y en `cartera-comercial-tab.tsx`,
  `consultas-bandeja.tsx`, `autorizaciones-bandeja.tsx` — el Server
  Component pasa a ser la única fuente de verdad; el estado de cliente
  sólo guarda lo que el servidor no sabe (`propuestos`/`resultado` de PO,
  diálogos abiertos, formularios). Nuevo hook compartido,
  `app/lib/ui/use-accion-servidor.ts` (`ejecutar()`: `fetch` con
  `cache:'no-store'`, error visible, `startTransition(() =>
  router.refresh())` en éxito), y `app/components/ui/actualizando.tsx`
  (indicador «Actualizando…»). Excepción documentada en el propio código:
  `po-detalle.tsx` NO usa el hook para `validar()` porque
  `ventas_po_validar()` responde `200` con `{success:false,...}` como
  resultado de negocio válido (PO rechazada, nada persistido) — refrescar
  ahí habría sido trabajo de red innecesario, no un bug. El mismo defecto
  de refresco existía también en `inventario/ajustes/[id]/page.tsx`
  (RTB-INV-01) y en `productos/[id]/producto-detalle.tsx` (pestaña
  Costos) — fix mínimo en el primero (esperar el refetch, `cache:
  'no-store'`, mostrar el error, `router.refresh()` para que la bandeja y
  la ficha de producto no queden viejas por el Router Cache de Next) y
  refresco real + `toast` en el segundo. §7.4 (UUID crudo de
  `producto_id` en vez de nombre): embed de PostgREST
  `productos(codigo_interno, nombre)` añadido en las 3 páginas de
  servidor de Ventas y sus `GET` de API equivalentes (mismo patrón que
  `api/inventario/ajustes/[id]/route.ts`, ya funcional); componente
  nuevo `components/inventario/producto-etiqueta.tsx`
  (`<ProductoEtiqueta>`) que nunca pinta el UUID como texto visible
  (fallback "Producto no disponible" con el UUID sólo en `title=`), usado
  en cotización/pedido/NR/Ajustes. §7.5 (tarjeta "Ventas" del dashboard
  seguía en "Próximamente"): `dashboard/page.tsx` mantenía su propio
  `MODULE_CARDS` hardcodeado y sin filtro por rol, una segunda lista
  desincronizada de `NAV_SECTIONS` (la que ya usa el sidebar, donde
  Ventas dejó de tener `badge` cuando se activó). Se sustituyó por
  `getNavForRole(role)` filtrando la sección "Módulos" (constante nueva
  `SECCION_MODULOS` en `lib/rbac/config.ts`), con un mapa local sólo de
  presentación (color/descripción) indexado por `href` — un módulo sin
  `badge` en `NAV_SECTIONS` queda disponible en ambos lados a la vez, sin
  mantener dos listas. §7.6 ("Costo vigente" no se refrescaba): dos
  piezas, porque arreglar sólo el refresco habría dejado al usuario
  viendo el mismo número sin explicación — refresco real (ya cubierto
  arriba) más una nota de fuente bajo el KPI ("Promedio de inventario" /
  "Catálogo o proveedor") y un aviso en la pestaña Costos, porque
  `costo_unitario_vigente()` (`011_inventario_kardex.sql:690-708`)
  prioriza `inventario_existencias.costo_promedio` sobre
  `producto_costos`: en un producto con existencias valuadas, un costo de
  catálogo nuevo **legítimamente no mueve** el KPI, y sin la nota eso se
  ve indistinguible de que el fix no funcionó. Verificado clic a clic con
  usuarios QA reales (no sólo lectura de código): `COT-000061` completa
  (agregar línea sin crash del Tooltip, enviar, aprobar — badge y
  botones cambian sin recargar), `PED-000041` (liberar a Almacén con
  estado real, no inferido por `url.includes()` como antes), `NR-000014`
  (mismas 2 líneas del hallazgo #1 ahora con código+nombre, seguimiento
  agregado sin recargar), `AJU-000019` (ciclo completo: agregar línea →
  enviar → autorizar → aplicar al kardex, los cuatro sin recargar,
  incluida la bandeja de Ajustes al volver a ella — confirma que también
  se invalida el Router Cache, no sólo la ruta activa), tarjeta de
  dashboard con `qa.almacen`/`qa.direccion`, y "Costo vigente" con
  `qa.compras` en `RTB-FER-000006`. `npx tsc --noEmit` y `docker build
  --target builder` limpios en cada verificación intermedia, no sólo al
  final — necesario porque las tres sesiones del día escribían archivos
  compartidos en paralelo (mismo repositorio, sin worktrees separados);
  se confirmó antes de cerrar que ningún archivo propio había perdido
  cambios de las otras dos. `contexto/AUDITORIA_RTB-VEN-01.md`
  actualizado: §7.3–§7.6 marcados como corregidos con el texto original
  conservado debajo como registro. Detalle completo en
  `sessions/2026-08-07-correccion-ux-ven01.md`.

- **2026-08-07 (sesión aparte, agente D — QA de navegación de
  RTB-VEN-01 + alta de roles comerciales)** — El dueño del proyecto pidió
  recorrer clic a clic el módulo de Ventas con 10 roles (los 8 reales más
  `gerente_comercial`/`cobranza`, que resultaron no existir) y corregir
  dos síntomas ya reportados: BUG-NAV-01 (`super_admin` veía contadores en
  el tablero sin poder profundizar) y BUG-NAV-02 (`ventas` sólo alcanzaba
  el dashboard y las NR). La investigación descartó la hipótesis de
  permisos denegados: las 43 políticas `SELECT` de los módulos operativos
  son role-agnostic, los 20 GET de `/api/ventas/*` llamaban
  `requireApiRole()` sin argumento, y ninguno de los 13 `page.tsx` del
  árbol comprobaba rol — **no había ningún bloqueo**. La causa real, única
  para ambos síntomas, era navegación ausente: el sidebar registraba un
  solo item de Ventas sin sub-items y las 7 tarjetas KPI del tablero eran
  `<div>` sin `href`. Corrección (`db/migrations/037_roles_comerciales.sql`
  + capa TypeScript): `profiles_role_check` amplía a 10 roles
  (`gerente_comercial` = `direccion` sólo dentro de Ventas;
  `cobranza` = sólo lectura, precursor de RTB-PRO-FAC-01) — cada
  `create or replace` de las 10 funciones `SECURITY DEFINER` tocadas se
  construyó desde `pg_get_functiondef()` de la base viva, no de las
  migraciones 031/032/033 originales, para no revertir en silencio los
  fixes de 035/036 (verificado con diff estructural después). Nueva
  constante `ACCESO_PANTALLA` (`lib/ventas/permisos.ts`) como fuente única
  para el submenú del sidebar (`NavItem` gana `children`), los `href` de
  las tarjetas del tablero, el nuevo `app/dashboard/ventas/layout.tsx`
  (`requireRole()`, no existía) y cada `page.tsx`/GET de API individual.
  Las dos pantallas `nueva` (cotizaciones, PO) eran `'use client'` sin
  ningún guard de servidor — se dividieron en Server Component + form
  cliente. Dos pantallas construidas desde cero,
  `/dashboard/ventas/{congelamientos,excepciones}` — sus APIs existían
  huérfanas desde la sesión original del módulo; en particular
  `congelamientos/[id]/liberar` no tenía ningún consumidor de UI, así que
  un cliente congelado era irreversible desde el navegador. Verificado con
  32 aserciones SQL simulando rol real (anti-autoaprobación de
  `gerente_comercial` confirmada por identidad, no por rol; no regresión
  de los 8 roles existentes) y clic a clic real con 5 de los 10 usuarios
  QA: BUG-NAV-01/02 cerrados con clic real, ciclo completo
  congelar→liberar sobre una entidad real, y el guard nuevo confirmado
  como redirect de servidor (no sólo sidebar oculto) para `logistica`
  (excluido del todo) y `cobranza` (excluido de `cotizaciones`). Un
  incidente de HMR de `next dev` (no del código: `docker build
  --target builder` limpio) tras convertir una de las páginas `nueva` de
  client a server component se resolvió con `docker compose restart web`.
  `npx tsc --noEmit` y `docker build --target builder` limpios,
  `get_advisors` sin `ERROR` nuevo. De paso, deduplicadas
  `ROLES_AUTORIZAN_VENTAS`/`ROLES_RESPONDEN_CONSULTA`/`ROLES_DESPACHAN_NR`
  (vivían repetidas en `lib/ventas/config.ts` y `permisos.ts`) y sustituidas
  38 listas literales de "los 8 roles" en las tres matrices de permisos
  (`lib/{entidades,inventario,ventas}/permisos.ts`) por la constante nueva
  `TODOS_LOS_ROLES` (`types/database.ts`) — sin eso, un alta de rol futura
  quedaría ciega en silencio en 38 sitios distintos. 2 usuarios QA nuevos
  creados vía `POST /api/admin/users` (único camino correcto):
  `qa.gerente.comercial@qa.refacrtb.mx` / `qa.cobranza@qa.refacrtb.mx`.
  Detalle completo, incluida la matriz pantalla×rol y las observaciones
  sin corregir, en `sessions/2026-08-07-agente-d-qa-navegacion-ventas.md`.

- **2026-08-08** — Rehecho el listado de `/dashboard/ventas/cotizaciones`
  a pedido del dueño del proyecto: era la única pantalla de Ventas que
  había quedado fuera de la migración a "explorer" de la sesión de
  optimizaciones (`.limit(50)` fijo, sin `count`, sin paginación, sin
  búsqueda, un único filtro `?estado=`). Ahora tiene dos vistas
  intercambiables — **tablero de tarjetas por estado** (por defecto,
  recordada en `localStorage`) y **tabla** —, búsqueda por
  folio/siglas/razón social/nombre comercial/clave del cliente, filtro de
  rango de fechas por campo elegible (creación/envío/aprobación-resolución
  /vigencia), y filtros de canal, vendedor ("sólo mías"), vigencia
  (vigente/vencida) y líneas en consulta. Migración
  `038_ventas_cotizaciones_listado.sql`: vista **`ventas_cotizaciones_listado`**
  (`security_invoker = true` — primera vista del repo; no es el patrón
  "función, no vista" de `usuarios_directorio()`, ese existe para saltarse
  la RLS, aquí es lo contrario) que aplana `entidades` (`entidad_id` no
  tiene FK a `clientes`) y agrega `total`/`lineas_count`/
  `lineas_en_consulta` sumando líneas activas — la cabecera nunca tuvo
  columna de total, el snapshot de precio vive en la línea (030). `LEFT
  JOIN` a `entidades` a propósito (defensivo: si su RLS se estrechara algún
  día, se pierde el nombre del cliente, nunca la cotización de la lista) y
  4 índices nuevos sobre fecha. Capa compartida
  `app/lib/ventas/listado-cotizaciones.ts` (parseo/validación de filtros
  contra sus tuplas `as const`, construcción de `.or()`/`.in()`/rango de
  fechas, orden con desempate por `folio`, construcción de las columnas del
  tablero) — un solo lugar para el GET (modo lista y modo tablero, una
  consulta por columna con su `count` real) y el Server Component, para que
  nunca diverjan (el defecto que ya tenía esta ruta: el `page.tsx` viejo
  traía el embed de `entidades` y el GET no). Primer consumidor de
  `components/ui/calendar.tsx` (huérfano desde la purga de componentes) vía
  el componente nuevo `components/ui/rango-fechas.tsx`. Verificado con SQL
  simulando rol real (conteo de la vista = conteo de la tabla base para
  varios roles, `42501` al revocar el `GRANT` de la vista y ruta normal al
  restaurarlo, total de la vista contra `sum(importe)` calculado aparte,
  `EXPLAIN` confirmando que el `LEFT JOIN LATERAL` de líneas se poda del
  plan en un `count(*)`), `get_advisors` sin `ERROR` nuevo, `npx tsc
  --noEmit` y `docker build --target builder` limpios, y clic a clic real
  con `qa.ventas` (búsqueda por folio/siglas/razón social **con coma** —
  caso real, "QA Cliente Uno, S.A. de C.V." — sin romper el `.or()` de
  PostgREST; filtro de fecha de creación acotado a un solo día confirmando
  que el último día del rango sí aparece; filtro de fecha de envío
  excluyendo correctamente los borradores sin `enviada_at`; "sólo mías";
  deep-link `?estado=` desde el tablero de Ventas con su enlace "ver
  todas"; persistencia de la vista tablero/tabla en `localStorage` tras
  F5) y `qa.almacen` confirmando `403`/redirect por no tener acceso a la
  pantalla. Sin cambios de RLS ni de autorización.

- **2026-08-08 (sesión aparte, misma jornada)** — Rediseño del ciclo de vida
  de `ventas_cotizaciones` a pedido del dueño del proyecto: hasta ahora
  "cancelar" cubría dos casos sin distinguirlos (arrepentirse antes de
  enviar / el cliente se retracta después de aprobar). Vocabulario nuevo:
  `rechazada` = el cliente dijo que no a una **enviada** (sin cambios, ya
  era así); `cancelada` = el cliente se retractó de una **aprobada** — y
  sólo si nada se ha entregado todavía (antes era al revés:
  `ventas_cotizacion_cancelar()` permitía borrador/enviada y prohibía
  aprobada). Si el pedido asociado ya muestra `entregado_parcial` **o**
  `entregado`, cancelar no procede: se abre una **devolución** en su
  lugar — nueva tabla `ventas_devoluciones` (seguimiento básico: folio,
  motivo, `valor_entregado` informativo, `pendiente`/`resuelta`; **sin**
  reembolso ni nota de crédito real, Facturación/RTB-PRO-FAC-01 no existe
  todavía — TODO explícito, con el gancho ya documentado hacia
  `entrada_devolucion_cliente` del kardex, `011`, sin ningún escritor
  todavía). Dos migraciones nuevas por el límite de Postgres de no poder
  referenciar en la misma transacción un valor que `ALTER TYPE ... ADD
  VALUE` acaba de agregar: `039_ventas_devoluciones_schema.sql` (enums
  `'en_devolucion'` en `ventas_cotizacion_estado`/`pedido_estado`, tabla
  `ventas_devoluciones`, columnas `cancelado_at`/`cancelado_por`/
  `motivo_cancelacion` en `ventas_pedidos`/`ventas_notas_remision` —
  ninguna función las escribía jamás, eran valores muertos del enum desde
  031/032 —, `GRANT DELETE`+RLS de `ventas_cotizacion_lineas` borrador-only,
  `or delete` agregado a los triggers de auditoría de cotización/líneas,
  primer `DELETE` real de todo el esquema) y
  `040_ventas_cotizacion_transiciones.sql` (después de que 039 hiciera
  commit: `ventas_cotizacion_cancelar()` reescrita con las dos ramas,
  `ventas_cotizacion_linea_before_write()` con candado total —ni INSERT ni
  UPDATE— fuera de `borrador`/`enviada` en vez de proteger sólo 5 columnas
  de precio comparando contra el literal `'borrador'` (cierra un hueco
  real: antes se podía cambiar cantidad/descuento/activo de una línea de
  una cotización **ya aprobada**), `ventas_cotizacion_eliminar()` nueva
  (borra líneas + cabecera de un borrador en una transacción),
  `ventas_devolucion_resolver()` nueva, `ventas_kpis()` +
  `devoluciones_pendientes`). Corrección `041_ventas_cotizacion_eliminar_fix.sql`
  el mismo día: `ventas_consultas_compras.cotizacion_id` es
  `on delete restrict` — un borrador creado con "Consultar a Compras"
  fallaba al eliminarse con una violación de llave foránea cruda; ahora las
  consultas `abierta`/`en_proceso` ligadas se cancelan y desligan, las
  `respondida`/`sin_disponibilidad` sólo se desligan
  (`consulta_respuesta_chk` es una equivalencia, forzarlas a `cancelada`
  habría violado el `CHECK` o exigido borrar la respuesta ya capturada) —
  y de paso `valor_entregado` a `ventas_devoluciones` + índice único
  parcial que impide dos devoluciones `pendiente` sobre el mismo pedido.
  Toda migración partió del cuerpo **vivo** de las funciones (verificado
  con `pg_get_functiondef()` contra Supabase real, no de `030`/`031`, que
  `037_roles_comerciales.sql` ya había reemplazado). Capa de aplicación:
  `puedeAdministrar` en `cotizacion-detalle.tsx` ganó `gerente_comercial`
  (bug preexistente, la RLS ya lo autorizaba desde `037` pero la UI le
  ocultaba los botones); botón "Cancelar" ahora sólo en `aprobada`, con
  aviso distinto (`toast`) según la función devuelva `cancelada` o
  `en_devolucion` con el folio; botón nuevo "Eliminar cotización"
  (`AlertDialog`) sólo en `borrador`; "Quitar línea" pasa a `DELETE` real
  en `borrador` y sigue siendo `activo:false` en `enviada`; pantalla nueva
  `/dashboard/ventas/devoluciones` (bandeja + "Resolver", roles
  `super_admin`/`direccion`/`gerente_comercial`, `ventas` sólo lectura) y
  tarjeta KPI "Devoluciones pendientes" en `/dashboard/ventas`. El tablero
  de cotizaciones (`038`, sesión anterior) ganó la columna "En devolución"
  automáticamente, sin tocar ni un archivo suyo — generaba una columna por
  cada valor de `VENTAS_COTIZACION_ESTADOS`. Verificado con SQL simulando
  rol real sobre los 3 escenarios reales de QA existentes (`PED-000041`
  `liberado` → cancelación en cascada con apartado liberado y
  `cantidad_apartada` decrementada; `PED-000040` `entregado` y
  `PED-000019` `entregado_parcial` → ambos abrieron devolución sin tocar
  NR/apartados), `get_advisors` sin `ERROR` nuevo, `npx tsc --noEmit` y
  `docker build --target builder` limpios, y clic a clic real con
  `qa.ventas` (crear borrador, agregar línea, borrarla de verdad, eliminar
  la cotización completa, editar producto/precio de una línea `enviada`
  —antes bloqueado—, cancelar `COT-000061` sin entrega, cancelar
  `COT-000039` con entrega parcial → `DEV-000006`), `qa.direccion`
  (resolver `DEV-000006` con notas) y `qa.almacen` confirmando redirect de
  servidor fuera de `/dashboard/ventas/devoluciones`. Los folios/datos QA
  generados (incluida la cancelación real de `COT-000061` y la devolución
  `DEV-000006`, resuelta) quedaron persistidos como evidencia, mismo
  criterio que otras campañas de este repo. Detalle completo en
  `sessions/2026-08-08-ciclo-cotizacion-devoluciones.md`. Sesión concurrente
  en el mismo repositorio (`documento-cotizacion.ts`,
  `042_ventas_cotizacion_envios.sql`, envío de cotizaciones por correo) —
  se verificó que ningún archivo tocado por ambas perdiera cambios de la
  otra.

- **2026-08-08 (sesión aparte, concurrente con la anterior)** — Documento
  PDF de cotización + envío por correo (MailerSend), pedido explícito del
  dueño del proyecto con una plantilla HTML de ejemplo (de otro sistema,
  campos tipo Notion — `nombre_de_cotizacion`, `po`, `pr`, interés, envío —
  sin equivalente en este esquema). Se adaptó, no se copió literal:
  PO/PR/interés/envío se eliminaron (no existen en `ventas_cotizaciones`);
  la rejilla de referencias pasó a Vendedor/Canal/Vigencia real (sin el
  cálculo "+15 días" que traía el ejemplo — usa `vigencia_hasta` tal cual,
  o "Sujeta a confirmación")/Crédito; IVA 16% sí se conservó, calculado en
  el render (`IVA_TASA`, nueva constante en `lib/ventas/config.ts` — el
  esquema no tiene columna de impuesto, el CFDI real es RTB-PRO-FAC-01,
  módulo futuro). Decisiones cerradas con el dueño del proyecto antes de
  implementar (`AskUserQuestion`): motor de PDF = Chromium headless vía
  Puppeteer dentro de Docker (fidelidad total al HTML/CSS dado, sobre
  @react-pdf/renderer o una API externa de pago); el envío de correo es un
  botón **independiente** "Enviar por correo" (no toca
  `ventas_cotizacion_enviar()`, que sigue sin mandar nada real); MailerSend
  ya tenía cuenta/dominio verificado, sólo hacía falta dejar la integración
  lista; destinatario prellenado con el contacto principal o
  `entidades.correo_principal`, editable.

  Infra: `chromium` + fuentes vía `apk add` en los stages `dev`/`runner`
  del `Dockerfile` (nunca en `builder`), `puppeteer-core` (nunca
  `puppeteer` completo — jamás debe intentar descargar su propio
  Chromium), `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`,
  `experimental.serverComponentsExternalPackages` en `next.config.js` para
  que el output tracing del standalone lo incluya. Verificado que el
  binario real es `/usr/bin/chromium-browser` (no asumido) y que
  `puppeteer-core` aparece solo en `.next/standalone/node_modules` sin
  ningún `COPY` manual adicional. Tipografías Inter + Playfair Display
  auto-hospedadas (`.woff2` variables descargados de Google Fonts e
  inlineados en base64 desde `app/public/fonts/`, no cargadas en runtime)
  para que el render sea 100% offline y determinista — igual que el logo
  (`app/public/logo-rtb.png` leído del disco y codificado al vuelo, nunca
  hardcodeado: el base64 que pegó el dueño del proyecto en su ejemplo
  podía estar desactualizado tras la regeneración con transparencia real
  del 2026-08-07).

  Migración `042_ventas_cotizacion_envios.sql`: bitácora append-only de
  cada intento de envío (éxito y fallo — un fallo debe quedar visible, no
  desaparecer), **sin** función `SECURITY DEFINER` a propósito (no es una
  transición de estado, es sólo auditoría) — `GRANT INSERT` por columna
  (excluye `id`/`enviado_por`/`enviado_at`, con default) + política RLS
  espejo de `ventas_cotizaciones_update` (`037`). Verificado con 8
  escenarios de SQL con rol real: `ventas` dueño inserta, `ventas` no
  dueño → `42501`, `gerente_comercial` sobre cualquier cotización → pasa,
  roles fuera de la matriz ven pero no insertan, falsear `enviado_por` →
  bloqueado por privilegio de columna (no por RLS), `update`/`delete` →
  siempre `42501`, `resultado='fallido'` sin `error_detalle` → viola el
  `CHECK`, y borrar un borrador con envíos ya registrados
  (`ventas_cotizacion_eliminar()`) → cascada limpia con el rastro
  conservado en `audit_log`.

  Capa nueva `lib/ventas/{documento-cotizacion,plantilla-cotizacion,
  generar-pdf,mailersend}.ts` — un solo render reutilizado por "ver/
  imprimir" (`GET .../pdf`, con `?html=1` para depurar sin Chromium de por
  medio) y por el adjunto de correo (`POST .../correo`, que registra
  siempre en la bitácora, éxito y fallo, con el cliente del propio
  usuario). Bug real encontrado y corregido en la propia verificación
  visual (no en el código a simple vista): `productos.marca` ya no existe
  desde `015` (reemplazada por `marca_id` → `producto_marcas`) —
  `documento-cotizacion.ts` seguía pidiéndola, así que toda cotización con
  líneas devolvía **cero líneas** en silencio (el `error` de PostgREST no
  se estaba revisando — mismo patrón del gotcha ya documentado de
  `.update()`/`.select()` sin mirar `error`). Segundo hallazgo de la
  verificación visual: el documento de una sola página se desbordaba a una
  segunda hoja casi en blanco por una línea de marca al pie duplicada con
  el footer real de Puppeteer — se quitó, dejando sólo el remate
  ornamental. Tercero: una línea `en_consulta` (sin precio todavía)
  mostraba `$0.00` en la tabla — cambiado a `—`, porque no es gratis, es
  desconocido. Verificado con Puppeteer real dentro del contenedor:
  documento de 1 línea, de 2 líneas (una con foto real de
  `producto_imagenes`, descuento, y una línea `en_consulta`), y de **45
  líneas** para confirmar paginación real (4 páginas, cabecera de tabla
  repetida en cada una, 45/45 SKU presentes, totales exactos, ninguna
  cortada). Prueba de escape con `<script>alert(1)</script><img src=x
  onerror=alert(1)>` en `observaciones` de una cotización real → se
  renderiza como texto plano, sin diálogo de alerta (Chromium corre con
  `--no-sandbox`, así que el escape no es cosmético).

  Verificado además: `docker build --target builder` (TypeScript real) y
  el perfil `web-prod` completo (`docker compose --profile prod up
  --build`) — `puppeteer-core` sí quedó trazado en
  `.next/standalone/node_modules` sin `COPY` manual, y Chromium lanza
  correctamente bajo el usuario no-root `nextjs` del stage `runner`. Clic
  a clic real con `qa.ventas` (vía *magic link* de
  `admin.generateLink()`, sin tocar contraseñas): botón "Ver / Imprimir
  PDF" abre el documento real en el visor del navegador; diálogo "Enviar
  por correo" prellena destinatario/asunto; sin `MAILERSEND_API_KEY`
  configurada (pendiente de que el dueño del proyecto la proporcione) el
  envío falla con el mensaje esperado en español y queda registrado como
  `fallido` en la bitácora, visible en la sección "Envíos por correo" del
  detalle tras recargar. Nota de la sesión: el navegador compartido con la
  sesión concurrente (`sesiones concurrentes`, gotcha ya documentado)
  mezcló identidades a media prueba — un envío quedó registrado con
  `enviado_por` de la cuenta real de `super_admin` en vez de `qa.ventas`;
  no es un defecto del código (la política RLS igual lo habría bloqueado
  de no ser un rol autorizado, como ya confirmaron los 8 escenarios de
  SQL), es la misma mezcla de cookies por origen ya conocida.

  **Cierre same-day**: el dueño del proyecto proporcionó la
  `MAILERSEND_API_KEY` real más tarde en la misma sesión. Antes de fijar
  el remitente se consultó la propia API de MailerSend (`GET
  /v1/domains`, `GET /v1/identities`) en vez de asumir: `refacrtb.com.mx`
  ya estaba verificado (DKIM/SPF) y con historial real de envíos (14,345
  totales — no era una cuenta nueva limitada a enviar sólo al dueño de la
  cuenta, el riesgo que se había anotado). Remitente elegido por el dueño
  del proyecto vía `AskUserQuestion`: `tbadillob@refacrtb.com.mx` (no el
  `cotizaciones@...` recomendado). `app/.env` actualizado y contenedor
  recreado (`--force-recreate`, `env_file` no se relee en caliente).
  **Envío real confirmado de punta a punta** desde la interfaz
  (`COT-000068` al correo personal del dueño del proyecto como receptor
  de prueba): MailerSend respondió `202`, `mensaje_id` real capturado,
  bitácora `exitoso`, visible en el detalle. Detalle completo de la
  sesión (incluido el cierre) en
  `sessions/2026-08-08-pdf-cotizacion-correo-mailersend.md`.

- **2026-08-08 (sesión aparte, cierre de jornada) — RTB-VEN-01: la PO nace
  al aprobar la cotización (Vía B), ciclo de surtido nuevo, explorer para
  Órdenes de Compra.** Pedido del dueño del proyecto: al aprobar una
  cotización se pregunta si se aprueba con Nota de Remisión o con Orden de
  Compra del cliente; si es PO, ésta nace ahí mismo con sus partidas
  copiadas 1:1 del pedido — nunca más un alta manual — y admite subir el
  archivo de PO que manda el cliente (al aprobar, opcional, o después
  desde el detalle). Consecuencia aceptada explícitamente: como la PO ya
  nace de datos consistentes, la validación por partida contra una NR deja
  de tener sentido, así que se retiran los estados `recibida`/`vinculada`
  y toda la maquinaria de validación de la Vía A (`ventas_po_validar()`,
  `ventas_vinculo_cancelar()`) — la Vía A (PO que llega DESPUÉS de una NR)
  queda pendiente para otra sesión, ver TODO. Plan validado por un segundo
  pase de arquitectura antes de escribir código, que encontró 3 errores
  que habrían roto la migración o dejado un bug de datos (orden
  `language sql` vs. swap de enum, `ALTER COLUMN ... DROP DEFAULT`
  faltante antes del `ALTER COLUMN TYPE`, y `valor_entregado` de una
  devolución de Vía B calculado sobre `ventas_nr_lineas` — tabla vacía en
  ese caso, habría dado `$0.00` mintiendo) y una consecuencia no obvia
  (Autorizaciones se queda sin productor).

  Dos migraciones: `043_ventas_po_ciclo_surtido.sql` (esquema — swap del
  enum `po_estado` a `abierta → parcialmente_surtida → surtida →
  facturada → pagada_cerrada` + `cancelada`, siguiendo el orden exacto
  verificado contra `pg_depend` antes de escribir nada; columnas nuevas en
  `ventas_ordenes_compra_cliente`/`ventas_po_partidas`; cierre del alta
  manual — `revoke insert`, sin GRANT UPDATE tampoco: adjuntar evidencia
  se hace por función; vista `ventas_ordenes_compra_listado` con el mismo
  patrón "explorer" de `038`; las 2 PO de QA existentes, sin
  `cotizacion_id`, se remapean a `cancelada` explícita con motivo, no se
  dejan como "abierta" fantasma) y `044_ventas_po_funciones.sql`
  (funciones — cada una partida del cuerpo **vivo** vía
  `pg_get_functiondef()`, nunca del texto de una migración vieja:
  `ventas_kpis()`/`tiene_operaciones_abiertas()` con el ciclo de PO nuevo,
  `ventas_cotizacion_aprobar()` con la bifurcación `via`,
  `ventas_nr_emitir()` rechazando un pedido de Vía B,
  `ventas_po_adjuntar_evidencia()`/`ventas_po_despachar()`/
  `ventas_po_cancelar()` nuevas, y `ventas_cotizacion_cancelar()`
  corregida para el bug de `valor_entregado` de arriba). `ventas_po_despachar()`
  es un espejo estricto de `ventas_nr_despachar()`: mismo emparejamiento
  por `pedido_linea_id` (035) para no reintroducir el hallazgo crítico #1
  de esa sesión, mismo patrón de consumir-luego-reinsertar el remanente
  del apartado, mismos casts explícitos de enum en el `CASE`.
  `ventas_po_cancelar()` se creó pero **sin botón en la UI** — la
  cancelación de negocio real sigue siendo "Cancelar cotización", que
  ahora también cancela la PO en la rama sin entrega (UPDATE directo, no
  llamando a `ventas_po_cancelar()`, porque esa función exige un conjunto
  de roles más estrecho que quien puede cancelar una cotización).

  Verificado exhaustivo con SQL simulando rol real dentro de
  `BEGIN`/`ROLLBACK` (creando cotizaciones/líneas de prueba a mano cuando
  hacía falta un escenario que los datos reales no cubrían — dos líneas
  del mismo producto en una PO, para repetir el escenario exacto del
  hallazgo crítico #1 pero contra `ventas_po_despachar()`): aprobar como
  PO con partidas 1:1 sin huecos, número de PO duplicado con mensaje de
  negocio (`22023`) en vez de `23505` crudo, `ventas_nr_emitir()` sobre
  Vía B rechazado, despacho fuera de orden con desambiguación correcta por
  `pedido_linea_id` (ninguna partida tocó la reserva de la otra), despacho
  parcial con remanente correcto, permisos negativos (`compras` no puede
  liberar/despachar; `authenticated` ya no puede insertar una PO
  directo), `evidencia_path` sólo por función, y las dos ramas de
  `ventas_cotizacion_cancelar()` (devolución con `valor_entregado ≠ 0`
  para Vía B; cancelación limpia que también cancela la PO).
  `get_advisors` sin `ERROR` nuevo, `npx tsc --noEmit` y
  `docker build --target builder` limpios.

  **Clic a clic real con `qa.ventas`/`qa.almacen`** (nunca la cuenta del
  dueño del proyecto — sesión previa había dejado una sesión de
  `super_admin` abierta en el mismo perfil de Chrome, se cerró antes de
  empezar): `COT-000068` aprobada como PO con número real → `POC-000027`
  creada con su partida → pedido liberado a Almacén → surtido parcial (2
  de 3) y luego completo desde el detalle del pedido (Almacén nunca entra
  a la pantalla de Órdenes de Compra — decisión del dueño del proyecto,
  el botón "Surtir PO" vive en el pedido) → kardex real confirmado por SQL
  directo (`MOV-00000046`, `salida_venta`, `referencia_tipo=
  'orden_compra_cliente'`) → PO `surtida`, pedido `entregado` → documento
  de PO subido y visto con URL firmada real (bucket `evidencias-ventas`,
  ruta de lectura firmada nueva, no existía ninguna para ese bucket) →
  `qa.almacen` redirigido por el servidor fuera de
  `/dashboard/ventas/ordenes-compra` (confirma que es un guard real, no
  sólo el sidebar oculto) → KPI "PO por surtir" del tablero correcto.

  Ese mismo recorrido encontró y corrigió un bug real no anticipado por
  la verificación SQL: la FK compuesta nueva de `043`
  (`ventas_po_partidas_po_pedido_fkey`) dejó **dos** relaciones entre
  `ventas_po_partidas` y `ventas_ordenes_compra_cliente`, así que el embed
  implícito `partidas:ventas_po_partidas(...)` (usado para traer la PO con
  sus partidas junto al pedido) quedó ambiguo para PostgREST — y como el
  código no miraba `error`, el síntoma fue el botón "Surtir PO" que nunca
  aparecía, sin ningún error visible. Corregido con el hint de relación
  explícito (`!ventas_po_partidas_po_id_fkey`) en los dos sitios que
  hacían ese embed — ver Gotchas.

  Alcance dejado fuera, documentado en TODO: Vía A completa (PO que llega
  después de una NR — la maquinaria de vínculos y la bandeja de
  Autorizaciones quedan intactas pero inertes, listas para cuando se
  reconstruya), cierre de una PO tras resolver su devolución, y
  `ventas_po_cancelar()` sin UI.

- **2026-08-08 (corrección posterior, mismo día) — Surtir es sólo de
  Almacén; `ventas` ya no despacha.** El dueño del proyecto corrigió dos
  cosas tras revisar la entrega de arriba: (1) facturar una PO/NR es un
  proceso **aparte** del surtido — se puede facturar antes de entregar o
  después de entregar, no es una etapa que siga necesariamente a
  `surtida`/`entregada` (ver TODO — todavía no aplica en código porque
  ninguna función de este módulo escribe `facturada`/`pagada_cerrada`,
  RTB-PRO-FAC-01 no existe; queda anotado para cuando se diseñe ese
  módulo, no se tocó el modelo hoy). (2) Surtir es trabajo físico de
  Almacén — se quitó `'ventas'` del guard de rol de **ambas** funciones
  de despacho (`ventas_nr_despachar()` y `ventas_po_despachar()`,
  migración `045`, mismo `ROLES_DESPACHAN` compartido por las dos desde
  su diseño), y el botón "Surtir PO" del detalle del pedido ahora se
  oculta para el rol `ventas` (`puedeSurtir`, mismo patrón que
  `nr-detalle.tsx`). `super_admin`/`direccion`/`gerente_comercial`
  conservan la capacidad como autoridad de override, no como flujo
  normal. El dueño del proyecto también planteó que, cuando exista el
  módulo de Almacén (hoy "Próximamente"), su propia pantalla sea
  simplemente una vista de la misma tabla de pedidos/PO con la función de
  surtir habilitada — no se construyó (el módulo no existe), queda como
  nota de diseño para esa entrega futura. Verificado por SQL con rol real
  (`ventas` bloqueado con `42501` en ambas funciones, `almacen` pasa el
  guard) y `npx tsc --noEmit` limpio, y clic a clic real
  (`qa.ventas` ya no ve "Surtir PO" en el detalle del pedido, `qa.almacen`
  sí).

  **Autocorrección durante la misma verificación:** `POST
  /api/ventas/pedidos/[id]/liberar` reutilizaba `ROLES_DESPACHAN` — antes
  de `045` coincidía por accidente con quién podía liberar, no por
  diseño. Al quitarle `'ventas'` a `ROLES_DESPACHAN`, esa ruta también le
  habría bloqueado a Ventas **liberar** el pedido a Almacén (acción que
  el dueño del proyecto no pidió tocar, y que
  `ventas_pedido_liberar_almacen()` sigue permitiendo en su propio
  guard — mismo patrón ya documentado de "route vs SQL desalineados").
  Encontrado por revisión de código antes de que llegara a producción,
  no por el clic a clic. Corregido con una constante separada,
  `ROLES_LIBERAN_ALMACEN` (`lib/ventas/permisos.ts`), que sí conserva
  `'ventas'` — reutilizar una constante de permisos para una acción
  distinta a la que describe su nombre es exactamente el tipo de atajo
  que produce este desalineamiento; cada acción necesita su propia
  constante aunque hoy coincida con otra.

- **2026-08-08 (sesión aparte, concurrente con las de arriba) — Vía A de
  RTB-VEN-01: registrar desde el tablero de NR la PO que llega DESPUÉS de
  una o varias NR ya emitidas.** Pedido del dueño del proyecto mientras
  otra sesión cerraba la Vía B en el mismo repositorio (043-045) — la Vía
  B invertía el flujo entero (la PO nace *al aprobar* la cotización); esta
  sesión cubre el caso complementario: el cliente ya recibió su mercancía
  por NR y su PO física llega después. La cotización sigue convirtiéndose
  en NR exactamente igual que siempre — sin cambios ahí. El registro no se
  rellena como una cotización nueva: pide los datos de la PO y del
  cliente, y dentro de un mismo asistente de 4 pasos deja seleccionar
  partidas de **respaldo** (líneas de una o varias NR ya entregadas) y
  partidas **por entregar**, estas últimas de dos orígenes — de una
  cotización `enviada` existente (las líneas no elegidas se desactivan
  con nota, nunca se borran, y la cotización se aprueba sólo por lo
  seleccionado) o nuevas del catálogo sin cotización de por medio. Toda
  partida por entregar se surte después contra la PO, con kardex real —
  unifica el modelo con la PO de Vía B en vez de construir un segundo
  sistema de despacho paralelo.

  Seis migraciones (`046_ventas_po_via_a_enums.sql` … `051_ventas_tablero_
  nr_drop.sql`), diseñadas y verificadas contra el estado **vivo** de
  Supabase después de que la Vía B ya hubiera aplicado 043/044/045 — no
  contra el texto de esas migraciones. La sesión encontró y resolvió tres
  problemas reales antes de escribir una sola línea de SQL: (1) la FK
  compuesta nueva de 043 (`ventas_po_partidas_po_pedido_fkey`) obliga a
  que toda partida comparta el `pedido_id` de su PO — imposible para una
  PO de Vía A que respalda NR de **pedidos distintos**; se dropeó y se
  sustituyó por un trigger (`po_partida_coherencia_pedido()`) que
  preserva la garantía real de Vía B sin bloquear el caso multi-pedido.
  (2) `ventas_pedidos.cotizacion_id` es NOT NULL, así que una partida
  nueva sin cotización (caso N) no podía tener pedido ni apartado por la
  vía existente — se evaluaron y descartaron inyectarla en la cotización
  del caso C (reescribiría un documento ya enviado por correo, 042),
  relajar `cotizacion_id` (`ventas_tablero_nr()` y varias funciones lo
  asumen con `INNER JOIN`) y una cotización de respaldo autogenerada
  (ensucia el explorer de Cotizaciones); se adoptó
  `inventario_apartados.po_partida_id` como origen de apartado de primera
  clase, igual que ya lo es `pedido_linea_id` desde `035` — barato porque
  ambas columnas de pedido del apartado ya eran nullable y
  `ventas_po_despachar()` nunca usó el pedido para el movimiento de
  kardex. Consecuencia aceptada: `ventas_devoluciones.cotizacion_id` se
  relajó a nullable (`dev_origen_chk` exige al menos `cotizacion_id` o
  `po_id`) — una PO de Vía A puramente de partidas nuevas no tiene
  cotización que la respalde. (3) El requisito de "cambio de precio
  congela la PO completa" exigía reescribir `ventas_cotizacion_aprobar()`
  (función de la otra sesión, activa en el mismo repositorio) para que,
  si recibe un `po_id` existente (caso C), agregue líneas a esa PO en vez
  de crear una nueva — decisión explícita del dueño del proyecto de
  editar la función compartida (un `if` aditivo de ~15 líneas) en vez de
  duplicar su lógica de apartados/conversión de unidad; riesgo de
  colisión con la sesión concurrente aceptado a cambio de no mantener
  kardex en dos sitios. `git diff` de los 12 archivos compartidos
  confirmado sin pérdida de cambios de la otra sesión al cerrar.

  Dos estados nuevos de `po_estado` (`pendiente_de_autorizacion`,
  `vinculada`) — deliberadamente no se agregó un tercer
  `parcialmente_vinculada`: habría sido redundante con
  `abierta`/`parcialmente_surtida` y reproducido el defecto histórico del
  `ventas_po_validar()` original (033) de escalar comparando agregados en
  vez de contar partidas. Dos tipos nuevos de `ventas_autorizacion_tipo`
  (`precio_po_divergente`, `ampliacion_po`); de paso se corrigió la causa
  raíz de que el `z.enum([...])` de `ventasAutorizacionCreateSchema`
  estuviera hardcodeado en vez de derivarse de `VENTAS_AUTORIZACION_TIPOS`
  — ya se había desincronizado una vez. `ventas_po_despachar()` se
  generalizó (no se bifurcó): perdió la exigencia de un único `pedido_id`,
  rechaza partidas de respaldo y PO congeladas, resuelve el apartado por
  `pedido_linea_id` o `po_partida_id` según cuál tenga la partida, y
  recalcula todos los pedidos que toque, no uno solo. `ventas_vinculo_
  cancelar()` se restauró (existía antes de 043, dropeada con el resto de
  la Vía A original) recalculando con los helpers nuevos en vez del
  `CASE` inline que sólo avanzaba.

  La verificación SQL (12 escenarios con rol real simulado, `BEGIN`/
  `ROLLBACK`) encontró un bug real antes de que hubiera datos en riesgo —
  ver Gotchas ("verdad vacía" de `ventas_po_recalcular_estado()`),
  corregido en `050`. `get_advisors` sin `ERROR` nuevo, `npx tsc --noEmit`
  y `docker build --target builder` (TypeScript real) limpios. Clic a
  clic real con `qa.ventas` (no la cuenta del dueño del proyecto): NR con
  cobertura real en las 5 tarjetas del detalle (antes fijas en $0),
  asistente completo con datos reales (línea de NR con disponible
  correcto, cotización `enviada` del cliente cargada), registro exitoso
  de `POC-000041` (`origen=posterior_a_entrega`), NR permaneciendo
  correctamente en `parcialmente_entregada` (tiene una segunda línea sin
  entregar — no es un bug, es el mismo criterio que ya usaba el sistema
  original: los estados de respaldo sólo aplican cuando la entrega está
  completa), detalle de la PO con partidas de respaldo, comparación de
  precio contra la NR y botón de cancelar vínculo, y el tablero de PO
  mostrando la fila nueva en la columna "Vinculada" junto a las PO de Vía
  B de la otra sesión sin interferencia. Encontrado en el mismo recorrido
  y corregido de inmediato: `EntidadCombobox` no tiene forma de mostrar
  un cliente preseleccionado por URL (`entidadId` sí quedaba bien puesto,
  sólo la etiqueta visual se veía vacía) — se resolvió pasando el nombre
  ya resuelto por query string (`entidad_label`) desde el botón "Registrar
  PO" del detalle de NR, sin fetch adicional en el cliente.

- **2026-08-10** — `clientes.lista_precio` retirado; `clientes.
  descuento_maximo` renombrado a `descuento_base`. El dueño del proyecto
  preguntó para qué servía "Lista de precios" en el alta de entidad — no
  lo usaba ninguna función de RTB-VEN-01 (el precio de línea es costo ×
  margen de familia con snapshot, no una tarifa por lista), así que pidió
  eliminarlo. Verificado antes de dropear: 0 de los clientes reales
  tenían el campo capturado. Migración `052_clientes_quitar_lista_precio.sql`
  (`drop column`, retira también el `GRANT UPDATE` de esa columna sin
  revoke aparte) + limpieza en `nueva/page.tsx`, `entidad-detalle.tsx`,
  `types/entidades.ts`, `lib/entidades/schemas.ts`.

  Al revisar el campo hermano "Descuento base %" salió el mismo patrón:
  tampoco estaba enforced — ninguna función valida el `descuento_porcentaje`
  de una línea de cotización contra `clientes.descuento_maximo` (sólo el
  `CHECK` genérico 0..100 por línea). A pedido del dueño del proyecto, se
  implementó "Agregar línea" (`cotizacion-detalle.tsx`) para que
  prellene el descuento de cada línea nueva con ese valor del cliente —
  editable, sin tope (nueva prop `descuentoBaseCliente`, de
  `page.tsx` → `CotizacionDetalle` → `AgregarLineaForm`; el schema/API ya
  aceptaban `descuento_porcentaje` en el POST, sólo faltaba en la UI).
  Verificado clic a clic con `qa.ventas`: campo prellenado con el valor
  del cliente, editado a mano, línea guardada con el importe correcto;
  datos de prueba revertidos.

  Al preguntarle al dueño del proyecto si `descuento_maximo` debía volverse
  un tope real (con o sin excepción autorizable) o quedarse como
  prellenado, confirmó **sólo prellenado** — y pidió corregir el nombre de
  la columna en la base, porque "máximo" prometía una validación que nunca
  existió (el nombre siempre fue así desde `002_entidades_core.sql`,
  anterior a que existiera Ventas; la UI ya le decía "Descuento base %").
  Migración `053_clientes_descuento_base_rename.sql` (`rename column` —
  conserva el `GRANT UPDATE` por columna sin tocarlo, el privilegio sigue
  al atributo). Propagado a todo el código (`types/entidades.ts`,
  `lib/entidades/schemas.ts`, `nueva/page.tsx`, `entidad-detalle.tsx`,
  `cotizaciones/[id]/page.tsx`, `cotizacion-detalle.tsx`) y a
  `db/ESQUEMA.md`. `docker build --target builder` limpio y sin `ERROR`
  nuevo en el advisor en ambas migraciones. Los archivos de migración
  anteriores (002/019/037) que mencionan `lista_precio`/`descuento_maximo`
  en comentarios **no** se editaron — son registro histórico de lo que se
  aplicó en su momento, no el estado actual (ese vive en `db/ESQUEMA.md`
  y en este archivo).

- **2026-08-10 (sesión aparte, mismo día) — RTB-ENT-01: `ventas` ya puede
  solicitar cambios de RFC/razón social/tipo de persona (P05), contactos
  editables, y modal de dirección que se cortaba por la pantalla,
  corregido.** El dueño del proyecto notó que la tarjeta "Modificación
  controlada (P05)" de la ficha de entidad no tenía ningún botón para
  solicitar el cambio de esos 3 campos — ni siquiera `super_admin` tenía
  uno. Investigando se encontró que `persona_tipo`, a diferencia de
  `nombre_legal`/`rfc`, **no tenía ningún camino de escritura**: ni
  `GRANT`, ni entrada en el enum `cambio_controlado`, ni campo en ningún
  schema zod — un hueco real, no sólo de UI. Migración
  `054_entidades_persona_tipo_cambio_controlado.sql` (sólo agrega el valor
  al enum, sin split porque nada en la misma migración lo referencia) +
  `REGLAS_APROBACION` (`lib/entidades/permisos.ts`) ampliada: `rfc` pasa
  de `aprueba: null` (nadie podía aprobar, sólo `super_admin` ejecutaba
  directo) a `inicia: [super_admin, ventas]` / `aprueba: [super_admin]`;
  `razon_social` gana `ventas` en `inicia`; `persona_tipo` nace con
  `inicia: [direccion, ventas]` / `aprueba: [super_admin]` — decisión
  confirmada con el dueño del proyecto vía `AskUserQuestion`: mismo nivel
  de severidad que ya tenía razón social, no el de límite de crédito
  (`direccion`). Nueva tarjeta **"Información Fiscal"** (ya no
  "Modificación controlada (P05)", con el párrafo bloqueante sustituido
  por "Edición de datos bajo aprobación") con un lápiz por campo que
  aparece sólo si el rol puede iniciar ese `tipo_cambio` — guarda directo
  (`PATCH /api/entidades/[id]`) si `ejecutaDirecto`, o crea una
  `solicitud_cambio` (mismo patrón ya usado por `limite_credito`) si no,
  con motivo obligatorio y badge "Solicitud pendiente".

  **Contactos** pasó de sólo-lectura a CRUD completo
  (`ContactosCard`/`ContactoModal`, calcados 1:1 de
  `DireccionesCard`/`DireccionModal` — el backend `GET/POST/PATCH
  .../contactos` ya existía sin ningún consumidor de UI, mismo patrón que
  direcciones antes de su propia sesión). Único matiz de negocio distinto:
  `uq_contacto_principal_entidad` no discrimina por `tipo` como sí lo hace
  el de direcciones — sólo puede haber UN contacto principal por entidad
  completa, así que marcar uno nuevo como principal exige un PATCH previo
  que desmarque al viejo (nunca al revés), verificado clic a clic con
  `qa.ventas`: swap real entre dos contactos sin choque de índice único,
  confirmado por SQL directo en ambos sentidos.

  **Modal "Agregar dirección" cortado por la pantalla** (pedido explícito
  del dueño del proyecto de revisarlo con la extensión de Chrome):
  confirmado en vivo — con `flex items-center` + `overflow-y-auto` en el
  overlay, cuando el contenido es más alto que el viewport el navegador
  centra el modal y la mitad superior (título, botón cerrar, campo Tipo)
  queda inalcanzable por scroll (no existe scroll negativo). Fix de una
  línea (`items-center` → `items-start`) en `DireccionModal` — mismo
  overlay que reutiliza `ContactoModal` nuevo — y aplicado también al
  modal de bloqueo (`modalBloqueo`), que tenía el mismo bug latente aunque
  su contenido corto rara vez lo mostrara. Polish menor: `MapaPunto` dentro
  de `DireccionModal` bajó de `h-64` a `h-48` (`claseAltura`, prop que ya
  existía en `MapaPuntoInner.tsx` sin usarse desde otras pantallas).

  Verificado con SQL simulando rol real (`ventas` inserta una solicitud de
  `persona_tipo` con el enum nuevo, `BEGIN/ROLLBACK`), `get_advisors` sin
  `ERROR` nuevo, `docker build --target builder` limpio, y clic a clic
  real end-to-end con `qa.ventas`/`qa.superadmin` sobre `QA Cliente Uno`:
  solicitud de RFC creada y visible en `/dashboard/solicitudes`, aprobada
  por `super_admin` con el RFC cambiando de verdad en la ficha; contacto
  nuevo agregado, editado, y promovido a principal con democión automática
  del anterior; modal de dirección confirmado sin corte. Los datos de
  prueba (RFC, contacto nuevo, principal) se revirtieron a su estado
  original tras verificar — a diferencia de otras campañas QA de este
  repo, aquí no aportaban valor como evidencia adicional una vez
  confirmado el mecanismo. Nota operativa: el `archivar()` de contactos
  usa `confirm()` nativo del navegador — la extensión Claude in Chrome se
  queda sin respuesta un momento tras dispararlo (limitación conocida de
  la extensión, no del código); el archivado en sí se aplicó igual, sólo
  se retrasó la confirmación visual en el navegador automatizado.

- **2026-08-10 (sesión aparte, concurrente con la de arriba) — RTB-ENT-01:
  leyenda siempre visible del umbral de crédito, interfaz de propuesta
  faltante para `condicion_proveedor`, y búsqueda/filtros en
  `/dashboard/solicitudes`.** Pedido del dueño del proyecto en dos pasos,
  tras dar de alta un cliente él mismo con `super_admin` y notar que el
  aviso de aprobación de crédito sólo aparecía **después** de teclear una
  cifra sobre el umbral, no antes.

  **Paso 1 — leyenda siempre visible.** Componente nuevo
  `<AvisoLimiteCredito>` (`components/entidades/aviso-credito.tsx`),
  reemplaza los dos avisos condicionales copiados (alta y edición de
  cliente): se ve desde que aparece el campo, con cuatro textos según dos
  ejes (¿supera $100,000? × ¿el rol que lee ejecuta directo?) — antes decía
  "quedará pendiente de aprobación de dirección" incluso a `super_admin`,
  que en realidad la aplica directo (`ejecutaDirecto()`, la misma función
  que ya deciden las rutas de API, nunca una copia paralela). De paso,
  `nueva/page.tsx` corrigió su propio cálculo de `requiereAprobacion`
  (no consultaba `ejecutaDirecto`, sólo el umbral).

  **Paso 2 — auditoría de "¿cuáles de los 8 cambios controlados ya tienen
  interfaz de aprobar/rechazar?".** El lado de **aprobar/rechazar** ya era
  uno solo, genérico, y cubría los 8 desde `/dashboard/solicitudes` (decide
  con `REGLAS_APROBACION[tipo].aprueba` en el servidor, no por pantalla
  dedicada por tipo). El lado de **proponer** tenía un hueco real:
  `condicion_proveedor` (categoría + condición de pago de un proveedor) no
  tenía ningún camino de escritura desde la UI — la tarjeta "Condiciones
  comerciales · Proveedor" era de sólo lectura, sin lápiz ni ruta, aunque
  el resolver ya sabía aplicarlo (`CAMPOS_PERMITIDOS.condicion_proveedor`)
  y la regla de negocio ya estaba declarada en `REGLAS_APROBACION` desde el
  origen del módulo — inalcanzable, no ausente. Confirmado a nivel de base
  de datos que es un cambio controlado real: `categoria`/`condicion_pago`
  nunca tuvieron `GRANT UPDATE` para `authenticated`
  (`015_catalogo_marcas_y_gobierno.sql`).

  Cerrado con `PATCH /api/entidades/[id]/proveedor` (ruta nueva, mismo
  patrón dual que `.../cliente` de `limite_credito`: `compras` propone,
  `super_admin` aplica directo con el cliente admin) y **`CampoP05Multi`**
  — variante nueva de `CampoP05` (el patrón ya usado para rfc/razón social/
  tipo de persona) para un cambio controlado que cubre **dos** columnas a
  la vez en una sola solicitud; `CampoP05` original no se tocó, sus 3 usos
  de un solo campo siguen iguales. Al verificar clic a clic salió un bug
  real no relacionado con la ruta nueva: el Server Component de la ficha de
  entidad (`entidades/[id]/page.tsx`) nunca incluía `tabla='proveedores'`
  al construir el filtro de `solicitudesPendientes` — mismo defecto ya
  conocido y corregido una vez para `tabla='clientes'` (el comentario que
  documentaba ese fix seguía en el archivo, sin la rama nueva). Sin
  corregirlo, "Solicitud pendiente" nunca se habría mostrado para
  `condicion_proveedor` aunque la solicitud existiera y fuera resoluble.

  **Paso 3 — búsqueda/filtros + ocultar el botón según permiso real**, a
  petición explícita del dueño del proyecto una vez visto el resultado del
  paso 2. `/dashboard/solicitudes` ganó: búsqueda de texto (entidad/RFC/
  siglas/motivo), filtro de tipo de cambio, rango de fechas
  (`<RangoFechas>`, primer uso fuera de Ventas), "Sólo mías", columna
  **Solicitante** (`usuarios_directorio()`, RPC ya usado en Ventas/
  Inventario para lo mismo), y paginación convergida a `<Paginacion>`
  (ya señalada como pendiente en el comentario del propio componente).
  Módulo nuevo `lib/entidades/listado-solicitudes.ts` (mismo pivote
  anti-duplicación que `lib/ventas/listado-cotizaciones.ts`, pero **sin**
  importar de `lib/ventas/*` — esa dirección de dependencia iría al revés
  de como está diseñado el repo; `valorLike`/`diaSiguiente` se duplican en
  4 líneas cada uno en vez de cruzar el import). La búsqueda de texto
  resuelve en dos pasos porque `registro_id` es polimórfico: `ilike` sobre
  `entidades` → ids, luego `clientes`/`proveedores` cuyo `entidad_id` esté
  en ese resultado → sus propios ids, `.or()` final con
  `and(tabla.eq.X,registro_id.in.(...))` por tabla más `motivo.ilike`.

  Al ver la bandeja con los 8 tipos mezclados salió una segunda petición:
  `direccion` veía el botón "Aprobar" en los 5 tipos que sólo `super_admin`
  resuelve (`rfc`/`razon_social`/`persona_tipo`/`reactivacion`/
  `bloqueo_temporal`) y se llevaba un `403` real al intentarlo. Corregido
  espejando en cliente la misma regla que ya aplicaba el servidor
  (`REGLAS_APROBACION[tipo].aprueba?.includes(role)`) — si no coincide, la
  celda muestra **"Sólo lectura — aprueba `<rol>`"** en vez del botón. El
  servidor sigue siendo la barrera real; esto sólo evita el viaje redondo
  que iba a fallar.

  Verificado end-to-end con usuarios QA reales, nunca la cuenta del dueño
  del proyecto: `qa.compras` propone condición de proveedor → aparece en la
  bandeja con búsqueda/filtro/solicitante correctos → `qa.direccion`
  aprueba → cambio confirmado en `proveedores` por SQL directo;
  `qa.superadmin` (nota: el correo real de ese usuario QA es
  `qa.superadmin@qa.refacrtb.mx`, sin guion bajo, a diferencia del patrón
  `qa.<rol>` del resto) aplica el mismo cambio directo, sin solicitud,
  también confirmado por SQL; `qa.ventas` propuso una razón social →
  `qa.direccion` la vio como "Sólo lectura — aprueba Super Admin" (sin
  botones) → `qa.superadmin` sí los vio y aprobó. Confirmado además por
  `information_schema.column_privileges` que `categoria`/`condicion_pago`
  siguen sin `UPDATE` para `authenticated` (sólo `INSERT`/`SELECT`) — la
  ruta nueva no abrió ningún hueco de privilegio. `tsc --noEmit` limpio en
  cada paso, `get_advisors` sin `ERROR` nuevo (sin migración SQL en esta
  sesión). Sesión concurrente en el mismo repositorio (persona_tipo/
  contactos/lista_precio arriba, y trabajo de código de barras autogenerado
  en Productos) — se verificó `tsc --noEmit` limpio sobre el estado
  combinado antes de dar por cerrada la sesión.

  **Hallazgo aparte, dejado en TODO a petición del dueño del proyecto:**
  revisando el alta de productos (`/dashboard/productos/nuevo`) para
  contestar por qué un producto dado de alta con `super_admin` quedaba en
  `estado='borrador'`, se confirmó que **no existe ningún camino, para
  ningún rol, que lo pase a `'activo'`** — ni UI, ni ruta de API con
  `service_role`, ni trigger. La columna ni siquiera está en el `GRANT
  UPDATE` de `productos` para `authenticated`. La spec del módulo nunca
  incluyó ese paso entre sus cambios controlados. Detalle completo,
  incluida la verificación capa por capa, en
  `db/procesos/alta-producto.md` y en el TODO de abajo.

- **2026-08-10 (sesión aparte, concurrente con las de arriba) — RTB-INV-01:
  código de barras autogenerado y fijo, checkbox "Producto estratégico" en
  el alta, y el costo de catálogo ahora liga a un proveedor.** El dueño del
  proyecto probó dar de alta un producto y trajo cuatro preguntas: qué es
  el código de barras (hoy texto libre capturado a mano, sin relación con
  el proveedor), por qué "costo" no pregunta a qué proveedor pertenece, qué
  significa "estratégico", y dónde se asigna la ubicación del inventario
  (no la encontró en el alta).

  **Investigación primero, sin tocar código.** Dos hallazgos explican las
  dos últimas preguntas sin necesitar ningún cambio:
  - **"Estratégico"** (`es_estrategico`) ya tenía efecto real en
    `inventario_alerta_stock()` (`014_inventario_kpis.sql:159-161`): si un
    producto tiene existencia física y lleva más de 180 días sin
    movimiento, la acción sugerida normalmente es `'bloquear_compra'`;
    marcado como estratégico, baja a `'revisar'` — mismo criterio que ya
    usa "cliente estratégico" en las reglas de Compras
    (`RTB-PRO-COM-01_Modulo_Compras.md`). El campo **no tenía ningún
    control de UI** (ni en el alta ni después), sólo se mostraba de sólo
    lectura — de ahí la pregunta. Aparte: `inventario_alerta_stock()` no
    tiene todavía ningún consumidor de UI (`/api/inventario/alertas` sin
    pantalla) — hoy es lógica lista, invisible hasta que exista Compras.
  - **La ubicación no se asigna en el alta por diseño, no por descuido.**
    El catálogo (`productos`) y las existencias por ubicación
    (`inventario_existencias`) son conceptos separados a propósito; esa
    tabla no admite `INSERT`/`UPDATE` directo, sólo la escribe el trigger
    del kardex o la aplicación de un conteo. Un producto nuevo nace sin
    ubicación siempre (documentado: así está hoy el 73.9% del catálogo
    real). El camino real: `Inventario → Ajustes → Nuevo ajuste`.

  **Código de barras — migración `055_productos_codigo_barras_autogenerado.sql`.**
  Confirmado con `AskUserQuestion` con el dueño del proyecto: se autogenera
  igual a `codigo_interno` (Code128 acepta alfanumérico directo, sin
  checksum EAN-13 aparte) y queda **fijo para siempre** — ni siquiera
  `super_admin` lo edita después, para que una etiqueta ya impresa nunca
  deje de coincidir con el sistema. Se quitó del formulario de alta y de
  ambos schemas zod (`productoCreateSchema`/`productoUpdateLibreSchema`);
  el trigger `productos_before_insert()` lo fija siempre después de
  resolver `codigo_interno` (sin excepción, aunque el cliente mande algo
  distinto en el `INSERT` — el `GRANT INSERT` de `productos` no restringe
  columnas); `revoke update (codigo_barras) on productos from authenticated`
  cierra el único camino que quedaba. Backfill de los 5 productos de
  prueba existentes (`codigo_barras = codigo_interno`) y `NOT NULL` nuevo.
  Verificado por SQL con rol real que ni `super_admin` puede hacer
  `UPDATE productos SET codigo_barras = ...` (`42501`).

  **Checkbox "Producto estratégico" en el alta.** `productoCreateSchema`
  ya aceptaba `es_estrategico` (nunca se exponía en el formulario) y el
  `GRANT INSERT` de `productos` no restringe columnas — no hizo falta
  tocar backend, sólo agregar el checkbox con la explicación de su efecto
  (misma explicación que se le dio al dueño del proyecto). Editarlo
  **después** de creado sigue sin control de UI (fuera de alcance de esta
  sesión, mismo hueco que `stock_minimo`/`stock_maximo`).

  **Costo de catálogo liga a un proveedor.** `producto_costos.proveedor_producto_id`
  existía desde `010_inventario_costos.sql`, sin ningún selector — el
  formulario "Nuevo costo" lo ignoraba por completo. Al investigar se
  encontró que `proveedor_productos` (la tabla que de verdad liga
  proveedor↔producto↔precio) **tampoco tenía ninguna pantalla en todo el
  repo** — cero consumidores de `POST /api/proveedor-productos`. Decisión
  confirmada con el dueño del proyecto (`AskUserQuestion`, no construir una
  pantalla completa de "lista de precios de proveedor" todavía): selector
  rápido dentro del mismo formulario de costo — un `<select>` con los
  `proveedor_productos` que ya tiene el producto, más
  **"+ Agregar proveedor nuevo…"** que despliega `<ProveedorCombobox>`
  (nuevo, `components/inventario/proveedor-combobox.tsx`, calcado de
  `EntidadCombobox` de Ventas pero filtrando `proveedor`/`mixta` — busca
  `entidades`, y el `proveedor_productos.proveedor_id` real se resuelve
  aparte vía `GET /api/entidades/{entidadId}` → `data.proveedor.id`, ya
  que `proveedores` no comparte `id` con `entidades`) + costo del
  proveedor + unidad en la que cotiza. Gateado a
  `super_admin`/`direccion`/`compras` (`finanzas` ve el selector pero no
  la opción de agregar — no tiene `GRANT INSERT` en `proveedor_productos`).
  `GET /api/proveedor-productos` y `GET /api/productos/[id]/costos`
  ganaron la resolución del nombre del proveedor (el segundo por
  consultas separadas, no un embed anidado de 3 niveles, para que
  `almacen` sin `SELECT` en `proveedor_productos` reciba `null` en vez de
  romper el embed completo).

  Verificado extremo a extremo en el navegador (`qa.compras`/`super_admin`
  de prueba, nunca la cuenta real): alta de un producto con "Producto
  estratégico" marcado → ficha muestra "Estratégico: Sí" y "Código de
  barras: RTB-AHO-000009" igual al código interno; en Costos, "+ Agregar
  proveedor nuevo…" con un proveedor real (`QA Proveedor Uno`) → queda
  preseleccionado tras crearse → costo guardado con el proveedor visible
  en el histórico. `docker build --target builder` limpio, sin `ERROR`
  nuevo en el advisor. Datos de prueba (producto, costo, `proveedor_producto`)
  borrados por SQL directo al cerrar — el catálogo real sigue vacío por
  decisión del dueño del proyecto, no valía la pena dejarlos como
  evidencia. Sesión concurrente en el mismo repositorio (`condicion_proveedor`/
  filtros de solicitudes, entrada de arriba) — el commit final quedó
  combinado por fuera de esta sesión; se verificó que el contenido de cada
  archivo propio llegó intacto al repositorio.

## TODO

- **RTB-INV-01 — ningún rol puede activar un producto (`borrador →
  activo`).** Confirmado 2026-08-10 revisando el alta de productos a
  pedido del dueño del proyecto (ver Historial de decisiones, misma
  fecha, y `db/procesos/alta-producto.md`): el formulario de alta nunca
  pide `estado` (queda en `'borrador'` por `default` del schema, siempre),
  `productos.estado` no tiene `GRANT UPDATE` para `authenticated`, ninguna
  de las 6 rutas de `/api/productos/**` la escribe con `service_role`, y
  la UI sólo la muestra con un badge de sólo lectura. La spec del módulo
  (`contexto/RTB-INV-01_Modulo_Productos_Inventario.md` §4) nunca incluyó
  "activar un producto" entre sus cambios controlados — el paso nunca se
  diseñó, no es sólo que falte construirlo. Pendiente: decidir con el
  dueño del proyecto quién activa (¿libre para `super_admin`/`direccion`?
  ¿exige costo y unidad ya capturados?) antes de construir la ruta/botón.
- **MailerSend sin webhook.** `ventas_cotizacion_envios.resultado='exitoso'`
  significa que el proveedor ACEPTÓ el envío (HTTP 202), no que el cliente
  lo recibió — un rebote posterior no queda reflejado. Si eso llega a
  importar, es una entrega aparte (endpoint de webhook + columna de estado
  de entrega).
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
- **RTB-VEN-01 — Vía A construida (2026-08-08, migraciones 046-051, ver
  Historial) — cierra el TODO que dejó abierto la entrega de Vía B
  (043/044).** Registrar desde el tablero de NR la PO que llega DESPUÉS
  de una o varias NR ya emitidas. `ventas_nr_cobertura()` ya no devuelve
  0 fijo, `nr_estado.parcialmente_respaldada`/`po_vinculada` sí tienen
  escritor, y la bandeja de Autorizaciones recibe `precio_po_divergente`/
  `ampliacion_po` (los tipos de Vía A; `excepcion_subtotal`/
  `codigo_divergente`/`duplicidad_confirmada` — los de la Vía A original,
  033 — siguen sin productor, ver más abajo). Alcance dejado fuera de
  esta entrega:
  - `ventas_po_devolver()` — una PO de Vía A compuesta sólo de partidas
    nuevas (caso N, sin cotización) puede abrir devolución por esquema
    (`ventas_devoluciones.po_id`/`cotizacion_id` nullable, `dev_origen_chk`
    exige al menos uno) pero no hay ninguna función que la abra; hoy sólo
    nace desde `ventas_cotizacion_cancelar()`.
  - `ventas_po_ampliar()` sólo admite `respaldo`/`compromiso_nuevas` en su
    payload — ampliar con líneas de OTRA cotización (además de la que ya
    tiene la PO, si la tiene) no está soportado ni en SQL ni en la UI.
  - Cierre de una PO tras resolver su devolución: no construido (mismo
    TODO que ya tenía Vía B).
  - `excepcion_subtotal`/`codigo_divergente`/`duplicidad_confirmada`
    (tipos de la Vía A **original**, 033) siguen sin ningún productor —
    esa maquinaria de validación por partida (`ventas_po_validar()`) fue
    la que 043 retiró; esta entrega construyó un modelo distinto
    (respaldo/compromiso con congelamiento de PO completa por precio
    divergente), no la resucitó.
- **RTB-VEN-01 — reloj de cobranza y CFDI son RTB-PRO-FAC-01, módulo
  futuro.** `clientes.tipo_cliente` (029) ya guarda la configuración por
  cliente y `nr_estado`/`po_estado` (032/043) ya incluyen
  `facturada`/`pagada_cerrada`, pero ninguna función de esta entrega los
  escribe ni calcula antigüedad de saldo vencido — el congelamiento de
  cartera (`cliente_congelamientos`) se sigue registrando a mano por
  Dirección hasta que exista ese módulo. **Aviso del dueño del proyecto
  (2026-08-08) para cuando se diseñe RTB-PRO-FAC-01:** facturar y
  entregar son dos procesos independientes — una PO/NR se puede facturar
  ANTES de entregarla o DESPUÉS de haberla entregado, no necesariamente
  en ese orden. `po_estado`/`nr_estado` hoy modelan `facturada`/
  `pagada_cerrada` como el tramo final de una cadena lineal después de
  `surtida`/`entregada` — esa forma probablemente no alcanza para
  representar "facturada antes de surtir". Al diseñar RTB-PRO-FAC-01,
  evaluar si facturación necesita ser una dimensión/columna
  **independiente** del estado de surtido (p. ej. una fecha/estado de
  facturación aparte, en vez de un valor más del mismo enum) en lugar de
  extender la cadena actual — no se tocó el modelo hoy porque ese módulo
  no existe todavía y hacerlo sin sus requisitos reales sería adivinar.
- **RTB-VEN-01 — permisos de PO entre vendedores: la pregunta original ya
  no aplica a la Vía B, pero resurge tal cual con la Vía A.** `030:165-168`
  discutía si una PO consolidada podía involucrar NR de otro vendedor del
  mismo cliente — irrelevante ahora en Vía B (la PO nace del propio pedido
  del vendedor que aprobó, mismo `vendedor_id`; `ventas_po_validar()`, que
  era donde vivía la pregunta, se retiró en 043). Vuelve a ser una
  pregunta real en cuanto se reconstruya la Vía A (TODO arriba): si esa
  reconstrucción reintroduce algo como `ventas_po_validar()` para vincular
  una PO tardía contra varias NR, decidir entonces si `vendedor_id` debe
  filtrar qué NR puede cubrir cada usuario `ventas` — no asumir el
  criterio viejo sin repreguntarlo.
- **`gerente_comercial` en `clientes_update` (037), punto más probable de
  revisión.** Incluir a `gerente_comercial` en esa política le da
  autoridad sobre `limite_credito`/`descuento_base`/`vendedor_id` (ya
  expuestas por el `GRANT` de columna existente) — se incluyó porque
  `ventas` ya la tiene y no separar esas columnas fue la decisión más
  rápida, no necesariamente la más fina. Si el dueño del proyecto quiere
  que el gerente comercial vea la política comercial pero no reasigne
  cartera entre vendedores, la corrección es un `GRANT UPDATE` por
  columna más estrecho para ese rol, no tocar la política completa.
- **`profiles_select` limita a cada usuario a su propia fila** — con los
  2 roles nuevos de 037, `gerente_comercial` (que ahora opera
  cotizaciones/NR de cualquier vendedor) ve en blanco el nombre de ese
  vendedor en cualquier join contra `profiles`. Ya afectaba a `direccion`
  desde antes de esta sesión; no se tocó porque ampliar esa política es
  una decisión de alcance mayor (qué tan visible debe ser el directorio
  de usuarios) que no correspondía decidir dentro de una sesión de
  navegación.
