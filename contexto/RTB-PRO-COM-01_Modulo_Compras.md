
# Módulo de Compras y Abastecimiento — Refacciones Tomás Badillo

**Refacciones Tomás Badillo, S.A. de C.V. · Documentación de procesos operativos**
Folio RTB-PRO-COM-01 · Versión 1.0 · Julio 2026 · Azcapotzalco, CDMX

Detalle operativo del módulo Compras-abasto. Complementa y desglosa el proceso "Compras-abasto" del mapa general (`RTB-PRO-01`). Este documento es la referencia de trabajo del Responsable de Compras y Abastecimiento y del equipo de Operaciones.

> **Nota de alcance:** este módulo documenta **Compras-abasto** — la compra real. El subproceso de *Compras-ligero* (solo consulta de precio y tiempo para cotizar, sin comprar) vive dentro del módulo de Ventas (`RTB-PRO-VEN-01`). Son procesos distintos y no deben confundirse.

---

## I. Propósito y alcance

El módulo de Compras-abasto cubre **desde que se detecta una necesidad de material (por alerta de inventario o faltante de pedido) hasta que el producto entra físicamente al almacén y se actualiza el inventario**. Incluye:

- La detección de la necesidad (dos disparadores).
- La gestión de solicitudes de material y pedidos a proveedores.
- El control administrativo y fiscal de la compra (facturas).
- La recepción física y la actualización del inventario.
- La ruta del material al destino: cross-dock (surtido directo) o a stock.

**Fuera del alcance:** la consulta de precio para cotizar (Compras-ligero, en módulo ① Ventas), el pago al proveedor (Finanzas / cierre de mes en módulo ④) y la preparación del pedido del cliente (Almacén / `RTB-PRO-ALM-01`).

---

## II. Dos disparadores

Este módulo recibe trabajo de **dos fuentes**:

| Disparador | Origen | Tipo de urgencia |
| --- | --- | --- |
| **A · Reabasto programado** | Sistema detecta stock por debajo del mínimo en **Gestión de Inventario** | Normal — se planifica con tiempo |
| **B · Faltante de pedido** | Almacén detecta que una pieza no está al preparar un pedido de cliente | Urgente — el pedido del cliente está en espera |

Ambos disparadores convergen en el mismo flujo de compra (Paso 3 en adelante), pero el faltante de pedido tiene prioridad de atención sobre el reabasto programado.

---

## III. Sistema de abastecimiento — 5 bases Notion

El sistema de Compras-abasto opera sobre **cinco bases interconectadas** en Notion. Cada una tiene una función específica en el ciclo:

```
Gestión de Inventario
    ↓  (detecta necesidad)
Solicitudes de Material
    ↓  (agrupa por proveedor)
Solicitudes a Proveedores
    ↓  (formaliza la compra)
FACTURAS COMPRAS
    ↓  (controla recepción física)
Entradas de Mercancía
    ↓  (actualiza stock)
Gestión de Inventario  ←── (ciclo cerrado)
```

### Base 1 — Gestión de Inventario

El **centro del sistema**. Cada registro representa un producto controlado. Calcula:

| Campo | Descripción |
| --- | --- |
| **Cantidad Real en Inventario** | Entradas reales − Salidas reales ± Ajustes |
| **Cantidad Teórica en Inventario** | Entradas teóricas − Salidas teóricas |
| **Diferencia de Stock** | Real vs. teórico — detecta errores o movimientos no conciliados |
| **Stock Mínimo** | Umbral definido por producto; es el punto de reorden |
| **Alerta de Stock** | 🟢 OK / 🔴 Bajo mínimo / ⚪ Sin definir |
| **Bloqueo de Compra** | Activo si el producto tiene stock real > 0 y lleva más de 180 días sin movimiento |
| **Acción Sugerida** | Reabastecer / Bloquear compra / Depurar / Liquidar / Revisar / Mantener |

**Lógica de alerta:**
- Sin Stock Mínimo definido → ⚪ Sin definir (no genera solicitud)
- Stock Teórico < Stock Mínimo → 🔴 Bajo mínimo
- Stock Mínimo = 0 y Stock Teórico negativo → 🔴 Bajo mínimo

**Regla del Bloqueo de Compra:** un producto bajo mínimo no siempre se compra. Si lleva más de 180 días sin movimiento y aún tiene stock real > 0, el sistema lo bloquea — evita comprar producto dormido. Para comprarlo de todas formas, se requiere una **excepción documentada**.

