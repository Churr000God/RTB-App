# Sesión 2026-08-06 — Ubicación geográfica y mapas (Entidades + Ubicaciones internas)

## Punto de partida

Pedido del dueño del proyecto: poder guardar la ubicación geográfica de
clientes, proveedores y de las ubicaciones internas que sean almacén,
oficina o similar (para programar entregas y rutas), obtener la dirección
a partir de la coordenada, y verla en un mapa dentro de la aplicación.

## 1. Exploración y plan

Tres agentes Explore en paralelo (esquema/API de entidades, UI de
entidades y ubicaciones, specs de `contexto/`) más lectura directa de
migraciones encontraron dos hechos que cambiaron el alcance real del
pedido:

- **`direcciones.latitud`/`longitud` ya existían** desde
  `002_entidades_core.sql` — el primer día de RTB-ENT-01 — con su `CHECK`
  de "ambas o ninguna" y rango válido, y el schema zod ya las validaba.
  Nadie las usaba: cero UI.
- **No había forma de agregar o editar una dirección de una entidad ya
  existente.** Sólo se capturaba una, al dar de alta la entidad, y
  después era de sólo lectura — aunque
  `GET/POST /api/entidades/[id]/direcciones` y
  `PATCH .../direcciones/[did]` ya existían, sin ninguna pantalla que los
  llamara (mismo patrón de API-sin-consumidor que ya se había visto con el
  `PATCH` de datos generales de entidad, sesión anterior).
- `ubicaciones_internas`, en cambio, no tenía ningún campo de dirección ni
  coordenada — había que agregarlos.
- `maplibre-gl@4.7.1` estaba en `package.json` sin usarse en ningún
  archivo — venía del ZIP original del generador.

Cuatro decisiones se resolvieron con el dueño del proyecto vía
`AskUserQuestion` antes de escribir el plan (todas la opción recomendada):
**Mapbox** como proveedor (mejor calidad de direcciones en México que la
alternativa gratuita de OpenStreetMap/Nominatim, con el costo real de
`permanent=true` aceptado de antemano); captura por **pin arrastrable +
campos de texto sincronizados**; autollenado **"proponer y confirmar"**,
nunca sobrescritura automática; y coordenada en ubicaciones internas
**sólo para `centro_operativo`** — una zona/pasillo/rack/posición hereda
la ubicación de su centro. Dos preguntas adicionales de alcance: sí
construir la **gestión completa de direcciones** (agregar/editar/archivar,
no sólo agregar) porque sin eso no había dónde poner la coordenada de un
cliente ya existente, y sí un **mapa global** con todos los puntos.

## 2. Base de datos — `024_ubicaciones_geo.sql`

`direcciones` no necesitó migración (las columnas ya existían).
`ubicaciones_internas` ganó 11 columnas espejo de `direcciones` (calle…
`codigo_postal`, `referencia`, `latitud`, `longitud`), con tres `CHECK`:

- `ubicaciones_geo_chk` — ambas coordenadas o ninguna, espejo exacto de
  `direcciones_geo_chk`.
- `ubicaciones_cp_chk` — formato de código postal.
- `ubicaciones_geo_solo_centro_chk` — si `tipo <> 'centro_operativo'`,
  las 11 columnas deben ser `NULL`. Es la barrera real, no la UI: una
  llamada directa a la API que se salte el formulario no puede colar
  dirección en un rack.

Normalización `nullif(btrim(...), '')` añadida a
`ubicaciones_before_insert()`/`_before_update()` — mismo gotcha que
`entidades.siglas` (020): sin esto, un campo tocado y borrado en un
formulario manda `''`, no `NULL`, y `''` sí burla el `CHECK`.
`GRANT UPDATE` reemitido con la lista completa de columnas (viejas +
nuevas), mismo patrón que `020`. Dos índices parciales
(`idx_direcciones_geo`, `idx_ubicaciones_geo`) para alimentar el mapa
global sin escanear cada tabla completa.

**Verificado con SQL simulando rol real** (no como `postgres`):
`almacen` escribe geo en un `centro_operativo` → pasa; lo mismo en un
`rack` → rechazado por `ubicaciones_geo_solo_centro_chk`; sólo latitud sin
longitud → rechazado por `ubicaciones_geo_chk`; `ventas` escribe geo en
una dirección de cliente → pasa; campo con `''` en un rack → normalizado a
`NULL`, no rechazado. `get_advisors` sin `ERROR` nuevo.

