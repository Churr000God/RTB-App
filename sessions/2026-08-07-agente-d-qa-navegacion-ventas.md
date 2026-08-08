# Sesión 2026-08-07 — QA de navegación y permisos de RTB-VEN-01 + alta de roles comerciales

Agente D. Encargo: recorrer clic a clic el módulo de Ventas con los 10 roles
declarados en la matriz del encargo (8 reales + `gerente_comercial` +
`cobranza`), verificar navegación/permisos pantalla por pantalla, y corregir
lo que estuviera mal. Dos síntomas ya reportados como bugs confirmados:
BUG-NAV-01 (super_admin ve contadores pero no puede profundizar) y BUG-NAV-02
(`ventas` sólo alcanza dashboard + NR).

## Resumen del hallazgo de fondo

**Ambos síntomas comparten una única causa raíz, y no es de permisos.** Antes
de esta sesión:

- Las 43 políticas `SELECT` de los módulos operativos (incluidas las 15
  tablas `ventas_*`) eran *role-agnostic* — cualquier usuario activo lee
  todo.
- Los 20 GET de `/api/ventas/*` llamaban `requireApiRole()` **sin
  argumento** — cualquier rol pasaba.
- Los 13 `page.tsx` del árbol `/dashboard/ventas/**` llamaban
  `requireActiveUser()` y **ninguno** comprobaba rol. No existía
  `app/app/dashboard/ventas/layout.tsx`.

No había ningún bloqueo — lo que faltaba era **navegación**: el sidebar
registraba un solo item de Ventas sin sub-items, y las 7 tarjetas KPI del
tablero eran `<div>` inertes sin `href`. De ahí que `ventas` viera
exactamente dashboard + NR (el único enlace saliente del tablero además de
"Nueva cotización"), y que `super_admin` leyera "Cotizaciones en borrador: 3"
sin poder hacer clic.

Además: los roles `gerente_comercial` y `cobranza` del encargo **no
existían** (`profiles_role_check` sólo admitía 8 valores, sin usuarios QA);
`/dashboard/ventas/congelamientos` y `/dashboard/ventas/excepciones` **no
existían** pese a que sus APIs sí (huérfanas, incluido
`congelamientos/[id]/liberar` — un cliente congelado no se podía liberar
desde la UI); y casi todos los hallazgos §7.x/§3.1 de
`contexto/AUDITORIA_RTB-VEN-01.md` citados en el encargo ya habían sido
corregidos por sesiones paralelas sobre el mismo repositorio antes de que
esta empezara — no se rehicieron.

Decisiones del dueño del proyecto antes de implementar (vía
`AskUserQuestion`): crear los 2 roles nuevos de verdad (no mapearlos a
roles existentes); restringir el módulo con un guard real, no sólo ocultar
menú; navegación por submenú en el sidebar **y** contadores clicables;
construir ambas bandejas faltantes.

## Resumen ejecutivo

Matriz `ACCESO_PANTALLA` (`app/lib/ventas/permisos.ts`) — fuente única que
ahora comparten el guard de cada página, el guard de cada API GET, los
sub-items del sidebar y los `href` del tablero:

| Pantalla | super_admin | direccion | gerente_comercial | ventas | compras | almacen | cobranza | logistica/facturacion/finanzas |
|---|---|---|---|---|---|---|---|---|
| Tablero | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ |
| Cotizaciones | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| Pedidos | ✅ | ✅ | ✅ | ✅ | ⬜ | ✅ | ⬜ | ⬜ |
| Remisiones | ✅ | ✅ | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |
| Órdenes de compra | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ✅ | ⬜ |
| Autorizaciones | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| Congelamientos | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| Excepciones | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| Consultas | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ |

