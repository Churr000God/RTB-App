
# Módulo de Ventas — Refacciones Tomás Badillo

**Refacciones Tomás Badillo, S.A. de C.V. · Documentación de procesos operativos**
Folio RTB-PRO-VEN-01 · Versión 1.0 · Julio 2026 · Azcapotzalco, CDMX

Detalle operativo del módulo Comercial / Ventas. Complementa y desglosa el proceso ① del mapa general (`RTB-PRO-01`). Para el panorama de punta a punta consultar el mapa; este documento es la referencia de trabajo del área.

---

## I. Propósito y alcance

El módulo de Ventas cubre **desde el primer contacto del cliente hasta que el pedido queda validado en Facturación y la NR (si la hay) queda saldada**. Incluye:

- El flujo de venta: prospección, cotización, asesoría técnica y aprobación.
- El subproceso de **seguimiento de Notas de Remisión (NR)**: registrar, dar seguimiento y cerrar cada NR hasta que tenga PO, sea facturada y cobrada.

**Fuera del alcance de este módulo:** la preparación física del pedido (Almacén), la programación de rutas (Logística), la emisión de la factura (Facturación) y el reloj de cobranza (Cobranza). Estos módulos tienen su propio proceso; Ventas es el punto de entrada y el handoff hacia ellos.

---

## II. Flujo de venta detallado

### Paso 1 — Contacto por portal autorizado

El cliente inicia la solicitud a través de uno de los **canales autorizados**:

| Canal | Notas |
| --- | --- |
| **Ariba** (u otro portal del cliente) | Portal corporativo; suele generar PO directamente |
| **Correo electrónico** | Canal formal; dejar evidencia por escrito |
| **WhatsApp** | Canal ágil; trasladar los acuerdos a correo o sistema |
| **Teléfono** | Registrar el pedido en el sistema inmediatamente |

> El vendedor **acusa recibo** en el mismo canal y registra la solicitud en el sistema.

---

### Paso 2 — Verificación de existencias

El vendedor consulta el sistema (Supabase/Notion):

- ¿El producto existe en el catálogo?
- ¿Hay stock disponible?

**Bifurcación:**

| Situación | Acción |
| --- | --- |
| Existe y hay stock | Continúa directo a la cotización (Paso 4) |
| No existe o sin stock | Entra **Compras-ligero** (Paso 3) |

---

### Paso 3 — Compras-ligero (consulta, no compra)

Cuando el producto no está en catálogo o no hay existencias, Ventas solicita apoyo a **Compras** para obtener:

- Disponibilidad y tiempo de entrega del proveedor.
- Costo de la pieza (para armar el precio al cliente).

> **Regla:** Compras-ligero **solo consulta**. No genera una orden de compra ni mueve dinero. Si el pedido se confirma y hay faltante, quien compra es **Compras-abasto** (proceso independiente, disparado por Almacén).

Compras regresa la información al vendedor → continúa en Paso 4.

---

### Paso 4 — Cotización con asesoría técnica

El vendedor arma la propuesta al cliente con:

- **Precio** (con margen correspondiente a la política comercial).
- **Tiempo de entrega** (stock en almacén o tiempo de conseguir la pieza).
- **Asesoría técnica embebida:** el vendedor resuelve dudas técnicas del producto (aplicación, compatibilidad, alternativas). La asesoría técnica no es un paso separado, es parte de la propuesta.

La cotización se envía por el canal por el que entró el cliente o el que el cliente prefiera.

---

### Paso 5 — Aprobación del cliente y apertura del pedido

El cliente responde. Si no aprueba, el ciclo cierra o se negocia. Si aprueba, se abre la segunda bifurcación:

#### Vía A — Aprobación con Nota de Remisión (NR)

El cliente aprueba pero aún no tiene PO. Se emite la **Nota de Remisión** y:

1. **Ventas registra la NR en el tablero de seguimiento** (ver Sección III).
2. El pedido pasa a **Almacén** para iniciar la preparación.
3. Ventas **vigila la NR** y persigue la PO con el cliente hasta que llegue.
4. Al recibir la PO: Ventas la **vincula a la(s) NR cubierta(s)** y **dispara el handoff a Facturación**.

> Varias NR de un mismo cliente pueden consolidarse en una sola PO. El tablero lleva el vínculo N-NR → 1-PO.

#### Vía B — Aprobación con PO directa

El cliente aprueba y emite la PO simultáneamente:

1. El pedido pasa a **Almacén** para preparar.
2. La PO pasa a **Facturación** para preparar la factura en paralelo.
3. No se genera NR; no aplica el subproceso de seguimiento.

---

### Paso 6 — Handoff de salida de Ventas

Una vez que Ventas tiene la PO (sea de vía A o B):

- El pedido ya está o está siendo preparado en Almacén.
- Facturación tiene la PO y prepara la factura.
- Ventas **actualiza el estado en el tablero** y cierra su parte de la operación.

A partir de aquí el flujo sigue en **Almacén → Logística → Facturación y Cobranza** (módulos ②③④).

---

## III. Subproceso — Seguimiento de Notas de Remisión (NR)

### ¿Por qué existe este subproceso?

El reloj de cobranza de 90 días **solo arranca cuando existe la PO**. Entre "NR emitida" y "PO recibida" puede pasar tiempo indefinido; sin un registro activo, esa NR queda fuera del radar de cobranza, representando dinero entregado sin seguimiento. Este subproceso cierra ese hueco.

**Principio:** ninguna NR puede quedar sin registro ni sin dueño. El tablero es **informativo** (no bloquea ni frena la operación), pero garantiza visibilidad total desde la NR hasta el cobro.

---

### Ciclo de vida de una NR — 6 estados

```
Abierta → En preparación → Entregada/sin PO → PO vinculada → Facturada → Pagada/cerrada
```

| # | Estado | Descripción | Área responsable de la transición |
| --- | --- | --- | --- |
| 1 | **Abierta** | NR emitida y registrada. Sin PO. | Ventas (al emitir la NR) |
| 2 | **En preparación** | Almacén trabajando el pedido. | Ventas / Almacén (al confirmar inicio de preparación) |
| 3 | **Entregada / sin PO** | Material despachado, PO pendiente. Estado de máxima vigilancia: hay valor entregado sin facturar. | Ventas (al confirmar entrega) |
| 4 | **PO vinculada** | PO recibida. Ventas la enlaza a la(s) NR correspondientes y dispara handoff a Facturación. | Ventas (al recibir la PO) |
| 5 | **Facturada** | CFDI emitido por Facturación. El reloj de cobranza de 90 días arranca desde aquí. | Facturación (al emitir el CFDI) |
| 6 | **Pagada / cerrada** | NR cobrada. Sale del tablero de abiertas. | Cobranza (al registrar el pago) |

> Las NR en estado **3 (Entregada / sin PO)** son el foco principal del seguimiento de Ventas: implican material ya despachado sin factura. El vendedor persigue activamente la PO con el cliente hasta que avance a estado 4.

---

### Campos del tablero de seguimiento

| Campo | Tipo | Notas |
| --- | --- | --- |
| **Folio NR** | Texto | Identificador único de la NR |
| **Fecha de emisión** | Fecha | Automática al registrar |
| **Vendedor** | Persona | Quién lleva la cuenta |
| **Cliente** | Texto / relación | Nombre y empresa del cliente |
| **Portal de origen** | Selección | Ariba · Correo · WhatsApp · Teléfono |
| **Piezas / descripción** | Texto | Resumen de lo cotizado |
| **Valor estimado** | Número | Para dimensionar el riesgo de cada NR abierta |
| **Estado** | Selección | Los 6 estados del ciclo de vida |
| **Antigüedad (días)** | Calculado | Días desde la emisión hasta hoy. **Informativo** — no genera alerta automática ni candado. |
| **PO vinculada** | Texto / relación | Número de PO al arribar; puede vincular varias NR |
| **Nota de último contacto** | Texto | Resumen del último seguimiento con el cliente por la PO |

**Sistema:** Notion / Supabase, gestionado por TI. La antigüedad y las vistas de "NR abiertas" son automatizadas.

---

### Responsabilidades RACI simplificado

| Actividad | Ventas | TI / Sistema | Facturación | Cobranza | Dirección |
| --- | --- | --- | --- | --- | --- |
| Registrar NR al emitirse | **R** | A | I | I | — |
| Mantener el estado actualizado | **R** | A | I | I | — |
| Perseguir la PO con el cliente | **R** | — | I | — | — |
| Sostener y automatizar el tablero | I | **R** | — | — | — |
| Leer el tablero para saber qué facturar | I | — | **R** | I | — |
| Leer el tablero para seguimiento de cobro | I | — | I | **R** | — |
| Revisar NR antiguas / cuentas de alto valor | I | — | I | I | **R** |

