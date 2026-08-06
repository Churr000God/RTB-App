# RTB-INV-01 | Productos, Costos e Inventario

**Proyecto:** Refacciones Tomás Badillo, S.A. de C.V.
**Submódulo:** RTB-INV-01 Productos, Costos e Inventario
**Versión:** 1.0
**Fecha:** 2026-08-05
**Estado:** Implementado y auditado

> Este documento **manda** sobre el paquete original
> (`RTB_Modulo_Productos_Costos.zip`: `01_analisis_funcional.md` +
> `02_esquema_sql_productos_inventario.sql` + `03_flujo_conteos_fisicos.md`) y,
> donde ambos difieren, también sobre él manda la documentación operativa real
> de RTB (reporte *Existencias de Inventario RTB-INV-01*, *Acta de Conteo
> Físico CIE-CON-01*, *Registro de Discrepancias CIE-DIS-01*). Ese paquete es
> mucho más delgado que el de RTB-ENT-01 y se contradice con cómo RTB opera
> hoy en varios puntos centrales — ver `contexto/AUDITORIA_RTB-INV-01.md` para
> el detalle completo de cada hallazgo y su corrección.

## 1. Objetivo y alcance

Catálogo de **productos**, su **unidad de medida y factor de conversión**,
**costos** (transacción/promedio/catálogo), **existencias** por
producto+ubicación, **kardex** append-only, **conteos físicos** con vista
ciega real, **discrepancias** con causa/banda/salida, y **ajustes
autorizados** — la pieza de la que dependerán Compras, Ventas, Almacén y
Rutas.

**Dentro de alcance:** catálogo de productos y sus catálogos de apoyo
(unidades de medida, familias, categorías), costo de catálogo con vigencia,
lista de precios de proveedor, precios de referencia, existencias, apartados
(reservas), kardex, conteos físicos completos (congelamiento, asignación,
captura con vista ciega, conciliación, exactitud, firmas, acta versionada),
discrepancias, ajustes autorizados, hallazgos, redefinición de unidad de
medida, y las funciones de KPI (exactitud, alerta de stock, consistencia).

**Fuera de alcance de esta entrega:** lotes/series/caducidad, costeo
PEPS/UEPS, catálogo genérico de conversión entre unidades, "bolsa de
ahorro" como KPI (sin respaldo documental), listas de precio de venta
reales (RTB-VEN-01), órdenes de compra/entradas de mercancía (RTB-COM-01),
ETL de la carga histórica de Notion, captura móvil offline,
notificaciones automáticas, semilla de catálogos (la base queda vacía por
decisión del dueño del proyecto). Detalle completo en
`contexto/AUDITORIA_RTB-INV-01.md` §Fuera de alcance.

## 2. Modelo de datos

Implementado en `db/migrations/009_inventario_catalogo.sql` (catálogo),
`010_inventario_costos.sql` (costos), `011_inventario_kardex.sql`
(existencias/apartados/kardex), `012_inventario_conteos.sql` (conteos),
`013_inventario_discrepancias_ajustes.sql` (discrepancias/ajustes/
hallazgos/redefinición de unidad) y `014_inventario_kpis.sql` (funciones de
lectura). Ese es el DDL autoritativo; lo que sigue es un resumen.

### 2.1 Tablas núcleo

