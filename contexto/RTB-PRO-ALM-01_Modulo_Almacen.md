
# Módulo de Almacén / Preparación — Refacciones Tomás Badillo

**Refacciones Tomás Badillo, S.A. de C.V. · Documentación de procesos operativos**
Folio RTB-PRO-ALM-01 · Versión 1.0 · Julio 2026 · Azcapotzalco, CDMX

Detalle operativo del módulo Almacén / Preparación. Complementa y desglosa el proceso ② del mapa general (`RTB-PRO-01`). Almacén vive dentro de **Logística y Envíos** — es quien transforma el pedido aprobado en material listo para salir.

---

## I. Propósito y alcance

El módulo de Almacén cubre **desde que llega la señal de inicio (NR o PO) hasta que el material está empaquetado, etiquetado y separado por destino, listo para que Logística lo programe**.

**Dentro del alcance:**
- Recepción del pedido (NR o PO) y verificación del documento.
- Verificación de stock pieza a pieza (picking).
- Solicitud de faltantes a Compras-abasto.
- Empaquetado y etiquetado.
- Decisión de envío completo vs. incompleto.
- **Entrada a inventario** de todo material que entra (incluyendo cross-dock).
- Separación del material por destino (local / foráneo).
- Handoff a **③ Programación de rutas y envíos**.

**Fuera del alcance:**
- Comprar el material faltante → eso es **Compras-abasto**.
- Programar rutas, asignar chofer, coordinar fleteras → eso es **Logística (③)**.
- Emitir la factura → eso es **Facturación (④)**.

> **Almacén no compra.** Cuando detecta un faltante, lo solicita a Compras-abasto; no negocia con proveedores ni genera órdenes de compra.

---

## II. Las dos entradas: NR y PO

Almacén recibe el pedido por una de dos vías, ambas provenientes de Ventas:

| Vía | Cuándo arranca Almacén | Qué recibe |
| --- | --- | --- |
| **NR (Nota de Remisión)** | Inmediatamente al recibir la NR — **no espera la PO** | Folio NR, cliente, listado de piezas y cantidades |
| **PO directa** (sin NR previa) | Al recibir la PO de Ventas | Número de PO, cliente, listado de piezas y cantidades |

**Regla:** la NR es la señal de inicio. La ausencia de PO no detiene la preparación. Lo que detiene la *facturación* es la falta de PO, no la preparación física.

Al recibir la señal de inicio, Almacén **verifica que el documento esté completo**: cliente identificado, listado de piezas, cantidades y unidades claramente especificadas. Si hay ambigüedad, regresa a Ventas antes de empezar.

---

## III. Flujo de preparación

### Paso 1 — Verificación de stock (picking)

El Encargado o Auxiliar de Almacén revisa pieza por pieza en el sistema (Supabase / kardex físico):

- **¿La pieza está en inventario y disponible?** → Se **separa** físicamente para este pedido.
- **¿La pieza no está o el stock es insuficiente?** → Se **registra el faltante** y se solicita a Compras-abasto.

> **Regla:** las piezas separadas se marcan como reservadas en el sistema inmediatamente. No se toman piezas "a ojo" sin reservarlas, para evitar conflictos con otros pedidos simultáneos.

---

### Paso 2 — Solicitud de faltantes a Compras-abasto

Por cada pieza faltante, Almacén genera la solicitud a Compras-abasto con:

- Nombre / referencia de la pieza.
- Cantidad requerida.
- Pedido al que pertenece (folio NR o número de PO).
- Urgencia estimada (¿el cliente quiere envío parcial o espera el pedido completo?).

Compras-abasto toma el proceso desde aquí. Almacén no hace seguimiento al proveedor — eso es responsabilidad de Compras.

---

### Paso 3 — Empaquetado con lo disponible

Con las piezas separadas (las que sí había en inventario), el Auxiliar de Almacén y Empaque inicia el empaquetado:

1. **Protección de la pieza** según su tipo (amortiguación, plástico, caja).
2. **Etiquetado**: cliente, folio NR / PO, dirección de entrega, contenido declarado.
3. Si el pedido va a ir como **envío foráneo** → etiqueta adicional de la fletera (generada en el sistema Notion / n8n).

> El empaquetado es función crítica: un empaque deficiente daña la pieza en tránsito y genera devoluciones que cuestan más que el pedido original.

---

### Paso 4 — Decisión: ¿envío completo o incompleto?

Una vez empaquetado lo disponible, se evalúa el estado del pedido:

| Situación | Acción |
| --- | --- |
| **Todas las piezas disponibles** | Pedido completo → pasa directo a separación local/foráneo |
| **Hay faltantes y el cliente NO autorizó envío parcial** | Pedido **en espera** hasta que llegue la pieza de Compras-abasto |
| **Hay faltantes y el cliente SÍ autorizó envío parcial** | Se envía lo disponible ahora; el restante se registra como **Pedido Incompleto** en Notion y se despacha cuando llegue la pieza |

**¿Cómo se sabe si el cliente autorizó el envío parcial?** Ventas lo indica al abrir el pedido (queda registrado en el folio NR o en la nota del pedido). Si no está especificado, Almacén **consulta a Ventas** antes de tomar la decisión — no asume.

**Seguimiento del restante:** cuando se hace un envío parcial, el pedido queda marcado por la fórmula **Tiene Faltante** en Pedidos de Clientes y se crea (o vincula) un registro en **Pedidos Incompletos** en Notion. Ver sección IV para el detalle completo del sistema. Cuando lleguen las piezas, el flujo retoma desde el Paso 1 para el restante y el despacho se hace como un envío nuevo con el mismo folio original.

---

### Paso 5 — Entrada a inventario (incluyendo cross-dock)

**Regla absoluta: toda entrada de material se registra en el sistema antes de moverse.**

Esto aplica en dos escenarios:

#### Escenario A — Material a stock (reposición normal)

El material llega de Compras-abasto o de una recolección de proveedor para reponer el inventario general:

1. Almacén recibe el material.
2. **Registra la entrada** contra la orden de compra de Compras-abasto (cuadra cantidad, referencia, factura del proveedor).
3. El kardex refleja el ingreso.
4. Se almacena en ubicación asignada.

#### Escenario B — Cross-dock (surtido directo a pedido pendiente)

El material llega de Compras-abasto **marcado para un pedido específico** que ya está en espera:

1. Almacén recibe el material.
2. **Registra la entrada** igual que en el escenario A — el inventario sube, aunque sea por un instante.
3. **Inmediatamente** despacha ese material al pedido pendiente (el inventario baja de nuevo).
4. El pedido en espera se activa y retoma el flujo desde el Paso 3 (empaquetado del restante).

> El registro de entrada en cross-dock **nunca se omite**, aunque la pieza no toque físicamente el estante. La trazabilidad y la cuadra de factura del proveedor lo requieren.

---

### Paso 6 — Separación por destino y handoff a Logística

Una vez que el pedido (o el parcial) está completamente empaquetado y etiquetado:

1. Almacén lo **clasifica por destino**:
   - **Local** (CDMX y zona metropolitana) → chofer propio.
   - **Foráneo** (resto del país) → fletera; la etiqueta y el folio de rastreo ya fueron generados en el paso de etiquetado.
2. El material se deja en la **zona de despacho** del almacén, separado físicamente por destino.
3. Almacén **notifica a Logística (③)** que el material está listo y le pasa:
   - Listado de bultos (cantidad, peso estimado, destino).
   - Folio NR / PO.
   - Tipo de envío (local / foráneo / mixto).
4. Logística toma el proceso desde aquí. El handoff está completo.

---

## IV. Sistema de seguimiento de pedidos incompletos (Notion)

El seguimiento de envíos parciales e incidencias vive en dos bases de Notion vinculadas: **Pedidos de Clientes** (el flujo principal) y **Pedidos Incompletos** (la bitácora de excepciones). El pedido principal se mantiene limpio; las incidencias tienen su propio espacio con sus propios estados, responsables y fechas.

---

### Base 1 — Pedidos de Clientes (flujo operativo principal)

Cada pedido formal del cliente tiene un registro aquí. Controla el avance general y concentra la información de la cotización relacionada (cliente, dirección, total, PO, teléfono, subtotal).

**Estados principales:**

| Propiedad | Estados |
| --- | --- |
| **Estado de Pedido** | En espera · Preparado · Enviado · Entregado |
| **Estatus de Pago** | No pagada · Pagada Parcial · Pagada Total · Cancelada |
| **Estado de Factura** | En espera · Facturando · Factura enviada |

**Fórmula automática — Tiene Faltante:**
Se activa cuando se cumplen las tres condiciones simultáneamente:
1. El porcentaje del pedido es **menor a 100%** (no iban todas las piezas).
2. El pedido ya está en estado **Enviado** o **Entregado**.
3. Existe información suficiente del estado del pedido.

En términos prácticos: si un pedido ya salió o fue entregado, pero no iba completo, se marca automáticamente como pedido con faltante. Este marcado es el disparador para abrir un registro en Pedidos Incompletos.

