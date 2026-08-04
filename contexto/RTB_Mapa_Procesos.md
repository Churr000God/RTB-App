# Mapa de Procesos — Refacciones Tomás Badillo

**Refacciones Tomás Badillo, S.A. de C.V. · Documentación de procesos operativos**
Folio RTB-PRO-01 · Versión 1.7 · Julio 2026 · Azcapotzalco, CDMX

> **Cambios v1.1:** Se añade el subproceso "Seguimiento de NR (Ventas)" en el módulo ① y la regla transversal correspondiente. Detalle completo en `RTB-PRO-VEN-01_Modulo_Ventas.md`.
> **Cambios v1.2:** Se añade referencia al módulo desglosado de Almacén / Preparación. Detalle completo (picking, cross-dock, envío incompleto, entrada a inventario, roles) en `RTB-PRO-ALM-01_Modulo_Almacen.md`.
> **Cambios v1.3:** Se actualiza ③ Programación de rutas y envíos: se resuelve el punto de evaluación (combo local+fletera), se aclaran días flexibles y se registra urgencias como punto de acción pendiente. Detalle completo en `RTB-PRO-RUT-01_Modulo_Rutas.md`.
> **Cambios v1.4:** Se actualiza ④ Facturación y Cobranza: se clarifica que Facturación arranca con la PO (no con la entrega), se registra congelamiento de cuenta como punto de acción pendiente. Detalle completo en `RTB-PRO-FAC-01_Modulo_Facturacion.md`.
> **Cambios v1.5:** Se actualiza Compras-abasto: se documentan los dos disparadores (reabasto programado y faltante de pedido), el sistema de 5 bases Notion y la regla de bloqueo de compra. Detalle completo en `RTB-PRO-COM-01_Modulo_Compras.md`.
> **Cambios v1.6:** Se añade módulo de Finanzas y Tesorería: pagos a proveedores (por transferencia, Gerente aprueba y ejecuta), pago de nómina (flujo completo con RRHH), conciliación bancaria, cierre financiero de mes y enlace con el despacho contable. Detalle completo en `RTB-PRO-FIN-01_Modulo_Finanzas.md`.
> **Cambios v1.7:** Se añade módulo de Tecnologías de la Información: stack híbrido (Notion · n8n · Supabase · VPS · cajas internas), soporte en persona, gestión de cuentas y accesos (Tailscale), plan de infraestructura por fases y reglas de seguridad. Detalle completo en `RTB-PRO-TI-01_Modulo_TI.md`.

Flujo de punta a punta del negocio, por departamento, en diagramas encadenados: desde que un cliente pide una cotización hasta el cobro y el cierre de mes.

---

## I. Panorama general

El negocio corre sobre **cuatro procesos troncales encadenados**, con **Compras** y **Finanzas** colgando a los lados y alimentándolos en puntos precisos:

```
① Venta · Prospección · Asesoramiento
        → ② Almacén / Preparación
                → ③ Programación de rutas y envíos
                        → ④ Facturación y cobranza
                                → (congelar cuenta cierra de regreso hacia Ventas)
```

Procesos que cuelgan del tronco:

- **Compras-ligero (consulta)** — alimenta ① para poder cotizar; no compra.
- **Compras-abasto** — pasa por Finanzas, recolecta y da entrada a inventario; alimenta ③.
- **Finanzas** — cierra el mes por las dos puntas: paga a proveedores y revisa el cobro a clientes. **La PO es el eje de todo el dinero.** Aparece tres veces como llave: dispara Almacén (si no hay NR), habilita facturar, y sin ella no corre el reloj de cobranza.

---

## II. Censo de departamentos