✅ = acceso correcto verificado (guard real + al menos una confirmación en
navegador real de esa fila/columna, ver detalle abajo) · ⬜ = sin acceso,
verificado como denegado (guard real + redirect confirmado para los casos
marcados abajo). Dentro de una pantalla permitida, quién puede *actuar*
(congelar, resolver, despachar…) lo sigue decidiendo `MATRIZ`/RLS/RPC, no
esta tabla — por diseño `ventas`/`cobranza` entran a Congelamientos pero
sólo `super_admin`/`direccion`/`gerente_comercial` ven el botón "Liberar".

**Confirmado en navegador real** (Claude in Chrome, sesión completa, sin
tocar cuentas reales):
- `super_admin` (`qa.superadmin@`): submenú de 8 items visible → clic en
  "Cotizaciones en borrador: 2" navegó a
  `/dashboard/ventas/cotizaciones?estado=borrador` y mostró exactamente 2
  filas (**BUG-NAV-01 cerrado**); abrió el detalle de una cotización sin
  crash (Tooltip); congeló una entidad real (`ENT-000022`) desde
  `cartera-comercial-tab.tsx` y la liberó de punta a punta desde la
  bandeja nueva `/dashboard/ventas/congelamientos` (ver Bugs corregidos
  §2).
- `ventas` (`qa.ventas@`): submenú completo de 8 items (antes sólo
  alcanzaba dashboard + NR) → `/dashboard/ventas/cotizaciones` carga y
  lista sus cotizaciones reales (**BUG-NAV-02 cerrado**).
- `gerente_comercial` (`qa.gerente.comercial@`, usuario nuevo): sesión
  real, tarjeta "Ventas" única en el dashboard, submenú completo,
  `/dashboard/ventas/autorizaciones` carga.
- `cobranza` (`qa.cobranza@`, usuario nuevo): submenú de exactamente 3
  items (Tablero/Remisiones/Órdenes de compra, sin botón "Registrar PO");
  URL directa a `/dashboard/ventas/cotizaciones` (fuera de su
  `ACCESO_PANTALLA`) redirige a `/dashboard` sin mostrar datos.
- `logistica` (`qa.logistica@`): sidebar sin ningún item de Ventas; URL
  directa a `/dashboard/ventas/cotizaciones` redirige a `/dashboard` —
  confirma que el guard nuevo es real (server-side), no cosmético.

**Confirmado por SQL simulando rol real** (32 escenarios, `BEGIN`/`ROLLBACK`,
detalle en Verificación final): los 8 roles restantes (`direccion`,
`compras`, `almacen`, `finanzas`, `facturacion`) y las acciones de
`gerente_comercial`/`cobranza` que el navegador no ejercitó directamente
(RPC de aprobar/despachar/validar PO, anti-autoaprobación, lecturas
restringidas) — 32/32 aserciones correctas.

## Bugs corregidos

### 1. BUG-NAV-01 y BUG-NAV-02 — navegación ausente (el hallazgo central)

**Causa raíz:** un solo item de sidebar sin sub-items
(`app/lib/rbac/config.ts`) y 7 tarjetas KPI sin `href`
(`app/app/dashboard/ventas/page.tsx`). Ninguna pantalla ni API comprobaba
rol — la restricción real vino después, como corrección independiente (ver
§4).

**Corrección:**
- `app/types/navigation.ts`: `NavItem` gana `children?: NavItem[]`.
- `app/lib/rbac/config.ts`: el item "Ventas" gana 8 `children` derivados de
  `ACCESO_PANTALLA` (uno por pantalla); `roles` del item padre pasa a ser
  la unión de esa matriz; `getNavForRole()` filtra recursivamente.
- `app/components/layout/sidebar.tsx`: nuevo bloque de render para items
  con `children` — expandida muestra un encabezado no clicable + la lista
  de hijos como enlaces propios (evita dos `<Link>` al mismo `href`);
  colapsada muestra sólo el icono del padre enlazando al primer hijo.
  `hrefActivo` ahora también considera los `href` de los hijos.
