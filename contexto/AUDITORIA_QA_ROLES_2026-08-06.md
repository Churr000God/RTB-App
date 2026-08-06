# Campaña de QA por rol — RTB-App (2026-08-06)

> **Estado: todos los hallazgos de este documento (E-01 a E-11, M-01 a M-09,
> y los 8 gaps de UI de §4) están corregidos y verificados** — ver §8 al
> final para el detalle de qué se hizo, qué se encontró de nuevo al corregir
> (incluida una corrección de causa raíz sobre lo que dice E-02 más abajo),
> y cómo se verificó.

## 0. Resumen ejecutivo

Primera verificación de la aplicación con sesiones de navegador reales de los 8
roles (hasta ahora sólo se había probado con `super_admin` y con SQL directo
simulando `authenticated`). Se crearon los 8 usuarios de prueba, se sembró un
circuito completo de datos (catálogos → productos → entidades → ajustes →
conteo físico → discrepancias) ejerciendo cada alta con el rol que la matriz
de permisos dice que puede hacerla, y se recorrieron los 8 roles con
verificaciones positivas y negativas.

**Semáforo por módulo:**

| Módulo | Estado |
|---|---|
| Autenticación / usuarios | 🟢 Correcto — alta, edición, desactivación, auto-protección de super_admin, expulsión de sesión viva: todo funciona |
| Entidades | 🟡 Funcional con fricciones — dos mensajes/estados de UI no reflejan la realidad (ver E-05, E-06) |
| Catálogos / Ubicaciones / Productos | 🟡 Funcional — un bug cosmético repetido (columna duplicada) |
| Ajustes de inventario | 🟢 El circuito de autorización funciona correctamente (segregación de funciones, motivo de rechazo obligatorio) |
| **Conteos físicos** | 🔴 **Roto en su función central** — no se puede congelar ni capturar un conteo a través de la aplicación, en ningún rol, nunca. Ver E-01 y E-02 |
| Discrepancias / hallazgos | ⚪ Sin UI de alta (gap ya documentado, no es código roto) |

**Las tres cosas que hay que arreglar antes de que nadie más use el módulo de
inventario:**

1. **`Congelar` nunca funciona** (E-01) — el primer paso obligatorio de todo
   conteo físico falla siempre, para cualquier rol, con un error crudo de
   Postgres. Root cause identificado y localizado a una línea.
2. **La captura de conteo está completamente bloqueada** (E-02) — la tabla
   que alimenta la pantalla de captura no tiene ningún `GRANT` para
   `authenticated`. Nadie puede escribir un conteo físico a través de la app.
3. **Un conteo "Aplicado" no aplica nada** (E-03) — el botón que debería
   copiar lo contado al inventario real no lo hace; el inventario queda
   exactamente igual, pero la pantalla dice que ya se aplicó.

Estos tres hallazgos están verificados dos veces: por lectura de código
(con cita de archivo y línea) y de forma **live**, reproduciendo el error
real contra la base de Supabase del proyecto.

---

## 1. Alcance y cobertura

### 1.1 Usuarios de prueba (quedan activos, sin tocar la cuenta del dueño)

| Email | Rol | Contraseña |
|---|---|---|
| qa.superadmin@qa.refacrtb.mx | super_admin | RtbQA-2026! |
| qa.direccion@qa.refacrtb.mx | direccion | RtbQA-2026! |
| qa.ventas@qa.refacrtb.mx | ventas | RtbQA-2026! |
| qa.compras@qa.refacrtb.mx | compras | RtbQA-2026! |
| qa.almacen@qa.refacrtb.mx | almacen | RtbQA-2026! |
| qa.logistica@qa.refacrtb.mx | logistica | RtbQA-2026! |
| qa.facturacion@qa.refacrtb.mx | facturacion | RtbQA-2026! |
| qa.finanzas@qa.refacrtb.mx | finanzas | RtbQA-2026! |

`sistemas@refacrtb.com.mx` (la cuenta del dueño) no se tocó en ningún
momento: nunca se editó, desactivó, ni se le cambió rol o contraseña.

### 1.2 Matriz de cobertura por rol

| Rol | Alta/negativo probado | Sidebar verificado | Denegación por URL |
|---|---|---|---|
| super_admin | ✅ Alta de 7 usuarios, edición, auto-bloqueo, firmas | ✅ | ✅ `/admin/settings` → 404 |
| direccion | ✅ Autoriza/aplica ajustes, bloqueo temporal, no autoriza lo propio | ✅ | ✅ `/admin/users` → redirige |
| compras | ✅ Marca, producto, proveedor, ajuste de merma | ✅ | ✅ `/reportes` → 404, `POST /ubicaciones` → 403 |
| almacen | ✅ Categoría, productos, ubicaciones, ciclo completo de conteo | ✅ | ✅ `POST /entidades` → 403 |
| finanzas | ✅ Cuenta bancaria (acceso completo), sólo lectura de conteos | ✅ | ✅ `POST /ajustes` → 403, `/finanzas` → 404 |
| ventas | ✅ Cliente con crédito sobre umbral, mixta incompleta rechazada | ✅ | ✅ `POST /productos` → 403; ve conteos por URL directa |
| logistica | ✅ Recorrido de lectura completo | ✅ | ✅ `POST /ajustes` → 403 |
| facturacion | ✅ Mensaje P03 de cuenta bancaria confirmado | ✅ | ✅ `POST /productos` → 403 |