| Departamento       | Rol en el flujo                                                                       | Estado                        |
|--------------------|---------------------------------------------------------------------------------------|-------------------------------|
| **Dirección**          | Estrategia, cuentas clave, blindaje del decisor económico del cliente                 | Existe                        |
| **Comercial / Ventas** | Prospección, contacto, cotización y **asesoría técnica embebida**                         | Existe                        |
| **Compras**            | Consulta al proveedor (ligero) y abasto real (compra, recolección, alta a inventario) | Existe                        |
| **Logística y Envíos** | Preparación (**Almacén**), programación de rutas, entrega y recolección                   | Existe                        |
| **Finanzas**           | Pago a proveedores, crédito, comprobantes, cierre de mes. Detalle en `RTB-PRO-FIN-01_Modulo_Finanzas.md` | Existe |
| **Facturación**        | Genera factura (requiere PO), asocia y valida el pedido                               | Existe                        |
| **Cobranza**           | Reloj de 90 días, aviso al cliente y notificación a Ventas, congelamiento de cuenta   | Existe                        |
| **Recursos Humanos**   | Soporte — **no toca el flujo operativo de punta a punta**                                 | Fuera de alcance de este mapa |

> **Nota de alcance.** El departamento sin nombre que se mencionó al inicio **no apareció en ninguno de los pasos del flujo**, por lo que se descartó de este mapa. **Recursos Humanos** existe pero es un área de soporte que no participa en el order-to-cash ni en el abasto; queda anotada para mapearse aparte cuando se levante su propio proceso (reclutamiento, alta, nómina, etc.).

**Almacén vive dentro de Logística y Envíos** — es quien prepara los envíos y programa la entrega o recolección del material.

---

## ① Venta · Prospección · Asesoramiento

El vendedor carga casi todo el proceso, con la asesoría técnica pegada a la venta.

1. El **cliente contacta** por un portal autorizado —Ariba, WhatsApp, correo o teléfono— pidiendo la cotización de un producto. *(Ventas)*
2. El **vendedor verifica** en el sistema si el producto existe y si hay existencias.
3. **Bifurcación — no existe o no hay stock:** entra **Compras-ligero**: busca y se comunica con el proveedor para conocer info de la pieza, costo y tiempo de entrega, y le regresa esos datos al vendedor. *(Compras — solo consulta, no compra.)*
4. El **vendedor arma la cotización** al cliente, dando la **asesoría técnica** en conjunto con la venta.
5. El **cliente aprueba** (o no). Si aprueba, se abre la segunda bifurcación según cómo aprueba:
   - **Vía Nota de Remisión (NR):** pasa directo a **Almacén** para empezar a trabajar el pedido, mientras se espera la **PO**. Varias NR pueden juntarse en una sola PO. **Al emitirse la NR, Ventas la registra en el tablero de seguimiento** y la vigila hasta que llegue la PO, se facture y se cobre (ver "Seguimiento de NR" abajo). Cuando llega la PO → Ventas vincula la(s) NR y dispara el handoff a **Facturación**.
   - **Vía PO directa:** va a **Almacén** para trabajar el pedido *y* a **Facturación** para facturarlo. **Regla dura:** facturar **siempre** requiere la PO. La NR arranca el trabajo en almacén, pero facturar espera la PO.

---

## Seguimiento de NR *(Ventas — tablero)*

Subproceso activo desde que el cliente aprueba vía NR hasta el cobro. **Dueño: Ventas.** Facturación y Cobranza son consumidores del tablero.

| Estado                | Qué indica                                                                           |
|-----------------------|--------------------------------------------------------------------------------------|
| **1. Abierta**            | NR emitida, registrada en tablero; PO pendiente                                      |
| **2. En preparación**     | Almacén trabajando el pedido                                                         |
| **3. Entregada / sin PO** | Material despachado; PO aún pendiente *(foco de vigilancia)*                           |
| **4. PO vinculada**       | PO recibida; Ventas la enlaza a la(s) NR cubierta(s) y dispara handoff a Facturación |
| **5. Facturada**          | CFDI emitido; arranca el reloj de cobranza (90 días)                                 |
| **6. Pagada / cerrada**   | Cobrada; sale del tablero de abiertas                                                |

