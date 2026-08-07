# Proceso — Dirección, coordenada y mapa

Cómo se captura la ubicación geográfica de una dirección de entidad
(cliente/proveedor/mixta) o de un centro operativo, y cómo se ve en el
mapa. Introducido el 2026-08-06 (`024_ubicaciones_geo.sql` +
`app/lib/mapas/`) a pedido del dueño del proyecto: Logística necesita el
punto exacto, no una cadena de texto, para programar entregas y rutas
(`contexto/RTB-PRO-RUT-01_Modulo_Rutas.md`).

## Qué ya existía y qué se agregó

`direcciones.latitud`/`longitud` (`numeric(10,7)`, ambas o ninguna) están
en la base desde `002_entidades_core.sql` — el primer día del submódulo —
pero ninguna pantalla las capturaba ni las mostraba, y no había forma de
agregar o editar una dirección de una entidad ya existente (sólo se
capturaba una, al dar de alta la entidad; después era de sólo lectura).
`024_ubicaciones_geo.sql` añadió el mismo par de columnas —y el resto de
una dirección postal— a `ubicaciones_internas`, restringido por `CHECK` a
sólo `tipo = 'centro_operativo'` (ver `ubicaciones-internas.md`). Lo demás
es UI, geocodificación y mapa, todo nuevo.

## Quién puede

Mismos roles que ya escribían `direcciones`: `super_admin`, `direccion`,
`ventas`, `compras`, `almacen`, `logistica` (RLS de `002_entidades_core.sql`,
sin cambios). Para un centro operativo: `super_admin`, `direccion`,
`almacen` (RLS de `ubicaciones_internas`). `GET /api/geocodificacion` exige
los mismos seis roles que escriben direcciones — quien no puede crear una
dirección tampoco necesita geocodificar una.

## Geocodificación (Mapbox)

`app/lib/mapas/mapbox.ts` llama a Mapbox Geocoding v6 desde servidor
únicamente (`MAPBOX_TOKEN`, secreto, nunca llega al cliente — ver
`app/lib/mapas/config.ts`, mismo patrón que
`app/lib/supabase/admin.ts`/`SUPABASE_SERVICE_ROLE_KEY`):

- **Inversa** (`?modo=inverso&latitud=&longitud=`): coordenada → dirección.
  Botón "Obtener dirección de esta coordenada" en `CampoCoordenada`.
- **Directa** (`?modo=directo&q=`): texto libre → dirección + coordenada
  (expuesta en `app/lib/mapas/mapbox.ts`, sin consumidor de UI todavía).

`permanent=true` en ambas llamadas: el resultado se guarda en
`direcciones`/`ubicaciones_internas`, y el modo temporal (default) de
Mapbox prohíbe persistirlo — sólo mostrarlo y descartarlo. Se factura
aparte del nivel gratuito de Mapbox (decisión confirmada con el dueño del
proyecto antes de implementar).

**Nunca se sobrescribe solo.** El resultado se muestra en
`PropuestaDireccion` con "Usar esta dirección" / "Descartar"; los campos
del formulario sólo cambian si el usuario pulsa "Usar esta dirección". Una
geocodificación imprecisa nunca pisa una dirección capturada correctamente
a mano.

## Captura de la coordenada

`CampoCoordenada` (dos inputs, latitud y longitud) y `MapaPunto` (pin
arrastrable + clic en el mapa reposiciona) están sincronizados en ambos
sentidos — cualquiera de los dos actualiza al otro. `CampoCoordenada`
también acepta pegar `"20.6736, -103.3440"` en el campo de latitud y lo
separa solo (así se copia una coordenada desde Google Maps en el celular).

## El mapa (`app/components/mapas/`)