| Tabla | Qué es | Notas clave |
|---|---|---|
| `unidades_medida` | Catálogo de unidades con precisión decimal | Sustituye al `CHECK` cerrado del paquete — causa #1 de pérdida medida, ver §5 |
| `producto_familias` | Agrupación gobernante de la unidad de medida | `RTB-<clave>-000001` es el prefijo del folio de producto |
| `producto_categorias` | Taxonomía comercial | Tabla, no enum — cambia sin `ALTER TYPE` |
| `productos` | Catálogo maestro | `codigo_interno` (único sólo si `estado='activo'`) y `sku` (número de parte del fabricante, **no** único) son identificadores independientes |
| `proveedor_productos` | Lista de precios de compra por proveedor | Cierra el pendiente declarado en `AUDITORIA_RTB-ENT-01.md` |
| `producto_costos` | Costo de catálogo, con vigencia | Cargable retroactivamente, con motivo obligatorio |
| `producto_precios_referencia` | "Costo Refacción"/"Costo Ariba"/mostrador/lista general | Vocabulario de Notion sin semántica de negocio, ver §5 |
| `inventario_existencias` | Agregado por producto+ubicación | `cantidad_teorica`/`cantidad_fisica`/`cantidad_apartada` son tres conceptos independientes; sólo el trigger del kardex y la aplicación de un conteo escriben aquí |
| `inventario_apartados` | Reservas (compromisos abiertos) | No mueve stock; sobre-reservar no se bloquea, queda visible en `cantidad_disponible` |
| `inventario_movimientos` | Kardex append-only | Sin `GRANT UPDATE`/`DELETE` para nadie, ni `service_role`, ver §6 |
| `inventario_conteos` | Sesión de conteo físico | Máquina de estados, ver §7 |
| `inventario_conteo_asignaciones` | Quién cuenta qué | Respalda la RLS de captura |
| `inventario_congelamientos` | Bloqueo de kardex durante el conteo | Real, no una convención de UI |
| `inventario_conteo_detalles` | Línea de conteo | Vista ciega real por privilegio de columna, ver §7 |
| `inventario_conteo_versiones` | Acta versionada | "Versión · Corte · Qué corrigió" |
| `inventario_conteo_firmas` | Firmas de cierre | Exige `supervisor` + `gerente_operaciones` |
| `inventario_discrepancias` | Registro de discrepancias | Causa/banda/salida, Paso 0 · Reubicación, ver §8 |
| `inventario_ajustes` | Ajuste autorizado (CIE-AJU-01) | Nadie autoriza su propia solicitud, ver §8 |
| `inventario_ajuste_lineas` | Líneas de un ajuste | Genera el movimiento de kardex al aplicar |
| `inventario_hallazgos` | Diferencias sin causa identificada | Sobrevive al cierre del conteo que lo originó |
| `producto_unidad_redefiniciones` | Única vía para cambiar la unidad de un producto | Ver §5 |

### 2.2 Estado de un producto

```
borrador → activo → descontinuado
                  → fusionado (absorbido por otro producto)
         → requiere_depuracion
```

`requiere_depuracion` recibe la realidad sucia del catálogo (códigos
truncados, duplicados) sin mentir con un `activo boolean` — mismo criterio
de "una sola fuente de estado" que ya rige `entidades.estado`.

## 3. Matriz de permisos

Espejo exacto de las políticas RLS — vive también en
`app/lib/inventario/permisos.ts` (constante `MATRIZ`); la barrera real es
siempre Postgres.

| Recurso | Select | Insert | Update |
|---|---|---|---|
| Catálogos (unidad/familia/categoría) | 8 roles | `super_admin`/`direccion`/`compras`/`almacen` | igual |
| Productos | 8 roles | `super_admin`/`direccion`/`compras`/`almacen` | igual (libre); `stock_minimo`/`stock_maximo`/`es_estrategico` sólo por API |
| Proveedor↔producto | `super_admin`/`direccion`/`compras`/`finanzas` (**no** `almacen`) | `super_admin`/`direccion`/`compras` | igual |
| Costo de catálogo | 8 roles | `super_admin`/`direccion`/`compras`/`finanzas` | — (sin `UPDATE`; una corrección es una fila nueva) |
| Existencias | 8 roles | — | — (sólo el trigger del kardex / aplicación de un conteo) |
| Apartados | 8 roles | `super_admin`/`direccion`/`ventas`/`almacen` | igual |
| Kardex | 8 roles | `super_admin`/`direccion`/`almacen`/`compras`/`logistica` | — (append-only) |
| Conteos | 8 roles | `super_admin`/`direccion`/`almacen` | igual |
| Línea de conteo | 8 roles (columnas restringidas, ver §7) | — (sólo al congelar) | `super_admin`/`direccion` siempre; `almacen` sólo en su asignación activa |
| Discrepancias/hallazgos | 8 roles | `super_admin`/`direccion`/`almacen`/`compras` | igual |
| Ajustes | solicitante + `super_admin`/`direccion`/`almacen`/`compras` | igual (nace en `borrador`) | sólo el solicitante, sólo en `borrador` |
| Redefinición de unidad | 8 roles | `super_admin`/`direccion`/`compras`/`almacen` | sólo el solicitante, sólo en `pendiente_autorizacion` |

Un usuario con `is_active=false` no ve nada de esto, con sesión viva o sin
ella — mismo mecanismo de `current_user_role()` que ya usa RTB-ENT-01.

## 4. Cambios controlados