## 3. Geocodificación — `app/lib/mapas/`

Capa nueva, `server-only` (mismo patrón que
`lib/supabase/admin.ts`/`SUPABASE_SERVICE_ROLE_KEY`): `mapbox.ts` llama a
Mapbox Geocoding v6 (`/reverse` y `/forward`) con `permanent=true` —
obligatorio porque el resultado se guarda en la base, y el modo temporal
(default) de Mapbox lo prohíbe. Tres rutas de API nuevas:
`GET /api/mapa/config` (entrega el token **público** al cliente tras
sesión, nunca inlinado en el bundle — mismo motivo que
`NEXT_PUBLIC_SUPABASE_URL`), `GET /api/geocodificacion`
(`?modo=inverso&latitud=&longitud=` | `?modo=directo&q=`, mismos roles que
escriben direcciones), `GET /api/mapa/puntos` (direcciones + centros
operativos activos con coordenada, para el mapa global).

## 4. Componentes de mapa — `app/components/mapas/`

Se instaló **`mapbox-gl`**, no el `maplibre-gl` que ya estaba sin usar:
los términos de servicio de Mapbox exigen consumir sus teselas con su
propio SDK. Lockfile regenerado dentro del contenedor `node:20-alpine`
(gotcha ya conocido del proyecto, no con el Node del host).

- **`MapaPunto`** / **`MapaMultiple`** — envueltos con
  `next/dynamic({ ssr: false })` porque `mapbox-gl` toca `window`; el
  resto de la app importa siempre estos wrappers, nunca los `*Inner`
  directo.
- **`CampoCoordenada`** — dos inputs sincronizados con el mapa en ambos
  sentidos; acepta pegar `"20.6736, -103.3440"` (como se copia desde
  Google Maps en el celular) y lo separa solo.
- **`PropuestaDireccion`** — "usar esta dirección" / "descartar"; nada se
  sobrescribe sin que el usuario confirme.

## 5. UI

- **Alta de entidad**: sección "Dirección fiscal" con coordenada + mapa +
  campo `referencia` (no se capturaba antes).
- **Ficha de entidad → pestaña "Contactos y direcciones"**: la card
  "Direcciones" pasó de una lista de texto sin un solo botón a gestión
  completa — agregar (modal), editar, archivar (`PATCH {activo:false}`,
  nunca `DELETE`), cada una con su mapa.
- **`/dashboard/ubicaciones`**: la sección de dirección + mapa sólo
  aparece cuando el `tipo` es `centro_operativo` (modal de alta y panel de
  detalle), en espejo del `CHECK`.
- **`/dashboard/mapa`** (nueva): todos los puntos con coordenada, filtro
  por tipo, clic en el pin navega a la ficha de la entidad o a
  `/dashboard/ubicaciones?seleccionar=[id]` (nuevo parámetro que abre esa
  ubicación directo en el árbol — cierra el circuito del clic).

## 6. Verificación

- SQL simulando rol real (detalle en §2), `get_advisors` sin `ERROR`
  nuevo.
- `npx tsc --noEmit` incremental tras cada archivo, no sólo al final.
- `docker build --target builder` (TypeScript real,
  `ignoreBuildErrors: false`) exitoso, con las ~35 rutas y 24 páginas del
  proyecto compilando, incluidas las nuevas.
- Smoke tests por HTTP sin sesión (sin credenciales de usuarios QA a la
  mano en esta sesión): las cuatro rutas de API nuevas responden `401`
  (no `404`/`500`, confirma que están bien registradas), `/dashboard/mapa`
  responde `307` a `/login` como el resto del dashboard, logs del
  servidor dev limpios.
- **No se hizo clic a clic con sesión real de un rol** — pendiente,
  declarado al dueño del proyecto en el momento.

## 7. Activación de los tokens de Mapbox (continuación, mismo día)