### 1.3 Fuera de alcance (y por qué)

- **Responsive/móvil** — la app es de escritorio, sidebar de ancho fijo.
- **RLS a nivel de base** — ya se probó por SQL en auditorías anteriores;
  aquí se probó la denegación donde la sufre el usuario (la API/UI).
- **Carga, concurrencia, accesibilidad formal, otros navegadores.**
- **Endpoints sin pantalla** (alta de discrepancias/hallazgos, cuentas
  bancarias, costos, redefinición de unidad) — no se ejercitaron por API
  directa porque esto es QA del producto tal como lo usa una persona; se
  listan como gaps de UI (§4), que es la información accionable.
- **Recuperación de contraseña / expiración de sesión** — no hay flujo
  implementado.

---

## 2. ERRORES

Ordenados por severidad. **S1** bloqueante (impide operar o corrompe datos) ·
**S2** grave (permiso mal aplicado, dato incorrecto, 500 en flujo normal) ·
**S3** menor (mensaje engañoso, 403 oculto tras lista vacía) · **S4** cosmético.

### E-01 — `Congelar` un conteo falla siempre, para cualquier rol — S1

**Rol y URL:** cualquiera con permiso de conteos (super_admin, direccion,
almacen) · `/dashboard/inventario/conteos/[id]`

**Pasos para reproducir:**
1. Crear un conteo (cualquier tipo, cualquier alcance).
2. Pulsar **Congelar**.

**Esperado:** el conteo pasa a estado `congelado`, genera sus líneas y
bloquea el kardex del alcance.

**Obtenido:** error `null value in column "congelado_por" of relation
"inventario_congelamientos" violates not-null constraint`. El conteo se
queda en `planificado` para siempre.

**Impacto en el negocio:** el módulo de conteos físicos es inoperable desde
cero — nadie puede avanzar más allá del primer paso.

**Hipótesis de causa (confirmada):** `db/migrations/012_inventario_conteos.sql:323`
define `congelado_por uuid not null references profiles(id) default
auth.uid()`. La ruta `app/app/api/inventario/conteos/[id]/congelar/route.ts`
inserta en `inventario_congelamientos` usando
`createSupabaseAdminClient()` (cliente `service_role`), que **no lleva
JWT** — `auth.uid()` resuelve a `NULL` en ese contexto, y el `DEFAULT` nunca
tiene con qué llenar la columna `NOT NULL`. No es un problema de permisos
de un rol: es un error estructural de la ruta, así que **rompe para el
100% de los intentos, de cualquier usuario**.

**Efecto secundario grave (parte del mismo hallazgo):** la ruta hace dos
`insert` seguidos sin transacción: primero
`inventario_conteo_detalles` (que sí tiene éxito) y luego
`inventario_congelamientos` (que falla). Al fallar el segundo, el primero
**no se revierte** — el conteo queda con líneas huérfanas para siempre,
en estado `planificado`. Un segundo intento de "Congelar" ya no repite el
mismo error: falla con `duplicate key value violates unique constraint
"uq_det_conteo_prod_sin_ubi"` — un error todavía más confuso que oculta la
causa real. **Cancelar el conteo tampoco limpia las líneas huérfanas** —
quedan como basura permanente en `inventario_conteo_detalles`.

**Verificado:** por lectura de código y en vivo (dos conteos de prueba,
`CNT-000003` y el primer intento de `CNT-000004`, reprodujeron el error
exacto contra Supabase).

---

### E-02 — La captura de conteo (vista ciega) está completamente bloqueada — S1

**Rol y URL:** cualquiera · `/dashboard/inventario/conteos/[id]/captura`

**Pasos para reproducir:**
1. Tener un conteo en estado `congelado` o `en_captura` (aunque sea
   sembrado manualmente, dado que E-01 impide llegar a ese estado desde la
   UI).
2. Abrir la pantalla de captura, o llamar
   `GET /api/inventario/conteos/[id]/detalles`.

**Esperado:** la lista de líneas asignadas al capturista, sin cantidad
teórica (vista ciega).

**Obtenido:** `permission denied for table inventario_conteo_detalles`
(HTTP 500). La pantalla lo traga silenciosamente y muestra "No visitada:
no quedan líneas pendientes en tu asignación" — un mensaje de éxito falso
sobre un fallo real.

**Impacto en el negocio:** aunque E-01 se arreglara, **nadie podría
capturar un conteo** — la funcionalidad completa de toma física de
inventario está inoperable.