**Excepciones válidas al bloqueo:**
- Pedido de cliente confirmado
- Cliente estratégico
- Refacción crítica / sin sustituto
- Obra o proyecto especial
- Reposición obligatoria (seguridad, garantía)

---

### Base 2 — Solicitudes de Material

Convierte la alerta de inventario (o el faltante de Almacén) en una **línea de compra**. Cada registro = un producto que se va a pedir.

Campos principales: producto · SKU · proveedor · costo unitario · cantidad solicitada · monto total · fecha · estado (Pendiente / Revisado / Procesado) · bloqueo activo · motivo de excepción.

**Cantidad sugerida de compra:**
```
Cantidad sugerida = Stock Mínimo − Cantidad Teórica en Inventario
```
*(Ajustar según demanda histórica, tamaño de paquete del proveedor y condición de crédito.)*

---

### Base 3 — Solicitudes a Proveedores

Agrupa varias Solicitudes de Material de un mismo proveedor en un **pedido formal**. Permite mandar una sola orden con todos los productos en lugar de pedidos individuales por pieza.

Calcula: subtotal · envío · IVA · total. Controla: PDF generado · envío por correo · confirmación del proveedor · fecha estimada de recolección · estado de recolección.

> **Selección de proveedor:** hoy se decide en el momento de crear la solicitud, sin parámetros formales. **Punto de acción pendiente:** definir criterios de selección (precio, disponibilidad, relación crediticia, tiempo de entrega).

---

### Base 4 — FACTURAS COMPRAS

El **expediente administrativo y fiscal** de la compra. No mueve el inventario directamente — controla la parte documental:

| Campo | Función |
| --- | --- |
| **Estatus de factura** | Sin Factura / Facturada / En proceso de cancelación / Cancelada |
| **Status del pedido** | Solicitada / En recolección / En Almacén / Cancelada / Devolución total o parcial |
| **Status de pago** | No Pagado / Pagado / Cancelada / Devolución en crédito |
| **TOTAL** | Subtotal + Envío + IVA − Descuentos |
| **Cantidad Faltante de Pago** | Total − Cantidad ya pagada |

Relaciona la compra con: la Solicitud a Proveedores que la generó, las Entradas de Mercancía que la cierran, y la factura fiscal del proveedor.

---

### Base 5 — Entradas de Mercancía

Registra **cada producto que llega físicamente al almacén**. Es la única base que actualiza el stock real.

| Campo | Función |
| --- | --- |
| **Cantidad solicitada** | Lo que se esperaba recibir |
| **Cantidad llegada** | Lo que realmente llegó |
| **Porcentaje de entrega** | Cantidad llegada / Cantidad solicitada |
| **Validación Física** | ¿Alguien revisó físicamente la mercancía? |
| **Validado por** | Quién hizo la validación |

Al registrar la cantidad llegada, **Gestión de Inventario** recalcula automáticamente el stock real y teórico del producto. Si el stock supera el mínimo, la alerta pasa a 🟢 OK.

---

## IV. Flujo de compra paso a paso

### Paso 1A — Disparador: reabasto programado

El sistema detecta en **Gestión de Inventario**:
- Alerta de Stock = 🔴 Bajo mínimo
- Bloqueo de Compra = Inactivo
- Acción Sugerida = Reabastecer

El Responsable de Compras revisa la vista **"Bajo mínimo comprable"** y decide qué productos entran a la siguiente ronda de compra.

---

### Paso 1B — Disparador: faltante de pedido (urgente)

Almacén detecta que una pieza no está al preparar el pedido de un cliente (`RTB-PRO-ALM-01`, Paso 2). Solicita urgente a Compras. Esta solicitud tiene **prioridad** sobre el reabasto programado y puede saltarse la vista de bajo mínimo — el pedido del cliente ya existe y espera.

---

### Paso 2 — Crear Solicitud de Material

Para cada producto a comprar:
1. Se crea un registro en **Solicitudes de Material**.
2. Se vincula al producto en **Gestión de Inventario**.
3. Se define: cantidad solicitada, proveedor, costo.
4. Si el producto tiene bloqueo de compra, se requiere **Motivo de excepción** antes de avanzar.
5. El estado pasa de **Pendiente** a **Revisado** al validarse.

---

### Paso 3 — Agrupar en Solicitud a Proveedores