| Cambio | Vía | Quién resuelve |
|---|---|---|
| Autorizar/rechazar un ajuste | `POST /api/inventario/ajustes/[id]/resolver` | `super_admin`/`direccion`, nunca el propio solicitante (`aju_no_autoaprobacion_chk`) |
| Aplicar un ajuste autorizado | `POST /api/inventario/ajustes/[id]/aplicar` | `super_admin`/`direccion` — genera el/los movimientos de kardex |
| Autorizar/rechazar una redefinición de unidad | `POST /api/redefiniciones-unidad/[id]/resolver` | `super_admin`/`direccion`, nunca el propio solicitante |
| Aplicar una redefinición autorizada | `POST /api/redefiniciones-unidad/[id]/aplicar` | Requiere reconteo si `requiere_reconteo=true` |
| Fusionar un producto duplicado | `POST /api/productos/[id]/fusionar` | `super_admin`/`direccion` |

## 5. Unidad de medida y el factor de conversión

Causa **medida** de la mayor pérdida de inventario de RTB: 14 de 27 folios
de no conformidad del corte de julio, −2,811 piezas, −$37,919.77, por
"familia con unidad de medida mal definida: salidas de kit descargadas
contra un registro llevado por pieza".

- `productos.unidad_medida_id` (unidad base) + `contenido_por_unidad` +
  `unidad_contenido_id` (unidad del contenido, p.ej. 12 `PZ` por `KIT`).
- El operador **captura en la unidad que tiene en la mano**; el trigger del
  kardex resuelve el factor contra el producto y lo **congela por
  movimiento** (`inventario_movimientos.factor_conversion`,
  `unidad_captura_id`, `unidad_base_id`). Si la unidad capturada no es ni
  la base ni la de contenido, el movimiento se **rechaza** en vez de asumir
  factor 1.
- La unidad de medida de un producto **sólo cambia vía
  `producto_unidad_redefiniciones` autorizada** — `productos_guard_unidad()`
  rechaza cualquier `UPDATE` directo de `unidad_medida_id`/
  `contenido_por_unidad`, incluso con `service_role`.
- `unidades_medida.decimales` no es cosmético: valida en el propio trigger
  que la cantidad capturada respete la precisión de la unidad
  (`round(cantidad, decimales) = cantidad`).

## 6. Kardex e inventario

- **Teórica** = acumulador documental (suma del kardex). **Física** =
  medición del último conteo validado (`NULL` = nunca contada, distinto de
  cero). **Apartada** = compromisos abiertos, tercer concepto independiente.
  `físico − teórico` es una señal de error de conciliación, no una
  proyección — vocabulario corregido respecto al paquete original.
- 16 tipos de movimiento (8 entrada + 8 salida) cubren compra, cross-dock,
  recolección, devolución de cliente, sobrante de ruta, transferencia,
  conteo, ajuste, venta, devolución a proveedor, consumo interno y merma.
- **Cross-dock y transferencia son dos filas** con el mismo `operacion_id`;
  un *constraint trigger* diferido exige que las dos existan al hacer
  `COMMIT` — una sola pierna hace fallar la transacción completa.
- **Saldo negativo bloqueado** por trigger (no `CHECK`), con una escotilla
  `permite_negativo` auditada que está **fuera del `GRANT INSERT`** de
  `authenticated` — sólo la API con `service_role` la usa, para carga
  inicial o ajuste autorizado.
- **Append-only real:** sin `GRANT UPDATE`/`DELETE` de ninguna columna, y
  además un trigger que rechaza `UPDATE`/`DELETE` incluso para
  `service_role`. Una corrección es siempre un movimiento nuevo.
- **Congelamiento real:** durante un conteo, el kardex del alcance
  congelado rechaza cualquier movimiento que no sea la propia
  reconciliación de ese conteo.

## 7. Conteos físicos

Mapea directo las 7 limitaciones reales declaradas en el Acta de Conteo
Físico CIE-CON-01:

| Limitación real | Solución |
|---|---|
| Un `0` físico no distingue "contado" de "no visitado" | `estado_conteo` por línea, `CHECK` que ata estado ↔ nulidad de `cantidad_fisica` |
| 73.9 % del catálogo sin ubicación | `ubicacion_id` nulable en existencias, con índice parcial; `productos.requiere_ubicacion` |
| Existencia sin costo unitario | `costo_unitario_snapshot` + `costo_origen` congelados al corte |
| Sin registro de cuarentena | `inventario_congelamientos`, real (bloquea movimientos) |
| No se registra quién contó qué ubicación | `inventario_conteo_asignaciones` |
| Faltante vs. material solicitado y no recibido | `solicitud_compra_folio` + `cantidad_en_transito` por línea |
| Exactitud ficticia (100 % contando lo no visitado como exacto) | `inventario_exactitud()` reporta cobertura como una cuarta base, separada de registro/pieza/valor |

