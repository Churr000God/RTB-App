# Campaña de QA integral por navegador + medición de rendimiento — RTB-App (2026-08-06, cierre de jornada)

Verificación end-to-end de los 4 bloques de trabajo del día (catálogo de marcas,
corrección completa de la auditoría QA de roles, siglas + imágenes de producto,
ubicación geográfica y mapas) con sesiones reales de navegador para los 8 roles,
usando la extensión Claude in Chrome. Complementa —no sustituye—
`AUDITORIA_QA_ROLES_2026-08-06.md` y `CORRECCION_QA_ROLES_2026-08-06.md`: aquella
campaña probó los hallazgos E-01…E-11 uno por uno el mismo día que se corrigieron;
ésta es la primera vez que se recorre **todo junto**, con los 4 bloques de trabajo
del día ya integrados en el mismo árbol de código.

## 0. Resumen ejecutivo

**Semáforo por módulo:**

| Módulo | Estado |
|---|---|
| Autenticación / sesiones por rol | 🟢 Los 8 usuarios QA activos, cuenta del dueño intacta |
| Catálogos (marcas/familias/categorías/unidades) | 🟢 Alta, gobierno por rol, sin columna duplicada |
| Conteos físicos — captura y firmas | 🟢 Congelar, vista ciega, captura, conciliación, firmas: todo funciona |
| **Conteos físicos — "Aplicar al inventario"** | 🟢 **Corregido 2026-08-07 — ver B-00, `db/migrations/025_conteo_puente_ajuste.sql`** |
| Ajustes de inventario (autorización + kardex) | 🟢 Segregación de funciones y guardrail de saldo negativo funcionan |
| Discrepancias / Hallazgos / Redefiniciones | 🟢 Las 3 pantallas nuevas del día operan sin error |
| Imágenes de producto (galería, principal, quitar) | 🟢 Ciclo completo sin el choque de índice único que motivó 022/023 |
| Entidades (siglas, datos generales editables, direcciones) | 🟢 Edición real confirmada, CLABE enmascarada para `direccion` |
| Mapa / geocodificación | 🟡 Funcional (hover, buscador, leyenda, navegación) — un dato de prueba con geografía inconsistente, sin repro de geocodificación en vivo |
| Permisos por rol (8 roles) | 🟢 Denegaciones por API confirmadas en los 5 roles con smoke test |

**El hallazgo que había que resolver antes de dar por cerrado RTB-INV-01 — corregido 2026-08-07:**

**B-00 — "Aplicar al inventario" no corrige el inventario real.** El botón pasa el
conteo a estado "Aplicado" y no da ningún error, pero `cantidad_teorica` (el número
que usa el resto del sistema) nunca cambia y no se genera un solo movimiento de
kardex. La corrección del 06/08 (`016_qa_correcciones.sql`) resolvió que E-01/E-02/E-03
fallaran con errores crudos de Postgres, pero dejó sin resolver el problema de fondo
que E-03 describía en la auditoría original ("un conteo Aplicado no aplica nada") —
sigue siendo literalmente cierto para la única cantidad que le importa a Ventas,
Compras y Almacén. Detalle completo en §2.

## 1. Alcance y método

- **Usuarios**: los 8 `qa.<rol>@qa.refacrtb.mx` (contraseña `RtbQA-2026!`,
  ya activos desde la campaña anterior). La cuenta del dueño
  (`sistemas@refacrtb.com.mx`) no se tocó en ningún momento.
- **Profundidad**: recorrido completo con escritura real (prefijo `QA2-`) en
  `super_admin`, `almacen` y `direccion` — los tres roles que ejecutan el circuito
  crítico de inventario de principio a fin. Smoke test + verificación negativa por
  API (`fetch` directo a las rutas mutantes) en `ventas`, `compras`, `logistica`,
  `facturacion`, `finanzas`.
- **Verificación de cada acción crítica contra la base de datos real** (MCP de
  Supabase, proyecto `RTB-App` ref `dgafffpbhktxadiqmmwl`), no sólo contra lo que
  muestra la pantalla — así se encontró B-00 y B-01: la UI no mostraba ningún error.