**Hipótesis de causa (confirmada):**
`grant select, insert, update, delete... on inventario_conteo_detalles`
sólo se otorgó a `postgres` y `service_role`
(`db/migrations/012_inventario_conteos.sql:590`) — **no existe ningún
`GRANT` a `authenticated`** para esta tabla. La política RLS
(`conteo_detalles_select`) sí es permisiva, pero Postgres deniega el
privilegio de tabla antes de evaluar RLS — exactamente el patrón de bug ya
documentado y corregido una vez en este proyecto para `audit_log`
(`008_audit_log_grant_select.sql`, RTB-ENT-01), reaparecido aquí sin
corregir.

> ⚠️ **Corrección de causa raíz (ver §8.2):** lo anterior está mal. El
> `GRANT` **sí existe** — es un `GRANT SELECT`/`UPDATE` por **columna**
> (`012_inventario_conteos.sql:576-588`), deliberado (es la vista ciega).
> `information_schema.role_table_grants` (la consulta que sustenta este
> párrafo) sólo ve permisos de tabla completa, no por columna, y por eso
> reportó "ningún GRANT" cuando sí lo había. La causa real es que la ruta
> hacía `select('*')`, que exige SELECT sobre *todas* las columnas. El fix
> real fue pedir la lista explícita de columnas concedidas, **no** ampliar
> el `GRANT` — hacerlo habría expuesto `cantidad_teorica`/`diferencia` al
> capturista y roto la vista ciega. Detalle completo en §8.2.

**Verificado:** en vivo — `fetch()` directo al endpoint desde la sesión de
`almacen` (y de cualquier otro rol, ya que el `GRANT` es inexistente, no
selectivo) devuelve el error de Postgres tal cual.

---

### E-03 — "Pasar a aplicado" no aplica nada al inventario — S1

**Rol y URL:** cualquiera con acceso al conteo · `/dashboard/inventario/conteos/[id]`

**Pasos para reproducir:**
1. Llevar un conteo hasta `cerrado` (con sus firmas).
2. Pulsar la transición **"Pasar a aplicado"**.

**Esperado:** `cantidad_fisica` de `inventario_existencias` se actualiza
con lo contado.

**Obtenido:** el conteo pasa visualmente a "Aplicado", pero
`inventario_existencias.cantidad_fisica` **sigue en `NULL`**,
`fecha_ultimo_conteo` y `conteo_id_ultimo` también quedan sin tocar. El
inventario no cambia en absoluto.

**Impacto en el negocio:** el propósito completo de hacer un conteo físico
— conciliar lo físico contra lo teórico — no ocurre nunca, aunque la
pantalla lo declare hecho.

**Hipótesis de causa:** el botón "Pasar a aplicado" usa
`POST /api/inventario/conteos/[id]/estado`
(`conteo-detalle.tsx:143-153`, genérico para toda transición declarada en
`CONTEO_TRANSICIONES`), que sólo hace `update({estado})`. La ruta que sí
copia `cantidad_fisica` — `POST /api/inventario/conteos/[id]/aplicar` —
**nunca se llama desde ninguna pantalla**.

**Verificado en vivo:** conteo `CNT-000004` marcado "Aplicado"; SQL directo
confirmó `cantidad_fisica = null` en la existencia de `QA-PROD-B` tras la
transición.

---

### E-04 — `almacen` puede "aplicar" un conteo, exclusivo de super_admin/direccion — S2

**Rol y URL:** almacen · mismo botón que E-03

**Pasos para reproducir:** con sesión de `almacen`, sobre un conteo
`cerrado`, pulsar "Pasar a aplicado".

**Esperado:** 403 — sólo `super_admin`/`direccion` pueden aplicar
(`POST /aplicar` los exige explícitamente).

**Obtenido:** `200 { success: true }`. `almacen` ejecuta la transición sin
restricción.

**Hipótesis de causa:** el mismo botón de E-03 usa `/estado`, cuyo
`requireApiRole` acepta `['super_admin', 'direccion', 'almacen']`, mientras
que la ruta correcta `/aplicar` sólo acepta los dos primeros. La
restricción de autorización se evade por la puerta que la UI realmente usa.

**Verificado en vivo:** con sesión de `qa.almacen`, `POST /estado
{estado:'aplicado'}` sobre `CNT-000004` devolvió éxito.

---

### E-05 — Un congelamiento nunca se libera desde la UI: bloqueo permanente de inventario — S1

**Rol y URL:** cualquiera · aplica a cualquier producto que haya sido
congelado alguna vez por un conteo

**Pasos para reproducir:**
1. Congelar un conteo sobre un producto (vía SQL, dado E-01).
2. Intentar aplicar cualquier ajuste sobre ese mismo producto.

**Esperado:** debería existir alguna forma de liberar el congelamiento una
vez que el conteo termina, para que el producto vuelva a moverse.

**Obtenido:** `Producto/ubicación congelado por el conteo... — no se puede
mover inventario mientras dura el conteo` (409). El guardia funciona
**correctamente** — el problema es que no existe ningún botón, pantalla o
ruta de UI que llame a `POST /congelamientos/[id]/liberar`. El producto
queda inmovilizado de forma indefinida.

