
# Módulo de Facturación y Cobranza — Refacciones Tomás Badillo

**Refacciones Tomás Badillo, S.A. de C.V. · Documentación de procesos operativos**
Folio RTB-PRO-FAC-01 · Versión 1.0 · Julio 2026 · Azcapotzalco, CDMX

Detalle operativo del módulo de Facturación y Cobranza. Complementa y desglosa el proceso ④ del mapa general (`RTB-PRO-01`). Para el panorama de punta a punta consultar el mapa; este documento es la referencia de trabajo del área de Administración y Finanzas.

---

## I. Propósito y alcance

El módulo de Facturación y Cobranza cubre **desde que llega la PO del cliente hasta que se registra el pago y se concilia contra el pedido**. Incluye:

- El subproceso de **Facturación**: validar la PO, emitir el CFDI y enviarlo al cliente en sincronía con la entrega.
- El subproceso de **Cobranza**: dar seguimiento al reloj de 90 días, gestionar saldos vencidos y ejecutar el aviso de congelamiento de cuenta.
- El **cierre de mes** de Finanzas: pago a proveedores y revisión de cobros a clientes.

**Fuera del alcance de este módulo:** la preparación del pedido (Almacén / `RTB-PRO-ALM-01`), la entrega física (Rutas / `RTB-PRO-RUT-01`) y el seguimiento de la NR antes de llegar la PO (Ventas / `RTB-PRO-VEN-01`). Facturación y Cobranza arrancan cuando ya existe la PO y cierran el ciclo de dinero.

---

## II. La PO como disparador financiero

**La Purchase Order (PO) es el eje de todo el dinero en RTB.** Sin PO:

- No se factura (no se emite CFDI).
- No corre el reloj de cobranza de 90 días.
- No se abona ningún pago a la cuenta del cliente.

La PO puede llegar por cualquier canal autorizado (Ariba, correo, WhatsApp, teléfono). **La forma en que llega determina qué tan rápido puede facturarse**: las PO por portal corporativo (Ariba) suelen traer todos los datos fiscales estructurados; las de WhatsApp o teléfono requieren validación adicional de datos.

> **Excepción documentada:** si el cliente da una indicación especial por canal autorizado solicitando anticipar o diferir la factura, Facturación la documenta en el sistema y actúa según la instrucción. Esta excepción debe quedar registrada con nombre del cliente, canal, fecha y quién autorizó.

---

## III. Flujo de facturación

### Paso 1 — Recepción de la PO

Facturación recibe la PO (puede venir de Ventas al hacer el handoff, o directamente del cliente por portal). Verifica:

- ¿La PO cubre qué pedidos / NR? Ventas ya vinculó las NR en el tablero de seguimiento.
- ¿Los datos fiscales del cliente están completos y actualizados (RFC, régimen fiscal, CFDI use, dirección fiscal)?
- ¿El monto de la PO corresponde a lo cotizado?

> Si los datos están incompletos, Facturación solicita la corrección **antes de emitir**. Una factura con datos fiscales incorrectos genera una nota de crédito y re-timbrado — proceso costoso que se evita validando primero.

---

### Paso 2 — Emisión del CFDI

Con la PO y los datos validados, Facturación emite el Comprobante Fiscal Digital por Internet (CFDI) en el sistema contable:

| Elemento | Detalle |
| --- | --- |
| **Sistema actual** | CONTPAQi / Aspel u otro software contable con timbrado SAT |
| **Sistema futuro (meta RTB)** | Sistema propio RTB (integrado con Notion / Supabase / n8n) que genere y tiembre directamente, eliminando la dependencia del software externo |
| **Datos requeridos** | RFC cliente, régimen fiscal, uso de CFDI, descripción de conceptos, monto, forma de pago |
| **Validación previa al timbrado** | Revisar que el pedido físico corresponda al CFDI (cantidad, descripción, precio) |

El CFDI timbrado queda registrado en el sistema contable y en el expediente del cliente.

