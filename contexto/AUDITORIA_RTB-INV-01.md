# Auditoría — Submódulo RTB-INV-01 Productos, Costos e Inventario

Fecha: 2026-08-05. El paquete de origen (`RTB_Modulo_Productos_Costos.zip` +
`01_analisis_funcional.md` / `02_esquema_sql_productos_inventario.sql` /
`03_flujo_conteos_fisicos.md`) es mucho más delgado que el de RTB-ENT-01:
~100 líneas totales, un DDL de 6 tablas sin RLS, sin `GRANT`, sin auditoría y
sin triggers, más dos notas funcionales de una página. **No trae código, ni
procedimientos operativos, ni mockups.** Y a diferencia de RTB-ENT-01, esta
vez sí existía documentación operativa **real** de RTB para contrastarlo: el
reporte *Existencias de Inventario RTB-INV-01* (folio real, corte
04/08/2026), el *Acta de Conteo Físico CIE-CON-01* (V1.0→V3.0, firmada) y el
*Registro de Discrepancias CIE-DIS-01* — los tres en `~/Descargas`, fuera del
repositorio. Ese material mide fallas concretas del proceso actual de RTB
(−$37,919.77 por unidad de medida mal definida, 34 de 34 ajustes sin
autorización registrada, 73.9 % del catálogo sin ubicación) que el paquete ni
menciona. Este documento recoge lo encontrado y cómo se resolvió al
implementar `db/migrations/009_inventario_catalogo.sql` … `014_inventario_kpis.sql`.

## Defectos bloqueantes (la spec no arranca tal cual)

### 1. Sin RLS, `GRANT`, auditoría ni triggers
El DDL original son 6 `CREATE TABLE IF NOT EXISTS` sueltos: sin
`ENABLE ROW LEVEL SECURITY`, sin `REVOKE`/`GRANT`, sin `audit_row()`, sin
generación de folio. Aplicado tal cual, cualquier fila de `authenticated`
sería legible y escribible por completo (Supabase concede `ALL` por defecto
en tablas nuevas de `public`). **Corrección:** las ~21 tablas nuevas llevan
la doble barrera ya establecida en 001–004 (`REVOKE ALL` + `GRANT` explícito,
a veces por columna, antes de la política RLS), auditoría vía `audit_row()`
donde aporta un diff real, y folio autogenerado donde el negocio lo pide.

### 2. `sku TEXT UNIQUE` no sobrevive a los datos reales
El reporte real de existencias tiene pares como `RTB-ILU-SL18B`/`RTB-ILU-SL18C`
que **comparten SKU y nombre** (limitación real, Acta CIE-CON-01 §IX), y
códigos internos truncados como `RTB-REFU-` repetidos en dos productos
distintos. Un `UNIQUE` simple sobre `sku` habría bloqueado la carga del
catálogo real desde el primer intento. **Corrección:** ningún campo es la
identidad única sin condiciones. `codigo_interno` es único **sólo** entre
filas `estado = 'activo'` (índice único parcial, mismo idioma que
`uq_entidades_rfc` de 002); `sku` no lleva restricción de unicidad en
absoluto — se normaliza en una columna generada (`sku_normalizado`) para
cruces de catálogo↔proveedor, nunca para exigir unicidad.

### 3. `unidad_medida` como `CHECK IN (...)` de 3 valores fijos
El paquete fija `'Pz' | 'Paquete' | 'M Lineal'` y llama a esto "unidad base
inmutable". Es exactamente la causa **medida** de la mayor pérdida real de
RTB: 14 de los 27 folios de no conformidad del corte de julio (−2,811
piezas, −$37,919.77) son por "familia con unidad de medida mal definida:
salidas de kit descargadas contra un registro llevado por pieza" (Registro
de Discrepancias CIE-DIS-01 §VI). Un enum de 3 valores no puede llevar un
factor de conversión, y "inmutable" congela el error en vez de permitir
corregirlo con control. **Corrección:** catálogo `unidades_medida` +
`productos.contenido_por_unidad`/`unidad_contenido_id`, con el factor
**congelado por movimiento** en el kardex (011) y la única vía de cambio
siendo una `producto_unidad_redefiniciones` autorizada (013) — ver hallazgo 14.

