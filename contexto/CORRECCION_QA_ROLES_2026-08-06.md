# Corrección de la campaña de QA por rol — RTB-App (2026-08-06)

Documento complementario de `contexto/AUDITORIA_QA_ROLES_2026-08-06.md`
(el diagnóstico). Este es el registro de la corrección: qué se hizo, en
qué orden, qué se encontró de nuevo al hacerlo, y cómo se verificó.
Alcance: **todos** los hallazgos del documento de diagnóstico — E-01 a
E-11, M-01 a M-09, y los 8 gaps de UI de §4.

## Migraciones nuevas

| Archivo | Qué hace |
|---|---|
| `016_qa_correcciones.sql` | `inventario_congelar_conteo()` e `inventario_aplicar_conteo()` (funciones `SECURITY DEFINER`, invocadas por el cliente del propio usuario — no `service_role`); `coalesce(new.<col>, auth.uid())` defensivo en los triggers de autoría; `GRANT INSERT` de `inventario_congelamientos` restringido por columna; liberación automática de congelamientos al aplicar/cancelar un conteo. |
| `017_conteo_captura_conversion.sql` | `conteo_detalles_before_update()` calcula `cantidad_fisica` a partir de `cantidad_capturada` × factor de conversión de unidad — no existía ningún cálculo, bug no documentado en la auditoría original, enmascarado por E-02. |
| — | El número 018 quedó libre: feature de siglas de entidad desarrollado en paralelo por otra sesión sobre el mismo repositorio ocupó momentáneamente ese número y luego se renombró a `020_entidades_siglas.sql` cuando ambas sesiones colisionaron. Se documenta aquí sólo para explicar por qué la numeración de esta corrección salta de 017 a 019. |
| `019_clientes_limite_credito_grant.sql` | `GRANT UPDATE (limite_credito)` en `clientes` — faltaba por completo; encontrado al construir la edición de crédito de una entidad ya existente (regla huérfana de E-07). |

## Causa raíz real de E-01/E-02/E-03

Ver `AUDITORIA_QA_ROLES_2026-08-06.md` §8.1 para el detalle — en resumen:
las rutas `congelar`/`aplicar` usaban el cliente `service_role` para
sortear el `GRANT` restringido de las tablas de conteo, pero eso deja
`auth.uid()` en NULL y rompe la autoría (E-01, y lo que habría roto E-03
en cuanto se arreglara). La corrección de fondo es usar funciones
`SECURITY DEFINER` invocadas por el cliente del propio usuario — mismo
patrón que el proyecto ya usaba para `inventario_congelamiento_activo()`.

**La causa raíz que describe E-02 en el documento de diagnóstico está
mal**, y su fix insinuado (ampliar el `GRANT SELECT`) habría destruido la
vista ciega. Corrección completa en AUDITORIA_QA_ROLES_2026-08-06.md §8.1.

## Fases de la corrección

1. **Migración 016** — los tres S1 de conteos, capa SQL. Verificado con
   simulación de rol real por SQL antes de tocar la capa de API.
2. **Rutas/UI de conteos** — `congelar`/`aplicar`/`detalles`/`estado`
   route.ts reescritas para usar las funciones nuevas; botón dedicado
   "Aplicar al inventario" (excluye `congelado`/`aplicado` del generador
   genérico de transiciones, M-06); pantalla de liberar congelamiento
   (E-05/M-09, `MotivoDialog` reutilizable, `components/inventario/motivo-dialog.tsx`).
3. **Entidades** — E-06 (sincronizar `tipo` con el rol), E-07 (aprobación
   de crédito real vía `solicitudes_cambio`, con `PATCH
   /api/entidades/[id]/cliente` nuevo para la regla huérfana), E-10/M-07
   (valor real en vez de placeholder para "Estado").
4. **Permisos de UI y navegación** — E-08 (gate de "Nuevo Conteo"/"Nuevo
   Ajuste"), E-09 (columna Nombre duplicada en catálogos), E-11/M-08
   (módulos futuros deshabilitados con "Próximamente" en el sidebar +
   `not-found.tsx` en español), bonus (doble resaltado del sidebar,
   "Módulos Activos" mal etiquetado).
5. **Fricción** — M-01 (asignar capturista con `<select>`, encontró el
   bug de `asg_alcance_chk`), M-03 (`ProductoCombobox`/`UbicacionSelect`
   nuevos, primeros consumidores de `cmdk` en el proyecto), M-04
   (contraseña unificada a 8 caracteres).
6. **Los 8 gaps de UI de §4** — pantallas nuevas: crear discrepancia,
   hallazgos (con `HallazgoEstadoBadge` nuevo), soporte documental de
   ajuste (subida real con URL firmada, bucket `soportes-inventario`,
   ruta nueva `soporte-upload-url`), costo de producto, cuenta bancaria de
   proveedor (subida real, mismo patrón), redefiniciones de unidad,
   solicitudes de cambio (`/dashboard/solicitudes`, con resolución de
   nombre de entidad server-side ya que `registro_id` es polimórfico).
7. **Limpieza de datos QA** — liberar congelamiento, aplicar `AJU-000004`
   y aprobar la solicitud pendiente, las tres **desde la app real**
   (verificación en sí misma de las pantallas nuevas), no por SQL. Sólo
   las 2 líneas huérfanas de `CNT-000003` se limpiaron por SQL.
8. **Verificación final** — recorrido clic a clic con sesiones reales de
   `almacen` y `direccion` (circuito completo de un conteo nuevo,
   `CNT-000012`), `tsc --noEmit`, `docker build --target builder`,
   `get_advisors`.

## Nota sobre desarrollo concurrente

Durante esta corrección, otra sesión trabajó en paralelo sobre el mismo
repositorio (feature de siglas de entidad, imágenes de producto). Se
verificó que ningún archivo tocado por ambas sesiones perdiera cambios de
la otra (`git diff` puntual tras cada edición cruzada), y se resolvió una
colisión de numeración de migraciones (018 usado por ambas — la de esta
corrección se renombró a 019, sin efecto funcional ya que Supabase
versiona cada migración aplicada por timestamp, no por el nombre del
archivo local).