Campos del tablero: folio NR · fecha · vendedor · cliente y portal de origen · piezas/valor estimado · estado · antigüedad en días *(informativa)* · PO vinculada · nota de último contacto. Detalle operativo: `RTB-PRO-VEN-01_Modulo_Ventas.md`.

---

## ② Almacén / Preparación

Dentro de Logística y Envíos. Superficial, en bloques grandes. Detalle operativo en `RTB-PRO-ALM-01_Modulo_Almacen.md`.

1. Almacén **recibe la NR** (arranca el trabajo); si no hay NR, arranca **hasta que llegue la PO**.
2. **Verifica stock** de las piezas del pedido.
   - Las que **hay** → se **separan**.
   - Las que **faltan** → se **solicitan** (pasa a **Compras-abasto**, que tiene su propio proceso).
3. Inicia el **empaquetado** con lo disponible.
4. **¿Falta alguna pieza?**
   - **Sí** → el pedido queda **pendiente** hasta que llegue, **salvo** que el cliente pida enviarlo **incompleto**: se envía lo disponible y el **restante se manda después**.
   - **No** → pedido **completo**.
5. Una vez preparado por completo, se **separa por local y foráneo**.
6. Pasa a **③ Programación de rutas y envíos**.

---

## ③ Programación de rutas y envíos

Dentro de Logística y Envíos. **Dueño: Coordinador de Logística.** Detalle operativo en `RTB-PRO-RUT-01_Modulo_Rutas.md`.

Recibe **dos corrientes**: el material preparado por Almacén (local/foráneo) **y** las recolecciones de Compras.

1. Se **verifica que el pedido esté preparado al 100%** —o, si es recolección, que el **proveedor confirme que está listo para recolectar**.
2. Se **agrupa por zonas**. Los días de salida son **miércoles y sábado como referencia**, pero se ajustan según carga y urgencia.
3. Se reparte según destino:
   - **Local** → **chofer propio**.
   - **Foráneo** → **siempre por fletera** (sistema Notion/n8n, tarifa por zona, etiqueta, rastreo). El chofer **deja los paquetes foráneos en la fletera de camino** a la ruta local — un solo viaje.
4. Se **asigna el chofer en la plataforma** y **Almacén carga** el material.
5. **Chequeo de la unidad antes de salir** —obligatorio, todos los días de ruta. Amarra con el RIT (protocolo de aptitud del conductor).
6. El **chofer sale a ruta** (entrega y/o recolección).
7. Al terminar: **chofer y Almacén descargan** lo recolectado o sobrante.
8. Se **envía la confirmación al cliente**.
9. Los **documentos pasan a Facturación** → **④ Facturación y cobranza**.

> **Punto de acción pendiente — Urgencias:** no hay regla definida para pedidos que soliciten salida fuera de los días de referencia. Queda registrado en `RTB-PRO-RUT-01` como decisión a tomar.

---

## Compras-abasto (proceso propio)

**Dueño: Responsable de Compras y Abastecimiento.** Detalle operativo en `RTB-PRO-COM-01_Modulo_Compras.md`.

Tiene **dos disparadores**: (A) el sistema detecta stock bajo mínimo y genera una alerta de reabasto programado; (B) Almacén detecta un faltante al preparar un pedido y solicita urgente. Ambos convergen en el mismo flujo de compra.

1. Almacén detecta faltante → **solicita el material a Compras**.
2. Compras **identifica al mejor proveedor**.
3. Se **comunica** con él para conocer costos, tiempos de entrega y existencias.
4. Hace la **solicitud formal** y arma la **cotización**.
5. Genera la **orden** para que **Finanzas** haga el pago —directo o **sumándolo al crédito abierto**.
6. **Finanzas envía el comprobante** de pago al proveedor y a Compras.
7. Compras **verifica fechas de recolección**. Aquí la recolección tiene **dos vías**:
   - **Recolección por chofer RTB** → entra a **③ Programación de rutas y envíos**.
   - **Envío directo del proveedor al almacén** → **se brinca ③** y cae directo en la entrada a inventario.
