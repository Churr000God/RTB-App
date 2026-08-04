
# Módulo de Finanzas y Tesorería — Refacciones Tomás Badillo

**Refacciones Tomás Badillo, S.A. de C.V. · Documentación de procesos operativos**
Folio RTB-PRO-FIN-01 · Versión 1.0 · Julio 2026 · Azcapotzalco, CDMX

Detalle operativo del área de Finanzas y Tesorería. Complementa y desglosa las funciones financieras del mapa general (`RTB_Mapa_Procesos.md`). Para el panorama de punta a punta consultar el mapa; este documento es la referencia de trabajo del Gerente de Administración y Finanzas.

---

## I. Propósito y alcance

El módulo de Finanzas y Tesorería cubre **el movimiento del dinero de RTB**: desde que se autoriza un pago hasta que se registra, concilia y se informa a quienes corresponde. Incluye:

- **Pago a proveedores:** ejecutar las transferencias que Compras solicita, enviar comprobante y registrar.
- **Pago de nómina:** recibir el cálculo de RRHH, validarlo, dispersar por transferencia y confirmar.
- **Conciliación bancaria y control de gasto:** cuadrar movimientos del banco contra los registros internos y vigilar el gasto operativo.
- **Cierre financiero de mes:** consolidar pagos y cobros del período y entregar los documentos al despacho contable externo.
- **Reporte financiero de Finanzas:** la fotografía mensual que Finanzas aporta al cierre de todas las áreas (proceso de gobierno de Dirección, en documento aparte).

**Fuera del alcance de este módulo:**
- Emisión de CFDI y seguimiento de cobranza → `RTB-PRO-FAC-01_Modulo_Facturacion.md`
- La solicitud de compra y elección de proveedor → `RTB-PRO-COM-01_Modulo_Compras.md`
- El cálculo de nómina, contratos y cumplimiento laboral → RRHH (módulo pendiente)
- El cierre mensual multi-área de todas las áreas → documento de gobierno de Dirección (pendiente)

---

## II. Panorama del dinero en RTB

Finanzas y Tesorería es la única área que mueve dinero real en RTB. Todo flujo pasa por aquí:

```
SALIDAS                                    ENTRADAS
──────────────────────────────             ────────────────────────────
Pago a proveedores (Compras solicita)      Cobros a clientes
Pago de nómina (RRHH calcula)             (conciliados por Cobranza/FAC-01)
Gasto operativo / de oficina (Adm.)
         │                                         │
         └────────────┬──────────────────────────┘
                      ▼
              TESORERÍA: saldo disponible,
              flujo de efectivo, foto financiera
```

**La PO del cliente es el eje financiero.** Sin PO no se emite factura (FAC-01) y sin factura no corre el reloj de cobro. Finanzas depende de que el ciclo orden-cobro cierre limpiamente para que el saldo de tesorería sea predecible.

**El Gerente de Administración y Finanzas** es hoy el dueño único de este módulo: aprueba, ejecuta y registra. La separación de funciones crece al incorporarse el Analista de Finanzas y Tesorería (previsto).

---

## III. Pago a proveedores

### Disparador

Compras genera una orden de compra y solicita el pago a Finanzas. El disparador puede ser:
- **Pago en crédito abierto:** el proveedor factura y Compras avisa a Finanzas con la factura del proveedor adjunta.
- **Pago inmediato:** el proveedor requiere transferencia antes o al momento de surtir. Compras alerta a Finanzas con urgencia.
- **Anticipo:** el proveedor exige un depósito previo al surtir. Requiere autorización de Compras antes de que Finanzas ejecute. Ver tabla de condiciones en `RTB-PRO-COM-01`.

### Flujo de ejecución

1. **Finanzas recibe** la solicitud de pago de Compras — con la factura del proveedor y la orden de compra vinculada.
2. **Valida** que el monto, el proveedor y los datos bancarios correspondan a la orden. Si hay discrepancia, regresa a Compras antes de pagar.
3. **El Gerente de Adm. y Finanzas aprueba y ejecuta la transferencia** desde la cuenta de RTB directamente.
4. **Obtiene y guarda el comprobante** de la transferencia (voucher bancario).
5. **Envía el comprobante** al proveedor (por el canal acordado: correo, portal, WhatsApp) y a Compras como confirmación.
6. **Registra el pago** en el sistema contable vinculado a la OC y a la factura del proveedor.

