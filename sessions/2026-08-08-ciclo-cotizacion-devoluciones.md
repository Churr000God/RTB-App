# Sesión 2026-08-08 (sesión aparte) — Ciclo de vida de cotización: rechazar/cancelar/devoluciones, borrado real y edición en enviada

## Punto de partida

El dueño del proyecto pidió redefinir las reglas de negocio del ciclo de
vida de `ventas_cotizaciones`: hasta ahora "cancelar" cubría dos casos
distintos sin distinguirlos (arrepentirse antes de enviar / el cliente se
retracta después de aprobar). Reglas nuevas, en sus palabras: `rechazada` =
el cliente dijo que no a una cotización **enviada**; `cancelada` = el
cliente se retractó de una cotización **aprobada**, y sólo si el pedido no
se marcó como entregado; si ya hubo entrega, en vez de cancelar se abre un
proceso de **devoluciones**. Además: sólo se pueden borrar cotizaciones en
`borrador` (primero las partidas, luego la cabecera), y las cotizaciones
`enviada` deben poder editar sus partidas igual que un `borrador`.

## 1. Exploración — tres agentes en paralelo

Antes de tocar SQL se verificó contra la base **viva** (no sólo lectura de
migraciones, con `pg_get_functiondef()`):

- `037_roles_comerciales.sql` había reemplazado
  `ventas_cotizacion_enviar/_rechazar/_cancelar/_aprobar` con `create or
  replace` — cualquier rediseño tenía que partir de ese cuerpo, no del de
  `030`/`031`.
- `ventas_cotizacion_cancelar()` (viva) permitía `borrador`/`enviada` y
  **prohibía** `aprobada` — exactamente al revés de la regla nueva.
- `ventas_cotizacion_rechazar()` ya sólo aceptaba `enviada` — sin cambios
  necesarios ahí.
- **No existía ninguna función que cancelara un pedido ni una NR, ni que
  liberara apartados por evento.** `pedido_estado.'cancelado'` y
  `nr_estado.'cancelada'` eran valores muertos del enum desde `031`/`032`
  — ninguna función los escribía jamás. Mismo defecto que ya se había
  corregido para vínculos PO↔NR en `036` (`ventas_vinculo_cancelar()`),
  aquí sin resolver.
- `ventas_cotizacion_linea_before_write()` comparaba contra el **literal**
  `'borrador'` (no una lista) y sólo protegía 5 columnas de precio —
  `cantidad`/`descuento_porcentaje`/`activo`/`observaciones` eran
  editables en **cualquier** estado, incluida `aprobada` con pedido y
  reservas ya creados. Hueco real, cerrado como parte de este cambio.

Decisiones cerradas con `AskUserQuestion` antes de diseñar: alcance de
"devoluciones" (tabla de seguimiento básica, sin reembolso/factura real —
Facturación/RTB-PRO-FAC-01 no existe); umbral de "ya se entregó"
(cualquier entrega, parcial o total, no sólo total); borrar línea en
borrador (DELETE real, no `activo:false`); cerrar el hueco de edición
encontrado (sí, candado total fuera de borrador/enviada).

## 2. Migraciones — `039`/`040`/`041`

Dos migraciones separadas por un límite de Postgres: `ALTER TYPE ... ADD
VALUE` no se puede referenciar en la misma transacción en que se agrega.

**`039_ventas_devoluciones_schema.sql`**: `'en_devolucion'` en
`ventas_cotizacion_estado` y `pedido_estado`; tabla `ventas_devoluciones`
(enum `devolucion_estado` con sólo `pendiente`/`resuelta`, folio
`DEV-000000`, sin `GRANT INSERT/UPDATE`); columnas `cancelado_at`/
`cancelado_por`/`motivo_cancelacion` en `ventas_pedidos`/
`ventas_notas_remision` (mismo idioma que `ventas_po_nr_vinculos`, `036`);
`GRANT DELETE` + política RLS de `ventas_cotizacion_lineas` (borrador-only,
mismo criterio de rol/dueño que insert/update); `or delete` agregado a los
triggers de auditoría de `ventas_cotizaciones`/`ventas_cotizacion_lineas`
(primer DELETE real de todo el esquema — sin esto, `audit_row()` nunca se
habría enterado).

