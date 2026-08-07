# RTB-ENT-01 | Gestión de Entidades

**Proyecto:** Refacciones Tomás Badillo, S.A. de C.V.
**Submódulo:** RTB-ENT-01 Gestión de Entidades
**Versión:** 2.0 — reemplaza la spec de AbacusAI del mismo nombre
**Fecha:** 2026-08-05
**Estado:** Implementado y auditado

> Este documento **manda** sobre el paquete original de AbacusAI
> (`Desarrollo_Subm_dulo_Cliente.zip`: documento técnico maestro + procedimientos
> P01–P06 + mockups). Ese paquete llegó con contradicciones internas serias — ver
> `contexto/AUDITORIA_RTB-ENT-01.md` para el detalle completo de cada una y su
> corrección. Este documento describe lo que realmente está implementado.

## 1. Objetivo y alcance

Maestro de **clientes, proveedores y ubicaciones internas** de RTB — la pieza de
la que dependerán Ventas, Compras, Almacén, Rutas, Facturación y Finanzas.

**Dentro de alcance:** entidades (clientes/proveedores/mixtas), contactos,
direcciones, cuentas bancarias de proveedor, ubicaciones internas, historial de
auditoría y solicitudes de cambio controlado.

**Fuera de alcance de esta entrega:** `proveedores_productos` (catálogo de
precios — pertenece a Compras, requiere un maestro de productos que aún no
existe), notificaciones automáticas (sin infraestructura de email todavía),
importador masivo desde Notion (alta manual únicamente; la migración de
históricos se hace por SQL directo, fuera de la UI).

## 2. Modelo de datos

Implementado en `db/migrations/002_entidades_core.sql` (núcleo),
`003_ubicaciones_internas.sql` (árbol de ubicaciones) y
`004_cuentas_bancarias.sql` (cuentas de proveedor) + un ajuste puntual en
`005_solicitudes_tipo_cambio.sql`, más `020_entidades_siglas.sql`
(2026-08-06: identificador corto de la entidad, ver §2.1) y
`024_ubicaciones_geo.sql` (2026-08-06: dirección + coordenada de un centro
operativo, ver §5). Ese es el DDL autoritativo; lo que sigue es un resumen.

### 2.1 Tablas núcleo

| Tabla | Qué es | Notas clave |
|---|---|---|
| `entidades` | Maestro único de clientes/proveedores/mixtas | `clave` autogenerada (`ENT-000123`), **único dueño del estado y el bloqueo** — `clientes`/`proveedores` no tienen estado propio. `siglas` (opcional, única, MAYÚSCULAS) identifica a la entidad de forma corta y entra al buscador |
| `clientes` | Extensión 1:1 de una entidad con rol cliente | `limite_credito`, `vendedor_id`, `canal_origen` |
| `proveedores` | Extensión 1:1 de una entidad con rol proveedor | `condicion_pago`, `credito_autorizado` |
| `contactos` | Contactos de una entidad | "modificación libre" (P05, sin aprobación) |
| `direcciones` | Direcciones de una entidad | "modificación libre"; `entidad_federativa` (no "estado", para no confundir con el estado del flujo); `tipo` = `fiscal\|envio\|cobro\|bodega\|sucursal\|oficina`; `latitud`/`longitud` opcionales (`numeric(10,7)`, ambas o ninguna) — en la base desde el alta pero sin UI que las usara hasta 2026-08-06, ver §7/§8 |
| `audit_log` | Historial inmutable | Append-only: sin `GRANT UPDATE`/`DELETE` para nadie salvo `service_role` |
| `solicitudes_cambio` | Cola de aprobación de cambios controlados | Ver §4 |
| `ubicaciones_internas` | Árbol de centros operativos/zonas/pasillos/racks/posiciones | Profundidad flexible 1–5, ver §5. Un `centro_operativo` puede además tener dirección + coordenada propias (`024_ubicaciones_geo.sql`) |
| `proveedor_cuentas_bancarias` | Cuentas bancarias de proveedor | Acceso restringido a `finanzas`/`super_admin`, ver §6 |