`mapbox-gl` (no `maplibre-gl`, que ya estaba en `package.json` sin uso —
ver Gotchas de `CLAUDE.md`) dibuja el mapa. Como toca `window`, los
componentes reales (`MapaPuntoInner`/`MapaMultipleInner`) sólo se importan
con `next/dynamic({ ssr: false })`, a través de `MapaPunto.tsx`/
`MapaMultiple.tsx` — el resto de la app importa siempre estos wrappers, no
los `*Inner` directo. El token público (`pk.`) se pide a
`GET /api/mapa/config` al montar, tras sesión — nunca inlinado en el
bundle (mismo motivo que `NEXT_PUBLIC_SUPABASE_URL`, ver
`app/lib/storage/publico.ts`). Sin `MAPBOX_TOKEN`/`MAPBOX_PUBLIC_TOKEN`
configurados, `mapaHabilitado()` es `false` y el componente muestra un
aviso en vez de romper el formulario — el resto de la pantalla (incluidos
los campos de latitud/longitud) sigue funcionando.

- **`MapaPunto`** — un pin. `editable` lo hace arrastrable y activa clic
  para reposicionar; sin `editable`, sólo lectura.
- **`MapaMultiple`** — varios pines con tarjeta (título/subtítulo) **al
  pasar el cursor**, no al hacer clic — el popup se abre/cierra a mano con
  `mouseenter`/`mouseleave` sobre el elemento del marcador
  (`marcadoresRef`/`popupsRef` indexados por `id` de punto,
  `activePopupRef` para que sólo haya uno abierto a la vez). `onPuntoClick`
  navega a la ficha correspondiente — el clic queda libre para eso, no
  compite con abrir el popup. Incluye un buscador propio (`BuscadorPuntos`,
  overlay arriba a la izquierda del mapa): filtra los `puntos` ya cargados
  por nombre (sin acentos/mayúsculas), y al elegir uno hace `flyTo` +
  abre su popup con el mismo mecanismo del hover, sin navegar — busca
  **entre los pines existentes**, no geocodifica una dirección nueva
  (decisión explícita: no depender de otra llamada a Mapbox por cada
  tecleo).

## `/dashboard/mapa`

Vista de todos los puntos con coordenada: direcciones activas de entidades
(`GET /api/mapa/puntos` → `direcciones`, con la entidad embebida) y centros
operativos activos (→ `ubicaciones_internas` filtrado por
`tipo = 'centro_operativo'`). Filtro por tipo (cliente/proveedor/mixta/
centro operativo), **leyenda de colores** debajo de los filtros (un punto
de color + etiqueta por cada entrada de `COLOR_POR_TIPO`, para que el
color del pin comunique algo sin adivinar), clic en el pin navega a
`/dashboard/entidades/[id]` o a `/dashboard/ubicaciones?seleccionar=[id]`
(este último parámetro abre esa ubicación directo en el árbol). Lectura
para los 8 roles — misma cobertura que `direcciones`/`ubicaciones` por
separado. Índices parciales `idx_direcciones_geo`/`idx_ubicaciones_geo`
(`024_ubicaciones_geo.sql`) cubren exactamente este filtro
(`latitud is not null and activo = true`).

## Qué puede fallar

| Síntoma | Causa |
|---|---|
| El mapa muestra "El mapa no está configurado todavía" | Falta `MAPBOX_TOKEN`/`MAPBOX_PUBLIC_TOKEN` en `app/.env`, **o** se agregaron pero el contenedor `web` no se recreó — `env_file` no se relee en caliente (ver `CLAUDE.md` → Gotchas, `docker compose up -d --force-recreate web`) |
| "No se encontró una dirección para esa búsqueda" (404) | Mapbox no devolvió resultados para esa coordenada/texto |
| "La geocodificación no está configurada todavía" (503) | Igual que arriba: sin tokens, `GET /api/geocodificacion` no intenta llamar a Mapbox |
| Ver `ubicaciones-internas.md` | Para los errores propios de la dirección de un centro operativo (`ubicaciones_geo_solo_centro_chk`, `ubicaciones_geo_chk`) |