> **Regla de control:** Finanzas paga, Compras compra. Nadie que solicita el gasto ejecuta también el pago. Esta separación protege el control del dinero y es consistente con la regla 9 del módulo de Compras.

---

## IV. Pago de nómina

### Punto de conexión con RRHH

RRHH es **dueña del cálculo y del cumplimiento laboral** (salarios, prestaciones, deducciones, IMSS, retenciones). Finanzas es **dueña de la dispersión**: recibe el cálculo autorizado y ejecuta el pago. Nadie más toca el dinero de la nómina.

### Flujo de pago de nómina

1. **RRHH calcula la nómina** del período y la entrega a Finanzas con el desglose por trabajador (monto neto a dispersar, cuenta bancaria de destino, periodo que cubre).
2. **RRHH autoriza formalmente** el cálculo antes de entregarlo — la autorización es requisito para que Finanzas proceda.
3. **Finanzas valida** que el total del desglose coincida con el monto autorizado. Si hay diferencia, regresa a RRHH para corrección antes de pagar.
4. **Ejecuta las transferencias** a cada trabajador según el desglose, en el calendario de pago establecido.
5. **Obtiene los comprobantes** de cada transferencia y los archiva vinculados al periodo de nómina.
6. **Confirma a RRHH** que la dispersión se completó, adjuntando los comprobantes.
7. RRHH timbra el recibo de nómina en el sistema (CFDI de nómina) con los datos del pago ejecutado.

> **Calendario de pago:** la nómina se dispersa los días **15 y 30 de cada mes**. Si el mes no tiene día 30 (febrero, por ejemplo), el pago se adelanta al día anterior. Finanzas ejecuta contra este calendario sin necesidad de instrucción adicional de RRHH cada quincena.

---

## V. Conciliación bancaria y control de gasto

### Conciliación bancaria

La conciliación bancaria cruza los movimientos reales de la cuenta bancaria de RTB contra los registros internos (pagos registrados, cobros aplicados, gastos operativos). Su objetivo es detectar diferencias, pagos duplicados, cobros no aplicados o movimientos no registrados.

| Elemento | Detalle |
| --- | --- |
| **Frecuencia mínima** | Mensual, antes del cierre financiero |
| **Responsable** | Gerente de Adm. y Finanzas (hoy); Analista de Finanzas y Tesorería al incorporarse |
| **Insumos** | Estado de cuenta bancario del período · registro de pagos a proveedores · dispersión de nómina · cobros conciliados (de Cobranza / FAC-01) · gastos operativos |
| **Resultado** | Saldo conciliado del período; diferencias documentadas y resueltas |

Toda diferencia encontrada se documenta y se resuelve antes de cerrar el mes. Una diferencia no resuelta no puede transferirse al mes siguiente.

### Control de gasto

Finanzas supervisa el gasto operativo y de oficina que ejecuta el área de Administración (insumos, papelería, servicios). El flujo de autorización:

1. Administración identifica la necesidad y la solicita a Finanzas.
2. Finanzas evalúa si entra en el presupuesto operativo o requiere autorización de Dirección.
3. Finanzas aprueba y ejecuta el pago (si aplica) o escala a Dirección.
4. El gasto se registra en el sistema con su comprobante.

> **En definición — Presupuesto:** Dirección y Finanzas están definiendo actualmente el presupuesto operativo. Una vez establecido, Finanzas podrá aprobar el gasto que entre en el techo sin escalar cada partida a Dirección. Se actualizará este módulo cuando el presupuesto quede formalizado.

---

## VI. Cierre financiero de mes y enlace con el despacho contable

### Cierre financiero de mes

El cierre financiero consolida todo el movimiento del período en dos ciclos:

**Ciclo de salida — pagos ejecutados**
1. Finanzas revisa que todas las OC del mes estén pagadas o con estatus claro (crédito vigente con fecha de vencimiento registrada).
2. Verifica que la nómina del período esté dispersada y sus comprobantes archivados.
3. Confirma que el gasto operativo del mes esté registrado y conciliado.