Una entidad que da de alta un rol contrario al que ya tiene (p.ej. un cliente al
que se le agrega un `proveedores`) se promueve automáticamente a `tipo='mixta'`
— no se duplica el registro (trigger `sync_entidad_tipo`).

### 2.2 Estados de una entidad

```
borrador → activo → bloqueado_temporal ⇄ activo
                  → bloqueado_permanente (irreversible)
         → inactivo
```

**Decisión de alcance:** el alta es directa a `activo` — no hay flujo de
`borrador → pendiente_aprobación` para el alta en sí. Sólo los **cambios
posteriores sensibles** pasan por aprobación (§4). "Pendiente" en la UI no es un
estado de la entidad: se deriva de que exista una `solicitudes_cambio` abierta
sobre ella.

## 3. Matriz de permisos

Espejo exacto de las políticas RLS — vive también en
`app/lib/entidades/permisos.ts` (constante `MATRIZ`) para que la UI pueda
mostrar/ocultar acciones sin round-trip; la barrera real es siempre Postgres.

| Rol | Entidades | Clientes | Proveedores | Contactos | Direcciones | Ctas. banco | Ubicaciones | Audit |
|---|---|---|---|---|---|---|---|---|
| `super_admin` | CRU + bloqueo total | CRU | CRU | CRU | CRU | R + aprobar | CRU | R |
| `direccion` | R + inicia bloqueo | R | R | R | R | sólo estado (enmascarado) | CRU | R |
| `ventas` | CRU (cliente/mixta) | CRU | R | CRU | CRU | — | R | — |
| `compras` | CRU (proveedor/mixta) | R | CRU | CRU | CRU | — | R | — |
| `finanzas` | R | R | R | CRU | R | CRU + ver completo | R | — |
| `almacen` | R | R | R | R | CRU | — | CRU (sin desactivar) | — |
| `logistica` | R | R | R | R | CRU | — | R | — |
| `facturacion` | R | R | R | R | R | — | R | — |

Un usuario con `is_active=false` no ve nada de esto, con sesión viva o sin
ella — `current_user_role()` devuelve `NULL` para un inactivo, y
`NULL = any(...)` es `NULL`, que RLS trata como falso.

## 4. Cambios controlados (P05 §II)

La mayoría de la edición es "libre" (sin aprobación): contactos, direcciones,
teléfonos, correos, notas. Los siguientes cambios exigen pasar por
`solicitudes_cambio` (`POST /api/solicitudes-cambio` → resuelve
`POST /api/solicitudes-cambio/[id]/resolver`), salvo que quien lo pida sea
`super_admin`, que siempre ejecuta directo:

| Cambio | Inicia | Aprueba |
|---|---|---|
| RFC | `super_admin` | ejecuta directo |
| Razón social | `direccion` | `super_admin` |
| Límite de crédito > $100,000 | `ventas` | `direccion` |
| Condición/categoría de proveedor | `compras` | `direccion` |
| Reactivar entidad bloqueada | `direccion` | `super_admin` |
| Bloqueo temporal | `direccion` | `super_admin` |
| Bloqueo permanente | `super_admin` | ejecuta directo |

Constante `UMBRAL_APROBACION_CREDITO = 100_000` en
`app/lib/entidades/config.ts`. El bloqueo permanente exige además que
`public.tiene_operaciones_abiertas(entidad_id)` devuelva `false` — hoy siempre
lo hace (Ventas/Compras no existen todavía); es el punto de extensión
documentado para cuando existan.

## 5. Ubicaciones internas

Árbol auto-referencial (`parent_id`) de profundidad flexible 1–5:
`centro_operativo → zona → pasillo → rack → posicion`. Un nodo puede saltarse
niveles intermedios (un rack puede colgar directo de una zona, sin pasillo) pero
nunca retroceder en la taxonomía. El código se genera automáticamente
concatenando el del padre + el segmento propio (`ALM-PRINCIPAL-ALM-A-R01-N2`).

`clasificacion` (`fisica|logica|especial`) es independiente del `tipo`
jerárquico; `uso_especial` (`cuarentena|devoluciones|material_danado|recepcion|
embarque|picking`) sólo aplica cuando `clasificacion='especial'`.

