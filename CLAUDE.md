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
├── app/                  # rutas (App Router): /login, /dashboard, /api/admin, /logout
├── components/
│   ├── auth/             # LoginForm
│   ├── layout/           # Sidebar, Header, DashboardShell, AuthProvider
│   └── ui/                # shadcn/Radix
├── lib/
│   ├── supabase/         # client.ts, server.ts, middleware.ts (solo redirects,
│   │                     # sin DB), admin.ts (service_role, server-only),
│   │                     # guards.ts (requireActiveUser/requireRole/requireApiRole)
│   └── rbac/             # configuración de roles, permisos y hooks
├── types/                # tipos TypeScript del sistema
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
| 2 | Ventas | 🔜 Planificado |
| 3 | Compras | 🔜 Planificado |
| 4 | Almacén | 🔜 Planificado |
| 5 | Rutas | 🔜 Planificado |
| 6 | Facturación | 🔜 Planificado (timbrado SAT vía n8n) |
| 7 | Finanzas | 🔜 Planificado |

Especificación de cada módulo en `contexto/RTB-PRO-*.md`.

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

## TODO

- Instalar `graphify` y correr `/graphify .` cuando haya más código real más allá
  del módulo de auth.