- `app/app/dashboard/ventas/page.tsx`: las 7 tarjetas ganan un `href`
  condicionado a `ACCESO_PANTALLA` (oculto si el rol no tiene esa
  pantalla) con el filtro de estado correspondiente
  (`?estado=borrador`, `?estado=entregada_sin_po`, etc.); el render pasa
  de `<div>` a `<Link>` cuando hay `href`.
- Dos pantallas destino no soportaban `?estado=` todavía:
  `app/app/dashboard/ventas/autorizaciones/{page.tsx,autorizaciones-bandeja.tsx}`
  y `app/app/dashboard/ventas/ordenes-compra/{page.tsx,ordenes-compra-explorer.tsx}`
  ganaron un `estadoInicial` que siembra el filtro de la bandeja cliente
  (mismo patrón que ya usaba `remisiones/page.tsx`).

**Confirmación visual:** ver Resumen ejecutivo — clic real en el contador,
navegación al listado filtrado con el conteo correcto, para `super_admin` y
`ventas`.

### 2. `/dashboard/ventas/congelamientos` y `/dashboard/ventas/excepciones` no existían

**Causa raíz:** las APIs (`GET/POST /api/ventas/congelamientos`,
`.../[id]/liberar`, `GET/POST /api/ventas/excepciones`,
`.../[id]/resolver`) se construyeron en la sesión del módulo pero ninguna
pantalla las consumía — `congelar` sí tenía UI (`cartera-comercial-tab.tsx`,
dentro de la ficha de entidad) pero **liberar no tenía ninguna**, dejando
un cliente congelado irreversible desde el navegador.

**Corrección:** dos pantallas nuevas calcadas del patrón de
`autorizaciones-bandeja.tsx` (paginación real, filtro por estado,
`MotivoDialog` para capturar el motivo, refresco vía `router.refresh()`):
- `app/app/dashboard/ventas/congelamientos/{page.tsx,congelamientos-bandeja.tsx}`
  — listado con botón "Liberar" para `super_admin`/`direccion`/`gerente_comercial`.
- `app/app/dashboard/ventas/excepciones/{page.tsx,excepciones-bandeja.tsx}`
  — listado con "Aprobar"/"Rechazar", mismo candado de
  anti-autoaprobación visual que autorizaciones (oculta los botones si
  `solicitante_id === userId`).
- `app/app/api/ventas/congelamientos/route.ts` y
  `app/app/api/ventas/excepciones/route.ts`: el `SELECT` ganó
  `entidades(nombre_comercial, nombre_legal)` para no mostrar el UUID
  crudo de la entidad (mismo criterio que el fix §7.4 ya aplicado en
  cotización/pedido/NR).

**Confirmación visual, de punta a punta:** con `qa.superadmin@`, se congeló
la entidad real `ENT-000022` (QA Prueba Siglas SA de CV) desde
`cartera-comercial-tab.tsx` — el estado pasó a "Congelada" y la ficha
confirmó "Esta entidad no puede operar ahora mismo", sin ningún botón para
revertirlo ahí. Se navegó a `/dashboard/ventas/congelamientos`, la fila
apareció con botón "Liberar", se completó el diálogo de motivo y el estado
pasó a "Liberado" — cierra el agujero real, no sólo la pantalla.

### 3. Los roles `gerente_comercial` y `cobranza` no existían

**Causa raíz:** `profiles_role_check` sólo admitía 8 valores; el encargo
asumía 10 roles y usuarios QA que nunca se crearon.

**Corrección** — migración `db/migrations/037_roles_comerciales.sql`:
- `profiles_role_check` amplía a 10 valores.
- `gerente_comercial` añadido tras `direccion` en el guard de 10 funciones
  `SECURITY DEFINER` (enviar/aprobar/rechazar/cancelar cotización, emitir
  NR, validar PO, cancelar vínculo, liberar a Almacén, despachar NR,
  resolver autorización) y en 14 políticas de escritura. Cada
  `create or replace` se construyó desde `pg_get_functiondef()` de la base
  **viva** (no de las migraciones 031/032/033 originales) para no revertir
  en silencio los fixes de 035 (hallazgo crítico #1,
  `pedido_linea_id`) ni de 036 (`ventas_vinculo_cancelar`) — verificado
  después con un diff estructural (`pg_get_functiondef` antes/después,
  cero `proname` duplicado en `pg_proc`).