**Impacto en el negocio:** cada conteo que se haga sobre un producto lo
deja congelado para siempre. `QA-PROD-B` de esta campaña ya está en ese
estado — cualquier ajuste futuro sobre él fallará con este mismo error
hasta que alguien libere el congelamiento manualmente por SQL.

**Verificado en vivo:** el ajuste `AJU-000004` (tipo Conteo, para
regularizar la diferencia de -2 piezas de `QA-PROD-B`) fue autorizado
correctamente por `direccion`, y **no pudo aplicarse** con exactamente
este error. Queda en estado `autorizado` para siempre.

---

### E-06 — "Tipo de entidad" muestra un estado inconsistente al crear (compras/ventas) — S2

**Rol y URL:** compras (y por el mismo patrón, ventas) ·
`/dashboard/entidades/nueva`

**Pasos para reproducir:** entrar como `compras` a "Nueva Entidad" sin
tocar el selector "Tipo de entidad".

**Esperado:** que el encabezado, el resumen y la sección de "Datos
comerciales" coincidan con lo que el `<select>` muestra seleccionado.

**Obtenido:** el `<select>` visualmente muestra **"Proveedor"**
seleccionado (es la primera opción permitida para `compras`, que no puede
crear clientes), pero el encabezado dice **"Cliente"**, el resumen dice
"Tipo: Cliente" y la sección de abajo muestra los campos de
**"Datos comerciales (cliente)"** (Límite de crédito, Días de crédito) en
vez de los de proveedor. Todo vuelve a coincidir en cuanto se toca el
selector una vez.

**Impacto en el negocio:** un usuario de compras que no note la
discrepancia llenaría campos de crédito de cliente pensando que está dando
de alta un proveedor.

**Hipótesis de causa:** `app/app/dashboard/entidades/nueva/page.tsx:29`
inicializa `tipo: 'cliente'` sin importar el rol; la línea 80 filtra las
opciones del `<select>` según el rol (`compras` no ve "Cliente"). El
`<select>` controlado (`value={form.tipo}`, línea ~189) no tiene ninguna
opción que coincida con `'cliente'`, así que el navegador cae al primer
`<option>` disponible ("Proveedor") — pero el estado de React
(`form.tipo`) sigue siendo `'cliente'` hasta el primer `onChange`.

**Verificado en vivo:** reproducido con sesión de `compras`; se corrigió
manualmente re-seleccionando el tipo antes de continuar con la campaña.

---

### E-07 — Aviso de aprobación de crédito no corresponde con lo que pasa realmente — S3

**Rol y URL:** ventas · `/dashboard/entidades/nueva`

**Pasos para reproducir:** dar de alta un cliente con límite de crédito
superior a $100,000.

**Esperado (según el propio aviso):** "Supera $100,000 — quedará
pendiente de aprobación de dirección."

**Obtenido:** la entidad se crea **de inmediato con estado Activo** y el
límite completo ya vigente ($150,000 en la prueba). No se genera ninguna
fila en `solicitudes_cambio`.

**Impacto en el negocio:** el aviso promete un control de aprobación de
crédito que no ocurre — cualquier vendedor puede otorgar cualquier límite
de crédito sin que dirección lo sepa ni lo apruebe.

**Hipótesis de causa:** `nueva/page.tsx:234` calcula `requiereAprobacion`
sólo para mostrar el texto; `POST /api/entidades` no contiene ninguna
referencia a `UMBRAL_APROBACION_CREDITO` ni genera solicitud alguna al
crear. La regla de aprobación (`REGLAS_APROBACION`) sólo aplica a
*cambios* sobre una entidad existente, nunca al valor inicial de creación
— pero el aviso no distingue eso.

**Verificado en vivo:** `QA Cliente Uno` (ENT-000007) con $150,000 de
crédito, estado Activo inmediato, tabla `solicitudes_cambio` sin ninguna
fila para esta entidad.

---

### E-08 — "Nuevo Conteo" y "Nuevo Ajuste" se muestran sin verificar permiso — S2

**Rol y URL:** cualquiera sin permiso de creación (ej. `ventas`,
`logistica`, `facturacion`) · `/dashboard/inventario/conteos` y
`/dashboard/inventario/ajustes`

**Pasos para reproducir:** entrar como `ventas` (que no puede crear
conteos ni ajustes) a cualquiera de las dos listas.

**Esperado:** el botón de alta no debería mostrarse, igual que en
Catálogos, Ubicaciones, Productos y Entidades (que sí ocultan
correctamente su botón según `puede(role, recurso, 'insert')`).

**Obtenido:** el botón **"Nuevo Conteo"** / **"Nuevo Ajuste"** se muestra
sin condición a cualquier rol autenticado. Si se usa, el formulario se
llena entero y sólo falla al final, con `403 Sin permisos`, tras haber
invertido el tiempo de llenarlo.

**Hipótesis de causa:** `app/app/dashboard/inventario/conteos/page.tsx:32`
y `app/app/dashboard/inventario/ajustes/page.tsx:34` no importan ni llaman
`puede()` en ningún punto del archivo — a diferencia de
`productos-explorer.tsx:78` y `entidades-explorer.tsx:95`, que sí lo hacen.