El dueño del proyecto probó `/dashboard/mapa` y vio "no configurado" en
mapa y geocodificación. Causa doble: faltaba `MAPBOX_PUBLIC_TOKEN` (sólo
se había guardado el secreto) y, aun con ambos en `app/.env`,
**`docker compose`'s `env_file` no se relee en caliente** — el contenedor
`web` ya estaba corriendo desde antes de editar el archivo
(`docker compose exec web printenv` confirmó cero variables `MAPBOX_*`
cargadas). Al pasarme el token público por error dos veces el mismo
secreto, se verificó el prefijo (`pk.` vs `sk.`) antes de guardarlo — un
`sk.` como público habría expuesto un token con permiso de Geocoding al
navegador de cualquier usuario autenticado. Con ambos tokens correctos en
`app/.env` y `docker compose up -d --force-recreate web`, quedaron
activos y confirmados por `printenv` dentro del contenedor.

## 8. Mejoras de uso sobre `/dashboard/mapa` (continuación, mismo día)

Con el mapa ya funcionando, tres pedidos puntuales:

1. **Tarjeta al pasar el cursor, no al hacer clic.** `MapaMultipleInner`
   ligaba el popup con `marker.setPopup()`, que mapbox-gl abre al clic —
   competía con `onPuntoClick` (la navegación a la ficha). Se reemplazó
   por `mouseenter`/`mouseleave` manuales sobre el elemento del marcador;
   `marcadoresRef`/`popupsRef` pasaron de arreglos a `Map<id, ...>` y se
   agregó `activePopupRef` para que sólo haya un popup abierto a la vez,
   sin importar si lo abrió el hover o el buscador (punto 3).
2. **Leyenda de colores.** El color por tipo ya existía
   (`COLOR_POR_TIPO`, de la implementación original) pero nada explicaba
   qué significaba — fila de puntos de color + etiqueta debajo de los
   filtros, reutilizando la misma paleta.
3. **Buscador de pines.** Overlay sobre el mapa que filtra los `puntos`
   ya cargados por nombre (sin acentos/mayúsculas); al elegir un
   resultado hace `flyTo` + abre su popup con el mismo mecanismo del
   hover, sin navegar. Decisión explícita: busca **entre los pines
   existentes**, no geocodifica direcciones nuevas — no hay llamada a
   Mapbox en cada tecleo.

Sin cambios de base de datos ni de API — todo contra el `PuntoMapa[]` que
el mapa ya recibía. Verificado con `tsc`, `docker build --target builder`
y el mismo sanity check por HTTP que en §6 (sin regresión en el redirect
de `/dashboard/mapa`).

## 9. Documentación

- `CLAUDE.md` — 2 gotchas nuevos (`mapbox-gl` vs `maplibre-gl` por ToS;
  `CHECK` para columnas válidas sólo en un valor de enum + `nullif`; y un
  tercero de esta continuación: `env_file` no se relee en caliente),
  entrada de historial (extendida con la activación de tokens y las
  mejoras de UX).
- `db/ESQUEMA.md` — `direcciones` (nota de uso), `ubicaciones_internas`
  (11 columnas + 3 `CHECK` nuevos).
- `db/procesos/direcciones-y-mapa.md` (nuevo) — geocodificación, captura
  de coordenada, componentes de mapa (incluida la fila de tooltip/
  leyenda/buscador), `/dashboard/mapa`, tabla de fallos.
  `db/procesos/ubicaciones-internas.md` y `alta-cliente.md` ampliados con
  referencia cruzada. `README.md` de procesos actualizado.
- `contexto/RTB-ENT-01_Modulo_Entidades.md` — §2.1 (`latitud`/`longitud`
  documentadas por fin), §5 (geo de centro operativo), §7 (rutas de
  `/api/mapa/*` y `/api/geocodificacion`), §8 (UI, incluidas las mejoras
  de uso del punto 8).
- `app/.env.example` — `MAPBOX_TOKEN`/`MAPBOX_PUBLIC_TOKEN` con
  comentario de cuál es secreto.

## Pendiente

- Clic a clic con sesión real de un rol (no se hizo por falta de
  credenciales de usuarios QA a la mano en esta sesión; toda la
  verificación fue por SQL simulando rol, `tsc`, build de producción y
  smoke tests HTTP).
- Buscador de direcciones nuevas (geocodificación libre, no sólo entre
  pines ya cargados) — descartado explícitamente para esta entrega, queda
  como posible ampliación futura si se pide.
