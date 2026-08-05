# Sesión 2026-08-05 — Submódulo RTB-ENT-01 Gestión de Entidades

## Punto de partida

Módulo 1 (Auth) auditado y funcional desde la sesión anterior. El dueño del
proyecto trajo un paquete nuevo generado por AbacusAI:
`~/Descargas/Desarrollo_Subm_dulo_Cliente.zip` — el siguiente submódulo,
clientes/proveedores/ubicaciones internas. Pidió explorarlo, resolver dudas,
plantear la implementación y, si había que corregir o mejorar algo,
incluirlo — auditoría implícita en el encargo, no un paso aparte.

## 1. Exploración y auditoría del paquete (modo plan)

El ZIP traía un documento técnico maestro (DDL + RLS + API + 6 flujos), 6
procedimientos operativos en HTML (P01–P06) y 4 mockups de pantalla — sin
código. Se lanzaron 2 agentes Explore en paralelo (uno sobre la arquitectura
real del proyecto, otro sobre el paquete y su comparación contra
Ventas/Compras) más consultas directas a Supabase.

Encontré que el documento maestro y los 6 procedimientos se contradecían
entre sí, generados por agentes distintos sin reconciliar:

- Las ~32 políticas RLS del documento usaban `auth.role()` (siempre
  `'authenticated'`, nunca un rol de negocio) — habrían bloqueado todo.
- Roles `admin`/`rutas` que no existen en `profiles.role`
  (`direccion`/`logistica` sí).
- Tres fuentes de estado distintas (`entidades`+`clientes`+`proveedores` cada
  una con su propio `estado`/`bloqueado`).
- `proveedor_cuentas_bancarias`: el DDL le daba a `compras` CRUD completo;
  P03 dice "solo finanzas inicia, solo super_admin aprueba, nadie más ve ni
  modifica". Se contradicen de forma directa.
- `ubicaciones_internas` sin jerarquía real, apuntando por error a
  clientes/proveedores en vez de ser centros operativos de RTB. P04 pide 5
  niveles; el mockup implementa 4 sin pasillo.
- Umbral de aprobación de crédito: $100,000 en P05, $50,000 en el mockup.
- Sin `audit_log` pese a ser "regla de negocio no negociable" en el propio
  documento.

Se le presentaron 4 preguntas de alcance al dueño del proyecto (vía
`AskUserQuestion`): alcance (núcleo + cuentas bancarias), nivel de
aprobaciones (sólo lo sensible), quién asume el rol `admin` inexistente
(`direccion`), y migración de históricos (manual, sin importador). Con esas
respuestas se escribió el plan completo y se aprobó.

## 2. Implementación

- **5 migraciones SQL** aplicadas vía MCP contra Supabase real
  (`dgafffpbhktxadiqmmwl`): núcleo de entidades (`002`), ubicaciones internas
  con árbol auto-referencial de profundidad flexible 1–5 (`003`), cuentas
  bancarias con validación de CLABE por dígito verificador (`004`), tipo de
  cambio controlado en `solicitudes_cambio` (`005`).
- **20 rutas de API** siguiendo el patrón de `api/admin/users`
  (`requireApiRole` → zod → lógica → `{error}` en español).
- **4 páginas** (`/dashboard/entidades`, `/nueva`, `/[id]`,
  `/dashboard/ubicaciones`), fieles a los mockups del paquete (que sí
  respetan la identidad visual RTB, a diferencia de P01/P02/P04/P06).
- **Capa TypeScript compartida** (`app/lib/entidades/`): permisos (espejo de
  las políticas RLS), validaciones (RFC, CLABE — mismo algoritmo que la
  función SQL), esquemas zod.
- Nueva sección de navegación "Datos maestros" en `app/lib/rbac/config.ts`.

Cada corrección de la auditoría quedó documentada con su porqué directo en
los comentarios del SQL, no sólo en un documento aparte.

## 3. Verificación — y dos bugs reales que no aparecieron leyendo código

1. Build de producción real (`docker build --target builder`, con
   `typescript.ignoreBuildErrors: false`) — encontró un error de tipos real
   (`.finally()` sobre un query builder de supabase-js, que es `PromiseLike`
   no `Promise`), corregido.
2. 5 escenarios de RLS probados contra Postgres simulando cada rol
   (`set local role authenticated` + `request.jwt.claim.sub`): `compras` sin
   acceso a cuentas bancarias, usuario `is_active=false` sin acceso a nada,
   `almacen` sin poder desactivar ubicaciones, `ventas` sin poder escribir
   `limite_credito` directo, `direccion` con acceso a la función enmascarada.