**Verificado:** por lectura de código (comparación directa entre los 4
archivos) y en vivo — `ventas` ve el botón en `/conteos`, y
`POST /api/inventario/conteos` con esa sesión devuelve 403.

---

### E-09 — Columna "Nombre" duplicada en las 4 pestañas de Catálogos — S4

**Rol y URL:** cualquiera · `/dashboard/catalogos` (Familias, Categorías,
Marcas, Unidades de medida)

**Obtenido:** la tabla de cada pestaña muestra la columna **"Nombre" dos
veces**, con el mismo valor repetido.

**Hipótesis de causa (confirmada):** el helper `NOMBRE()` en
`lib/inventario/catalogos.ts:59-66` marca `enTabla: true`. La tabla
genérica (`catalogo-tabla.tsx:52,66`) ya renderiza una columna "Nombre"
fija para todos los catálogos, y además añade cualquier campo con
`enTabla: true` — así que el campo "nombre" se pinta dos veces. Afecta a
los 4 catálogos por igual, porque los 4 usan el mismo helper.

**Verificado:** en vivo, en las 4 pestañas, con datos reales (unidades
sembradas, familias sembradas, y `QA-CAT`/`QA-MRC` creados en esta
campaña).

---

### E-10 — El campo "Estado" (dirección fiscal) parece prellenado pero es sólo un placeholder — S3

**Rol y URL:** cualquiera con alta de entidad · `/dashboard/entidades/nueva`

**Pasos para reproducir:** llenar el formulario de alta de entidad sin
tocar el campo "Estado" (muestra "Jalisco" en gris).

**Esperado:** o el campo viene prellenado de verdad, o no se ve como si lo
estuviera.

**Obtenido:** "Jalisco" es el `placeholder`, no un valor. Al enviar, el
formulario rechaza con "El estado es obligatorio" — un error válido, pero
que sorprende porque visualmente el campo no se distingue de un campo
lleno hasta que se hace foco en él.

**Impacto:** fricción menor, pero reproducible en cualquier alta de
entidad; ya ocurrió dos veces durante esta misma campaña con dos usuarios
distintos (compras y ventas).

---

### E-11 — Los 8 enlaces a módulos futuros dan un 404 crudo de Next.js en inglés — S4 (hallazgo agregado)

**Rol y URL:** cualquiera · `/dashboard/ventas`, `/compras`, `/almacen`,
`/rutas`, `/facturacion`, `/finanzas`, `/reportes`, `/admin/settings`

**Obtenido:** página negra, sin sidebar, sin header, sin marca, con el
texto en inglés "404 · This page could not be found." — completamente
fuera del shell y del idioma del resto de la aplicación.

**Impacto:** rompe la coherencia visual/idiomática en 8 puntos de entrada
que, además, están enlazados desde el propio sidebar de la app (no son
URLs "escondidas").

Se reporta como **un solo hallazgo agregado** (no 8), ya que la causa y la
corrección son la misma en los 8 casos: son módulos planificados
(`RTB-PRO-VEN/COM/ALM/RUT/FAC/FIN-01`) sin página `page.tsx` todavía.

---

## 3. MEJORAS

Prioridad: **Alta** (fricción que impide el uso real por un operador no
técnico) · **Media** (ralentiza o confunde) · **Baja** (pulido). Esfuerzo:
`XS` (<1h) / `S` (medio día) / `M` (1-3 días) / `L` (>3 días).

| Id | Título | Prioridad | Esfuerzo |
|---|---|---|---|
| M-01 | "Asignar capturista" usa `window.prompt` pidiendo pegar un UUID de usuario a mano (`conteo-detalle.tsx:93-96`) — inusable para un operador real; debería ser un `<select>` con los mismos nombres que ya trae `usuarios_directorio()` | Alta | S |
| M-02 | "Cancelar" un conteo también usa `window.prompt` para el motivo (`conteo-detalle.tsx:88-91`) — mismo problema | Alta | XS |
| M-03 | Las líneas de un ajuste piden "Producto ID" y "Ubicación ID" como texto libre (UUID pegado a mano) — la pantalla de ubicaciones nunca muestra el UUID en ningún lado, así que ubicación queda casi siempre vacía por la fricción, no por elección | Alta | M |
| M-04 | Placeholder de contraseña en alta de usuario dice "Mínimo 6 caracteres", el servidor exige 8 — corregir el texto del placeholder | Media | XS |
| M-05 | Botones de transición de conteo muestran el valor crudo del enum (`Pasar a en_conciliacion`) en vez de la etiqueta en español ya definida en `CONTEO_ESTADO_LABELS` | Media | XS |
| M-06 | El botón "Pasar a congelado" (E-01 lo hizo evidente) debería excluirse igual que ya se excluye "cancelado" en el generador de botones genérico de transición | Alta | XS |
| M-07 | El campo "Estado" en dirección fiscal debería traer un valor real por defecto ("Jalisco") en vez de sólo un placeholder, ya que la mayoría de las direcciones de RTB están en ese estado | Media | XS |
| M-08 | Los 8 enlaces de módulos futuros deberían mostrarse deshabilitados con etiqueta "Próximamente" en el sidebar (como ya hace el Dashboard con sus tarjetas) en vez de ser enlaces reales a un 404 | Media | S |
| M-09 | Gap de UI: no existe pantalla para liberar un congelamiento — dado E-05, esta es ahora una **prioridad alta**, no cosmética: sin ella, cada conteo deja productos inmovilizados para siempre | Alta | M |