Las solicitudes revisadas y aprobadas se agrupan por proveedor en **Solicitudes a Proveedores**:
1. Se crea un registro por proveedor.
2. Se relacionan todas las Solicitudes de Material correspondientes.
3. El sistema calcula subtotal, envío, IVA y total.
4. Se genera el PDF del pedido.
5. Se envía al proveedor (hoy: correo y/o WhatsApp; meta futura: portal integrado).
6. El proveedor confirma y da la **fecha estimada de entrega o recolección**.

---

### Paso 4 — Seguimiento y recolección

Con el pedido confirmado, Compras coordina la recepción:

| Vía de llegada | Quién actúa | Siguiente paso |
| --- | --- | --- |
| **Recolección por chofer RTB** | Coordinador de Logística programa la parada en la ruta | Material pasa por ③ Rutas (recolección) |
| **Envío directo del proveedor al almacén** | Compras monitorea la fecha de entrega | Material llega directamente — no pasa por ③ |

En ambos casos, al arribar el material al almacén, Almacén ejecuta la recepción física.

---

### Paso 5 — Recepción física y FACTURAS COMPRAS

Al llegar el material:
1. **Almacén** valida físicamente la mercancía: cuenta, revisa condición, compara contra la Solicitud a Proveedores.
2. Se crean los registros de **Entradas de Mercancía** (uno por producto recibido), con cantidad llegada y validación física.
3. Se crea (o actualiza) el registro en **FACTURAS COMPRAS**: se adjunta la factura del proveedor, se registra el monto y se asigna el estado de pago.

Si hay faltante parcial:
- La entrada refleja solo lo que llegó.
- El porcentaje de entrega queda < 100 %.
- Compras sigue en seguimiento con el proveedor por el resto.

---

### Paso 6 — Registro de la factura del proveedor en el sistema

Compras registra la factura del proveedor en **FACTURAS COMPRAS**:
- Se adjunta el XML + PDF de la factura.
- Se verifica que el total facturado corresponda al total del pedido.
- El estatus de factura pasa a **Facturada**.
- El pago lo ejecuta **Finanzas** (en el ciclo de salida del cierre de mes, o de forma inmediata según las condiciones del proveedor — crédito vs. pago inmediato).

---

### Paso 7 — Destino del material en almacén

El material recibido tiene dos destinos posibles:

| Destino | Condición | Acción |
| --- | --- | --- |
| **Surtido directo (cross-dock)** | La pieza estaba marcada para un pedido de cliente pendiente | Se despacha inmediatamente al pedido; no pasa la noche en stock |
| **A stock** | No hay pedido pendiente para esa pieza | Se resguarda en su ubicación; el inventario aumenta |

**Regla dura:** incluso en cross-dock, la **entrada documental siempre se registra** antes del despacho — cuadra la factura del proveedor, actualiza el kardex y garantiza trazabilidad total.

---

### Paso 8 — Actualización de Gestión de Inventario

Con las Entradas de Mercancía registradas:
- **Gestión de Inventario** recalcula automáticamente el stock real y teórico.
- Si el stock supera el mínimo → Alerta pasa a 🟢 OK.
- Si sigue bajo mínimo → puede generar una nueva solicitud en el siguiente ciclo.
- La **Diferencia de Stock** se recalcula: si hay discrepancias entre real y teórico, se marca para revisión.

---

## V. Crédito vs. pago inmediato

| Tipo de proveedor | Condición de pago | Quién ejecuta el pago |
| --- | --- | --- |
| **Proveedor con crédito abierto** | Pago a plazo (cierre de mes o fecha acordada) | Finanzas — en el ciclo de salida del cierre de mes |
| **Proveedor sin crédito / nuevo** | Pago inmediato (transferencia o efectivo) | Finanzas — en cuanto Compras confirma la orden |
| **Proveedor con anticipo requerido** | Depósito antes de surtir | Finanzas — previa autorización de Compras |

> **Punto de acción pendiente — Criterios de selección de proveedor:** hoy se elige en el momento de crear la solicitud sin parámetros formales. Se recomienda definir criterios (precio, disponibilidad, crédito, tiempo de entrega, historial de cumplimiento) para que la selección sea consistente entre distintos compradores.

---

## VI. Roles del módulo

*(Ver catálogo completo en `RTB-ORG-01_Organigrama_V2.0.md`)*

