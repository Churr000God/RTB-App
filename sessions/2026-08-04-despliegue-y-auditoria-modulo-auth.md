# Sesión 2026-08-04 — Despliegue base y auditoría del módulo de Autenticación

## Punto de partida

El código del módulo 1 (Autenticación y Permisos) ya estaba en `app/` desde una
sesión anterior, generado por AbacusAI. Quedaban pendientes 4 pasos del plan
original:

1. Desplegar el proyecto base en Docker.
2. Configurar y subir el repositorio a GitHub.
3. Configurar la base de datos de Supabase vía MCP.
4. Evaluar el proyecto, identificar puntos de corrección y aplicarlos.

También arrastrábamos un bloqueo previo: el usuario `diego` no estaba en el grupo
`docker` del sistema.

## 1. Docker

El problema de permisos ya estaba resuelto al iniciar esta sesión (`diego` en el
grupo `docker`, servicio activo). Al levantar el proyecto con
`docker compose up --build` aparecieron dos problemas nuevos, no relacionados con
permisos:

- **Sin `package-lock.json`** — `npm ci` fallaba. Se generó dentro de un contenedor
  `node:20-alpine` (no con el Node del host, para que coincida con el Dockerfile).
- **Conflicto de peer-deps** `eslint@9.24.0` vs `@typescript-eslint/parser@7.0.0`
  (requiere `eslint@^8.56.0`), heredado del generador. Se resolvió con
  `--legacy-peer-deps` en el `Dockerfile` y al regenerar el lockfile.

Con eso, la app quedó corriendo en `http://localhost:3000`.

## 2. GitHub

Repo `Churr000God/RTB-App`, confirmado **privado** (necesario por el contenido de
negocio en `contexto/`). Tenía cero commits. Se hizo un commit base con el código
tal como salió de AbacusAI, sin corregir nada todavía, y se empujó a `origin/main`.
Cada corrección posterior se commiteó por separado — historial auditable de qué
venía roto del generador y qué se arregló después.

## 3. Supabase — hallazgo importante: dos proyectos

Al ir a conectar Supabase apareció un problema serio: **la organización tenía dos
proyectos**, y el que documentaba `CLAUDE.md` (`RTB_Web_Desarrollo`,
`qbwjgwnwhkmgzczfsifs`) no era el correcto — tenía tablas ajenas a RTB
(`admin_users`, `audit_log`, `mailbox_state`) de otra iniciativa que reutiliza la
misma organización de Supabase. El proyecto correcto es **`RTB-App`
(`dgafffpbhktxadiqmmwl`, región ca-central-1)**, creado el mismo día que el repo.
Se detectó porque la `service_role key` que pegó el usuario tenía un `ref` distinto
al que se venía usando.

Una vez confirmado el proyecto correcto con el usuario:

- Se restauró (estaba `INACTIVE`) y se conectó `app/.env` con sus credenciales
  reales.
- Se creó el primer usuario `super_admin` (`sistemas@refacrtb.com.mx`) vía la API
  admin de Supabase Auth, y su perfil en `profiles`.
- Se desactivó el registro público de usuarios en el dashboard (Authentication →
  Sign In / Up). Nota: el usuario primero apagó por error el interruptor maestro
  "Enable email provider" (esto bloqueó también el login), luego encontró el
  correcto — "Allow new users to sign up" — que sí es el específico para bloquear
  solo altas nuevas sin afectar el login.

Se documentó todo esto en `CLAUDE.md` y `contexto/AUDITORIA_MODULO_AUTH.md`, y
luego se retiró la mención al proyecto viejo por indicación del usuario (es de
otro proyecto, no debía quedar documentado aquí).

## 4. Auditoría y correcciones — el hallazgo más serio de la sesión

`CLAUDE.md` afirmaba en su historial que 4 fallos de seguridad ya se habían
corregido "antes del primer arranque", citando `contexto/AUDITORIA_MODULO_AUTH.md`
como evidencia. **Ninguna corrección estaba aplicada y ese documento no existía.**
La documentación describía un sistema más seguro que el código real.

Correcciones aplicadas y verificadas contra Supabase real:

1. **Recursión RLS (`42P17`)** — las políticas de `profiles` consultaban `profiles`
   desde dentro de sí mismas. Resuelto con `is_super_admin()` (`SECURITY DEFINER
   STABLE`, `search_path` fijo) y `GRANT UPDATE (full_name)` en vez de un
   `WITH CHECK` recursivo.
2. **Escalada de privilegios** en `handle_new_user()` (leía el rol de
   `raw_user_meta_data`, controlable por quien se registra) — el trigger se
   eliminó por completo; el rol lo fija siempre un `super_admin` vía API.
3. **Cliente `service_role` sin aislar** — movido a `app/lib/supabase/admin.ts`
   con `import 'server-only'` e import estático.
4. **Telemetría de AbacusAI** (`apps.abacus.ai/chatllm/appllm-lib.js`) — removida
   de `app/app/layout.tsx`.
5. **`is_active=false` no se aplicaba en servidor** — nuevo `app/lib/supabase/guards.ts`
   (`requireActiveUser`/`requireRole`/`requireApiRole`, memoizado con `cache()`).
   Verificado en vivo: usuario desactivado con sesión ya emitida recibe `403` en
   la siguiente llamada a la API.
6. **`POST /api/admin/users` estaba roto** — creaba el perfil dos veces (el
   trigger y la ruta), violaba la PK y el rollback borraba al usuario recién
   creado. El alta de usuarios **nunca había funcionado**. Corregido al eliminar
   el trigger; probado end-to-end contra la app real.
7. **Sin protección contra quedarse sin `super_admin`** — bloqueo de
   auto-degradación/auto-desactivación (400) y de dejar el sistema sin ningún
   `super_admin` activo (409).

De paso se retiró por completo la deuda muerta de Prisma/NextAuth y de una app de
gastos personales ajena al proyecto (`lib/db.ts`, `prisma/`, `lib/types.ts`,
`next-auth.d.ts`, dependencias en `package.json`) — nada la importaba.

Se creó `contexto/AUDITORIA_MODULO_AUTH.md` con el detalle real de cada defecto,
su corrección y cómo se verificó.

## 5. Ajuste de UI

Se agregaron tooltips (componente `Tooltip` de Radix/shadcn) a los botones de
"Editar" y "Activar/Desactivar" en `/dashboard/admin/users`, mostrando la acción
exacta al pasar el cursor — incluido el motivo cuando el botón está deshabilitado.

## Estado final

- **10 commits** en `main`, sincronizados con GitHub.
- App corriendo en Docker, probada contra Supabase real (login, RLS, alta de
  usuario, `is_active`, anti-lockout).
- Documentación del repo (`CLAUDE.md`, `AGENTS.md`, `contexto/AUDITORIA_MODULO_AUTH.md`)
  alineada con el código real, sin referencias al proyecto Supabase ajeno.
- Memoria persistente actualizada, incluida una lección para futuras sesiones:
  no confiar en afirmaciones de "esto ya está corregido" leídas en la
  documentación sin verificar el código/infra real primero.

## Pendiente para después

- Instalar `graphify` y correr `/graphify .` cuando haya más módulos construidos.
- Sin endpoint `DELETE` de usuarios (decisión deliberada, no pendiente): se
  desactivan en vez de borrarse para no destruir historial cuando existan
  Ventas/Compras referenciando `profiles(id)`.