- **Entorno**: `docker compose up -d --force-recreate web` (recreación obligatoria
  para que `env_file` tomara los tokens de Mapbox — gotcha ya documentado).
  Contenedor en `target: dev` (`next dev`), no un build de producción — ver §3.

## 2. Hallazgos

### B-00 (S1 — crítico) — "Aplicar al inventario" no actualiza `cantidad_teorica` — ✅ CORREGIDO 2026-08-07

> **Actualización 2026-08-07:** el diagnóstico de este hallazgo describía
> el bug como "no genera kardex", pero verificando a fondo antes de
> corregir resultó que ese comportamiento es intencional (CIE-DIS-01,
> "una diferencia sin causa identificada no se ajusta"), codificado en
> `mov_ajuste_chk`/`ajuste_autorizado()`/`aju_no_autoaprobacion_chk` desde
> el propio RTB-INV-01. El bug real era que faltaba el puente entre
> "conteo aplicado" y "ajuste autorizado" — el usuario tenía que capturar
> cada discrepancia y cada línea de ajuste a mano. Corregido con
> `db/migrations/025_conteo_puente_ajuste.sql`: al aplicar, se genera
> automáticamente una discrepancia por diferencia y un ajuste borrador con
> sus líneas; el teórico sigue sin cambiar hasta que ese ajuste se envíe,
> lo autorice otra persona y se aplique. Verificado por SQL (rol
> simulado) y clic a clic con dos usuarios reales
> (`sessions/2026-08-07-correccion-qa-b00-b01-optimizaciones.md`). El
> mismo circuito de verificación destapó dos bugs adicionales
> preexistentes sin relación con B-00 en sí (trigger de
> `inventario_ajuste_lineas` con columna inexistente, y "Aplicar al
> kardex" no atómico) — corregidos en `026`/`027`, ver CLAUDE.md.


- **Repro**: conteo `CNT-000013` (QA2, tipo general), rol `almacen` crea → congela
  → asigna capturista → captura 8 y 3 piezas (vista ciega, físico real). Rol
  `direccion` firma como supervisor y gerente_operaciones, cierra, y pulsa
  "Aplicar al inventario".
- **Antes de aplicar**: `inventario_existencias.cantidad_teorica` = 100 y 38
  (productos RTB-AHO-000005/000003).
- **Resultado del clic**: `POST /api/inventario/conteos/[id]/aplicar` → `200`,
  el conteo pasa a estado "Aplicado", `fecha_ultimo_conteo` avanza. Ningún error
  visible en pantalla ni en consola.
- **Pero `cantidad_teorica` sigue en 100 y 38.** Lo único que cambió fue una
  columna lateral, `cantidad_fisica` (= 8 y 3) — el número que de verdad usa el
  resto del sistema (kardex, apartados, dashboards) nunca se tocó. Cero filas
  nuevas en `inventario_movimientos` para este conteo.
- **Causa raíz** (confirmada leyendo el código, no por inferencia):
  `inventario_aplicar_conteo()` en `db/migrations/016_qa_correcciones.sql:259-299`
  hace
  ```sql
  update public.inventario_existencias e
     set cantidad_fisica = d.cantidad_fisica,
         fecha_ultimo_conteo = now(),
         conteo_id_ultimo = p_conteo_id
    from public.inventario_conteo_detalles d
   where ...
  ```
  — nunca escribe `cantidad_teorica` y nunca inserta en `inventario_movimientos`.
- **Contraste que confirma que el kardex real sí funciona**: se probó el mismo tipo
  de reconciliación por la vía de un Ajuste autorizado (`AJU-000005`, botón
  "Aplicar al kardex", que sí inserta `entrada_ajuste`/`salida_ajuste` en
  `inventario_movimientos`). Ahí el sistema **rechazó correctamente** la operación
  con un `400` — "Saldo negativo no permitido" — por una inconsistencia real de mis
  propios datos de prueba (la línea del ajuste apuntaba a una ubicación sin
  existencia previa). Confirma que la vía Ajustes → kardex sí reconcilia
  `cantidad_teorica` cuando los datos son consistentes; la vía Conteos
  (`inventario_aplicar_conteo()`) simplemente nunca pasa por ahí.
- **No se corrigió en esta sesión.** Es un cambio de lógica de negocio central
  (generar movimientos de kardex desde un conteo) con las mismas trampas de
  autorización que ya documenta CLAUDE.md para `mov_ajuste_chk` — merece revisión
  del dueño del proyecto antes de tocarse, no un parche de última hora al cierre de
  una campaña de QA. **Recomendado como el primer punto de la sesión de mañana.**

### B-01 (S2, confianza media) — una transición de estado devolvió 200 sin persistir — ✅ CORREGIDO 2026-08-07

> **Actualización 2026-08-07:** confirmado real (no era flakiness de la
> herramienta de automatización). Causa raíz: `estado/route.ts` hacía
> `.update(...)` sin `.select()` — supabase-js manda
> `Prefer: return=minimal`, así que PostgREST responde `204` tanto si el
> `UPDATE` afectó una fila como si el `USING` de la política RLS filtró la
> fila en silencio (`error === null` en ambos casos). Corregido con el
> patrón `.select('id')` + `if (!data.length)` que ya usaban otras dos
> rutas del repo, aplicado a las 19 rutas con el mismo patrón latente
> (ver CLAUDE.md → Gotchas). Reproducido y confirmado corregido con un
> clic real, sin herramientas de automatización de por medio, en
> `sessions/2026-08-07-correccion-qa-b00-b01-optimizaciones.md`.


- Conteo `CNT-000013`, rol `almacen`. Clic en "Pasar a En conciliación":
  `POST /estado` devolvió `200 {"success":true}`. Tras una recarga completa de la
  página (no navegación suave — nueva petición al servidor de punta a punta), la
  pantalla **y la base de datos** seguían mostrando el estado anterior
  (`en_captura`).
- Una segunda llamada, idéntica byte a byte, sí persistió (`updated_at` avanzó,
  estado pasó a `en_conciliacion`).
- Archivo: `app/app/api/inventario/conteos/[id]/estado/route.ts:36-50`. Hipótesis:
  alguna condición de carrera entre la lectura de `estado` para validar la
  transición y el `UPDATE` posterior — no se profundizó más por tiempo.
- **Nota metodológica** — no sobre-reportar: casos parecidos con "Firmar como
  contador" y con el combobox de producto de "Nueva discrepancia" resultaron ser
  un problema de la herramienta de automatización (el clic de mouse sobre un ítem
  de `cmdk` no siempre dispara `onSelect`; seleccionar con teclado, Enter tras
  filtrar, funcionó siempre) — **no** son bugs de la app, y se excluyen aquí. El
  caso de B-01 es distinto: ahí el clic sí generó una petición de red real con
  `200` antes de fallar en persistir, así que no puede explicarse por un clic que
  nunca llegó al botón.
- **Impacto si se confirma con una segunda repro sin herramientas de automatización
  de por medio**: un usuario puede creer que avanzó (o firmó) un conteo porque no
  vio ningún error, y descubrir después que no pasó nada.

### Nota — dato de mapa preexistente con geografía inconsistente

"QA Centro de Pruebas" (`ubicaciones_internas`, sembrado en una sesión anterior)
tiene una dirección que dice "Ciudad de México" pero un `entidad_federativa` de
"Mexican Riviera" (no es un estado mexicano — es una zona turística de la costa del
Pacífico) y una coordenada que en el mapa cae en un área que corresponde más bien a
Zapopan, Jalisco. Parece un dato sembrado a mano, no el resultado de una llamada
real a Mapbox — el código de geocodificación (`app/lib/mapas/mapbox.ts`) sí pide
`language=es`/`country=mx` correctamente. **No se ejerció una geocodificación real
en vivo durante esta campaña** (quedó fuera por tiempo) — sigue siendo el bloque con
menos verificación clic a clic del sistema. Recomendado para la próxima sesión.

## 3. Confirmado correcto (verificado clic a clic + SQL, no sólo por pantalla)

- **Congelar un conteo (E-01)**: funciona — congela las líneas reales del alcance.
- **Vista ciega en captura (E-02)**: confirmado, la pantalla de captura no expone
  la cantidad teórica al capturista.
- **Cálculo de `cantidad_fisica` al capturar (017)**: confirmado con datos reales
  (físico tecleado = 8 y 3, `cantidad_fisica` calculada = 8 y 3 — factor de
  conversión 1, unidad PZ en ambos lados; no se pudo ejercer un factor ≠ 1 con los
  productos QA disponibles).
- **Asignar capturista con `<select>` (M-01)**: sin UUID a mano.
- **Firmas (contador/supervisor/gerente_operaciones)**: las tres se registraron
  correctamente en `inventario_conteo_firmas`, con gating de rol correcto
  (`almacen` no ve los botones de supervisor/gerente; `direccion` sí).
- **Ajustes de inventario**: `ProductoCombobox`/`UbicacionSelect`, subida real de
  soporte documental (bucket `soportes-inventario`, URL firmada), segregación de
  funciones ("no puedes autorizar tu propia solicitud" — confirmado que
  `direccion`, al ser un usuario distinto del solicitante `almacen`, sí pudo
  autorizar), y el guardrail de saldo negativo del kardex (`011:534`) rechazando
  correctamente una reconciliación inconsistente.
- **Imágenes de producto (021/022/023)** — el bloque que el propio equipo marcó
  como "nunca probado clic a clic": subir una segunda foto, promover a principal,
  revertir la promoción, y "quitar" una foto (con auto-promoción de la hermana
  activa) — ciclo completo repetido dos veces sin el choque de índice único
  (`23505`) que motivó las migraciones 022/023. Confirmado por SQL en cada paso,
  no sólo por lo que mostraba la pantalla.
- **Discrepancias / Hallazgos / Redefiniciones**: las tres pantallas nuevas del día
  (`DIS-000001`, `HAL-000001`, alta de redefinición) crean registros reales sin
  error.
- **Catálogos**: alta de marca (`QA2-MRC`), columna "Nombre" ya no duplicada
  (E-09), gobierno por rol correcto (`almacen` no ve unidades/familias).
- **Entidades**: `DatosGeneralesCard` editable con persistencia confirmada por SQL
  (antes de esta sesión era de sólo lectura), CLABE enmascarada para `direccion`
  ("acceso restringido P03 §II"), siglas visibles como chip en el listado y en la
  búsqueda.
- **Mapa**: renderiza con mapbox-gl real (no un placeholder), hover abre tarjeta
  sin necesidad de clic, buscador de pines filtra en vivo y hace `flyTo` + popup,
  leyenda de colores por tipo, clic en un pin navega a la ficha/ubicación correcta.
- **404 en español** (E-11) en las 8 rutas de módulos futuros, con badge
  "Próximamente" deshabilitado en el sidebar.
- **Permisos por rol** — verificación negativa por API en los 5 roles con smoke
  test: `ventas` y `logistica` reciben `403` al intentar crear un ajuste/conteo;
  `compras` recibe `403` al intentar crear una ubicación; `facturacion` recibe
  `403` en los 4 endpoints mutantes probados (entidades, catálogos, admin/users,
  ajustes); `finanzas` recibe `403` al intentar autorizar un ajuste ajeno a su rol.
  `/dashboard/admin/users` redirige a `/dashboard` para roles sin acceso.

## 4. Rendimiento y consumo de recursos

**Caveat obligatorio: el contenedor corre en `target: dev` (`next dev`), que
compila cada ruta bajo demanda en el primer acceso.** Estos números miden una
sesión de desarrollo, no un build de producción — no son comparables a lo que
vería un usuario final con `next build && next start`.

### Arranque

| Métrica | Valor |
|---|---|
| `next dev` listo (`✓ Ready in`) | 1.9 s |
| Primera compilación de `/login` | 3.3 s |
| Primera respuesta HTTP completa | 3.5 s |

### Tiempos de página (muestra — no las 25 rutas por límite de tiempo de la sesión)

Medidos con `performance.getEntriesByType('navigation')` sobre la pestaña ya
cargada; "peso" es `transferSize` de la respuesta HTML inicial.

| Ruta | TTFB | DOMContentLoaded | Load | Peso HTML |
|---|---|---|---|---|
| `/dashboard` (super_admin) | 2798 ms | 2822 ms | 3124 ms | 5.4 KB |
| `/dashboard/catalogos` | 1994 ms | 2452 ms | 2605 ms | 6.8 KB |
| `/dashboard/solicitudes` | 2100 ms | 2123 ms | 2481 ms | 5.5 KB |

Los tres son "primer acceso" (compilación en caliente incluida) — recargas
posteriores de la misma ruta, ya compilada, respondieron en decenas de
milisegundos según se observó de forma cualitativa durante el resto de la
campaña (no se instrumentaron todas).

**Limitación declarada, no oculta**: no se midió sistemáticamente el par
frío/caliente de las 25 rutas ni la latencia de cada endpoint de API por
separado — la profundidad de la propia campaña (encontrar y verificar B-00/B-01
contra la base de datos) consumió el tiempo reservado para esa instrumentación.
Queda pendiente para la sesión de mañana si se quiere un perfil de rendimiento
completo.

### Recursos del contenedor (muestreo cada 5 s, ~67 minutos de sesión, 674 muestras)

| Métrica | Valor |
|---|---|
| Memoria en reposo (arranque en frío) | 126 MiB |
| Memoria en régimen (tras compilar la mayoría de rutas) | ~1.0–1.2 GiB |
| CPU — mediana | 0.02 % (idle la mayor parte del tiempo) |
| CPU — media | 8.45 % |
| CPU — pico | 357.6 % (ráfaga de compilación multi-núcleo de `next dev`) |

El crecimiento de memoria de 126 MiB a ~1 GiB es el comportamiento esperado de
`next dev`, que mantiene en memoria cada módulo compilado de cada ruta visitada;
no es una fuga — no se observó crecimiento continuo sin límite durante la hora de
prueba, se estabilizó tras los primeros ~15 minutos (cuando ya se habían visitado
la mayoría de las rutas).

## 5. Limpieza de datos QA2

Todo lo creado en esta campaña queda en estado terminal, sin bloquear nada:

| Dato | Estado final |
|---|---|
| `CNT-000013` (conteo) | `aplicado` — terminal, congelamientos auto-liberados |
| `AJU-000005` (ajuste) | `autorizado`, sin aplicar al kardex (bloqueado por el guardrail de saldo negativo — dato de prueba inconsistente, no un bug; se documenta y se deja así en vez de forzarlo por SQL) |
| `DIS-000001` (discrepancia) | Abierta — dato de prueba válido para la próxima sesión, mismo patrón que dejó la campaña anterior |
| `HAL-000001` (hallazgo) | Abierto — ídem |
| `QA2-MRC` (marca) | Activa — dato de catálogo inofensivo |
| Fotos de prueba en "QA Producto de Prueba A" | Una activa (principal), una desactivada — ciclo ya verificado, no se revirtió por ser irrelevante |
| Edición de prueba en `sitio_web` de "QA Proveedor Uno" | **Revertida por SQL** a `NULL` (única limpieza hecha fuera de la app, por ser un campo de texto trivial) |
| `get_advisors` (security) | Sin `ERROR` nuevo — sólo `WARN` ya aceptados en sesiones anteriores (mismo patrón `SECURITY DEFINER`) |

## 6. Pendientes para la sesión de mañana (por prioridad)

1. ~~**B-00**~~ — **corregido 2026-08-07**, ver actualización en §2 y
   `db/migrations/025_conteo_puente_ajuste.sql`.
2. ~~**B-01**~~ — **corregido 2026-08-07**, ver actualización en §2.
3. Geocodificación en vivo con sesión de rol real — bloque que sigue sin
   verificación clic a clic pese a esta campaña.
4. Perfil de rendimiento completo (25 rutas × frío/caliente + latencia de API por
   endpoint) si se quiere ese nivel de detalle.
5. Migración de los 1,388 SKU reales (pendiente heredado, sin relación con esta
   campaña).