**Vista ciega real** (Acta §II: *"la vista no muestra cantidad teórica ni
diferencia"*): `GRANT SELECT` de `inventario_conteo_detalles` **omite**
`cantidad_teorica`/`diferencia`/`valor_diferencia`/`costo_unitario_snapshot`
— es un privilegio de columna de Postgres, no una regla de pantalla. La
única puerta al teórico es `conteo_conciliacion()`, que devuelve cero filas
si el conteo sigue `en_captura` con `vista_ciega=true` y no eres
`super_admin`/`direccion`.

**Máquina de estados:**
```
planificado → congelado → en_captura → en_conciliacion → cerrado → aplicado
     ↓             ↓            ↓              ↓
  cancelado    cancelado    cancelado      cancelado
```
Cerrar exige firma de `supervisor` **y** de `gerente_operaciones`
(`inventario_conteos_before_update()`); ninguna otra combinación pasa.
`aplicar` copia `cantidad_fisica` a `inventario_existencias` — **nunca**
ajusta el teórico (eso pasa por un ajuste autorizado aparte, ver §8).

## 8. Discrepancias y ajustes autorizados

Regla dura del Registro de Discrepancias real (CIE-DIS-01), convertida en
`CHECK` de Postgres, no en validación de API: *"una diferencia sin causa
identificada no se ajusta: se declara como hallazgo."* Sólo las salidas
`hal` (hallazgo) y `men` (diferencia menor) pueden ir sin `causa_presunta` +
`banda`.

- **Taxonomía de salida** (vocabulario real): `ubi` (corrección de
  ubicación), `cap` (corrección de captura), `aju` (ajuste autorizado con
  soporte), `aju_sin_soporte` ("AJU s/s"), `justificado` (material en
  tránsito), `hal` (hallazgo abierto), `men` (diferencia menor).
- **Paso 0 · Reubicación:** una pieza mal ubicada genera dos discrepancias
  (un faltante y un sobrante); `discrepancia_par_id` + un trigger de
  validación exigen que la pareja sea el mismo producto con signo opuesto.
- **Ajuste autorizado (CIE-AJU-01), de primera clase:** `borrador →
  pendiente_autorizacion → autorizado → aplicado` (o `rechazado`/
  `cancelado`). `aju_no_autoaprobacion_chk` hace **estructuralmente
  imposible** que `autorizador_id = solicitante_id` — ni la API con
  `service_role` puede saltárselo. Un movimiento de kardex de corrección
  (`entrada_ajuste`/`salida_ajuste`/`entrada_conteo`/`salida_conteo`) sólo
  es posible con un ajuste en `autorizado`/`aplicado`.
- **Hallazgo sobrevive al conteo:** no se cancela al cerrar el acta — es lo
  que impide que "el problema desaparezca de la vista".

## 9. API

Mismo patrón que RTB-ENT-01: `requireApiRole([...])` → validación zod →
lógica de negocio → `{ error: string }` en español o el recurso directo.

```
GET/POST     /api/catalogos/[tipo]                 tipo ∈ unidades-medida|familias|categorias
PATCH        /api/catalogos/[tipo]/[id]
GET/POST     /api/productos
GET/PATCH    /api/productos/[id]
POST         /api/productos/[id]/fusionar
POST         /api/productos/[id]/redefinir-unidad
GET/POST     /api/productos/[id]/costos
GET/POST     /api/proveedor-productos
PATCH        /api/proveedor-productos/[id]
GET/POST     /api/precios-referencia
PATCH        /api/precios-referencia/[id]
GET/POST     /api/redefiniciones-unidad
POST         /api/redefiniciones-unidad/[id]/resolver
POST         /api/redefiniciones-unidad/[id]/aplicar
GET          /api/inventario/existencias
GET/POST     /api/inventario/movimientos            POST acepta 1 fila o un par [entrada,salida]
GET/POST     /api/inventario/apartados
POST         /api/inventario/apartados/[id]/liberar
GET          /api/inventario/alertas
GET/POST     /api/inventario/conteos
GET/PATCH    /api/inventario/conteos/[id]
POST         /api/inventario/conteos/[id]/congelar
POST         /api/inventario/conteos/[id]/estado
POST         /api/inventario/conteos/[id]/aplicar
POST/PATCH   /api/inventario/conteos/[id]/asignaciones
GET/POST     /api/inventario/conteos/[id]/congelamientos
POST         /api/inventario/conteos/[id]/congelamientos/[cid]/liberar
GET          /api/inventario/conteos/[id]/detalles
PATCH        /api/inventario/conteos/[id]/detalles/[did]
PATCH        /api/inventario/conteos/[id]/detalles/[did]/recontar
GET          /api/inventario/conteos/[id]/conciliacion
GET          /api/inventario/conteos/[id]/exactitud
POST         /api/inventario/conteos/[id]/firmas
POST         /api/inventario/conteos/[id]/versiones
GET/POST     /api/inventario/discrepancias
POST         /api/inventario/discrepancias/[id]/resolver
GET/POST     /api/inventario/hallazgos
PATCH        /api/inventario/hallazgos/[id]
POST         /api/inventario/hallazgos/[id]/cerrar
GET/POST     /api/inventario/ajustes
GET/PATCH    /api/inventario/ajustes/[id]
POST         /api/inventario/ajustes/[id]/lineas
POST         /api/inventario/ajustes/[id]/enviar
POST         /api/inventario/ajustes/[id]/resolver
POST         /api/inventario/ajustes/[id]/aplicar
GET          /api/inventario/consistencia            sólo super_admin/direccion
```

## 10. UI

| Ruta | Contenido |
|---|---|
| `/dashboard/productos` | KPIs (total, activos, requieren depuración, sin ubicación, sin costo), búsqueda/filtros, tabla paginada |
| `/dashboard/productos/nuevo` | Alta: identidad, unidad de medida (con aviso de causa #1), ubicación |
| `/dashboard/productos/[id]` | Detalle con tabs General · Existencias · Kardex · Costos |
| `/dashboard/productos/[id]/redefinir-unidad` | Solicitud de redefinición de unidad de medida |
| `/dashboard/inventario` | Existencias con filtros reales (sin ubicación, sin costo, teórico negativo, nunca contada) |
| `/dashboard/inventario/conteos` | Lista de conteos con exactitud |
| `/dashboard/inventario/conteos/nuevo` | Planificación: tipo, alcance, responsable/supervisor |
| `/dashboard/inventario/conteos/[id]` | Detalle: acciones de máquina de estados, conciliación, exactitud, asignaciones, firmas, acta versionada |
| `/dashboard/inventario/conteos/[id]/captura` | **Vista ciega real** — sin cantidad teórica ni diferencia |
| `/dashboard/inventario/discrepancias` | Registro con modal de investigación (causa/banda/salida) |
| `/dashboard/inventario/ajustes` | Bandeja de ajustes |
| `/dashboard/inventario/ajustes/nuevo` | Alta de ajuste (borrador) |
| `/dashboard/inventario/ajustes/[id]` | Detalle: líneas, soporte, enviar, autorizar/rechazar, aplicar |

Todas las entradas de navegación viven en la nueva sección "Inventario" de
`app/lib/rbac/config.ts`, más "Productos" añadido a "Datos maestros".

## 11. Reglas de negocio (vigentes)

1. `codigo_interno` es único sólo entre productos `activo`; `sku` no es
   único (hay pares reales del catálogo que lo comparten).
2. La unidad de medida y el factor de conversión de un producto sólo
   cambian vía redefinición autorizada, nunca por `UPDATE` directo.
3. Un movimiento de kardex es inmutable desde que se crea: una corrección
   siempre es un movimiento nuevo, nunca una edición.
4. Cross-dock y transferencia son dos movimientos, nunca uno solo.
5. Un ajuste que corrige el teórico exige autorización de un tercero —
   estructuralmente, no por disciplina.
6. Una diferencia sin causa identificada no se ajusta: se declara hallazgo.
7. El congelamiento de un conteo bloquea de verdad el kardex del alcance
   congelado, no sólo la UI.
8. Un conteo no se cierra sin firma de supervisor y de gerente de
   operaciones.
9. No hay borrado físico operativo: ninguna tabla de este submódulo tiene
   `GRANT DELETE` para `authenticated`.
10. Moneda por defecto `MXN`.

## 12. Referencias

- `contexto/AUDITORIA_RTB-INV-01.md` — cada defecto encontrado y cómo se
  corrigió, incluidos dos hallazgos de la propia implementación (no del
  paquete original).
- `db/migrations/009_inventario_catalogo.sql` … `014_inventario_kpis.sql`
  — DDL autoritativo.
- `app/lib/inventario/` — permisos, validaciones, configuración y esquemas
  compartidos entre API y UI.
- Fuentes normativas reales citadas por el Acta y el Registro de
  Discrepancias (`RTB-CIE-01`, `CIE-AJU-01`) que **no existen** en
  `contexto/` — implementadas tal como las citan los documentos que sí
  existen; si aparecen después con contenido distinto, mandan ellos.
