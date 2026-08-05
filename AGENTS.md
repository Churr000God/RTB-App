# AGENTS.md — Guía maestra de trabajo

Para cualquier agente (Claude Code u otro) que trabaje en este repo.

## Orden de lectura del código para entender el proyecto rápido

1. `CLAUDE.md` — visión general, stack, gotchas.
2. `contexto/AUDITORIA_MODULO_AUTH.md` — qué se heredó, qué se corrigió, qué falta.
3. `db/migrations/001_auth_profiles.sql` — el modelo de datos y las políticas RLS.
4. `app/middleware.ts` → `app/lib/supabase/middleware.ts` — cómo se protege una ruta.
5. `app/lib/rbac/config.ts` y `app/lib/rbac/hooks.ts` — cómo se calcula el rol y la
   navegación visible.
6. `app/components/layout/dashboard-shell.tsx` — cómo se ensamblan Sidebar + Header +
   AuthProvider alrededor de una página.
7. `app/app/api/admin/users/` — el único par de rutas de API que existe hoy; patrón a
   replicar para los módulos futuros (auth check → chequeo de rol → validación de
   payload → operación).
8. `contexto/RTB-PRO-*.md` — especificación funcional del módulo que vayas a construir.
9. `contexto/RTB_sistema_visual.md` + `app/STYLE_GUIDE.md` — antes de tocar cualquier
   componente visual.

## Módulos activos vs. legado

- **Activo:** todo bajo `app/lib/supabase/`, `app/lib/rbac/`, `app/components/auth/`,
  `app/components/layout/`, `app/app/(login|dashboard|api/admin|logout)/`.
- **Legado retirado (2026-08-04):** el ZIP de AbacusAI traía `app/lib/db.ts` (Prisma),
  `app/prisma/schema.prisma` (vacío), `next-auth` + `@next-auth/prisma-adapter`, y
  `app/lib/types.ts` (tipos de una app de gastos personales ajena al proyecto). Nada
  los importaba — se eliminaron por completo (código, carpeta y dependencias en
  `package.json`), no quedaron como deuda documentada.
- **Docker:** `Dockerfile` y `docker-compose.yml` en la raíz del repo (no dentro de
  `app/`) — fueron reescritos, el `Dockerfile` original del ZIP no funcionaba.

## Reglas de implementación

- Toda la UI en español; el código (variables, comentarios) en inglés como ya está.
- Cualquier tabla nueva en Supabase necesita RLS habilitado desde el `CREATE TABLE`
  — nunca se sube una tabla sin políticas, ni "temporalmente".
- Las políticas RLS que necesiten comprobar el rol del usuario actual usan la función
  `public.is_super_admin()` (o su equivalente por rol), nunca un `EXISTS` recursivo
  directo sobre la misma tabla que protegen.
- Cualquier ruta bajo `app/app/api/` valida sesión → rol → payload, en ese orden,
  siguiendo el patrón de `app/app/api/admin/users/route.ts`.
- El cliente con `SUPABASE_SERVICE_ROLE_KEY` (`lib/supabase/admin.ts`) lleva
  `import 'server-only'` al tope y jamás se importa desde un archivo `'use client'`.
- Nuevos módulos siguen la estructura de navegación de `lib/rbac/config.ts`
  (`NAV_SECTIONS` con `roles: UserRole[] | 'all'`) para que aparezcan/oculten según
  el rol automáticamente.

## Skills sugeridos y cuándo usarlos

- `test-driven-development` — antes de tocar parseo, agregaciones o cálculos de KPIs
  (inventario, facturación, finanzas serán los módulos donde más importa).
- `code-review` — si el cambio toca más de un módulo o afecta KPIs visibles en el
  dashboard.
- `run` / `verify` — para levantar el contenedor (`docker compose up`) y observar el
  comportamiento real antes de dar algo por terminado.
- `verification-before-completion` — antes de reportar "listo" en cualquier tarea.
- `security-review` — obligatorio antes de mergear a `main`, especialmente en
  cualquier cambio a políticas RLS, rutas de API o el middleware de auth.

## Verificación antes de cerrar (checklist de 5 pasos)

1. `docker compose build` completa sin errores (TypeScript real: `ignoreBuildErrors:
   false` en `next.config.js`).
2. `docker compose up` levanta y el flujo login → dashboard → logout funciona a mano.
3. Si se tocó RLS o una API: probar con al menos dos roles distintos (uno con acceso,
   uno sin) para confirmar que la restricción es real, no solo de UI.
4. `grep -ri abacus app/` no devuelve nada (no debe reaparecer telemetría de terceros).
5. `git status` revisado a mano antes de cualquier commit — nunca `git add -A` a
   ciegas; confirmar que no se cuela un `.env` real.

## MCP disponibles relevantes para este proyecto

- **Supabase** — gestión directa del proyecto `RTB-App` (ref `dgafffpbhktxadiqmmwl`):
  migraciones (`apply_migration`), inspección (`list_tables`, `get_advisors`,
  `get_logs`), y branches para probar cambios de esquema sin tocar producción.
- **n8n** — el módulo de Facturación necesita timbrado SAT vía n8n (ver
  `contexto/RTB-PRO-FAC-01_Modulo_Facturacion.md`); ahí es donde se conecta.
- **Figma** — si se retoma el trabajo de `contexto/RTB_sistema_visual.md` y aparece
  un archivo de diseño de referencia para los módulos nuevos.
- Gmail / Calendar / Drive / Notion / Gamma / Canva no tienen un uso identificado
  para este proyecto por ahora.