- `cobranza`: sólo lectura — cero políticas de escritura, cero función
  `SECURITY DEFINER`, storage `evidencias-ventas` sólo `SELECT`.
- Capa TypeScript: `USER_ROLES` (`app/types/database.ts`) gana los 2
  roles; `ROLE_LABELS`/`ROLE_COLORS` (`app/lib/rbac/config.ts`) — únicos
  dos puntos que rompían la compilación al no actualizarse.
- 2 usuarios QA creados vía `POST /api/admin/users` (el único camino
  correcto — sin trigger `on_auth_user_created`, un alta por Dashboard de
  Supabase deja un usuario sin perfil e inerte):
  `qa.gerente.comercial@qa.refacrtb.mx` / `qa.cobranza@qa.refacrtb.mx`,
  contraseña `RtbQA-2026!`.

**Confirmación:** los 2 usuarios existen en `profiles` con `is_active=true`
y el rol correcto (verificado por SQL); sesión real de ambos en el
navegador (ver Resumen ejecutivo); el `<select>` de
`/dashboard/admin/users` ofreció "Gerente Comercial"/"Cobranza" como
opciones reales al crearlos.

### 4. Ninguna pantalla ni API de Ventas comprobaba rol de verdad

**Causa raíz:** ver §1 — no era el síntoma reportado, pero es la misma
clase de bug que el encargo pidió cerrar en todas las pantallas.
`logistica`/`facturacion`/`finanzas` podían teclear cualquier URL de
Ventas y ver datos reales.

**Corrección:**
- **Nuevo** `app/app/dashboard/ventas/layout.tsx`: `requireRole()` con la
  unión de `ACCESO_PANTALLA` como primer filtro de todo el árbol.
- Los 13 `page.tsx` existentes pasan de `requireActiveUser()` a
  `requireRole(ACCESO_PANTALLA.<pantalla>)`. Las dos páginas `nueva`
  (`cotizaciones/nueva`, `ordenes-compra/nueva`) eran client components
  **sin ningún guard de servidor** — se dividieron en un Server Component
  con el guard (`page.tsx`) + el formulario cliente
  (`cotizacion-nueva-form.tsx`/`po-nueva-form.tsx`). La de PO usa
  `rolesQuePueden('ordenes_compra','insert')` en vez de
  `ACCESO_PANTALLA.ordenes_compra` porque ese último incluye `cobranza`
  (sólo lectura del listado) — dejarlo entrar a un formulario de alta que
  su propio POST rechazaría habría sido un guard cosmético.
- 14 de los 17 GET de `/api/ventas/*` que llamaban `requireApiRole()` sin
  argumento pasaron a su `ACCESO_PANTALLA` correspondiente. Los 3
  restantes (`clientes/[entidadId]/estado`, `precios/[productoId]`,
  `consultas/[id]/cancelar`) se dejaron abiertos a propósito: los dos
  primeros los consumen componentes de Entidades/Productos (`roles:
  'all'`), y el tercero (`ventas_consulta_cancelar`) protege por
  identidad — `current_user_role() not in (...) and solicitante_id <>
  actor` —, así que restringirlo por rol habría bloqueado a `ventas`
  cancelando su propia consulta. Verificado leyendo la función antes de
  tocar la ruta, no asumido.

**Confirmación:** `logistica` sin ningún item de Ventas en el sidebar y
redirigido a `/dashboard` al teclear la URL directa (ver Resumen
ejecutivo); `cobranza` redirigido igual al intentar `/cotizaciones`.

