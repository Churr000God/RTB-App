# Sesión 2026-08-05 — Submódulo RTB-INV-01 Productos, Costos e Inventario

## Punto de partida

RTB-ENT-01 (Gestión de Entidades) auditado y funcional desde la sesión
anterior, mismo día. El dueño del proyecto trajo el siguiente paquete:
`~/Descargas/RTB_Modulo_Productos_Costos.zip` + tres archivos sueltos
(`01_analisis_funcional.md`, `02_esquema_sql_productos_inventario.sql`,
`03_flujo_conteos_fisicos.md`) — mucho más delgado que el de RTB-ENT-01,
~100 líneas totales. Pidió el mismo tratamiento: auditar, corregir/mejorar,
implementar.

## 1. Exploración y auditoría (modo plan)

Dos agentes Explore en paralelo — uno sobre la arquitectura real del
proyecto (patrones exactos de RTB-ENT-01 a replicar), otro sobre la
documentación de negocio disponible. El segundo encontró algo que no
estaba en el encargo original: además de `contexto/` (specs de proceso sin
modelo de datos), **`~/Descargas` tenía documentación operativa real de
RTB sobre inventario** — un reporte de existencias con folio real
(*Existencias de Inventario RTB-INV-01*), un *Acta de Conteo Físico
CIE-CON-01* firmada y versionada (V1.0→V3.0), y un *Registro de
Discrepancias CIE-DIS-01* — los tres exportados del sistema de reportes
propio de RTB, no de Notion. Miden fallas reales del proceso actual:
−$37,919.77 por unidad de medida mal definida (14 de 27 folios de no
conformidad), 34 de 34 ajustes históricos sin autorización registrada,
73.9% del catálogo sin ubicación asignada.

El paquete se contradecía con esa realidad en varios puntos centrales:

- "Real"/"Teórico" invertidos respecto a como RTB los usa hoy (Compras
  §III y los tres documentos reales).