**Relación con Pedidos Incompletos:** cada registro en Pedidos de Clientes tiene la propiedad **Pedidos Incompletos** que apunta a la base de excepciones. Desde aquí se puede ver si el pedido tiene incidencias abiertas.

**Vistas disponibles en Pedidos de Clientes:**
- Panel de facturación, asociaciones y validaciones
- Panel de envíos
- Panel de preparación de pedidos
- Panel de pagos

---

### Base 2 — Pedidos Incompletos (bitácora de excepciones)

Se usa cuando un pedido no puede completarse normalmente. No reemplaza al pedido principal — lo complementa con el contexto de la excepción.

**Estados de gestión interna:**

| Estado | Qué indica |
| --- | --- |
| **Pendiente** | Detectado; aún sin acción asignada |
| **En proceso** | Hay un responsable trabajando en la resolución |
| **Esperando inventario** | La pieza faltante está en camino (Compras-abasto en curso) |
| **Esperando pago** | El bloqueo es financiero, no de inventario |
| **Listo para enviar** | El faltante ya está disponible; pendiente de programar ruta |
| **Enviado** | El restante salió hacia el cliente |
| **Completado** | Pedido resuelto al 100%; incidencia cerrada |

**Campos que registra Pedidos Incompletos:**

| Campo | Descripción |
| --- | --- |
| **Motivo de incompletitud** | Falta de inventario · Pago pendiente · Problema de envío · Error en dirección · Producto dañado · Documentación incompleta · Proveedor · otro |
| **Prioridad** | Alta · Media · Baja |
| **Responsable** | Persona a cargo de la resolución |
| **Fecha Estimada de Resolución** | Para el seguimiento de calendario |
| **Notas adicionales** | Contexto libre del incidente |
| **Productos Faltantes** | Rollup desde la cotización relacionada |
| **Pedido Faltante** | Relación de regreso a Pedidos de Clientes |

**Vistas disponibles en Pedidos Incompletos:**
- Tabla general de pedidos incompletos
- Tablero por estado
- Calendario de resolución
- Tablero por prioridad
- Tablero por responsable

---

### Flujo típico de un pedido incompleto

```
① Pedido aprobado → Pedidos de Clientes (Estado: En espera)
② Almacén prepara → Estado: Preparado
③ Sale incompleto → Estado: Enviado / Fórmula Tiene Faltante = ✓
④ Se abre registro en Pedidos Incompletos → Estado: Pendiente
⑤ Se asigna responsable, motivo, prioridad y fecha estimada
⑥ Compras-abasto consigue la pieza → Estado: Esperando inventario → Listo para enviar
⑦ Almacén despacha el restante (cross-dock o desde stock)
⑧ Estado de la incidencia → Enviado → Completado
⑨ El pedido original en Pedidos de Clientes conserva el vínculo como trazabilidad
```

> **La relación es bidireccional:** desde Pedidos de Clientes se ven las incidencias abiertas del pedido. Desde Pedidos Incompletos se regresa al pedido original con un clic. Esto mantiene el registro principal limpio mientras la excepción tiene todo su propio espacio.

---

### Quién opera cada base

| Acción | Almacén | Ventas | Compras-abasto | Facturación/Cobranza |
| --- | --- | --- | --- | --- |
| Actualizar Estado de Pedido | **R** | I | — | I |
| Detectar faltante (fórmula automática) | Sistema | — | — | — |
| Abrir registro en Pedidos Incompletos | **R** | I | — | — |
| Asignar motivo, prioridad y responsable | **R** | C | C | — |
| Dar seguimiento hasta "Completado" | **R** | I | C | — |
| Leer vistas de facturación y pagos | I | — | — | **R** |

---

## V. Entrada a inventario — regla completa

La regla se aplica a **todo** material que entra a las instalaciones de RTB, sin excepción:

| Tipo de entrada | Origen | ¿Se registra? |
| --- | --- | --- |
| Reposición de stock | Proveedor vía Compras-abasto | Siempre |
| Cross-dock (pedido pendiente) | Proveedor vía Compras-abasto | Siempre — antes de despachar |
| Recolección por chofer RTB | Proveedor local | Siempre — al llegar a almacén |
| Devolución de cliente | Cliente | Siempre — con nota de devolución |
| Material sobrante de ruta | Chofer al regresar | Siempre — al descargar |

**Qué se registra en cada entrada:**
- Referencia / número de pieza.
- Cantidad recibida.
- Proveedor u origen.
- Número de orden de compra o folio relacionado.
- Fecha y hora.
- Quién lo recibió (Encargado o Auxiliar).

> La exactitud del inventario es responsabilidad directa del **Encargado de Almacén**. Un inventario inexacto genera cotizaciones erróneas en Ventas, pedidos pendientes innecesarios y pérdida de trazabilidad financiera.