3. **Clic a clic en la app real**, con Docker levantado. Encontré una sesión
   real de `super_admin` ya abierta en el navegador — en vez de tocarla, creé
   una cuenta de prueba aparte para no interferir con la sesión real del
   dueño del proyecto, y la until al terminar (junto con toda la data de
   prueba: entidad, ubicaciones). Alta de cliente, bloqueo temporal, árbol de
   ubicaciones — todo funcionó visualmente, **pero la pestaña de Auditoría
   mostraba "Sin movimientos registrados" pese a que las pruebas de RLS por
   SQL ya habían pasado.**

   La causa: `002_entidades_core.sql` escribió la política RLS de
   `audit_log` pero nunca el `GRANT SELECT` subyacente — el privilegio de
   tabla se comprueba antes que RLS, así que cualquier lectura desde
   `authenticated` fallaba con `42501`, sin importar el rol. Las pruebas por
   SQL directo no lo detectaron porque corren como `postgres` (dueño de la
   tabla, bypassa RLS *y* grants). Sólo la UI real, con una sesión de usuario
   de verdad, lo hizo visible — y aun así en silencio, porque el `.then()`
   del componente no miraba `error`. Se corrigió
   (`008_audit_log_grant_select.sql`) y se reverificó que el `GRANT` no
   abriera una brecha (`compras` sigue viendo 0 filas).

   De paso, limpiar los usuarios de prueba de las pruebas de RLS reveló un
   segundo problema real: `audit_log.usuario_id` no tenía `ON DELETE SET
   NULL`, así que borrar una cuenta de `auth.users` con historial de
   auditoría fallaba por esa FK — contradiciendo que el historial deba
   sobrevivir a lo que describe. Corregido
   (`007_audit_log_on_delete_set_null.sql`), sin aplicar el mismo cambio a
   `created_by`/`updated_by`/etc. de las demás tablas (ésas sí deben seguir
   bloqueando el borrado — es la misma decisión ya documentada para el
   módulo de Auth).

Toda la data de prueba (entidades, ubicaciones, perfiles, usuarios de Auth
con prefijo `QA`) se limpió al terminar — la base quedó con un solo perfil
(el `super_admin` real).

## 4. Documentación

- `contexto/RTB-ENT-01_Modulo_Entidades.md` — spec corregida, la que manda
  sobre el paquete original.
- `contexto/AUDITORIA_RTB-ENT-01.md` — 23 hallazgos con su corrección
  (bloqueantes, contradicciones internas, errores de modelo, huecos frente a
  Ventas/Compras, más los 2 bugs de la verificación en vivo).
- `db/ESQUEMA.md` — referencia completa de las 10 tablas de `public`
  (`profiles` + las 9 de RTB-ENT-01): columnas, tipos, constraints, FKs,
  grants, políticas RLS, funciones auxiliares, diagrama de relaciones.
- `db/procesos/` — 6 documentos de proceso (alta de usuario, alta de
  cliente, alta de proveedor, bloqueo y aprobaciones, cuenta bancaria de
  proveedor, ubicaciones internas): quién puede, qué ruta se llama, qué pasa
  en la base de datos, qué puede fallar.
- `CLAUDE.md` actualizado: tabla de módulos, árbol de arquitectura, 3
  gotchas nuevos (SECURITY DEFINER función vs. vista, `docker compose build`
  no corre `next build`, RLS sin `GRANT` falla en silencio desde el
  cliente), historial de decisiones.

## Estado final

- 8 migraciones nuevas (`002`–`005`, `007`–`008`) aplicadas y verificadas
  contra Supabase real; sin `006` (se plegó su contenido dentro de `005`
  antes de aplicarlo, no quedó como archivo separado).
- Build de producción limpio con las 20 rutas de API y 4 páginas nuevas.
- `get_advisors` sin hallazgos `ERROR`.
- Verificación clic a clic en la app real, sin tocar la cuenta del dueño del
  proyecto, sin dejar datos de prueba.
- Documentación del repo alineada con el código real: spec corregida,
  auditoría completa, referencia de base de datos y de procesos.

## Pendiente para después

- `P01`, `P02`, `P04`, `P06` del paquete original siguen fuera de la
  identidad visual RTB (paleta roja/ámbar, Poppins/Montserrat) — no se
  regeneraron, quedó reportado en la auditoría por si se quieren rehacer.
- `proveedores_productos` fuera de alcance (pertenece a Compras, sin maestro
  de productos todavía).
- Notificaciones automáticas de P05 §VII — sin infraestructura de email;
  los eventos ya quedan en `audit_log`, listos para engancharlas.
- Selector de vendedor en el alta de cliente (`clientes.vendedor_id` existe
  en el modelo, no expuesto todavía en el formulario).