- Ajuste automático del inventario ("diferencia ≠ 0 → movimiento
  `CONTEO_FISICO`") sin autorización de tercero — el Registro de
  Discrepancias real lo prohíbe explícitamente y mide su costo (34/34 sin
  autorizar).
- `unidad_medida` como `CHECK` cerrado de 3 valores, "inmutable" — es
  literalmente la causa #1 de pérdida medida.
- `sku UNIQUE` — el catálogo real tiene pares que comparten SKU.
- `ubicaciones_racks` nueva y plana, cuando RTB-ENT-01 ya tiene
  `ubicaciones_internas` (árbol de 5 niveles, auditado).
- Sin RLS, `GRANT`, auditoría, ni costo en ningún lado del DDL.

Se presentaron 3 preguntas de alcance al dueño del proyecto (vía
`AskUserQuestion`): alcance completo (catálogo + inventario + conteos +
discrepancias/ajustes) vs. recortado, reutilizar `ubicaciones_internas` vs.
crear una tabla nueva, y si cargar los 275 SKU reales como semilla. Con
esas respuestas (completo, reutilizar, sin semilla) se delegó el diseño
detallado del modelo de datos a un agente Plan, se revisó su propuesta
contra los documentos reales, y se escribió el plan final.

## 2. Implementación

- **6 migraciones SQL** aplicadas una por una vía MCP contra Supabase real
  (`dgafffpbhktxadiqmmwl`, que seguía vacía — sin datos de RTB-ENT-01 en
  riesgo): catálogo (`009`), costos (`010`), existencias/apartados/kardex
  (`011`), conteos físicos (`012`), discrepancias/ajustes/hallazgos/
  redefinición de unidad (`013`), funciones de KPI (`014`). ~21 tablas,
  ~20 funciones, ~45 FK.
- **Capa TypeScript compartida** (`app/lib/inventario/`): tipos, config
  (etiquetas + umbrales espejo de SQL), permisos (espejo de RLS),
  esquemas zod (traducción literal de cada `GRANT INSERT/UPDATE`),
  validaciones puras.
- **~35 rutas de API** (`app/app/api/{catalogos,productos,proveedor-productos,
  precios-referencia,redefiniciones-unidad,inventario/*}`), mismo patrón
  `requireApiRole` → zod → `{error}` en español.
- **~14 páginas** (`/dashboard/productos*`, `/dashboard/inventario*`),
  incluida la pantalla de captura con vista ciega real.
- Nueva sección "Inventario" en `app/lib/rbac/config.ts` + "Productos" en
  "Datos maestros".
- Verificación incremental con `npx tsc --noEmit` dentro del contenedor
  Docker corriendo (`docker compose exec web ...`) después de **cada
  archivo nuevo**, no sólo al final — atrapó dos errores de sintaxis
  reales (un `*/` dentro de un comentario JSDoc que cerraba el bloque a
  medio texto) antes de que se acumularan.

Cada corrección de la auditoría quedó documentada con su porqué directo en
los comentarios del SQL, no sólo en un documento aparte — mismo criterio
que RTB-ENT-01.

## 3. Dos hallazgos de la propia implementación (no del paquete)

Ninguno llegó a producción — se encontraron diseñando una migración contra
la anterior, antes de aplicar nada:

1. **Kardex:** `mov_ajuste_chk` sólo exigía autorización para 2 de los 4
   tipos de movimiento de corrección (`entrada_ajuste`/`salida_ajuste`),
   dejando `entrada_conteo`/`salida_conteo` sin ese control — habría
   reabierto exactamente el hallazgo "34 de 34 sin autorizar" que el
   submódulo existe para cerrar. Corregido al inicio de `012` con un
   `ALTER TABLE`.
2. **Conteos:** `GRANT INSERT` sin restricción de columna en
   `inventario_conteos` + una máquina de estados que sólo valida en
   `UPDATE` = un `INSERT` directo podría crear un conteo ya
   `estado='cerrado'` con firmas forjadas. Corregido restringiendo el
   `GRANT INSERT` a las columnas de creación — toda fila nace en su
   estado inicial por el `DEFAULT`.

Ambos se generalizaron como gotchas nuevos en `CLAUDE.md`.

## 4. Verificación

1. **Funcional, como `postgres`** (para aislar lógica de negocio de
   privilegios): conversión de unidad con factor congelado (KIT↔PZ,
   costo promedio correcto), bloqueo de saldo negativo, cross-dock sin
   pareja fallando en el `COMMIT`, máquina de estados de conteo completa
   (con y sin firmas), autoaprobación de ajuste rechazada,
   `ajuste_autorizado()` cerrando el ciclo con el kardex. Cada prueba
   limpió sus propios datos — incluida una limpieza de kardex que exigió
   deshabilitar temporalmente el trigger de inmutabilidad (confirmando
   que sí protege incluso a `postgres`).
2. **Con el rol Postgres real `authenticated`** (`set local role` +
   `set_config('request.jwt.claim.sub', ...)`), no sólo como
   superusuario: `SELECT cantidad_teorica` sobre `inventario_conteo_detalles`
   falla con `insufficient_privilege` (vista ciega real, no de pantalla);
   nombrar `estado`/`permite_negativo`/`ajuste_id` en un `INSERT` fuera del
   `GRANT` falla igual, en las tres tablas que más importan.
3. `get_advisors` (security + performance): 0 `ERROR`. Los `WARN`/`INFO`
   son la misma clase ya aceptada desde RTB-ENT-01 (funciones
   `SECURITY DEFINER` expuestas como RPC, `created_by`/`updated_by` sin
   indexar, índices nuevos sin uso con la base vacía).
4. `npx tsc --noEmit` limpio en cada fase (tipos → API → UI), y de nuevo al
   cierre de la sesión sobre el árbol completo.

Verificación clic a clic en la app real, `docker build --target builder`
(TypeScript real) y `inventario_verificar_consistencia()` sobre datos con
tráfico real quedan para cuando exista al menos un usuario de prueba con
rol operativo distinto de `super_admin` — la base sigue con un solo
perfil real, por decisión explícita de no crear datos de prueba
adicionales en esta sesión más allá de los que cada verificación limpió
por sí misma.

## 5. Documentación

- `contexto/RTB-INV-01_Modulo_Productos_Inventario.md` — spec corregida.
- `contexto/AUDITORIA_RTB-INV-01.md` — 18 hallazgos (bloqueantes,
  contradicciones con la realidad operativa, errores de modelo, 2 huecos
  de la propia implementación, huecos frente a módulos futuros, fuera de
  alcance) con su corrección.
- `db/ESQUEMA.md` — ampliado con las 21 tablas nuevas, sus enums,
  funciones, diagrama de relaciones fusionado con el de RTB-ENT-01, y los
  nuevos advisors aceptados.
- `db/procesos/` — 5 documentos nuevos (`alta-producto.md`,
  `movimientos-de-inventario.md`, `conteo-fisico.md`,
  `discrepancias-y-ajustes.md`, `redefinicion-unidad-medida.md`) + README
  actualizado.
- `CLAUDE.md` — tabla de módulos, árbol de arquitectura, 3 gotchas nuevos
  (orden de migración con funciones `language sql`, `GRANT INSERT` sin
  restringir en tablas con máquina de estados, extender un `CHECK` sin
  repasar todas las reglas que dependen de él), historial de decisiones.