---

### Paso 3 — Envío al cliente y sincronización con la entrega

La factura **sale junto con el material** — ese es el estándar. El flujo de paralelo funciona así:

```
PO recibida
    ├── Facturación: valida, emite CFDI ──────────────────────────┐
    └── Almacén: prepara el pedido (si aún no está listo) ─────────┤
                                                                   ↓
                                              Entrega al cliente + CFDI juntos
```

- Si el pedido ya estaba listo antes de llegar la PO (preparado con NR), la factura se emite inmediatamente y se envía con la próxima salida de rutas.
- Si el pedido aún está en preparación, Facturación termina el CFDI mientras Almacén termina de preparar; ambos convergen en el despacho.

El CFDI se envía al cliente:
- Por **correo electrónico** (XML + PDF), al correo registrado del cliente.
- Por **portal del cliente** (Ariba u otro) si así lo requiere.
- El acuse de recibo queda registrado en el expediente.

---

### Paso 4 — Registro en el expediente y asociación al pedido

Con el CFDI timbrado y enviado:
1. Facturación **registra la factura** en el expediente del cliente (número de CFDI, monto, fecha de emisión, PO vinculada, NR vinculadas si aplica).
2. El sistema marca el pedido como **"Facturado"** — este estado es el punto de sincronía con el tablero de seguimiento de Ventas (estado 5 de la NR).
3. **Arranca el reloj de cobranza de 90 días** desde la fecha de emisión del CFDI.

---

## IV. Flujo de cobranza

### Paso 1 — Seguimiento de saldos

A partir de la emisión del CFDI, Cobranza lleva el expediente activo de cada cliente:

| Campo de seguimiento | Detalle |
| --- | --- |
| **Número de CFDI** | Identificador único de la factura |
| **Fecha de emisión** | Inicio del reloj de 90 días |
| **Monto** | Valor de la factura; puede ser parcial si el cliente paga en abonos |
| **Antigüedad (días)** | Calculada automáticamente en el sistema |
| **Estado de pago** | No pagada / Pagada Parcial / Pagada Total / Cancelada |
| **Contacto de cobranza** | Quién lleva el seguimiento con el cliente |
| **Nota de último contacto** | Resumen de la última gestión de cobro |

---

### Paso 2 — Aviso preventivo antes de los 90 días

Cuando un saldo se acerca al límite (recomendado: alerta a los 60 días), Cobranza:
1. Contacta al cliente para **recordatorio formal** del saldo pendiente.
2. Registra la gestión en el expediente.
3. Notifica a Ventas (solo informativo — Ventas no ejecuta la cobranza, solo queda al tanto para no generar nuevos compromisos de crédito con ese cliente).

---

### Paso 3 — Vencimiento a 90 días

Si el cliente llega a los 90 días sin pagar:

1. Cobranza **avisa formalmente al cliente** por el canal registrado.
2. Cobranza **notifica a Ventas** para que el vendedor sepa que ese cliente tiene saldo vencido.
3. Se aplica el **congelamiento de cuenta** (ver Sección V — punto de acción pendiente).

---

### Paso 4 — Aplicación y conciliación del pago

Cuando el cliente paga (parcial o total):

1. Cobranza **registra el pago** en el sistema contable.
2. Se **concilia** el pago contra la factura correspondiente (CFDI).
3. Si el pago es parcial, el saldo restante sigue en seguimiento activo.
4. Si el pago es total, la factura se marca como **"Pagada / cerrada"** — estado 6 en el tablero de NR de Ventas.
5. La conciliación se sincroniza con **Tesorería** (Finanzas) para el flujo de efectivo del mes.

---

## V. Congelamiento de cuenta

> **Estado actual: sin proceso definido.** El congelamiento existe en el mapa como regla, pero no hay un procedimiento claro de ejecución. Se registra como **punto de acción pendiente** para que Dirección y el área de Administración y Finanzas definan la política.

