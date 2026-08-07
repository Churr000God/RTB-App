# Sesión 2026-08-06 (cierre de jornada) — Campaña de QA integral por navegador y medición de rendimiento

## Punto de partida

Cuarto y último bloque de trabajo del día. Los tres anteriores (catálogo de
marcas, corrección completa de la auditoría QA de roles, siglas + imágenes de
producto, ubicación geográfica y mapas) ya estaban commiteados, pero nunca se
habían probado **juntos** con sesiones reales de navegador para los 8 roles, y el
rendimiento de la aplicación nunca se había medido. El dueño del proyecto pidió
cerrar el día ejecutando esa campaña completa con la extensión Claude in Chrome:
todos los usuarios de prueba, identificar errores/bugs/mejoras, medir tiempo de
respuesta y consumo de recursos, subir el informe al repositorio, y dejar memoria
y contexto listos para retomar mañana.

## 1. Arranque

`docker compose up -d --force-recreate web` (recreación obligatoria, no
`restart` — gotcha ya documentado: `env_file` no se relee en caliente). Arranque
en frío medido: `next dev` listo en 1.9 s, primera compilación de `/login` en
3.3 s. Sampler de recursos (`docker stats` cada 5 s) lanzado en background para
correr durante toda la campaña — 674 muestras a lo largo de ~67 minutos.

## 2. Recorrido por rol

**`super_admin`**: catálogos (alta de marca `QA2-MRC`, columna "Nombre" ya no
duplicada), solicitudes de cambio, y el bloque menos probado del día — el mapa.
Confirmado con hover (tarjeta sin clic), buscador de pines (`flyTo` + popup),
leyenda de colores, navegación de pin a ficha, y las 8 rutas de módulos futuros
con 404 en español.

**`almacen`**: el circuito completo de un conteo nuevo (`CNT-000013`, QA2) —
crear, congelar, asignar capturista, capturar con vista ciega, más un ajuste con
`ProductoCombobox`/soporte documental real, una discrepancia, un hallazgo, y el
bloque que el propio equipo había marcado como nunca probado clic a clic:
**imágenes de producto**. Se ejerció el ciclo completo (subir, promover a
principal, revertir, quitar con auto-promoción de la hermana) dos veces, con
verificación por SQL en cada paso — el choque de índice único que motivó las
migraciones 022/023 no reapareció.

**`direccion`**: firmó como supervisor y gerente de operaciones, cerró el
conteo, y pulsó "Aplicar al inventario" — ahí apareció el hallazgo más
importante de la sesión (ver §3). También autorizó el ajuste de `almacen`
(confirmando la segregación de funciones), editó datos generales de una entidad
existente con persistencia confirmada por SQL, y comprobó que la CLABE de
cuentas bancarias sigue enmascarada para su rol.

**`ventas`, `compras`, `logistica`, `facturacion`, `finanzas`**: smoke test más
ligero de lo planeado originalmente por límite de tiempo — login, sidebar
correcto, y verificación negativa por llamadas `fetch` directas a los endpoints
mutantes que la matriz de permisos dice que no les tocan (todas devolvieron
`403`, incluidas 4 rutas distintas probadas contra `facturacion`, el rol más
restringido).

## 3. El hallazgo central: B-00

Verificando "Aplicar al inventario" contra la base de datos real (no sólo
contra la pantalla, que no mostraba ningún error) apareció el problema más
serio del día: el botón pasa el conteo a estado "Aplicado" pero
`cantidad_teorica` — el número que usa el resto del sistema — nunca cambia, y
no se genera un solo movimiento de kardex. Leyendo el código de
`inventario_aplicar_conteo()` (`016_qa_correcciones.sql:259-299`) se confirmó
la causa exacta: el `UPDATE` de esa función sólo toca `cantidad_fisica`
(una columna lateral), nunca `cantidad_teorica`, y no inserta en
`inventario_movimientos`. La corrección de la sesión anterior (mismo día)
arregló que E-01/E-02/E-03 fallaran con errores crudos de Postgres, pero dejó
sin resolver el problema de fondo que E-03 describía originalmente — sigue
siendo literalmente cierto que "un conteo Aplicado no aplica nada", para la
única cantidad que le importa al resto de la aplicación.

Como contraste — y para no dejar la impresión de que todo el kardex está
roto — se probó la misma reconciliación por la vía de un Ajuste autorizado
(que sí usa `inventario_movimientos`), y ahí el sistema **rechazó
correctamente** una operación con datos de prueba inconsistentes (guardrail
de saldo negativo, `011_inventario_kardex.sql:534`, funcionando como se
diseñó). No se corrigió B-00 en esta sesión — es un cambio de lógica central
que merece revisión del dueño del proyecto antes de tocarse, no un parche de
última hora.

Un segundo hallazgo (B-01, confianza media) apareció durante el mismo
recorrido: una transición de estado de conteo devolvió `200 {"success":true}`
sin persistir el cambio en la base de datos — sólo una segunda llamada
idéntica lo aplicó de verdad. Documentado con su evidencia completa (network +
SQL) en el informe; se distinguió con cuidado de varios casos que resultaron
ser flakiness de la propia herramienta de automatización (clics de mouse sobre
ítems de `cmdk` que no siempre disparaban `onSelect` — seleccionar por teclado
sí funcionó de forma consistente), para no sobre-reportar bugs de la app que en
realidad eran de la sesión de pruebas.

## 4. Rendimiento

Medido con caveat explícito: el contenedor corre `next dev` (compila cada ruta
bajo demanda), no un build de producción. Arranque en frío, tiempos de página
de una muestra de 3 rutas (TTFB 2–2.8 s en primer acceso), y consumo de
recursos del contenedor durante toda la campaña — memoria estable en ~1 GiB
tras los primeros ~15 minutos (comportamiento esperado de `next dev`, no una
fuga), CPU en 0.02% de mediana con picos de hasta 357% durante compilación
multi-núcleo. No se alcanzó a instrumentar las 25 rutas por completo ni la
latencia de cada endpoint de API por separado — declarado como pendiente, no
ocultado.

## 5. Limpieza

Todo lo creado con prefijo `QA2-` queda en estado terminal (conteo aplicado,
ajuste autorizado sin aplicar por el propio guardrail del sistema,
discrepancia/hallazgo abiertos como dato de prueba — mismo patrón que dejó la
campaña anterior). Única limpieza hecha por SQL en vez de por la app: revertir
un campo de texto (`sitio_web`) que se usó para verificar que la edición de
entidad funciona. `get_advisors` sin `ERROR` nuevo.

## Estado final

Informe completo en `contexto/QA_INTEGRAL_2026-08-06.md`. Un hallazgo crítico
(B-00) sin corregir, documentado con causa raíz exacta y marcado como primer
punto de mañana — no se intentó parchear lógica de kardex al cierre de una
campaña de QA sin revisión del dueño del proyecto. Un hallazgo de confianza
media (B-01) pendiente de una segunda reproducción limpia. El resto de los 4
bloques de trabajo del día se confirmó funcionando correctamente con
verificación real contra la base de datos, no sólo contra la pantalla.