`almacen` puede crear y editar ubicaciones pero **no puede activar/desactivarlas**
— sólo `direccion`/`super_admin`.

**Dirección y coordenada (`024_ubicaciones_geo.sql`, 2026-08-06):** sólo un
`centro_operativo` (la raíz del árbol — almacén, oficina, sucursal) puede
capturar dirección postal + `latitud`/`longitud`; una zona, pasillo, rack o
posición hereda la ubicación de su centro y el `CHECK`
`ubicaciones_geo_solo_centro_chk` lo hace cumplir en la base, no sólo en la
UI. Mismo mecanismo de geocodificación que las direcciones de entidades
(§7/§8): pin en el mapa o campos de texto, "obtener dirección de esta
coordenada" propone y el usuario confirma antes de sobrescribir nada.

## 6. Cuentas bancarias de proveedor (P03)

Control antifraude explícito: **solo `finanzas` inicia, solo `super_admin`
aprueba, nadie más ve ni modifica** — ni siquiera `direccion`, que sólo ve un
resumen con la CLABE enmascarada (`public.proveedor_cuentas_resumen()`,
`****1234`) vía `GET /api/proveedores/[id]/cuentas`.

- Sólo puede existir **una cuenta `activa` por proveedor** a la vez.
- Al registrar un reemplazo, la cuenta anterior pasa a `pendiente_reemplazo` y,
  cuando `super_admin` aprueba la nueva, la anterior pasa a `inactiva`
  automáticamente. Nunca se elimina físicamente (regla P03: "no se puede
  eliminar una cuenta con pagos históricos").
- CLABE validada con el algoritmo completo de dígito verificador (P03 §V) tanto
  en Postgres (`public.clabe_valida()`, usada en un `CHECK`) como en TypeScript
  (`app/lib/entidades/validaciones.ts::clabeValida`, espejo exacto).
- El comprobante (PDF/JPG/PNG) vive en el bucket privado
  `comprobantes-bancarios` de Supabase Storage y se sirve siempre por URL
  firmada de corta duración generada en el servidor — nunca por URL pública.

## 7. API

Todas las rutas siguen el patrón de `app/app/api/admin/users/route.ts`:
`requireApiRole([...])` → validación zod → lógica de negocio →
`{ error: string }` en español o el recurso directo.

```
GET/POST     /api/entidades
GET/PATCH    /api/entidades/[id]
POST         /api/entidades/[id]/bloquear        { tipo: 'temporal'|'permanente', motivo }
POST         /api/entidades/[id]/desbloquear      { motivo }
GET/POST     /api/entidades/[id]/contactos
PATCH        /api/entidades/[id]/contactos/[cid]
GET/POST     /api/entidades/[id]/direcciones
PATCH        /api/entidades/[id]/direcciones/[did]
GET/POST     /api/proveedores/[id]/cuentas
POST         /api/proveedores/[id]/cuentas/[cid]/aprobar
POST         /api/proveedores/[id]/cuentas/[cid]/rechazar
POST         /api/proveedores/[id]/cuentas/comprobante-upload-url
GET          /api/proveedores/[id]/cuentas/[cid]/comprobante   (URL firmada, 60s)
GET/POST     /api/ubicaciones
PATCH        /api/ubicaciones/[id]
GET/POST     /api/solicitudes-cambio
POST         /api/solicitudes-cambio/[id]/resolver   { decision: 'aprobar'|'rechazar', comentario_resolucion? }
```

Geocodificación y mapa (`app/lib/mapas/`, 2026-08-06 — capa nueva, comparte
roles con `direcciones`/`ubicaciones`, no un submódulo aparte):

```
GET   /api/mapa/config            { habilitado, token, estilo }  — token PÚBLICO (pk.) de Mapbox, tras sesión
GET   /api/geocodificacion        ?modo=inverso&latitud=&longitud=  |  ?modo=directo&q=
GET   /api/mapa/puntos            direcciones + centros operativos activos con coordenada, para /dashboard/mapa
```

## 8. UI

| Ruta | Contenido |
|---|---|
| `/dashboard/entidades` | KPIs (total, clientes activos, proveedores activos, bloqueadas), tabs por tipo, búsqueda/filtros, tabla paginada en servidor |
| `/dashboard/entidades/nueva` | Alta compuesta: datos generales + comerciales + contacto principal + dirección fiscal (calle…CP + referencia + coordenada con mapa) |
| `/dashboard/entidades/[id]` | Detalle con tabs General · Contactos y direcciones · Cuenta bancaria (si aplica) · Auditoría, y acciones de bloqueo/desbloqueo. La pestaña General edita in-place los campos de "modificación libre" (§4). La card "Direcciones" agrega/edita/archiva (antes de 2026-08-06 era sólo lectura, con el `POST`/`PATCH` existente pero sin pantalla que los llamara) |
| `/dashboard/ubicaciones` | Árbol expandible + panel de detalle; un `centro_operativo` seleccionado muestra su dirección + mapa, editable in-place |
| `/dashboard/mapa` | Todos los puntos con coordenada (clientes/proveedores/mixtas + centros operativos) en un solo mapa, filtro por tipo, leyenda de colores, tarjeta con el nombre al pasar el cursor sobre un pin, buscador por nombre entre los pines cargados, clic en el pin abre la ficha — nueva en 2026-08-06, base para agrupar por zona cuando llegue Rutas (`contexto/RTB-PRO-RUT-01_Modulo_Rutas.md`) |

Las cuatro entradas de navegación (`Entidades`, `Ubicaciones`, `Mapa`,
`Productos`/`Catálogos`) están en la sección "Datos maestros" de
`app/lib/rbac/config.ts`, visibles para los 8 roles.

**Componentes de mapa** (`app/components/mapas/`): `MapaPunto` (un pin,
arrastrable si `editable`), `MapaMultiple` (varios pines, usado por
`/dashboard/mapa`), `CampoCoordenada` (inputs de lat/long, acepta pegar
`"20.6736, -103.3440"`, botón "obtener dirección de esta coordenada") y
`PropuestaDireccion` (muestra el resultado de Mapbox con "usar esta
dirección" / "descartar" — nunca sobrescribe solo). Envueltos con
`next/dynamic({ ssr: false })` porque `mapbox-gl` toca `window`. Requieren
`MAPBOX_TOKEN`/`MAPBOX_PUBLIC_TOKEN` en `app/.env` (ver `.env.example`);
sin ellos, degradan a un aviso en vez de romper el formulario.

## 9. Reglas de negocio (vigentes)

1. `clave` y `rfc` no se repiten — salvo los RFC genéricos del SAT
   (`XAXX010101000`, `XEXX010101000`), que sí pueden repetirse.
2. Cada `clientes`/`proveedores` cuelga de una única `entidad_id` (1:1).
3. Sólo un contacto principal y una dirección principal por tipo, por entidad.
   Sólo una cuenta bancaria `activa` por proveedor.
4. No hay borrado físico operativo: todo es `activo=false` o cambio de
   `estado`. Ninguna tabla de este submódulo tiene `GRANT DELETE` para
   `authenticated`.
5. Los cambios sensibles (§4) exigen aprobación de un segundo rol.
6. Trazabilidad obligatoria: `created_by`/`updated_by` con `DEFAULT auth.uid()`,
   nunca escribibles por el cliente sin pasar por la sesión autenticada.
7. Historial inmutable: `audit_log` es append-only.
8. Moneda por defecto `MXN`.
9. Un bloqueo permanente exige cero operaciones abiertas y no se reactiva sin
   una migración especial de datos.

## 10. Referencias

- `contexto/AUDITORIA_RTB-ENT-01.md` — cada defecto encontrado en el paquete
  original y cómo se corrigió.
- `db/migrations/002_entidades_core.sql`, `003_ubicaciones_internas.sql`,
  `004_cuentas_bancarias.sql`, `005_solicitudes_tipo_cambio.sql` — DDL
  autoritativo.
- `app/lib/entidades/` — permisos, validaciones y esquemas compartidos entre
  API y UI.