**`040_ventas_cotizacion_transiciones.sql`** (después de que `039` hizo
commit): `ventas_cotizacion_cancelar()` reescrita con dos ramas — sin
entrega, cascada completa (apartados liberados, NR cancelada si existía,
pedido `cancelado`); con entrega (`entregado`/`entregado_parcial`), abre
`ventas_devoluciones` y pasa cotización+pedido a `en_devolucion` sin tocar
NR ni apartados. `ventas_cotizacion_linea_before_write()` simplificada a un
candado total (una sola condición de entrada en vez de comparar 5
columnas). `cot_resolucion_motivo_chk` extendida a `en_devolucion`.
`ventas_cotizacion_eliminar()` y `ventas_devolucion_resolver()` nuevas.
`ventas_kpis()` +`devoluciones_pendientes`.

**`041_ventas_cotizacion_eliminar_fix.sql`** (corrección el mismo día, tras
verificación): `ventas_consultas_compras.cotizacion_id` es `on delete
restrict` — un borrador nacido de "Consultar a Compras" habría fallado al
eliminarse con una violación de llave foránea cruda.
`ventas_cotizacion_eliminar()` corregida para cancelar+desligar las
consultas `abierta`/`en_proceso` y sólo desligar (sin tocar `estado`) las
`respondida`/`sin_disponibilidad` — `consulta_respuesta_chk` es una
equivalencia, forzarlas a `cancelada` la habría violado. De paso:
`valor_entregado` en `ventas_devoluciones` (informativo,
`sum(cantidad_entregada * precio_unitario)` de la NR) e índice único
parcial `uq_ventas_dev_pedido_pendiente`.

Un agente Plan corrió en paralelo durante el diseño y aportó ambas
correcciones de `041` antes de que se verificaran manualmente — se
incorporaron y luego se confirmaron con SQL real.

## 3. Verificación SQL contra Supabase real

Con `BEGIN`/`ROLLBACK` para las pruebas exploratorias y, para el camino
feliz, sobre los **3 escenarios reales de QA ya existentes** (nunca
simulados): `PED-000041` (`liberado`, sin entrega), `PED-000040`
(`entregado`), `PED-000019` (`entregado_parcial`). Resultado exacto:

- `PED-000041` → cancelación en cascada: pedido `cancelado`, apartado
  `liberado`, `cantidad_apartada` bajó de 6 a 5 (verificado antes/después).
- `PED-000040`/`PED-000019` → ambos abrieron devolución
  (`DEV-000001`/`DEV-000002` en las pruebas con rollback; `DEV-000006` en
  la corrida real que quedó persistida), cotización y pedido a
  `en_devolucion`, NR y apartados intactos.
- Casos negativos: cancelar `borrador`/`enviada` → `42501`; DELETE de línea
  vía RLS en `enviada` → 0 filas sin excepción; `ventas_devolucion_resolver`
  con rol `ventas` → `42501`.
- `get_advisors`: sin `ERROR` nuevo, todos los `WARN` ya aceptados y
  documentados.

## 4. Capa de aplicación