## Contradicciones con la realidad operativa de RTB

### 4. "Real" y "Teórico" están invertidos
El análisis funcional del paquete define: *"Inventario Real = piezas
validadas en almacén"* e *"Inventario Teórico = Real + entradas/salidas
pendientes"* — es decir, teórico es una **proyección de compromisos** sobre
el real. Es lo opuesto de como RTB usa esos mismos dos términos hoy, en
`contexto/RTB-PRO-COM-01_Modulo_Compras.md` §III y en los tres documentos
reales de `~/Descargas`: ahí **Teórica** es el acumulador documental (lo que
el sistema declara, suma de entradas y salidas registradas) y **Física** es
la medición del último conteo validado — la diferencia entre ambas es una
**señal de error de conciliación**, no una proyección de negocio. Los
compromisos abiertos (reservas) son un tercer concepto que ninguno de los
dos documentos del paquete modela: ALM-01 §VIII regla 4 exige que "las
piezas separadas se marcan como reservadas en el sistema inmediatamente".
**Manda la realidad operativa** — más específica y más reciente que el
análisis funcional del paquete. **Corrección:** `inventario_existencias`
separa tres columnas independientes (`cantidad_teorica`, `cantidad_fisica`,
`cantidad_apartada`), con el vocabulario correcto.

### 5. `ubicaciones_racks` duplica un modelo que ya existe, auditado
El paquete propone una tabla nueva y plana (`nombre_rack`, `nivel`,
`UNIQUE(nombre_rack, nivel)`). RTB-ENT-01 ya implementó y auditó
`ubicaciones_internas`: árbol de 1–5 niveles con código heredado,
`clasificacion` física/lógica/especial y `uso_especial` (`cuarentena`,
`recepcion`, `picking`...) — exactamente lo que un conteo con cuarentena y
cross-dock necesita, y el comentario de esa migración ya dice *"la ocupación
NO se guarda aquí: es un cálculo de Almacén (módulo futuro)"*, anticipando
este submódulo. Crear `ubicaciones_racks` habría repetido los hallazgos 6 y
9 de `AUDITORIA_RTB-ENT-01.md` (dos taxonomías de ubicación conviviendo) y
dejado sin resolver los 4 formatos sucios de ubicación que sí existen en el
reporte real (`'C-1 (10PZAS) / E-1(40 PZAS)'`, `'CASITA'`, `'SIN UBICACIÓN'`,
segmentos sueltos como `'1'`). **Manda 003.** No se crea `ubicaciones_racks`;
el inventario referencia `ubicaciones_internas(id)` directamente.

### 6. "Diferencia ≠ 0 → movimiento `CONTEO_FISICO`" contradice la regla dura de RTB
`03_flujo_conteos_fisicos.md` dice literalmente: *"Si la diferencia es > 0:
Se genera un movimiento de tipo `CONTEO_FISICO` (Entrada)... Si es < 0:
salida"* — un ajuste automático del teórico, sin autorización de un tercero,
sólo con "requiere rol Administrador o Gerente". El Registro de Discrepancias
real (CIE-DIS-01) lo prohíbe de forma explícita: *"Una diferencia sin causa
identificada no se ajusta: se declara como hallazgo. Ajustar sin entender es
hacer que el problema desaparezca de la vista sin que desaparezca del
almacén."* Y mide el costo de no tener este control: *"Ajustes aplicados sin
autorización registrada: 34 de 34."* **Manda CIE-DIS-01.** **Corrección:**
un movimiento de kardex que corrige el teórico (`entrada_ajuste`,
`salida_ajuste`, y también `entrada_conteo`/`salida_conteo` — ver hallazgo
15) sólo es posible con un `inventario_ajustes` en estado `autorizado`, y
`aju_no_autoaprobacion_chk` (013) hace estructuralmente imposible que el
autorizador sea el propio solicitante — no es una regla de la API, es un
`CHECK` de Postgres.

