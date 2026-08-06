# Proceso — Conteo físico

Congelamiento, asignación, captura con vista ciega, conciliación, exactitud
y cierre firmado. Cubre las 7 limitaciones reales declaradas en el Acta de
Conteo Físico CIE-CON-01 — mapeo completo en
`contexto/RTB-INV-01_Modulo_Productos_Inventario.md` §7.

## Quién puede

Planificar/congelar/asignar: `super_admin`, `direccion`, `almacen`.
Capturar: `almacen`, sólo dentro de su propia asignación activa y sólo
mientras el conteo está `en_captura`. Firmar como `supervisor`/
`gerente_operaciones`: `super_admin`/`direccion`. Cerrar/aplicar:
`super_admin`/`direccion`.

## Dónde

UI: `app/app/dashboard/inventario/conteos/` (lista, nuevo, `[id]`
detalle, `[id]/captura` vista ciega). API: `app/app/api/inventario/conteos/`.

## Máquina de estados

```
planificado → congelado → en_captura → en_conciliacion → cerrado → aplicado
     ↓             ↓            ↓              ↓
  cancelado    cancelado    cancelado      cancelado
```

`inventario_conteos_before_update()` (`012_inventario_conteos.sql`) es la
única fuente de verdad de qué transición es válida — la UI (`CONTEO_TRANSICIONES`
en `app/lib/inventario/config.ts`) es sólo un espejo para habilitar botones.

## 1. Planificar

`POST /api/inventario/conteos` con `{ tipo, nombre, alcance, alcance_descripcion,
responsable_id, ... }`. `alcance` es un JSON libre que **la API interpreta**,
no una regla de SQL: `{ ubicacion_id?, incluye_descendientes?, familia_id?,
producto_ids? }`. Nace en `planificado` — `estado` no está en el `GRANT INSERT`.

## 2. Congelar

`POST /api/inventario/conteos/[id]/congelar` (con `service_role`, porque
genera líneas en `inventario_conteo_detalles`, tabla sin `GRANT INSERT` para
`authenticated`):

1. Resuelve `alcance` contra `inventario_existencias` (ubicaciones
   descendientes por prefijo de `codigo`, familia, o productos explícitos;
   vacío = todo el catálogo con existencia).
2. Crea `inventario_congelamientos` para ese alcance — **bloqueo real** del
   kardex, consultado por `inventario_congelamiento_activo()` desde el
   propio trigger de movimientos (limitación real #5: *"sin registro de
   cuarentena, el congelamiento no es demostrable"*).
3. Genera una línea en `inventario_conteo_detalles` por cada existencia en
   alcance, con `cantidad_teorica`/`costo_unitario_snapshot`/
   `contenido_por_unidad_snapshot` **congelados al corte** — el acta tiene
   que ser reproducible aunque el catálogo siga cambiando.

## 3. Asignar

`POST /api/inventario/conteos/[id]/asignaciones` — quién cuenta qué
ubicación/familia (limitación real #6: *"el export no guarda quién contó
cada ubicación"*). La RLS de captura de `inventario_conteo_detalles`
comprueba esta tabla directamente.

## 4. Capturar — vista ciega real

`PATCH /api/inventario/conteos/[id]/detalles/[detalleId]` con
`{ estado_conteo, cantidad_capturada?, unidad_captura_id? }`. La vista
ciega ("la vista no muestra cantidad teórica ni diferencia", Acta §II) es
un **privilegio de columna de Postgres**: el `GRANT SELECT` de
`inventario_conteo_detalles` omite `cantidad_teorica`/`diferencia`/
`valor_diferencia`/`costo_unitario_snapshot`. Un capturista no las puede
leer ni con `curl` directo a PostgREST, no sólo porque la UI no las
muestre — verificado con el rol Postgres real `authenticated`, no sólo
como superusuario (ver `contexto/AUDITORIA_RTB-INV-01.md` §Verificación).

`estado_conteo` (limitación real #1): un `0` físico sólo es válido bajo
`no_localizada`, nunca bajo `no_visitada` — el `CHECK`
`det_estado_cantidad_chk` lo exige, así que un renglón sin visitar es
indistinguible de un cero **por diseño**, no por convención de UI.

`contado_por`/`contado_at` los estampa el trigger
(`conteo_detalles_before_update()`), no el payload del cliente — nadie
puede atribuirle un conteo a otra persona.

## 5. Conciliar

`GET /api/inventario/conteos/[id]/conciliacion` → `conteo_conciliacion()`,
`SECURITY DEFINER`, la única función que sí devuelve el teórico. Devuelve
**cero filas** si el conteo sigue `en_captura` con `vista_ciega=true` y no
eres `super_admin`/`direccion` — el mismo "seguro por defecto" del resto
del esquema.

`GET /api/inventario/conteos/[id]/exactitud` → `inventario_exactitud()`,
sobre **cuatro bases**: cobertura, registro, pieza, valor. Cobertura va
primero a propósito — contar una línea `no_visitada` como "exacta" es la
mentira que produce el 100% ficticio del proceso actual (el Acta real mide
"exactitud por registro 98.33% · por pieza 88.13% · por valor 98.83%", tres
números distintos porque miden cosas distintas).

## 6. Firmar y cerrar

`POST /api/inventario/conteos/[id]/firmas` con `{ rol_firma }`.
`inventario_conteos_before_update()` exige firma de `supervisor` **y** de
`gerente_operaciones` antes de aceptar `estado='cerrado'` (RTB-CIE-01,
citado por el Acta real). El `hash_contenido` de cada firma es un digest
del estado del conteo al momento de firmar — una edición posterior queda
desalineada de forma detectable.

## 7. Aplicar

`POST /api/inventario/conteos/[id]/aplicar` copia `cantidad_fisica` a
`inventario_existencias` para cada línea con una medición válida.
**No ajusta el teórico** — "una diferencia sin causa identificada no se
ajusta: se declara como hallazgo" (Registro de Discrepancias real). Ajustar
el teórico exige un `inventario_ajustes` autorizado aparte, ver
`db/procesos/discrepancias-y-ajustes.md`.

## Qué puede fallar

| Síntoma | Causa |
|---|---|
| "Transición de conteo no permitida: X → Y" | La máquina de estados rechaza ese salto |
| "El alcance no encontró existencias que congelar" | El filtro de `alcance` no coincide con ninguna fila de `inventario_existencias` |
| `select cantidad_teorica` devuelve `insufficient_privilege` | Vista ciega real por privilegio de columna — esperado para un capturista |
| "No puedes capturar esta línea: no está en tu asignación activa..." | RLS de `inventario_conteo_detalles`: no eres tú el asignado, o el conteo no está `en_captura` |
| "Un conteo no se cierra sin firma de supervisor y de Gerencia de Operaciones" | Faltan una o ambas firmas en la versión vigente |
| `conteo_conciliacion()`/`inventario_exactitud()` devuelven 0 filas | Rol no autorizado, o vista ciega activa durante la captura |