### 5. Duplicación de constantes de rol en `lib/ventas/config.ts`

**Causa raíz (encontrada durante la implementación, no en el encargo
original):** `ROLES_AUTORIZAN_VENTAS`/`ROLES_RESPONDEN_CONSULTA`/
`ROLES_DESPACHAN_NR` en `config.ts` duplicaban con otro nombre
`ROLES_AUTORIZAN`/`ROLES_RESPONDEN_CONSULTA`/`ROLES_DESPACHAN` de
`permisos.ts` — dos fuentes de verdad para la misma política. Añadir
`gerente_comercial` sólo en `permisos.ts` habría dejado los consumidores
de `config.ts` (`consultas-bandeja.tsx`, `nr-detalle.tsx`) desincronizados.

**Corrección:** `config.ts` ahora reexporta los tres desde `permisos.ts`
con los nombres originales — un solo lugar que actualizar en el futuro.

### 6. 38 listas literales de "los 8 roles" en tres matrices de permisos

**Causa raíz:** `app/lib/{entidades,inventario,ventas}/permisos.ts`
repetían a mano el arreglo completo de roles en cada entrada `select` (6 +
18 + 14 = 38 veces). Añadir un rol nuevo sin tocar las 38 lo habría dejado
ciego en silencio a ese rol para leer entidades/inventario, aun cuando la
RLS real (role-agnostic) sí lo permite — el riesgo de omisión más alto de
toda la parte TypeScript.

**Corrección:** nueva constante `TODOS_LOS_ROLES` en
`app/types/database.ts` (derivada de `USER_ROLES`), sustituyendo las 38
apariciones en los tres archivos.

## Observaciones sin corrección

- **§3.6 de `AUDITORIA_RTB-VEN-01.md`** (Órdenes de compra sin restricción
  de dueño por `vendedor_id`) sigue abierta — pregunta para el dueño del
  proyecto, sin tocar por diseño (ver TODO de `CLAUDE.md`).
- **`profiles_select` limita a cada usuario a su propia fila** —
  `direccion`/`gerente_comercial` ven en blanco el nombre de otros
  usuarios en joins (p.ej. quién es el vendedor de una cotización ajena).
  Condición preexistente que ya afectaba a `direccion`; no se amplía aquí
  porque tocar esa política es una decisión de alcance mayor a esta
  sesión.
- **`clientes_update` para `gerente_comercial`** conlleva autoridad sobre
  `limite_credito`/`descuento_maximo`/`vendedor_id` (columnas ya expuestas
  por el `GRANT` existente). Se incluyó porque `ventas` ya la tiene y un
  gerente más débil que su propio equipo sería incoherente — es el punto
  más probable de revisión si el dueño del proyecto quiere separar esas
  columnas después.
- **Dos `gerente_comercial` en ping-pong de autorizaciones**: con dos
  usuarios de ese rol, uno podría solicitar y el otro resolver —
  estructuralmente igual a como ya opera `direccion` hoy. Es una decisión
  de dotación de personal, no un hueco de SQL.
- **No se ejecutó `aprobar`/`despachar`/`validar PO` end-to-end en
  navegador** para `gerente_comercial` (requieren producto con costo,
  existencia, pedido con línea real — fuera del alcance de esta sesión de
  navegación). Sí se verificó por SQL simulando rol real que las 10
  funciones tienen el guard correcto (diff estructural) y que 3 de ellas
  (`rechazar`, `cancelar`, `resolver autorización`) funcionan de punta a
  punta con datos reales dentro de una transacción revertida.
- El hallazgo crítico #1 (emparejamiento de apartados) **no se tocó** —
  ya estaba corregido por la migración 035 antes de esta sesión, y el
  encargo lo asignaba a otro agente. Se verificó explícitamente que
  `ventas_nr_despachar()` se reconstruyó desde la definición viva (con el
  fix de 035 intacto), no desde el texto original de 032.