---

## 4. Gaps de UI (funcionalidad de backend sin pantalla)

Capacidades que el backend soporta pero que la aplicación no expone en
ninguna pantalla — confirmado que sus rutas de API existen y responden,
pero ningún componente las invoca:

| Capacidad | Ruta existente | Notas |
|---|---|---|
| Liberar un congelamiento | `POST /congelamientos/[id]/liberar` | Ver E-05 — ahora crítico |
| Crear una discrepancia | `POST /api/inventario/discrepancias` | La pantalla sólo lista, nunca crea |
| Crear/cerrar un hallazgo | `POST/PATCH /api/inventario/hallazgos` | Sin pantalla en absoluto |
| Subir soporte documental de un ajuste | — | El campo es una ruta de texto libre, no un `<input type="file">` con URL firmada (mismo patrón ya resuelto en RTB-ENT-01 para comprobantes de proveedor) |
| Alta de costo de producto | `POST /api/productos/[id]/costos` | El rol lo permite (compras, finanzas, direccion, super_admin), no hay botón |
| Alta de cuenta bancaria de proveedor | `POST /api/proveedores/[id]/cuentas` | finanzas/super_admin pueden por permiso, no hay formulario |
| Resolver/aplicar redefinición de unidad | `POST /redefiniciones-unidad/[id]/resolver` y `/aplicar` | Se puede *solicitar* desde el producto, pero no hay pantalla para verla, resolverla ni aplicarla |
| Aprobar/rechazar solicitud de cambio | `POST /solicitudes-cambio/[id]/resolver` | Hay una solicitud pendiente real de esta campaña (bloqueo temporal de `QA Proveedor Uno`) sin ninguna pantalla donde dirección/super_admin pueda verla y resolverla |

---

## 5. Confirmado correcto (para que quede constancia de lo que sí funciona)

- Alta de usuario, edición, badges de rol y estado — funcionan de punta a
  punta.
- Auto-protección de `super_admin`: no puede desactivarse ni cambiarse el
  rol a sí mismo (`400` con mensaje claro).
- Desactivación de cuenta: **sesión viva expulsada en la siguiente
  petición** (`/login?reason=inactive`) y **login bloqueado** con el mismo
  mensaje de negocio — verificado en vivo con `qa.facturacion`.
- Segregación de funciones en ajustes: nadie —ni siquiera `super_admin`—
  puede autorizar su propio ajuste.
- Rechazo de ajuste exige motivo, con error de validación legible (no
  crudo).
- Congelamiento **sí** bloquea correctamente un ajuste sobre producto
  congelado, con mensaje de negocio traducido (no el 55006 crudo).
- Cierre de conteo sin firmas correctamente bloqueado, citando la norma
  interna (RTB-CIE-01).
- Vista ciega de conciliación (`conteo_conciliacion()`) respeta el estado
  `en_captura` — devuelve cero filas al capturista, tal como se
  documentó.
- Entidad "mixta" incompleta se rechaza con `400` claro, no con un 500
  (la hipótesis original de esta sonda resultó ser incorrecta — el
  comportamiento real es correcto).
- Mensajes de acceso a cuenta bancaria diferenciados por rol: "Acceso
  completo (finanzas / super_admin)" y "No tienes acceso a esta
  información (P03)" para facturación — ambos verificados en pantalla.
- Sidebar de los 8 roles coincide exactamente con la matriz de
  navegación esperada.
- Bloqueo temporal de entidad por `direccion` queda correctamente
  pendiente de aprobación de `super_admin` (no se aplica directo).
- Los ~10 endpoints de escritura probados desde un rol sin permiso
  devuelven `403 Sin permisos` de forma consistente.

---

## 6. Datos de prueba creados

Todo lleva prefijo `QA-` o el sufijo "(prueba)" para ser identificable.
**No se sembró ni se limpió nada por decisión del dueño del proyecto** —
queda como semilla útil, con las siguientes advertencias:

| Elemento | Clave/folio | Estado final | Nota |
|---|---|---|---|
| Marca | `QA-MRC` | Activo | |
| Categoría | `QA-CAT` | Activo | |
| Ubicación (centro) | `QA` | Activo | |
| Ubicación (zona) | `QA-Z01` | Activo | |
| Producto A | `RTB-AHO-000005` | Borrador, 100 pz @ $25.50 | Libre, sin congelamiento |
| Producto B | `RTB-AHO-000003` | Borrador, 38 pz físicas (teórica 40) | **Congelado permanentemente por `CNT-000004` — ver advertencia abajo** |
| Producto C | `RTB-AHO-000004` | Borrador, sin existencia | Nunca se le aplicó ningún movimiento |
| Proveedor | `QA Proveedor Uno` (`ENT-000006`) | Activo | Tiene una solicitud de bloqueo temporal **pendiente sin resolver** |
| Cliente | `QA Cliente Uno` (`ENT-000007`) | Activo, crédito $150,000 | Ver E-07 — no generó aprobación pese a superar el umbral |
| Ajuste | `AJU-000002` (Carga inicial) | Aplicado | Correcto, generó las existencias de A y B |
| Ajuste | `AJU-000003` (Merma) | Rechazado | Circuito de rechazo probado con éxito |
| Ajuste | `AJU-000004` (Conteo) | **Autorizado, nunca podrá aplicarse** | Bloqueado por el congelamiento de `CNT-000004` — ver E-05 |
| Conteo | `CNT-000003` | Cancelado | **Tiene 2 líneas huérfanas en `inventario_conteo_detalles` que nunca se limpiaron** (residuo de E-01) |
| Conteo | `CNT-000004` | Aplicado (sin efecto real, ver E-03) | **Deja `QA-PROD-B` con un congelamiento activo permanente** |

### ⚠️ Advertencias operativas para el dueño del proyecto

1. **`QA-PROD-B` está congelado para siempre** — cualquier ajuste o
   movimiento de kardex sobre él fallará con "Producto/ubicación
   congelado..." hasta que alguien libere manualmente el congelamiento por
   SQL (no hay botón en la app — ver E-05/M-09).
2. Hay **una solicitud de cambio pendiente sin resolver** (bloqueo
   temporal de `QA Proveedor Uno`) — visible sólo por SQL, no por
   pantalla, hasta que se implemente el gap de §4.
3. `CNT-000003` dejó **2 filas huérfanas** en `inventario_conteo_detalles`
   — no afectan la operación pero son basura de datos producto de E-01.
4. Debido a E-01 y E-02, **este ciclo de conteo se completó parcialmente
   por SQL directo** (siempre documentado en el momento: congelamiento,
   captura de la cantidad física, y las transiciones de estado que sí
   funcionan por API se hicieron vía `fetch()` autenticado real, nunca
   inventando datos). Esto fue necesario para poder seguir probando las
   etapas posteriores (firmas, cierre, aplicado) — de otro modo la
   campaña se habría detenido en el primer paso.

---

## 7. Riesgos y siguiente vuelta

- **Prioridad inmediata recomendada:** corregir E-01 y E-02 antes de que
  cualquier persona real intente usar Conteos Físicos — hoy la
  funcionalidad es 100% inoperable desde la interfaz.
- Una vez corregido E-01, revisar si la falta de `GRANT` de E-02 es un
  patrón que se repite en otras tablas nuevas del mismo módulo (el
  proyecto ya tiene un historial de este exacto tipo de bug en
  `audit_log`) — vale la pena una pasada de `information_schema.role_table_grants`
  contra las tablas de `012_inventario_conteos.sql` completas.
- Recomendado implementar la pantalla de liberar congelamiento (M-09)
  como parte del mismo parche que corrija E-01 — sin ella, cada conteo
  corregido seguirá dejando productos inmovilizados.
- Pendiente para una siguiente vuelta: recorrido clic a clic de los gaps
  de UI de §4 una vez que existan pantallas, y verificación de que las
  correcciones de E-01/E-02/E-03 no rompan el resto del circuito ya
  probado en esta campaña (ajustes, entidades, catálogos).

---

## 8. Corrección (2026-08-06, misma fecha, sesión posterior)

Se corrigieron **todos** los hallazgos de este documento: E-01 a E-11,
M-01 a M-09, y los 8 gaps de UI de §4. Detalle completo en
`contexto/CORRECCION_QA_ROLES_2026-08-06.md`. Resumen aquí de lo que un
lector de esta auditoría necesita saber para no quedarse con el
diagnóstico original como vigente.

### 8.1 Los tres S1 de conteos (E-01, E-02, E-03) — causa raíz real

El diagnóstico de síntoma de los tres era correcto (reproducido en vivo,
tal como dice este documento). La causa raíz de fondo, común a los tres,
era la misma y **no** es la que E-01/E-02 describen por separado:

Las rutas `congelar`/`aplicar` usaban `createSupabaseAdminClient()`
(`service_role`, **sin JWT**). Eso resuelve dos problemas de golpe —
`auth.uid()` NULL (por eso `congelado_por` violaba NOT NULL en E-01, y por
eso `aplicado_por` habría violado su propio CHECK en cuanto se arreglara
E-03) y el `GRANT` restringido de las tablas de conteo — pero rompe el
segundo para arreglar el primero.