> **R** = Responsable · **A** = Aprobador/soporte técnico · **I** = Informado/consumidor. Sin candado ni acción dura por antigüedad: el campo de días es informativo; si Dirección lo decide, puede revisar las NR de alto valor pero no es un proceso automático.

---

### Handoff NR → Facturación (estado 3 → 4 → 5)

Cuando llega la PO:

1. **Ventas** localiza la(s) NR que cubre esa PO en el tablero.
2. **Ventas** registra el número de PO en el campo "PO vinculada" y cambia el estado a **4 — PO vinculada**.
3. **Ventas** notifica a **Facturación** (por el canal establecido) con el número de PO y las NR vinculadas.
4. **Facturación** verifica los datos (PO, pedido, datos fiscales del cliente) y emite el **CFDI**.
5. **Facturación** (o el sistema) actualiza el estado a **5 — Facturada**.
6. Arranca el **reloj de cobranza de 90 días** (proceso ④ del mapa general).
7. Al cobrar, **Cobranza** cierra la NR en estado **6 — Pagada / cerrada**.

---

## IV. Roles del módulo

### Puestos que operan este módulo

*(Ver catálogo completo en `RTB-ORG-01_Organigrama_V2.0.md`)*

| Puesto | Rol en este módulo | Estado |
| --- | --- | --- |
| **Gerente Comercial** | Define política comercial, supervisa el módulo, interviene en cuentas clave y en negociaciones por NR vencidas | Actual |
| **Vendedor y Asesor Comercial** | Ejecuta el flujo completo: contacto, cotización, asesoría, apertura de NR, seguimiento de la NR y handoff a Facturación | Actual |
| **Coordinador de Ventas** | Cuando exista: coordina vendedores, supervisa el tablero de NR abiertas, alerta sobre las de mayor antigüedad | Previsto |
| **Auxiliar de Ventas** | Cuando exista: apoya el registro, actualización de estados y seguimiento documental en el tablero | Previsto |

**TI/Sistema:** mantiene el tablero, las automatizaciones de antigüedad y las vistas; no es operador del proceso comercial.

---

## V. Reglas del módulo

1. **La asesoría técnica va embebida en la venta.** El vendedor no transfiere la consulta técnica a otro departamento: la resuelve él o con apoyo de Compras-ligero.
2. **Toda NR se registra al emitirse.** No existe NR "de palabra"; si se emitió, está en el tablero.
3. **Ventas es dueño de la NR hasta que llega la PO.** A partir de ahí Facturación toma la delantera; Ventas solo mantiene el estado en el tablero.
4. **El tablero es informativo, no un candado.** La antigüedad de la NR en días no bloquea la operación ni escala automáticamente; es visibilidad para tomar decisiones.
5. **N NR → 1 PO.** Varias NR de un mismo cliente pueden cubrirse con una sola PO. Ventas las vincula correctamente antes de notificar a Facturación.
6. **Sin PO no hay factura.** La NR autoriza la preparación y la entrega, pero Facturación no emite CFDI sin PO —salvo indicación especial expresa del cliente documentada.
7. **Canales autorizados, evidencia siempre.** Cualquier acuerdo por teléfono o WhatsApp se traslada a correo o sistema antes de cerrar el paso.

---

## VI. Conexión con otros módulos

| Módulo | Punto de conexión |
| --- | --- |
| **Compras-ligero** | Ventas solicita consulta cuando no hay stock o el producto no está en catálogo (Paso 3). Compras devuelve info; no compra. |
| **② Almacén / Preparación** | Ventas dispara la preparación al aprobar el cliente (con NR o PO). Almacén inicia sin esperar la PO si hay NR. |
| **④ Facturación** | Ventas dispara el handoff al vincular la PO. Facturación preparaba la factura en paralelo; al recibir el handoff, valida y emite. |
| **④ Cobranza** | Consumidor del tablero de NR para saber qué está facturado y en qué estado de cobro. El congelamiento de cuenta a 90 días revierte a Ventas como aviso (no es acción de Ventas). |
| **Dirección** | Cuentas clave y decisor económico del cliente son responsabilidad de Dirección; Ventas las alimenta con información del tablero cuando corresponde. |

---

*Módulo de Ventas · Refacciones Tomás Badillo, S.A. de C.V. · Folio RTB-PRO-VEN-01 · V1.0 · Julio 2026 · Azcapotzalco, CDMX*