**Ciclo de entrada — cobros del período**
1. Cobranza (FAC-01) entrega a Finanzas el reporte de cobros del mes: facturas pagadas, saldos activos y vencidos.
2. Finanzas concilia los cobros recibidos contra los saldos bancarios.
3. El saldo resultante queda documentado como la posición de tesorería al cierre del mes.

### Enlace con el despacho contable externo

Una vez cerrado el mes financiero, RTB entrega los documentos al despacho contable externo:

| Elemento | Detalle |
| --- | --- |
| **Fecha de entrega** | Al final del mes o en los primeros 5 días del mes siguiente |
| **Responsable de la entrega** | Gerente de Adm. y Finanzas |
| **Documentos que se entregan** | Facturas de proveedores pagadas · comprobantes de transferencias · CFDI de nómina · estado de cuenta bancario · facturas emitidas a clientes (de FAC-01) · cualquier nota de crédito del período |
| **Rol del despacho** | Cierre contable mensual · timbrado de CFDI de nómina si aplica · enlace con el SAT · preparación de declaraciones fiscales |

> El despacho contable **no opera** el día a día de RTB. Su función es cerrar el período contable y cumplir con las obligaciones fiscales. Finanzas es quien opera; el despacho es quien certifica.

---

## VII. Reporte financiero de Finanzas

> **Estado actual: no se presenta ningún reporte de Finanzas a Dirección.** Se registra como **punto de acción pendiente**.

### Meta

Dentro del **cierre mensual de todas las áreas** (proceso de gobierno de Dirección, en documento aparte), Finanzas aportaría un reporte financiero mensual los últimos días del mes. Los componentes previstos:

| Componente | Descripción |
| --- | --- |
| **Posición de tesorería** | Saldo disponible al cierre del mes |
| **Flujo de efectivo del mes** | Total de salidas (proveedores + nómina + gasto) vs. entradas (cobros) |
| **Antigüedad de cuentas por pagar** | OC pendientes de pago con fecha de vencimiento |
| **Antigüedad de cuentas por cobrar** | Resumen del reporte de Cobranza (FAC-01) |
| **Alertas** | Saldos bajos, pagos vencidos, clientes en zona de riesgo (>60 días) |

El diseño del cierre mensual multi-área (formato, frecuencia, quién lo convoca, cómo se presenta a Dirección) es responsabilidad de Dirección y quedará en su propio documento de gobierno.

---

## VIII. Roles del módulo

*(Ver catálogo completo en `RTB-ORG-01_Organigrama_V2.0.md`)*

| Puesto | Rol en este módulo | Estado |
| --- | --- | --- |
| **Gerente de Adm. y Finanzas** | Dueño actual. Aprueba y ejecuta todos los pagos (proveedores y nómina), concilia, cierra el mes y entrega al despacho | Actual |
| **Analista de Finanzas y Tesorería** | Cuando exista: lleva el flujo de efectivo, prepara la conciliación y el reporte financiero; el Gerente revisa y aprueba | Previsto |
| **Auxiliar de Tesorería** | Cuando exista: captura de movimientos, archivo de comprobantes, soporte a la conciliación | Crecimiento |
| **Despacho Contable Externo** | Recibe la documentación mensual, cierra el período contable, enlace con el SAT y declaraciones fiscales | Servicio externo |
| **RRHH** | Calcula y autoriza la nómina; entrega el desglose a Finanzas para dispersión | Actual (punto de conexión) |
| **Compras** | Solicita el pago a proveedores adjuntando la factura y la OC | Actual (punto de conexión) |

---

## IX. RACI del módulo

| Actividad | Gte. Adm./Fin. | Analista Fin. | Compras | RRHH | Despacho Cont. | Dirección |
| --- | --- | --- | --- | --- | --- | --- |
| Recibir y validar solicitud de pago a proveedor | **R** | C | I | — | — | — |
| Aprobar y ejecutar transferencia a proveedor | **R** | C | I | — | — | — |
| Enviar comprobante a proveedor y a Compras | **R** | — | I | — | — | — |
| Recibir y validar cálculo de nómina | **R** | C | — | A | — | — |
| Ejecutar dispersión de nómina | **R** | C | — | I | — | — |
| Confirmar dispersión y archivar comprobantes | **R** | — | — | I | — | — |
| Conciliación bancaria mensual | **R** | C | — | — | I | — |
| Control y autorización de gasto operativo | **R** | C | — | — | — | A |
| Cierre financiero del mes (ciclos salida/entrada) | **R** | C | I | I | — | I |
| Entrega de documentos al despacho contable | **R** | — | — | — | A | — |
| Cierre contable y declaraciones fiscales | I | — | — | — | **R** | — |
| Reporte financiero mensual a Dirección | **R** | C | — | — | — | A |