Tipos/config (`en_devolucion` en ambos enums, `DevolucionEstado`,
`DevolucionRow`, badges y labels — TypeScript obliga a completar los
`Record` exhaustivos), permisos (`Accion` gana `'delete'`,
`ACCESO_PANTALLA.devoluciones`), nav (`Devoluciones` en el sidebar de
Ventas), 4 rutas de API (`DELETE` en `lineas/[lineaId]`, `POST .../eliminar`
nueva, `GET/POST` de `devoluciones`). `cotizacion-detalle.tsx`:
`puedeAdministrar` ganó `gerente_comercial` (bug preexistente encontrado en
la exploración — la RLS ya lo autorizaba desde `037`, la UI le ocultaba los
botones); "Cancelar" sólo en `aprobada` con aviso distinto según la
respuesta (`toast` de `cancelada` vs `en_devolucion` + folio); botón nuevo
"Eliminar cotización" (`AlertDialog`) sólo en `borrador`; "Quitar línea"
hace DELETE real en `borrador`, `activo:false` en `enviada`. Pantalla nueva
`/dashboard/ventas/devoluciones` (calco de `congelamientos`) + tarjeta KPI
en `/dashboard/ventas`. El tablero de cotizaciones (`038`, sesión anterior)
ganó la columna "En devolución" automáticamente, sin tocar ningún archivo
suyo.

## 5. Verificación por navegador (Claude in Chrome, usuarios QA)

`qa.ventas`: cotización nueva con una línea → borrar la línea (DELETE real,
confirmado por SQL y por `audit_log` con `accion='delete'`) → "Eliminar
cotización" completa (confirmó el diálogo con el conteo real de líneas,
redirigió al listado, `count(*)` en 0). Cancelar `COT-000061` (`liberado`,
sin entrega) → `cancelada` con motivo visible, sin botones (terminal).
Cancelar `COT-000039` (`entregado_parcial`) → toast de advertencia con el
folio real `DEV-000006`, banner en el detalle con folio/motivo/valor
entregado. `qa.direccion`: resolvió `DEV-000006` desde la bandeja nueva,
confirmado por SQL (`resuelta_at`/`resuelta_por`/`notas_resolucion`).
`qa.almacen`: redirect de servidor real (no sólo sidebar oculto) fuera de
`/dashboard/ventas/devoluciones`. Tablero de Ventas con "Devoluciones
pendientes: 0" tras resolver la única abierta. Tablero de cotizaciones con
las columnas "Cancelada" y "En devolución" pobladas, generadas solas.

Un 503 transitorio de `next dev` apareció una vez al hacer clic en
"Eliminar cotización" (edición de archivos en curso mientras se probaba) —
se confirmó por SQL que la cotización no había cambiado (atomicidad
intacta) y el reintento funcionó sin necesitar reiniciar el contenedor.

## 6. Nota sobre sesión concurrente

Este repositorio tuvo una segunda sesión trabajando en paralelo sobre el
mismo checkout: envío de cotizaciones por correo (MailerSend) —
`app/lib/ventas/documento-cotizacion.ts`,
`db/migrations/042_ventas_cotizacion_envios.sql`, y cambios en
`Dockerfile`/`app/.env.example`/`app/next.config.js`/`app/package.json`.
Antes de escribir la documentación final se confirmó con `git status` y
`list_migrations` que la numeración no chocaba (`039`-`041` vs `042`,
aplicada después) y que `cotizacion-detalle.tsx` — tocado por ambas
sesiones potencialmente — conservaba intactos los cambios de esta sesión.
`db/ESQUEMA.md` recibió la sección nueva insertada **antes** de la sección
que la otra sesión ya había escrito para `042`, sin tocarla. `npx tsc
--noEmit` y `docker build --target builder` se corrieron al final con el
checkout combinado de ambas sesiones, limpios.

## Alcance dejado fuera, anotado

`ventas_devolucion_resolver()` no tiene regla anti-autoautorización (quien
canceló y abrió la devolución podría resolverla también) — se documentó en
el propio comentario de la función como una línea de agregar si el dueño
del proyecto la quiere; no se agregó porque aquí no se aprueba ningún gasto
ni excepción (sin reembolso en el alcance). El proceso operativo real de
una devolución (recibir la mercancía física, reembolso, nota de crédito)
queda pendiente de RTB-PRO-FAC-01 — el gancho documentado es el tipo de
movimiento de kardex `entrada_devolucion_cliente` (`011`), sin ningún
escritor todavía.