---

## VI. Roles del módulo

*(Ver catálogo completo en `RTB-ORG-01_Organigrama_V2.0.md`)*

| Puesto | Rol en este módulo | Estado |
| --- | --- | --- |
| **Encargado de Almacén** | Líder operativo: recibe el pedido, supervisa el picking, decide sobre envío parcial (consultando a Ventas), garantiza la exactitud del inventario, autoriza los handoffs | Actual |
| **Auxiliar de Almacén y Empaque** | Ejecuta el picking físico, empaqueta, etiqueta y mueve material. Registra entradas en el sistema | Actual |
| **Ayudante General de Almacén** | Apoyo físico cuando el volumen rebasa al Auxiliar (carga, acomodo, limpieza de área) | Previsto |
| **Supervisor de Almacén** | Cuando exista: coordina varios operativos, reporta exactitud y eficiencia de preparación | Crecimiento |

**Relaciones hacia afuera del módulo:**
- Recibe de **Ventas**: folio NR o PO con listado de piezas.
- Solicita a **Compras-abasto**: faltantes con especificación completa.
- Entrega a **Logística (③)**: material empaquetado, etiquetado y clasificado por destino.
- Informa a **Ventas**: si hay faltantes que pueden afectar tiempos prometidos al cliente.

---

## VII. RACI del módulo

| Actividad | Almacén | Ventas | Compras-abasto | Logística | Sistema/TI |
| --- | --- | --- | --- | --- | --- |
| Recibir y verificar el documento de pedido | **R** | I | — | — | — |
| Picking (verificar y reservar en sistema) | **R** | I | — | — | A |
| Solicitar faltantes a Compras-abasto | **R** | I | I (recibe) | — | — |
| Decidir envío parcial (consultar con Ventas) | **R** | C | — | — | — |
| Empaquetar y etiquetar | **R** | — | — | — | — |
| Registrar entradas a inventario | **R** | — | I | — | A |
| Cross-dock: registrar y despachar | **R** | — | I | — | A |
| Clasificar por destino y notificar a Logística | **R** | — | — | I (recibe) | — |

> **R** = Responsable · **C** = Consultado · **A** = Aprobador / soporte técnico · **I** = Informado.

---

## VIII. Reglas del módulo

1. **Almacén no compra.** Detecta faltantes y los solicita a Compras-abasto; nunca negocia con proveedores ni genera órdenes de compra.
2. **Toda entrada a inventario se registra siempre**, incluso en cross-dock. Primero se registra la entrada, luego se despacha.
3. **La NR arranca la preparación; la PO no es requisito para empezar.** La ausencia de PO detiene la facturación, no el trabajo físico.
4. **Piezas separadas = reservadas en el sistema.** Ninguna pieza se toma del estante sin marcarla como reservada para el pedido correspondiente.
5. **Sin confirmación de Ventas, no hay envío parcial.** Almacén no decide por su cuenta enviar incompleto; consulta a Ventas y Ventas consulta al cliente.
6. **El pedido abierto (restante) se registra inmediatamente.** Al hacer un envío parcial, las piezas pendientes quedan registradas con folio original y se retoman cuando lleguen de Compras-abasto.
7. **El handoff a Logística incluye el listado de bultos, folios y tipo de envío.** Logística no estima ni asume; recibe datos precisos.
8. **La exactitud del inventario es responsabilidad del Encargado de Almacén.** Cualquier discrepancia se investiga y corrige antes del cierre del día.

---

## IX. Conexión con otros módulos

| Módulo | Punto de conexión desde Almacén |
| --- | --- |
| **① Ventas** | Recibe: folio NR o PO con listado de piezas. Regresa información si hay ambigüedad en el pedido o si hay faltantes que afectan el tiempo prometido |
| **Compras-abasto** | Almacén dispara Compras-abasto al detectar un faltante. Le pasa: referencia de pieza, cantidad, pedido de origen y urgencia |
| **③ Logística y envíos** | Almacén entrega el material empaquetado, etiquetado y clasificado. Logística programa la ruta a partir de ese punto |
| **④ Facturación** | Almacén no tiene contacto directo con Facturación, pero su trabajo habilita la sincronización: material preparado + factura lista salen juntos al momento de la entrega |
| **Mapa general** | Este módulo desglosa el proceso ② de `RTB-PRO-01` |

---

*Módulo de Almacén / Preparación · Refacciones Tomás Badillo, S.A. de C.V. · Folio RTB-PRO-ALM-01 · V1.0 · Julio 2026 · Azcapotzalco, CDMX*
