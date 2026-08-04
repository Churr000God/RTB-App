
# Módulo de Programación de Rutas y Envíos — Refacciones Tomás Badillo

**Refacciones Tomás Badillo, S.A. de C.V. · Documentación de procesos operativos**
Folio RTB-PRO-RUT-01 · Versión 1.0 · Julio 2026 · Azcapotzalco, CDMX

Detalle operativo del módulo Logística / Rutas. Complementa y desglosa el proceso ③ del mapa general (`RTB-PRO-01`). Para el panorama de punta a punta consultar el mapa; este documento es la referencia de trabajo del área de Logística y Envíos.

---

## I. Propósito y alcance

El módulo de Programación de Rutas y Envíos cubre **desde que Almacén entrega el material preparado (o Compras confirma una recolección) hasta que el cliente recibe su pedido y los documentos pasan a Facturación**. Incluye:

- La programación de entregas locales (chofer propio) y envíos foráneos (fletera).
- La combinación de ruta local + drop-off en fleteras en un solo viaje.
- El chequeo de la unidad antes de cada salida (RIT).
- La recolección de material de proveedores como parte del circuito de ruta.
- El registro de la confirmación de entrega al cliente y el traspaso documental a Facturación.

**Fuera del alcance de este módulo:** la preparación física del pedido (Almacén / `RTB-PRO-ALM-01`), la compra y el traslado del proveedor hacia RTB (Compras-abasto), y la emisión de la factura (Facturación / módulo ④). Este módulo recibe de Almacén y entrega a Facturación.

---

## II. Corrientes de entrada

Este módulo recibe trabajo de **dos fuentes simultáneas**:

| Corriente | Origen | Condición de entrada |
| --- | --- | --- |
| **Entregas a clientes** | Almacén — material preparado | Pedido listo al 100 % (o el cliente autoriza envío incompleto) |
| **Recolecciones de proveedor** | Compras-abasto | Proveedor confirma que el material está disponible para recolectar |

Ambas corrientes se integran en la misma programación de ruta: el chofer puede hacer entregas **y** recolecciones en el mismo viaje.

---

## III. Flujo de programación y despacho

### Paso 1 — Verificación de readiness

Antes de programar la salida, el Coordinador de Logística verifica:

- **Entregas a clientes:** el pedido está preparado al 100 % en Almacén —o el cliente autorizó explícitamente el envío con faltante (proceso documentado en `RTB-PRO-ALM-01`).
- **Recolecciones:** el proveedor confirmó (por escrito o en el sistema) que el material está disponible.

> Si un pedido no cumple la condición, **no entra al despacho**. Espera al siguiente ciclo de ruta o al cumplimiento de la condición.

---

### Paso 2 — Agrupación y programación del calendario

El Coordinador agrupa los pedidos listos **por zona** y define los días de salida.

**Días de referencia: miércoles y sábado.** El calendario no es fijo: se ajusta según el volumen de pedidos listos y la urgencia declarada. La frecuencia mínima es dos veces por semana; se pueden agregar salidas intermedias con autorización.

| Criterio | Acción |
| --- | --- |
| Pedidos suficientes para una ruta rentable | Se programa salida en el próximo día de referencia |
| Volumen bajo | Se consolida con la siguiente fecha |
| Urgencia declarada (ver Sección VI) | Decisión caso a caso por el Coordinador |

---

### Paso 3 — Clasificación local / foráneo y asignación de modo

Cada pedido se clasifica:

| Destino | Modo de envío | Responsable del traslado |
| --- | --- | --- |
| **Local** (zona de reparto del chofer) | Chofer propio RTB | Coordinador de Logística + Chofer |
| **Foráneo** (fuera de la zona local) | Fletadora | Coordinador de Logística (genera guía/etiqueta) |

**Regla del viaje combinado:** cuando en el mismo despacho hay paquetes locales *y* foráneos, el chofer **sale con todos los paquetes**. La primera parada es el drop-off en la fletadora; a partir de ahí continúa con la ruta local. Un solo viaje, sin retorno al almacén entre corrientes.

---

### Paso 4 — Sistema de fletera (foráneo)

Los envíos foráneos se gestionan a través del sistema Notion/n8n integrado con la(s) fletadora(s). El Coordinador de Logística:

1. Genera la **guía de envío** en el sistema (datos del destinatario, dimensiones, peso, zona).
2. El sistema aplica la **tarifa por zona** y registra el costo.
3. Se imprime o genera la **etiqueta** para pegar en el paquete.
4. El sistema activa el **rastreo** (tracking) del envío, visible para el área y comunicable al cliente.
5. El chofer lleva los paquetes foráneos al punto de drop-off de la fletadora en su primer parada de ruta.

> La fletera hace la recolección en nuestro almacén solo cuando el volumen o el acuerdo con la fletera lo contempla. En el modelo habitual, el chofer lleva los paquetes.

---

### Paso 5 — Asignación del chofer y carga

1. El Coordinador **asigna al chofer en la plataforma** (Notion u otro sistema) con los pedidos del día.
2. El **Chofer y Almacén preparan la carga** juntos: verifican que los paquetes correspondan a la lista de despacho, que estén etiquetados y en orden de ruta.
3. Se confirma la lista de despacho firmada antes de salir.

---

### Paso 6 — Chequeo de la unidad (RIT)

**Obligatorio antes de cada salida.** El Chofer realiza el chequeo de la unidad siguiendo el **RIT (Registro de Inspección de la Unidad / protocolo de aptitud del conductor)**:

- Estado general del vehículo (llantas, luces, frenos, líquidos).
- Aptitud del conductor (protocolo RIT vigente).
- Confirmación en el sistema antes de arrancar.

> Si la unidad no pasa el chequeo, **no sale**. El Coordinador gestiona la alternativa (otra unidad, reagendamiento o fletera).

---

### Paso 7 — Salida a ruta

El Chofer ejecuta el recorrido según el orden de ruta asignado:

**Secuencia habitual en viaje combinado:**
1. Drop-off de paquetes foráneos en la fletadora (primera parada).
2. Entregas locales a clientes en el orden de zona.
3. Recolecciones en proveedores (si las hay en ese día).

El Chofer mantiene comunicación con el Coordinador durante la ruta para reportar incidencias (cliente ausente, dirección incorrecta, accidente, demora).

---

### Paso 8 — Regreso, descarga y cierre de ruta

Al terminar el recorrido:

1. **Chofer y Almacén descargan** el material recolectado (de proveedores) y los paquetes no entregados (si los hay).
2. El material recolectado de proveedores pasa directamente a **entrada a inventario** (proceso `RTB-PRO-ALM-01`, Sección V).
3. Los paquetes no entregados se reagendan o se resuelven con el cliente.
4. El Chofer entrega al Coordinador la **hoja de ruta firmada** con evidencia de entrega (acuse, foto, firma del cliente).

---

### Paso 9 — Confirmación al cliente y traspaso a Facturación

1. El Coordinador (o sistema) **envía la confirmación de entrega al cliente** por el canal establecido (correo, WhatsApp, portal del cliente).
2. Los **documentos de entrega** (acuse, remisión firmada, comprobante de fletera) pasan a **Facturación** para que los integre al sistema y proceda con la factura.

A partir de aquí el flujo continúa en **④ Facturación y cobranza**.

---

## IV. Urgencias y salidas extraordinarias

> **Estado actual: sin regla definida.** Las urgencias fuera de los días de referencia se manejan caso por caso. Se registra como **punto de acción pendiente** para que Dirección y el Coordinador de Logística definan la política.

**Preguntas abiertas que requieren decisión:**

| Pregunta | Opciones frecuentes en el sector |
| --- | --- |
| ¿Quién autoriza una salida extraordinaria? | Coordinador solo / requiere Dirección |
| ¿El costo extra (combustible, tiempo) se absorbe o se cobra? | Cargo al cliente / absorción interna |
| ¿Hay un límite de urgencias por mes o por cliente? | Sin límite / cuota definida |
| ¿Las urgencias siempre van por fletera exprés o puede salir el chofer? | Solo fletera / según disponibilidad |

Hasta que se tome la decisión, el proceso para urgencias es: **el Coordinador consulta a Dirección y documenta la resolución en el sistema antes de ejecutar**.

---

## V. Roles del módulo

### Puestos que operan este módulo

*(Ver catálogo completo en `RTB-ORG-01_Organigrama_V2.0.md`)*

