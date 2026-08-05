# Proceso — Alta de usuario interno

Módulo 1 (Autenticación y Permisos). Quien opera esto es siempre un
`super_admin`; no existe registro público.

## Quién puede

Sólo `super_admin`. `direccion` tiene lectura amplia del sistema pero no
administra usuarios (`CLAUDE.md` §Reglas de negocio críticas).

## Dónde

- **UI:** `/dashboard/admin/users` (`app/app/dashboard/admin/users/page.tsx`).
- **API:** `POST /api/admin/users` (alta), `PATCH /api/admin/users/[id]`
  (edición/activar/desactivar). No hay `DELETE` — decisión deliberada, ver
  más abajo.

## Flujo de alta

1. El `super_admin` llena correo, contraseña temporal, nombre completo y rol
   en el modal de `/dashboard/admin/users`.
2. `POST /api/admin/users` valida con zod
   (`app/app/api/admin/users/route.ts`): correo válido, contraseña ≥ 8
   caracteres, nombre 3–120 caracteres, rol dentro de `USER_ROLES`
   (`app/types/database.ts`).
3. Crea el usuario en `auth.users` vía
   `admin.auth.admin.createUser({ email, password, email_confirm: true })`
   — con el cliente `service_role` (`app/lib/supabase/admin.ts`).
4. Inserta el perfil en `public.profiles` (mismo cliente admin, porque
   `authenticated` no tiene `GRANT INSERT` sobre `profiles`). **No existe
   trigger `on_auth_user_created`** — es la única forma de que el rol se
   fije, nunca se deriva de `raw_user_meta_data` (controlable por quien se
   registra).
5. Si el insert del perfil falla, se revierte el alta en Auth
   (`admin.auth.admin.deleteUser`) — rollback manual, no hay transacción
   real entre Auth y Postgres.

## Reglas de negocio que aplica el código

- **Anti-lockout:** `PATCH /api/admin/users/[id]` bloquea que un
  `super_admin` se auto-degrade o se auto-desactive (400), y exige que quede
  al menos un `super_admin` activo tras cualquier cambio de rol/estado (409).
- **`is_active=false` se aplica en servidor**, no sólo en cliente —
  `app/lib/supabase/guards.ts::getAuthState()`, memoizado con `cache()` de
  React. Un usuario desactivado con sesión ya emitida recibe `403` en la
  siguiente llamada a cualquier API, y `redirect('/logout?reason=inactive')`
  en el siguiente Server Component.
- **Sin `DELETE`:** el borrado duro destruiría historial en cuanto un módulo
  referencie `profiles(id)` — y ahora todos los módulos lo hacen
  (`created_by`, `vendedor_id`, `aprobador_id`, etc. de RTB-ENT-01). Un
  usuario que ya no trabaja en RTB se desactiva, no se borra.

## Qué puede fallar

| Síntoma | Causa | Dónde mirar |
|---|---|---|
| "Ya existe un usuario con ese correo" | Auth ya tiene ese email | mensaje detectado por regex sobre el error de `createUser` |
| Usuario creado sin poder iniciar sesión | Perfil no se creó (fallo revertido) | logs de la API, `authError`/`profileError` en la ruta |
| Usuario ve "Tu cuenta no tiene un perfil asignado" | Se creó a mano en el Dashboard de Supabase, sin pasar por esta API | `getAuthState()` lo trata como denegado — fallo seguro, no un bug |

Detalle de la auditoría de este módulo (defectos heredados del generador y su
corrección) en `contexto/AUDITORIA_MODULO_AUTH.md`.