## Archivos modificados

**Nuevos:**
- `db/migrations/037_roles_comerciales.sql`
- `app/app/dashboard/ventas/layout.tsx`
- `app/app/dashboard/ventas/congelamientos/page.tsx`
- `app/app/dashboard/ventas/congelamientos/congelamientos-bandeja.tsx`
- `app/app/dashboard/ventas/excepciones/page.tsx`
- `app/app/dashboard/ventas/excepciones/excepciones-bandeja.tsx`
- `app/app/dashboard/ventas/cotizaciones/nueva/cotizacion-nueva-form.tsx`
- `app/app/dashboard/ventas/ordenes-compra/nueva/po-nueva-form.tsx`

**Modificados** (sólo las líneas de rol/navegación/guard — varios de estos
archivos ya traían otros cambios sin commitear de sesiones paralelas
previas a ésta):
- `app/types/database.ts`, `app/types/navigation.ts`
- `app/lib/rbac/config.ts`, `app/components/layout/sidebar.tsx`
- `app/lib/ventas/permisos.ts`, `app/lib/ventas/config.ts`
- `app/lib/entidades/permisos.ts`, `app/lib/inventario/permisos.ts`
- `app/app/dashboard/ventas/page.tsx`
- `app/app/dashboard/ventas/cotizaciones/page.tsx`
- `app/app/dashboard/ventas/cotizaciones/[id]/page.tsx`
- `app/app/dashboard/ventas/cotizaciones/nueva/page.tsx`
- `app/app/dashboard/ventas/pedidos/page.tsx`
- `app/app/dashboard/ventas/pedidos/[id]/page.tsx`
- `app/app/dashboard/ventas/remisiones/page.tsx`
- `app/app/dashboard/ventas/remisiones/[id]/page.tsx`
- `app/app/dashboard/ventas/ordenes-compra/page.tsx`
- `app/app/dashboard/ventas/ordenes-compra/[id]/page.tsx`
- `app/app/dashboard/ventas/ordenes-compra/nueva/page.tsx`
- `app/app/dashboard/ventas/ordenes-compra/ordenes-compra-explorer.tsx`
- `app/app/dashboard/ventas/consultas/page.tsx`
- `app/app/dashboard/ventas/autorizaciones/page.tsx`
- `app/app/dashboard/ventas/autorizaciones/autorizaciones-bandeja.tsx`
- `app/app/api/ventas/autorizaciones/route.ts`
- `app/app/api/ventas/congelamientos/route.ts`
- `app/app/api/ventas/consultas/route.ts`
- `app/app/api/ventas/cotizaciones/route.ts`
- `app/app/api/ventas/cotizaciones/[id]/route.ts`
- `app/app/api/ventas/cotizaciones/[id]/lineas/route.ts`
- `app/app/api/ventas/excepciones/route.ts`
- `app/app/api/ventas/excepciones/[id]/resolver/route.ts`
- `app/app/api/ventas/notas-remision/route.ts`
- `app/app/api/ventas/notas-remision/[id]/route.ts`
- `app/app/api/ventas/ordenes-compra/route.ts`
- `app/app/api/ventas/ordenes-compra/[id]/route.ts`
- `app/app/api/ventas/pedidos/route.ts`
- `app/app/api/ventas/pedidos/[id]/route.ts`
- `app/app/api/ventas/tablero/route.ts`
- `CLAUDE.md`, `app/README.md`, `db/ESQUEMA.md`

## Verificación final

**SQL simulando rol real** (`set_config('request.jwt.claim.sub', <uuid
literal resuelto antes de cambiar de rol>, true)`, dentro de
`BEGIN`/`ROLLBACK` — nada persistió): 32/32 aserciones correctas, incluidas:
- `gerente_comercial` rechaza/cancela/edita cotizaciones de **otro**
  vendedor (prueba el guard + la exención de la rama de propiedad a la
  vez); congela y **libera** cartera; resuelve la política comercial del
  cliente.