| Puesto | Rol en este módulo | Estado |
| --- | --- | --- |
| **Coordinador de Logística** | Dueño del módulo. Programa rutas, clasifica envíos, genera guías de fletera, asigna al chofer, supervisa el chequeo RIT y el cierre de ruta | Actual |
| **Chofer** | Ejecuta el recorrido: drop-off en fletera, entregas locales, recolecciones, chequeo de unidad, hoja de ruta | Actual |
| **Almacén** | Prepara y carga el material; descarga lo recolectado; valida la lista de despacho antes de la salida | Actual (módulo compartido con `RTB-PRO-ALM-01`) |
| **Coordinador de Almacén** | Cuando exista: supervisa la interfaz Almacén → Rutas y la calidad de la carga | Previsto |

**TI/Sistema (Notion/n8n):** mantiene el módulo de fletera (guías, tarifas, tracking) y el registro de rutas; no es operador del proceso logístico.

---

## VI. RACI del módulo

| Actividad | Coord. Logística | Chofer | Almacén | Compras | Facturación | Dirección |
| --- | --- | --- | --- | --- | --- | --- |
| Verificar readiness del pedido/recolección | **R** | I | I | I | — | — |
| Programar días de ruta y agrupación por zonas | **R** | I | I | — | — | I |
| Generar guías y etiquetas de fletera | **R** | — | — | — | — | — |
| Asignar chofer y confirmar lista de despacho | **R** | A | C | — | — | — |
| Chequeo de unidad (RIT) | I | **R** | — | — | — | — |
| Ejecutar ruta (entregas, drop-off, recolecciones) | I | **R** | — | — | — | — |
| Cargar y descargar material | I | C | **R** | — | — | — |
| Enviar confirmación al cliente | **R** | I | — | — | I | — |
| Traspasar documentos a Facturación | **R** | — | — | — | A | — |
| Autorizar salidas extraordinarias (urgencias) | C | — | — | — | — | **R** |

> **R** = Responsable · **A** = Aprobador · **C** = Consultado · **I** = Informado.

---

## VII. Reglas del módulo

1. **No sale sin readiness.** Ningún pedido sale si no está preparado al 100 % —o si el cliente no autorizó explícitamente el envío incompleto.
2. **No sale sin chequeo.** El RIT es previo a cada salida, sin excepción. La unidad que no pasa el RIT no sale.
3. **Foráneo siempre por fletera.** Ningún envío fuera de la zona local se hace con el chofer propio sin autorización expresa.
4. **Viaje combinado: fletera primero.** Cuando hay paquetes locales y foráneos en el mismo despacho, el drop-off en la fletera es la primera parada.
5. **Días de referencia, no días fijos.** Miércoles y sábado son el ritmo base; el Coordinador ajusta según carga y urgencias autorizadas.
6. **Recolecciones entran a inventario el mismo día.** El material recolectado de proveedores se registra en almacén al regresar, sin pasar la noche sin entrada.
7. **Documentos de entrega a Facturación ese día.** Los acuses y remisiones firmadas no esperan al día siguiente para trasladarse a Facturación.
8. **Urgencias sin regla = Dirección decide.** Hasta que exista una política formal, toda salida extraordinaria requiere aval del Coordinador y autorización de Dirección, documentada en el sistema.

---

## VIII. Conexión con otros módulos

| Módulo | Punto de conexión |
| --- | --- |
| **② Almacén / Preparación** | Rutas recibe el material listo. Almacén carga la unidad y descarga lo recolectado. Interfaz bidireccional continua. |
| **Compras-abasto** | Rutas recibe la confirmación del proveedor para arrancar la recolección. El material recolectado regresa a Almacén como entrada a inventario. |
| **④ Facturación y cobranza** | Rutas traspasa los documentos de entrega (acuses, remisiones firmadas) para que Facturación integre y emita el CFDI. |
| **④ Cobranza** | La confirmación de entrega es el punto de partida del reloj de cobranza de 90 días (cuando ya existe la PO). |
| **Cliente** | La confirmación de entrega cierra el ciclo logístico visible para el cliente. Canal: correo / WhatsApp / portal. |

---

*Módulo de Programación de Rutas y Envíos · Refacciones Tomás Badillo, S.A. de C.V. · Folio RTB-PRO-RUT-01 · V1.0 · Julio 2026 · Azcapotzalco, CDMX*
