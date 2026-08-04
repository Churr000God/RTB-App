# CLAUDE.md — RTB Sistema

Instrucciones que se cargan en cada sesión de Claude Code para este proyecto.

## Qué es el proyecto

Sistema ERP interno modular para **Refacciones Tomás Badillo, S.A. de C.V.** Reemplaza
Notion como herramienta de gestión interna. Parte de un módulo base (Autenticación y
Permisos) generado con AbacusAI y adoptado como punto de partida el 2026-08-04.

## Stack y cómo correrlo

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/Radix
- **Backend/DB:** Supabase (Auth email/password + PostgreSQL + RLS) — proyecto
  `RTB_Web_Desarrollo` (ref `qbwjgwnwhkmgzczfsifs`)
- **Contenedor:** Docker + docker-compose
- **No usa NextAuth ni Prisma** — usa Supabase SSR con cookies directamente, aunque
  ambas librerías siguen instaladas como dependencia muerta (ver Gotchas)

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
├── app/                  # rutas (App Router): /login, /dashboard, /api/admin
├── components/
│   ├── auth/             # LoginForm
│   ├── layout/           # Sidebar, Header, DashboardShell, AuthProvider
│   └── ui/                # shadcn/Radix
├── lib/
│   ├── supabase/         # clientes browser, server, middleware, admin
│   └── rbac/             # configuración de roles, permisos y hooks
├── types/                # tipos TypeScript del sistema
└── middleware.ts         # protección de rutas con Supabase SSR
db/migrations/            # SQL versionado, aplicar en orden en Supabase SQL Editor
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

- **RLS recursivo:** las políticas que comprueban `role = 'super_admin'` consultando
  `profiles` desde dentro de una política *sobre* `profiles` producen `42P17`
  (recursión infinita) en Postgres. Usar una función `SECURITY DEFINER` auxiliar
  (`is_super_admin()`), nunca un `EXISTS (SELECT ... FROM profiles ...)` directo en
  la política.
- **Trigger `handle_new_user()`:** nunca debe leer el rol desde
  `raw_user_meta_data` — es controlable por el usuario que se registra (escalada de
  privilegios). Rol por defecto fijo, se cambia después desde el panel de admin.
- **`createSupabaseAdminClient()`** usa `SUPABASE_SERVICE_ROLE_KEY` y solo debe
  importarse desde código server-only (`import 'server-only'` al tope del archivo).
  Nunca desde un componente `'use client'`.
- **Sin lockfile en el ZIP original** — se generó `app/package-lock.json` al reparar
  Docker. No borrarlo. Se generó con `npm install --package-lock-only --legacy-peer-deps`
  dentro de un contenedor `node:20-alpine` (no con el Node del host) para que coincida
  con la versión que usa el Dockerfile.
- **Conflicto de peer-deps eslint/typescript-eslint:** `eslint@9.24.0` vs
  `@typescript-eslint/parser@7.0.0` (requiere `eslint@^8.56.0`) — ambos vienen así del
  generador. `npm ci`/`npm install` fallan con `ERESOLVE` sin `--legacy-peer-deps`. El
  Dockerfile ya usa `RUN npm ci --legacy-peer-deps` en el stage `deps`; si se regenera
  el lockfile a mano hay que usar la misma flag.
- El proyecto base traía un script de telemetría de AbacusAI
  (`apps.abacus.ai/chatllm/appllm-lib.js`) y un inyector base64 ofuscado en
  `next.config.js` — ambos removidos. Si aparecen de nuevo al regenerar código con
  IA, quitarlos.
- `lib/db.ts` (Prisma) y las dependencias de NextAuth quedaron del generador
  original sin usarse — no las alimentes con lógica nueva; es deuda técnica
  pendiente de retirar (ver auditoría).
- Node 20 dentro del contenedor Docker; el host puede tener otra versión (irrelevante
  gracias al contenedor).

## Historial de decisiones

- **2026-08-04** — Proyecto inicializado. Se adopta como base el módulo de
  Autenticación/Permisos generado por AbacusAI (`Proyecto_Frontend_y_Backend.zip`),
  aplanando `rtb-system/nextjs_space/` → `app/` para eliminar el anidamiento
  innecesario de un monorepo de un solo servicio.
- **2026-08-04** — Se corrigen antes del primer arranque: recursión RLS, escalada de
  privilegios en `handle_new_user`, telemetría de terceros (Abacus), y se separa el
  cliente admin de Supabase a un módulo `server-only`. Ver
  `contexto/AUDITORIA_MODULO_AUTH.md` para el detalle completo y lo que queda
  pendiente.
- **2026-08-04** — Ejecución vía Docker (no `npm run dev` directo) porque así lo
  pidió el dueño del proyecto; el `Dockerfile`/`docker-compose.yml` heredados no
  servían (sin lockfile, corrían `yarn dev` en producción, root) y se reescribieron.

## TODO

- Instalar `graphify` y correr `/graphify .` cuando haya más código real más allá
  del módulo de auth.
- `SUPABASE_SERVICE_ROLE_KEY` real: pendiente de copiar del dashboard de Supabase
  (el MCP no expone claves secretas).