- **La prueba más importante**: `gerente_comercial` intenta resolver su
  **propia** solicitud de autorización → `42501 "No puedes resolver tu
  propia solicitud."` Y resuelve la de otro usuario sin problema — prueba
  que el primer fallo es por identidad, no por rol.
- `gerente_comercial` sigue **sin** poder fijar precio de venta, aplicar
  un ajuste de inventario, ni responder una consulta de Compras-ligero
  (los tres, `42501`, con el mensaje exacto de cada función); sin acceso a
  cuentas bancarias/`audit_log`/`proveedor_productos` (0 filas); sólo ve
  su propia fila en `profiles`; no puede forjar su propio ascenso a
  `super_admin`.
- `cobranza` lee `ventas_cotizaciones`/`cliente_congelamientos`/storage
  `evidencias-ventas`; toda escritura y todo RPC de Ventas devuelve
  `42501` o "permission denied for table" (bloqueado antes de llegar a
  RLS, por el `GRANT` de columna).
- No regresión de los 8 roles existentes: `ventas` edita lo suyo (1 fila)
  y no lo ajeno (0 filas, sin error); `direccion` sigue resolviendo
  autorizaciones de otros; `almacen`/`compras` siguen pasando el guard de
  `ventas_nr_despachar()`/`ventas_consulta_responder()` (error de negocio,
  no `42501`); `finanzas`/`facturacion`/`almacen` sin cambio en sus
  lecturas de cuentas bancarias/evidencias/soportes.
- Estructural: `profiles_role_check` con 10 valores en el orden original +
  2 nuevos; 18 funciones con el patrón `not in (...)` intactas (ninguna
  perdió su guard); cero `proname` duplicado en `pg_proc` (sin overloads
  accidentales por firma mal copiada).

**Compilación:**
- `npx tsc --noEmit` dentro del contenedor: limpio, sin errores.
- `docker build --target builder -f Dockerfile .` (TypeScript real,
  `ignoreBuildErrors: false` — `docker compose build` no compila nada,
  gotcha ya documentado del proyecto): `Successfully built`, las 2
  pantallas nuevas (`/dashboard/ventas/congelamientos`,
  `/dashboard/ventas/excepciones`) aparecen en la lista de rutas
  compiladas.
- `get_advisors(type=security)` tras la migración: sin `ERROR` nuevo —
  sólo los `WARN` preexistentes de `SECURITY DEFINER` expuesto vía REST
  (patrón ya aceptado en todo el proyecto).

**Navegador real** (Claude in Chrome, 5 de los 10 usuarios QA con sesión
propia, sobre datos reales — ver detalle en Resumen ejecutivo y Bugs
corregidos): BUG-NAV-01 y BUG-NAV-02 confirmados cerrados con clic real;
alta de los 2 usuarios nuevos vía la pantalla real de
`/dashboard/admin/users`; ciclo completo de congelar→liberar una entidad
real; guard de módulo confirmado como redirect de servidor real (no sólo
sidebar oculto) para un rol totalmente excluido (`logistica`) y para un
rol parcialmente excluido (`cobranza` fuera de `cotizaciones`).

**Un incidente de HMR durante la sesión, sin relación con el código**: tras
convertir `cotizaciones/nueva/page.tsx` de `'use client'` puro a un Server
Component que importa un Client Component nuevo, el compilador de
desarrollo de Next (`next dev`, hot-reload) quedó con metadata de módulo
obsoleta y devolvía `500` en todo `/dashboard/*`
("`server-only` importado en una ruta no soportada"). `docker build
--target builder` (compilación limpia, sin caché) nunca mostró el error —
confirma que era un artefacto de HMR, no un problema real de los límites
cliente/servidor. Se resolvió con `docker compose restart web`; anotado
por si vuelve a pasar en un cambio similar de un `page.tsx` de client a
server component.