> **R** = Responsable · **A** = Aprobador · **C** = Consultado · **I** = Informado.

---

## X. Reglas del módulo

1. **Todo pago por transferencia bancaria.** RTB no paga en efectivo ni en cheque; toda salida de dinero es por transferencia. Sin excepción salvo autorización expresa de Dirección debidamente documentada.
2. **Finanzas paga, no compra; Compras compra, no paga.** La separación entre quien solicita el gasto y quien lo ejecuta es el control mínimo de dinero en RTB. Nadie autoriza su propio pago.
3. **El Gerente de Adm. y Finanzas aprueba y ejecuta.** Ningún pago sale sin su aprobación explícita. Cuando exista el Analista, el Gerente sigue siendo el aprobador; el Analista puede preparar pero no ejecutar sin autorización.
4. **Nómina solo contra cálculo autorizado por RRHH.** Finanzas no dispersa nómina sin recibir el desglose firmado o aprobado por RRHH. Una instrucción verbal no es suficiente.
5. **Cada pago con su comprobante archivado.** Todo voucher bancario queda guardado y vinculado a la OC o al período de nómina correspondiente antes de cerrar el mes. Sin comprobante, el gasto no existe formalmente.
6. **Documentos al despacho contable a fin de mes o en los primeros 5 días del mes siguiente.** Pasada esa ventana, el despacho no puede cerrar el período a tiempo y se acumulan obligaciones fiscales.
7. **Diferencias de conciliación se resuelven en el mes.** No se arrastra ninguna diferencia al mes siguiente sin documento que la explique y justifique.
8. **El reporte financiero es responsabilidad de Finanzas.** Aunque hoy no se presente, cuando el cierre de gobierno de Dirección arranque, Finanzas es quien lo alimenta con los números del período.

---

## XI. Conexión con otros módulos

| Módulo / Área | Punto de conexión |
| --- | --- |
| **Compras-abasto** (`RTB-PRO-COM-01`) | Compras solicita el pago al proveedor; Finanzas recibe la solicitud con la factura del proveedor y la OC, valida y ejecuta la transferencia. El comprobante regresa a Compras. |
| **④ Facturación y Cobranza** (`RTB-PRO-FAC-01`) | Cobranza entrega a Finanzas el reporte de cobros del mes para el cierre. Tesorería concilia los ingresos. El reloj de 90 días lo lleva Cobranza; Finanzas recibe el resultado. |
| **RRHH** | RRHH calcula y autoriza la nómina; Finanzas recibe el desglose y dispersa. La confirmación de dispersión regresa a RRHH para el timbrado del CFDI de nómina. |
| **Administración** | Administración solicita el gasto operativo y de oficina; Finanzas lo evalúa, autoriza y ejecuta. La autorización escala a Dirección si supera el techo operativo. |
| **Despacho Contable Externo** | Finanzas entrega los documentos del mes a fin de mes / primeros 5 días. El despacho cierra el período contable, gestiona las declaraciones fiscales y es el enlace con el SAT. |
| **Dirección General** | Finanzas apoya las decisiones económicas de Dirección con la foto de tesorería. Las decisiones de gasto extraordinario, congelamiento de cuenta y presupuesto pasan por Dirección. |
| **① Ventas** | El congelamiento de cuenta (cliente >90 días, FAC-01) le llega a Ventas vía Cobranza. Finanzas no interactúa directamente con Ventas en el día a día, pero el ciclo cobro-tesorería impacta las decisiones de crédito que Dirección comunica a Ventas. |

---

*Módulo de Finanzas y Tesorería · Refacciones Tomás Badillo, S.A. de C.V. · Folio RTB-PRO-FIN-01 · V1.0 · Julio 2026 · Azcapotzalco, CDMX*