**Preguntas abiertas que requieren decisión:**

| Pregunta | Opciones frecuentes |
| --- | --- |
| ¿Quién ejecuta el congelamiento? | Cobranza automáticamente / requiere autorización de Dirección |
| ¿Es automático en el sistema o manual? | El sistema bloquea al cliente / alguien lo marca manualmente |
| ¿Congela nuevos pedidos, entregas o ambos? | Solo pedidos nuevos / también detiene entregas en curso |
| ¿Hay excepciones por tipo de cliente o monto? | Sin excepción / Dirección puede autorizar continuar |
| ¿Cómo se levanta el congelamiento? | Al pagar el saldo completo / al pagar un porcentaje acordado |

**Regla provisional:** cuando un cliente pasa los 90 días, Cobranza lo documenta en el expediente y consulta a Dirección. Dirección decide si congelar y comunica a Ventas la instrucción. Ventas ejecuta el freno en la operación (no acepta nuevos pedidos de ese cliente).

---

## VI. Cierre de mes — Finanzas

El cierre de mes tiene **dos ciclos**:

### Ciclo de salida — Pago a proveedores
1. Finanzas revisa todas las **órdenes de compra pendientes de pago** (coordinado con Compras-abasto).
2. Ejecuta los pagos según las condiciones de cada proveedor.
3. Envía el comprobante de pago al proveedor y registra en el sistema.

### Ciclo de entrada — Cobro a clientes
1. Cobranza genera el **reporte de antigüedad de saldos** a fin de mes.
2. Identifica clientes en zona de riesgo (60–90 días) y clientes vencidos (>90 días).
3. Ejecuta acciones: recordatorio, aviso formal o congelamiento según corresponda.
4. Tesorería concilia los cobros recibidos en el mes contra las facturas emitidas.

> El cierre de mes es el punto donde el ciclo completo `Venta → Almacén → Rutas → Facturación → Cobranza` se reconcilia en números. Un mes bien cerrado tiene cero facturas sin estado claro y cero pagos sin aplicar.

---

## VII. Sobre el sistema de facturación — Estado actual y meta futura

**Hoy:** CONTPAQi / Aspel u otro software contable con timbrado SAT. El proceso es manual: el auxiliar captura los datos de la PO en el software, timbra y envía por correo.

**Meta futura:** el sistema propio de RTB (Notion / Supabase / n8n) generará y timbrará los CFDI directamente, sin intervención manual de captura. Esto elimina el re-trabajo de pasar datos de la PO al software contable y reduce el riesgo de error en los datos fiscales. El despacho contable externo seguirá siendo el enlace con la autoridad fiscal, pero el timbrado operará desde el sistema de RTB.

Este cambio **no modifica el flujo** de este módulo — los pasos son los mismos; solo cambia el sistema que ejecuta el timbrado.

---

## VIII. Roles del módulo

*(Ver catálogo completo en `RTB-ORG-01_Organigrama_V2.0.md`)*

| Puesto | Rol en este módulo | Estado |
| --- | --- | --- |
| **Auxiliar de Facturación y Cobranza** | Dueño actual. Ejecuta ambos procesos: recibe PO, valida datos, emite CFDI, da seguimiento a saldos y gestiona cobros | Actual |
| **Gerente de Administración y Finanzas** | Supervisión, autorización de excepciones, cierre de mes y decisiones de congelamiento | Actual |
| **Responsable de Facturación** | Cuando exista: valida PO, pedido y datos fiscales antes de emitir; coordina con el despacho contable | Previsto |
| **Analista de Crédito y Cobranza** | Cuando exista: analiza antigüedad de saldos, gestiona los 90 días y coordina el congelamiento con Dirección | Previsto |
| **Despacho Contable Externo** | Enlace con autoridad fiscal, revisión de timbrados, cierre contable mensual | Servicio externo |

---

## IX. RACI del módulo