| Puesto | Rol en este módulo | Estado |
| --- | --- | --- |
| **Responsable de Compras y Abastecimiento** | Dueño del módulo. Revisa alertas, crea solicitudes, selecciona proveedores, gestiona pedidos, da seguimiento a entregas y registra facturas | Actual |
| **Encargado de Almacén** | Valida físicamente la mercancía al recibirla, registra las Entradas de Mercancía y determina el destino (stock o cross-dock) | Actual |
| **Coordinador de Logística** | Programa la recolección cuando el material viene por chofer RTB | Previsto |
| **Finanzas / Gerente Adm.** | Ejecuta el pago al proveedor según las condiciones (crédito o inmediato) | Actual |
| **Auxiliar de Compras** | Cuando exista: apoya el registro de solicitudes, seguimiento a entregas y captura documental | Previsto |

---

## VII. RACI del módulo

| Actividad | Resp. Compras | Enc. Almacén | Log./Rutas | Finanzas | Ventas/Almacén (orig.) |
| --- | --- | --- | --- | --- | --- |
| Revisar alertas de bajo mínimo | **R** | I | — | — | — |
| Recibir solicitud urgente de Almacén | **R** | A | — | — | I |
| Crear Solicitud de Material | **R** | — | — | — | — |
| Seleccionar proveedor y cantidad | **R** | — | — | — | — |
| Crear Solicitud a Proveedores y enviar | **R** | — | — | — | — |
| Confirmar fecha con proveedor | **R** | I | I | — | — |
| Coordinar recolección por chofer | I | — | **R** | — | — |
| Validar físicamente la mercancía | I | **R** | — | — | — |
| Registrar Entradas de Mercancía | **R** | A | — | — | — |
| Registrar factura en FACTURAS COMPRAS | **R** | — | — | I | — |
| Ejecutar pago al proveedor | I | — | — | **R** | — |
| Despachar cross-dock al pedido | I | **R** | — | — | I |

> **R** = Responsable · **A** = Aprobador · **C** = Consultado · **I** = Informado.

---

## VIII. Reglas del módulo

1. **Compras-abasto no cotiza para Ventas.** Solo compra. La consulta de precio para cotizar es Compras-ligero (módulo ① Ventas).
2. **Sin Stock Mínimo no hay alerta.** Si un producto no tiene Stock Mínimo definido, el sistema marca ⚪ Sin definir y no genera solicitud automática.
3. **Bloqueo de compra es real.** Un producto bajo mínimo con más de 180 días sin movimiento no se compra sin excepción documentada.
4. **Faltante urgente tiene prioridad.** Una solicitud de Almacén por faltante de pedido entra antes que cualquier reabasto programado.
5. **Selección de proveedor → punto de acción pendiente.** Hasta que existan criterios formales, el Responsable de Compras documenta la razón de la selección en la Solicitud de Material.
6. **Entrada documental siempre, incluso en cross-dock.** Primero se registra la entrada, luego se despacha. Sin excepción.
7. **La factura del proveedor entra al sistema ese mismo día.** No se acumula para el cierre; el expediente fiscal debe estar al día.
8. **Diferencia de stock = revisión obligatoria.** Si al registrar la entrada el sistema detecta diferencia entre stock real y teórico, se revisa antes de continuar.
9. **El pago lo ejecuta Finanzas, no Compras.** Compras solicita y recibe; Finanzas paga. La separación protege el control del gasto.

---

## IX. Conexión con otros módulos

| Módulo | Punto de conexión |
| --- | --- |
| **② Almacén / Preparación** | Almacén dispara el faltante urgente (disparador B). El material comprado regresa a Almacén como entrada a inventario. El cross-dock despacha directamente al pedido pendiente. |
| **③ Rutas y Envíos** | Cuando el proveedor no entrega directamente, el chofer hace la recolección dentro de la ruta programada. |
| **④ Facturación y Cobranza (Finanzas)** | Finanzas paga las facturas de proveedores — crédito en el cierre de mes, inmediato según condición. Compras no ejecuta pagos. |
| **① Ventas (Compras-ligero)** | Compras-ligero consulta precio y tiempo para que Ventas pueda cotizar. Es distinto al abasto real — no genera OC ni mueve dinero. |

---

*Módulo de Compras y Abastecimiento · Refacciones Tomás Badillo, S.A. de C.V. · Folio RTB-PRO-COM-01 · V1.0 · Julio 2026 · Azcapotzalco, CDMX*