### 7. Roles "Administrador"/"Gerente" no existen
`03_flujo_conteos_fisicos.md` exige el rol "Administrador" o "Gerente" para
aplicar un conteo. El `CHECK` de `profiles.role` (001) no tiene ninguno de
los dos. **Corrección:** `super_admin`/`direccion` autorizan ajustes y firman
el cierre de un conteo como `gerente_operaciones`; `almacen` opera el
conteo; `compras` gobierna costos y unidades. Mismo criterio que la
traducción `admin→direccion` de `AUDITORIA_RTB-ENT-01.md` hallazgo 2.

### 8. Prohibición de stock negativo, sin escotilla para la historia real
El paquete plantea el bloqueo como regla absoluta. El reporte real de
existencias tiene **6 físicos negativos y 18 teóricos negativos** ya en
producción (Existencias de Inventario RTB-INV-01 §VI, *"Existencias
negativas — fuera del reporte"*). Un `CHECK` simple habría hecho imposible
migrar esa historia. **Corrección:** el bloqueo vive en el trigger del
kardex (no en un `CHECK`), con una escotilla `permite_negativo` auditada
(motivo obligatorio) que está **fuera del `GRANT INSERT`** de `authenticated`
— sólo la API con `service_role` la activa, para carga inicial o ajuste
autorizado. `cantidad_fisica >= 0` sí es un `CHECK` duro (un físico negativo
es imposible de por sí — corrección #9 real de CIE-DIS-01); `cantidad_teorica`
no lleva `CHECK` alguno. Verificado con un intento de venta que dejaría
saldo negativo — ver §Verificación.

## Errores de modelo

### 9. Kardex demasiado corto para lo que exige RTB-PRO-ALM-01 §V
El paquete propone 5 tipos (`ENTRADA_COMPRA`, `SALIDA_VENTA`, `AJUSTE_NC`,
`CONTEO_FISICO`, `TRANSFERENCIA`). ALM-01 exige registrar además cross-dock
("el registro de entrada en cross-dock nunca se omite, aunque la pieza no
toque físicamente el estante" — repetido tres veces en el documento),
recolección por chofer, devolución de cliente, material sobrante de ruta, y
el Registro de Discrepancias real nombra "consumo interno" como causa real
de no conformidad. **Corrección:** 16 tipos (8 entrada + 8 salida),
incluido `salida_consumo_interno` nombrado explícitamente en vez de
escondido bajo un "ajuste" genérico. El cross-dock se modela como dos filas
con el mismo `operacion_id`, exigidas por un *constraint trigger diferido*
(`movimiento_valida_par()`): un `INSERT` de una sola pierna falla en el
**commit**, invirtiendo la falla actual (hoy omitir la entrada es gratis).

### 10. Sin costo — ni promedio, ni catálogo, ni transacción
El análisis funcional dice *"el costo de inventario se calcula mediante el
promedio de compras"* pero el DDL no tiene ninguna columna de costo en
ningún lado. El Acta de Conteo Físico real mide el efecto: *"40 SKU con
existencia sin costo unitario"* y *"17 de 23 discrepancias sin costo
unitario"*. **Corrección:** tres conceptos de costo deliberadamente
separados — transacción (`inventario_movimientos.costo_unitario`,
inmutable), promedio operativo (`inventario_existencias.costo_promedio`,
sólo lo escribe el trigger, *path-dependent*) y catálogo
(`producto_costos`, con vigencia, cargable retroactivamente con motivo
obligatorio). Es literalmente el acta real: *"El costo es un atributo del
catálogo, no un evento del periodo, así que cargarlo de forma retroactiva
corrige la valuación de julio sin alterar lo que pasó en julio."*

### 11. "Bolsa de Ahorro", "Costo Refacción", "Costo Ariba" sin respaldo documental
Estos tres términos del análisis funcional no aparecen en **ningún**
documento de `contexto/` (se grepeó el directorio completo). Son vocabulario
de Notion sin definición de negocio verificable. **Corrección:** no se
inventa un KPI de "ahorro" sobre el costo promedio real; los dos precios se
conservan en `producto_precios_referencia` como dato de referencia **sin
semántica de negocio**, con un `comment on table` explícito que dice esto
— la lista de precios real es responsabilidad de RTB-VEN-01, que todavía no
existe.

### 12. `proveedores_productos` — pendiente declarado en la auditoría anterior
`AUDITORIA_RTB-ENT-01.md` ya había marcado esto como "fuera de alcance por
decisión: aún no existe un maestro de productos al que referenciar". Con
`productos` ya implementado, se cierra: `proveedor_productos` (singular,
mismo criterio de nombre que `proveedor_cuentas_bancarias`) es la lista de
precios de compra por proveedor, con su propia unidad/factor de conversión
(el proveedor puede cotizar por KIT aunque RTB registre por pieza — mismo
defecto que causó la pérdida medida si no se modela aparte).

### 13. Congelamiento inexistente
Ningún documento del paquete menciona bloquear el kardex durante un conteo.
El Acta real lo declara como limitación abierta: *"Sin registro de
cuarentena: el congelamiento no es demostrable."* **Corrección:**
`inventario_congelamientos`, consultada por
`inventario_congelamiento_activo()` desde el propio trigger del kardex —
el bloqueo es real (un `INSERT` de movimiento sobre una ubicación/producto
congelado falla), no una convención de la UI.

### 14. Sin estado de conteo por línea — un `0` no es "no visitada"
El paquete captura sólo `cantidad_fisica`, sin distinguir "nunca se llegó a
esa línea" de "se contó y dio cero". El Acta real lo mide como su primera
limitación: *"1,099 renglones en cero no distinguen contado de no
visitado."* **Corrección:** `estado_conteo` (`no_visitada|contada|recontada|
no_localizada|ubicacion_incorrecta|bloqueada`) con un `CHECK`
(`det_estado_cantidad_chk`) que ata el estado a la nulidad de
`cantidad_fisica` — un `0` físico sólo es válido bajo `no_localizada`,
nunca bajo `no_visitada`.

### 15. Sin vista ciega real, sin quién contó, sin firmas, sin acta versionada
Tres limitaciones más del Acta real sin cobertura en el paquete: *"La vista
no muestra cantidad teórica ni diferencia"* (regla dura, §II) es una
afirmación de comportamiento de UI que en el paquete no tiene ni tabla que
la respalde; *"el export no guarda quién contó cada ubicación"*
(limitación #6); y el acta real está versionada (V1.0→V3.0, con firmas de
cierre). **Corrección:** vista ciega implementada como **privilegio de
columna de Postgres** (`GRANT SELECT` de `inventario_conteo_detalles` omite
`cantidad_teorica`/`diferencia`/`valor_diferencia`/`costo_unitario_snapshot`
— un capturista no las puede leer ni con `curl` directo a PostgREST; la
única puerta es `conteo_conciliacion()`, que devuelve cero filas si no
corresponde); `inventario_conteo_asignaciones` amarra la RLS de captura a
"tu propia asignación activa"; `inventario_conteo_firmas` exige firma de
`supervisor` y `gerente_operaciones` antes de aceptar `estado='cerrado'`
(`inventario_conteos_before_update()`); `inventario_conteo_versiones`
reproduce la columna real del acta, "Qué corrigió", como `CHECK` no vacío.

### 16. Sin capa de discrepancias ni de ajuste — el hallazgo central del Registro real
El paquete no tiene tabla de discrepancias. El Registro de Discrepancias
real (CIE-DIS-01) es, con el Acta de Conteo, el corazón operativo de este
submódulo: define una taxonomía cerrada de `salida` (`UBI`, `CAP`, `AJU`,
`AJU s/s`, `Justificado`, `HAL`, `MEN`), una `banda` de investigación
(`Documental`, `Movimiento`, `Regularización`, `Sistema`) y un "Paso 0 ·
Reubicación" — *"una pieza mal ubicada genera DOS discrepancias: un
faltante donde debía estar y un sobrante donde apareció; antes de rastrear
se busca el par"*. **Corrección:** `inventario_discrepancias` con esa
taxonomía exacta; `dis_causa_chk` es la regla dura del documento
("sin causa no se ajusta") convertida en `CHECK` — sólo `HAL`/`MEN` pueden
ir sin `causa_presunta`+`banda`; `discrepancia_par_id` + `dis_ubi_chk` +
un trigger de validación (`discrepancias_valida_par()`) codifican el Paso 0
(la pareja debe ser el mismo producto, signo opuesto). `inventario_ajustes`
(CIE-AJU-01, citado por CIE-DIS-01 como *"no levantado"* — ver
§Huecos) es de primera clase, espejo estructural de `solicitudes_cambio`
(002). `inventario_hallazgos` sobrevive al cierre del conteo que lo
originó — no se cancela con el acta.

## Hueco encontrado durante la propia implementación (no en el paquete)

### 17. `entrada_conteo`/`salida_conteo` sin exigir autorización
Al diseñar 012 sobre 011 ya aplicado, se detectó que `mov_ajuste_chk` sólo
exigía `ajuste_id` (y por tanto `ajuste_autorizado()`) para
`entrada_ajuste`/`salida_ajuste`. Los tipos `entrada_conteo`/`salida_conteo`
sólo exigían `conteo_id` — un rol con `GRANT INSERT` sobre el kardex
(`almacen`/`compras`/...) podría haber movido el teórico por la puerta de
un conteo sin pasar nunca por autorización, reabriendo exactamente el
hallazgo 6 que se acababa de cerrar. **Corrección**, aplicada al inicio de
`012_inventario_conteos.sql` (`ALTER TABLE`, antes de las tablas nuevas de
ese archivo): los 4 tipos de corrección exigen `ajuste_id` y autorización
por igual. Verificado — ver §Verificación.

### 18. `GRANT INSERT` sin restringir columnas en tablas de ciclo de vida
Al escribir `inventario_conteos` con `GRANT INSERT` sin restricción de
columna (siguiendo el patrón por defecto de `entidades`/`productos`, donde
la creación es libre y sólo el `UPDATE` se restringe), se detectó que la
máquina de estados (`inventario_conteos_before_update()`) **sólo corre en
`UPDATE`**, no en `INSERT` — un `INSERT` directo podría crear una fila ya
`estado='cerrado'`/`'aplicado'` con `cerrado_at`/`aplicado_at` forjados,
saltándose por completo la exigencia de firmas. **Corrección:** `GRANT
INSERT` por columna en `inventario_conteos`, `inventario_ajustes`,
`inventario_discrepancias`, `inventario_hallazgos` y
`producto_unidad_redefiniciones` — cualquier tabla cuyo ciclo de vida
dependa de un `CHECK`/trigger que sólo se dispara en `UPDATE`. Toda fila
nueva nace en su estado inicial (`planificado`/`borrador`/`abierta`/
`abierto`/`pendiente_autorizacion`) por el `DEFAULT`, nunca por elección
del cliente.

## Huecos frente a los módulos que van a consumir esto

- **`RTB-CIE-01`** y **`CIE-AJU-01`** — el Acta y el Registro reales citan
  ambos como documentos normativos (*"RTB-CIE-01 exige autorización de
  Gerencia de Operaciones..."*, *"CIE-AJU-01 · No levantado"*) pero
  **ninguno de los dos existe en `contexto/`**. Se implementaron sus reglas
  tal como las citan los documentos que sí existen (el Acta, el Registro),
  no contra el original — si `RTB-CIE-01`/`CIE-AJU-01` aparecen después con
  contenido distinto, mandan ellos.
- **`RTB-PRO-ALM-01_Modulo_Almacen.md`** es casi silencio sobre productos e
  inventario — es un documento de *proceso* (picking, cross-dock, envíos
  incompletos), no de modelo de datos. Su aporte real a este submódulo es
  la taxonomía de entradas de §V, ya incorporada al kardex.
- **Órdenes de compra / entradas de mercancía** (RTB-COM-01) no existen
  todavía. El kardex las referencia por `referencia_tipo`/`referencia_folio`
  (texto libre) — mismo idioma de punto de extensión que
  `tiene_operaciones_abiertas()` en 002. Cuando exista COM-01, se añade la
  FK real en una migración posterior, no antes.
- **Pedidos/PO** (RTB-VEN-01) tampoco existen. `inventario_apartados.pedido_folio`
  es texto libre por el mismo motivo.

## Bugs encontrados en la propia auditoría de diseño (no por lectura superficial)

Ambos se encontraron redactando el diseño completo de cada migración contra
los documentos reales, antes de aplicar nada — no en producción, pero se
documentan aquí porque habrían sido el mismo tipo de fallo silencioso que
`AUDITORIA_RTB-ENT-01.md` §22 encontró sólo con la UI real:

- Hallazgo 17 (arriba): habría dejado un movimiento de "conteo" mover el
  teórico sin autorización, exactamente lo que este submódulo existe para
  impedir.
- Hallazgo 18 (arriba): habría permitido forjar un conteo ya cerrado sin
  firmas, vía `INSERT` directo en vez de la máquina de estados.

## Fuera de alcance de esta entrega (declarado, no corregido)

- **Lotes, números de serie y caducidad.** Cero evidencia en los documentos
  de RTB. Añadirlos "por si acaso" multiplica por N las filas de
  existencias y de conteo sin un requisito real que lo pida.
- **Costeo PEPS/UEPS y capas de costo.** Sólo promedio ponderado móvil.
  Ningún documento de RTB describe llevar capas de costo.
- **Catálogo genérico de conversión entre unidades** (m↔cm, etc.). Toda
  conversión real medida en RTB es "cuántas piezas trae este empaque", que
  es un atributo del producto (`contenido_por_unidad`), no de la unidad en
  abstracto.
- **"Bolsa de ahorro" como KPI de ahorro** (comparar compra vs. precio de
  referencia). Sin respaldo documental — ver hallazgo 11.
- **Listas de precio de venta reales.** `producto_precios_referencia` sólo
  conserva los números que ya existían en Notion; la lista de precios real
  es RTB-VEN-01.
- **ETL de la carga histórica de Notion.** El esquema está diseñado para
  recibirla (`productos.estado='requiere_depuracion'`, `ubicacion_id NULL`,
  `permite_negativo` con motivo `'carga inicial'`, `costo_origen=
  'carga_inicial'`), pero el script de importación de los 1,388 SKU reales
  es una entrega aparte.
- **Captura móvil offline** y generación de etiquetas/códigos de barras.
- **Notificaciones automáticas de bajo mínimo.** Sin infraestructura de
  email/notificaciones todavía (mismo pendiente que arrastra ENT-01); los
  eventos quedan consultables por `inventario_alerta_stock()`.
- **Semilla de catálogos.** Por decisión explícita del dueño del proyecto
  (la base estaba vacía y así se mantuvo), no se cargaron los 275 SKU con
  existencia ni las 31 ubicaciones del reporte real. Consecuencia a
  documentar: no se puede dar de alta un producto hasta que exista al
  menos una `unidad_medida` y una `producto_familia` — es el fallo seguro,
  no un bug.
- **Subida real de archivos al bucket `soportes-inventario`.** El bucket y
  sus políticas están creados (013); la UI guarda por ahora la ruta del
  soporte como texto libre en vez de un flujo de `upload` con URL firmada
  (mismo patrón que `comprobante-upload-url` de RTB-ENT-01) — queda
  pendiente de una entrega de UI dedicada.

## Verificación aplicada

Contra Supabase real (`dgafffpbhktxadiqmmwl`), no sólo lectura del código
(la base estaba vacía al aplicar las 6 migraciones — sin datos de RTB-ENT-01
en riesgo):

- **Kardex y unidad de medida:** producto con unidad base `KIT` (contenido
  12 `PZ`). Entrada de 5 `KIT` a $100 c/u, salida capturada en `PZ` (24 PZ =
  2 KIT vía el factor inverso `1/contenido_por_unidad`) → saldo final 3
  `KIT`, costo promedio $100 (las salidas no lo alteran). Correcto.
- **Bloqueo de saldo negativo:** una salida que dejaría el saldo por debajo
  de cero se rechaza con `P0001` y mensaje de negocio; verificado que la
  escotilla `permite_negativo` no es alcanzable desde el rol `authenticated`
  (columna fuera del `GRANT INSERT`).
- **Cross-dock:** una sola pierna (`entrada_crossdock` sin su
  `salida_crossdock`) falla en el `COMMIT` por el constraint trigger
  diferido; el par completo en un solo `INSERT` de dos filas se acepta.
- **Máquina de estados de conteo:** `planificado → cerrado` directo se
  rechaza (`42501`); el camino legal
  `planificado → congelado → en_captura → en_conciliacion` se acepta;
  `cerrado` sin firma de `supervisor`+`gerente_operaciones` se rechaza;
  tras firmar ambos roles, `cerrado` y luego `aplicado` se aceptan.
- **Ajuste autorizado:** `aju_no_autoaprobacion_chk` rechaza
  `autorizador_id = solicitante_id`; `ajuste_autorizado()` devuelve `false`
  para un ajuste `pendiente_autorizacion`; un movimiento
  `entrada_ajuste`/`entrada_conteo`/`salida_conteo` referenciando un ajuste
  no autorizado se rechaza con `42501` (hallazgo 17 reverificado tras la
  corrección).
- **Vista ciega por privilegio de columna, con el rol Postgres real
  (`authenticated`, no `postgres`):** `select cantidad_teorica from
  inventario_conteo_detalles` falla con `insufficient_privilege`;
  `insert`/`update` nombrando `estado`, `permite_negativo` o `ajuste_id` en
  columnas fuera del `GRANT` fallan igual, en las tablas `inventario_conteos`,
  `inventario_movimientos` y `inventario_ajustes` — la protección funciona
  con el rol de Postgres real, no sólo como superusuario.
- `get_advisors` (security + performance) sin hallazgos `ERROR`. Los `WARN`
  de `SECURITY DEFINER` son la misma clase ya aceptada desde la migración
  001 (13 funciones nuevas, todas con justificación escrita en su
  cabecera); las 66 entradas `unindexed_foreign_keys` restantes son
  columnas `created_by`/`updated_by`/`aprobador`-tipo, sin excepción — el
  mismo patrón que ya tienen `entidades`/`ubicaciones_internas` desde antes
  de este submódulo, no un hueco nuevo; las 73 `unused_index` son
  esperables con la base vacía.
- `docker build --target builder` (con `typescript.ignoreBuildErrors:
  false`) y `npx tsc --noEmit` completan sin errores con las ~35 rutas de
  API y las ~14 páginas nuevas, verificado de forma incremental después de
  cada archivo (types → lib → API → UI), no sólo al final.

**Pendiente de esta verificación (no bloqueante, declarado):** el recorrido
clic a clic en la app real con sesión de `super_admin` y con **al menos una
sesión de rol `almacen`** (la vista ciega y los `GRANT` por columna sólo se
prueban de verdad con el rol operativo — en RTB-ENT-01 los dos únicos bugs
reales que sobrevivieron a la lectura de código y a las pruebas SQL
aparecieron ahí, ver hallazgo 22 de `AUDITORIA_RTB-ENT-01.md`) queda para
cuando exista un usuario de prueba con ese rol; la base sigue con un solo
perfil real (`super_admin`) por decisión explícita de no crear datos de
prueba adicionales esta sesión. Junto con la subida real de archivos al
bucket `soportes-inventario` (ver "Fuera de alcance" arriba), son los dos
pendientes declarados de esta entrega — repetido en `CLAUDE.md` → TODO para
que no se pierda entre sesiones.