La corrección de fondo no es "dar más privilegio a `service_role`": es
dejar de usar el cliente admin ahí. `inventario_congelar_conteo()` e
`inventario_aplicar_conteo()` (funciones `SECURITY DEFINER`,
`016_qa_correcciones.sql`) hacen todo el trabajo de una sola vez,
invocadas por el cliente del **propio usuario** — la función gana el
privilegio que necesita sobre las tablas restringidas (igual que ya
hacían `inventario_congelamiento_activo()` y `conteo_conciliacion()` en
012), pero como nunca se sale del contexto JWT del usuario, `auth.uid()`
resuelve al actor real durante todo el flujo. Congelar quedó además
atómico (antes eran 2-4 escrituras HTTP sueltas — la causa de las líneas
huérfanas de E-01).

**La causa raíz que describe E-02 en este documento está equivocada, y su
fix insinuado es peligroso.** `inventario_conteo_detalles` **sí** tenía
`GRANT` para `authenticated` — 21 de 28 columnas en SELECT, 7 en UPDATE,
tal como los escribió `012`. `information_schema.role_table_grants` (la
consulta que sustenta el hallazgo original) sólo ve permisos de **tabla**,
no de columna. La causa real: la ruta hacía `select('*')`, que exige
SELECT sobre *todas* las columnas — de ahí el `permission denied for
table`, con el mismo síntoma que un GRANT ausente. El HINT que Postgres
imprime en ese error (`GRANT SELECT ON ... TO authenticated`) habría sido
el fix incorrecto: un `GRANT` de tabla completa habría expuesto
`cantidad_teorica`/`diferencia`/`costo_unitario_snapshot` al capturista,
destruyendo la vista ciega — el control más importante del módulo. El fix
real fue pedir la lista explícita de columnas ya concedidas
(`CONTEO_DETALLE_COLUMNAS_CAPTURA`, `lib/inventario/config.ts`), no tocar
el `GRANT`.

### 8.2 Bug adicional, no documentado aquí, encontrado al corregir

`inventario_conteo_detalles.cantidad_fisica` — la columna real que exige
`det_estado_cantidad_chk` para marcar una línea como `contada`, y que
`inventario_aplicar_conteo()` copia a `inventario_existencias` — **nunca
se calculaba**. La captura sólo mandaba `cantidad_capturada` +
`unidad_captura_id`; no existía ningún trigger que convirtiera eso a
`cantidad_fisica` (a diferencia del kardex, que sí tiene esa conversión en
`inventario_movimientos_before_insert()`). E-02 lo enmascaraba por
completo — nadie llegó a intentar una captura real a través de la UI antes
de esta corrección. Confirmado con los datos QA reales: la única línea
`contada` que existía (`CNT-000004`/`QA-PROD-B`) tenía `cantidad_fisica`
sólo porque el equipo de QA la escribió a mano por SQL durante la campaña
(ver advertencia 4 de §6), nunca a través de este PATCH. Corregido en
`conteo_detalles_before_update()` (`017_conteo_captura_conversion.sql`).

También se encontró y corrigió, al construir "Asignar capturista" (M-01):
el payload mandaba `familia_id: null, ubicacion_id: null` siempre —
`asg_alcance_chk` exige uno de los dos no nulo, así que la asignación
**siempre habría fallado** en cuanto alguien llegara vivo hasta ese botón
(cosa que E-01/E-02 impedían). Y al implementar la edición de crédito de
una entidad ya existente (regla huérfana descubierta al corregir E-07):
`clientes.limite_credito` nunca tuvo `GRANT UPDATE` para `authenticated`
(`019_clientes_limite_credito_grant.sql`) — el flujo de aprobación
funcionaba sólo porque el resolver usa `service_role`, que ignora la
columna faltante.

### 8.3 Verificación

- SQL, simulando cada rol real (`set local role authenticated` +
  `set_config('request.jwt.claim.sub', ...)`), incluida la atomicidad de
  `inventario_congelar_conteo()` ante un fallo a mitad de camino (0 líneas
  huérfanas) y el bloqueo de `inventario_aplicar_conteo()` para `almacen`
  a nivel de función, no sólo de ruta.
- Clic a clic, con sesiones reales de navegador de `almacen` y
  `direccion` (el recorrido pendiente del TODO de `CLAUDE.md`): conteo
  nuevo (`CNT-000012`) de principio a fin — crear → congelar → asignar →
  capturar (vista ciega, sin teórico) → conciliar → firmar supervisor y
  gerente de operaciones → cerrar → aplicar al inventario. Confirmado por
  SQL que `inventario_existencias.cantidad_fisica`/`fecha_ultimo_conteo`/
  `conteo_id_ultimo` quedaron escritos y que `aplicado_por` no es NULL.
- Limpieza de los datos QA atascados (§6) hecha **desde la app real**, no
  por SQL: se liberó el congelamiento de `QA-PROD-B`, se aplicó
  `AJU-000004` (ya sin el bloqueo), y se aprobó la solicitud de bloqueo
  temporal de `QA Proveedor Uno` desde la pantalla nueva de solicitudes.
  Sólo las 2 líneas huérfanas de `CNT-000003` se limpiaron por SQL (no
  hay, ni tiene sentido que haya, una pantalla para eso).
- `npx tsc --noEmit` y `docker build --target builder` (TypeScript real,
  `ignoreBuildErrors: false`) limpios. `get_advisors` sin `ERROR` nuevo.