| Actividad | Aux. Fac./Cob. | Gerente Adm. | Ventas | Rutas | Despacho Cont. | Dirección |
| --- | --- | --- | --- | --- | --- | --- |
| Recibir y validar la PO | **R** | A | I | — | — | — |
| Validar datos fiscales del cliente | **R** | A | C | — | C | — |
| Emitir y timbrar el CFDI | **R** | A | — | — | I | — |
| Enviar CFDI al cliente | **R** | — | I | I | — | — |
| Registrar factura y asociar al pedido | **R** | A | I | — | — | — |
| Seguimiento de saldos (cobranza activa) | **R** | A | I | — | — | — |
| Aviso preventivo a los 60 días | **R** | I | I | — | — | — |
| Aviso formal a los 90 días | **R** | A | I | — | — | — |
| Ejecutar congelamiento de cuenta | C | A | I | — | — | **R** |
| Aplicar y conciliar pagos | **R** | A | — | — | I | — |
| Cierre de mes — pago a proveedores | I | **R** | — | — | C | I |
| Cierre de mes — revisión de cobros | **R** | A | I | — | C | I |

> **R** = Responsable · **A** = Aprobador · **C** = Consultado · **I** = Informado.

---

## X. Reglas del módulo

1. **Sin PO no hay factura.** La PO es la única llave que abre el proceso de facturación. No hay CFDI sin PO —salvo excepción documentada por el cliente.
2. **La excepción requiere registro.** Toda instrucción especial del cliente que altere el proceso estándar (anticipar, diferir, facturar sin PO) se documenta con nombre, canal, fecha y quién autorizó antes de actuar.
3. **Facturación arranca con la PO, no con la entrega.** El CFDI se emite en cuanto llega la PO; no espera a que Almacén termine ni a que el chofer entregue.
4. **El CFDI sale con el material.** Aunque se emite en paralelo, se sincroniza para que factura y pedido lleguen juntos al cliente.
5. **Datos fiscales antes de timbrar.** Un CFDI con error requiere cancelación y re-timbrado. Validar primero es siempre más barato.
6. **El reloj de 90 días arranca desde el CFDI.** No desde la entrega, no desde la cotización — desde la fecha de emisión del Comprobante Fiscal.
7. **Aviso preventivo a los 60 días.** Cobranza no espera a los 90 días para gestionar; actúa antes del vencimiento.
8. **Congelamiento sin regla = Dirección decide.** Hasta que exista una política formal, toda decisión de congelamiento pasa por Dirección y queda documentada antes de comunicarse a Ventas.
9. **Cero facturas sin estado al cierre del mes.** El reporte de antigüedad de saldos debe llegar a cero facturas "sin estado claro" en cada cierre mensual.

---

## XI. Conexión con otros módulos

| Módulo | Punto de conexión |
| --- | --- |
| **① Ventas** | Ventas dispara el handoff al vincular la PO a las NR. Recibe notificación de congelamiento de cuenta para no aceptar nuevos pedidos. Tablero de NR: estados 5 (Facturada) y 6 (Pagada) los actualiza Facturación/Cobranza. |
| **② Almacén / Preparación** | Facturación corre en paralelo a la preparación. El CFDI converge con el pedido listo en el despacho. |
| **③ Rutas y Envíos** | Rutas entrega los documentos de entrega (acuses, remisiones) a Facturación para integrarlos al expediente del cliente. La confirmación de entrega refuerza el expediente de cobranza. |
| **Compras-abasto** | Finanzas paga las OC a proveedores en el cierre de mes, cerrando el ciclo de salida de dinero. |
| **Despacho Contable Externo** | Revisa los timbrados, cierra el mes contable y es el enlace con el SAT. |

---

*Módulo de Facturación y Cobranza · Refacciones Tomás Badillo, S.A. de C.V. · Folio RTB-PRO-FAC-01 · V1.0 · Julio 2026 · Azcapotzalco, CDMX*