8. Hasta que **se recolecta / llega**:
   - **Compras** mete la **factura al sistema**.
   - **Almacén da entrada** al material. **La entrada documental siempre se registra** —cuadra la factura del proveedor, refleja el kardex y da trazabilidad total. 
     - **Surtido directo** (pieza marcada para pedido pendiente) → se despacha de una hacia el envío (cross-dock).
     - **A stock** → se queda en inventario para surtir después.

> **Dos caras de Compras.** El **ligero** solo pide información al proveedor para cotizar (proceso ①), no compra. El **abasto** (este) ya es comprar de verdad, con Finanzas, recolección y alta a inventario. Son procesos distintos.

---

## ④ Facturación y Cobranza

Dentro de Administración y Finanzas. **Dueño actual: Auxiliar de Facturación y Cobranza** (un solo puesto carga ambos procesos; al crecer se divide en Responsable de Facturación + Analista de Crédito y Cobranza). Detalle operativo en `RTB-PRO-FAC-01_Modulo_Facturacion.md`.

### Facturación

1. **Arranca al recibir la PO**, sin esperar a que Almacén termine —salvo indicación especial del cliente por canal autorizado. La factura corre en paralelo a la preparación y sale junto con el material.
2. **Regla dura:** solo se factura **si ya hay PO**. Sin PO, espera —excepto indicación especial documentada.
3. Facturación valida PO, pedido y datos fiscales del cliente, emite el **CFDI** (hoy vía CONTPAQi / Aspel; meta futura: sistema propio RTB) y lo envía al cliente.

### Cobranza

1. El CFDI emitido **arranca el reloj de 90 días**.
2. Cobranza da seguimiento a los saldos; cuando un cliente se acerca al límite, avisa con anticipación.
3. Si el cliente **pasa de 90 días** → Cobranza avisa al cliente y notifica a Ventas (solo para que estén al tanto).
4. **Congelamiento de cuenta:** sin proceso definido. **Punto de acción pendiente** — queda documentado en `RTB-PRO-FAC-01`.

### Cierre de mes (Finanzas)

- Pagar **todas las OC pendientes** a proveedores.
- Revisar **todos los pagos de clientes**.
- El congelamiento de cuenta cierra el ciclo de punta a punta de regreso hacia Ventas.

> **Finanzas cierra dos ciclos en fin de mes:** salida (paga a proveedores) y entrada (cobra a clientes). Detalle completo del cierre financiero y enlace con el despacho contable en `RTB-PRO-FIN-01_Modulo_Finanzas.md`.

---

## Reglas transversales

- **La PO manda el dinero.** Dispara Almacén (si no hay NR), habilita facturar y arranca el reloj de cobranza (90 días).
- **Facturación corre en paralelo a la preparación**, y se sincroniza en la entrega: material listo + factura lista salen juntos.
- **Entrada a inventario siempre**, incluso en cross-dock: primero se registra, luego se despacha.
- **Almacén no compra:** cuando detecta faltante, se lo brinca a Compras-abasto.
- **Ninguna NR sin registro ni sin dueño.** Toda NR se registra en el tablero al emitirse y permanece visible por estado hasta que la PO llega, se factura y se cobra. **Ventas la vigila; Facturación y Cobranza la consumen.** El tablero es informativo: no congela la operación, pero garantiza que ninguna NR quede fuera del radar.
- **Recursos Humanos** queda fuera del alcance de este mapa operativo; se documenta aparte.

---

*Documentación de procesos · Refacciones Tomás Badillo, S.A. de C.V. · Basado en el Sistema de Identidad Visual V1.0 · 2026*