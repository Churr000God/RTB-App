# Auditoría — Módulo de Autenticación y Permisos

Fecha: 2026-08-04. Este documento se citaba desde `CLAUDE.md` y `AGENTS.md` como
lectura obligatoria antes de que existiera — una sesión anterior escribió el
historial de decisiones dándolo por hecho, sin haberlo creado ni haber aplicado
las correcciones que describía. Este es el documento real, escrito después de
verificar el código y corregirlo.

## Contexto

El módulo base (Next.js 14 + Supabase Auth/RLS + RBAC de 8 roles) llegó generado
por AbacusAI. Antes de esta auditoría, `CLAUDE.md` afirmaba que cuatro fallos de
seguridad se habían corregido "antes del primer arranque". Al revisar el código
real ninguno de los cuatro estaba aplicado — la documentación describía un sistema
más seguro que el que había en disco. Esta auditoría parte de ahí.

## Defectos encontrados y corrección aplicada

### 1. Recursión RLS (`42P17`)

**Antes:** las políticas `super_admin_read_all`, `super_admin_update_all`,
`super_admin_insert` hacían `EXISTS (SELECT 1 FROM profiles WHERE ...)` dentro de
una política *sobre la propia tabla* `profiles`. Además `users_update_own_name`
hacía el mismo subselect en su `WITH CHECK`. Cualquier lectura autenticada de
`profiles` fallaba con `42P17` (recursión infinita).

**Corrección:** función auxiliar `public.is_super_admin()` `SECURITY DEFINER`
`STABLE` con `SET search_path = public, pg_temp`. Al correr como el owner de la
tabla (`postgres`), Postgres no le aplica RLS (nunca se activa `FORCE ROW LEVEL
SECURITY`, que lo reintroduciría), así que el `SELECT` interno no re-evalúa las
políticas. `STABLE` la evalúa una vez por sentencia, no por fila. El `search_path`
fijo evita que el llamante inyecte una tabla `profiles` falsa a una función que
corre con privilegios elevados. Ver `db/migrations/001_auth_profiles.sql`.

### 2. Escalada de privilegios en `handle_new_user()`

**Antes:** `COALESCE(NEW.raw_user_meta_data->>'role', 'ventas')` — el campo
`raw_user_meta_data` lo controla quien se registra. Cualquiera podía crear su
cuenta con `role: 'super_admin'` en los metadatos del signup.

**Corrección:** el trigger `on_auth_user_created` y la función `handle_new_user()`
se **eliminaron por completo**, no se corrigieron. El rol lo fija siempre un
`super_admin` desde `POST /api/admin/users` usando el cliente `service_role`.
Como capa adicional, `authenticated` no tiene `GRANT UPDATE` sobre las columnas
`role`/`is_active` de `profiles` — la escalada es imposible a nivel de privilegio,
no solo de política.

Además, el registro público (`Enable Sign Ups`) se desactivó en Authentication →
Providers → Email del dashboard de Supabase (2026-08-04). Esto bloquea
`/auth/v1/signup`, pero no afecta a `POST /api/admin/users`: esa ruta crea usuarios
con `admin.auth.admin.createUser()` vía `service_role`, un camino administrativo
aparte que el toggle de registro público no controla. El alta de usuarios sigue
funcionando exclusivamente desde `/dashboard/admin/users`, operado por un
`super_admin`.

### 3. Cliente `service_role` sin aislar

**Antes:** `createSupabaseAdminClient()` vivía en `app/lib/supabase/server.ts`,
sin `import 'server-only'`, usando `require('@supabase/supabase-js')` en runtime
(lo que además impide que el bundler analice la dependencia y aplique el marcado
server-only).

**Corrección:** movido a `app/lib/supabase/admin.ts`, con `import 'server-only'`
al tope e import estático. Si este módulo termina en un grafo de cliente, el build
falla en vez de filtrar la clave en silencio.

### 4. Telemetría de terceros (AbacusAI)

**Antes:** `app/app/layout.tsx` cargaba
`<script src="https://apps.abacus.ai/chatllm/appllm-lib.js" />` en el `<head>` de
toda la aplicación.

**Corrección:** eliminado. Verificado con `grep -ri abacus app/` → sin resultados.

### 5. `is_active=false` no se aplicaba en servidor

**Antes:** solo se comprobaba en cliente (`auth-provider.tsx`, `login-form.tsx`
tras el login). Ni el middleware ni las rutas de API lo verificaban — un usuario
desactivado con sesión viva seguía operando, contradiciendo la regla de negocio
explícita del proyecto.

**Corrección:** `app/lib/supabase/guards.ts` — `getAuthState()` memoizado con
`cache()` de React (una consulta por request), `requireActiveUser()`/`requireRole()`
para Server Components, `requireApiRole()` para Route Handlers. Se aplicó en el
layout de `/dashboard` y en ambas rutas de `/api/admin/users`. Verificado en vivo:
desactivar a un usuario con sesión ya emitida (token no revocado) y esa misma
sesión recibe `403 Tu cuenta está desactivada` en la siguiente llamada a la API.

Limitación aceptada: los layouts de Next no se re-ejecutan en navegación *soft*
entre rutas hermanas del mismo segmento, así que la UI de un usuario desactivado
*mientras* navega dentro de `/dashboard/*` no desaparece hasta el siguiente request
al servidor. Los datos sí están protegidos siempre, porque cada API route valida
por su cuenta.

### 6. `POST /api/admin/users` estaba roto

**Antes:** creaba el usuario en Auth (lo que disparaba el trigger, que ya insertaba
el perfil), y luego la ruta insertaba el perfil *otra vez* → violación de PK →
entraba a la rama de rollback y borraba el usuario recién creado. **El alta de
usuarios nunca funcionó** en el estado heredado.

**Corrección:** al eliminar el trigger (punto 2), el insert de la ruta es la única
escritura del perfil, hecho con el cliente `service_role`. Verificado end-to-end:
alta real vía la API de Next contra Supabase, perfil creado sin duplicados.

### 7. Sin protección contra quedarse sin `super_admin`

**Antes:** `PATCH /api/admin/users/[id]` permitía que un `super_admin` se
auto-degradara o se auto-desactivara, sin ninguna comprobación de que quedara al
menos un `super_admin` activo en el sistema.

**Corrección:** bloqueo explícito de auto-degradación/auto-desactivación (400), más
un chequeo de "al menos un `super_admin` activo restante" (409) como defensa en
profundidad para futuros endpoints que operen sobre múltiples usuarios a la vez.
Verificado: intentar auto-desactivarse devuelve 400 con mensaje explicativo.

## Pendiente

- Sin endpoint `DELETE` para usuarios (decisión deliberada): el borrado duro
  destruiría historial en cuanto los módulos de Ventas/Compras referencien
  `profiles(id)`. Desactivar ya impide operar por completo.
