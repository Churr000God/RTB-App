# Proceso — Ubicaciones internas

Árbol de centros operativos, zonas, pasillos, racks y posiciones de RTB.
Corrige a P04 (que exigía exactamente 5 niveles fijos) y al mockup de UI (que
sólo implementaba 4, sin pasillo) reconciliándolos en un único modelo de
profundidad flexible — ver `contexto/AUDITORIA_RTB-ENT-01.md`, hallazgos 6–9.

## Quién puede

Consultar: los 8 roles. Crear/editar: `super_admin`, `direccion`, `almacen`.
**Activar/desactivar: sólo `super_admin`/`direccion`** — `almacen` opera la
estructura pero P04 no le da esa facultad; lo aplica un trigger
(`ubicaciones_before_update()`), no sólo la UI.

## La taxonomía

```
centro_operativo → zona → pasillo → rack → posicion
      (rango 1)     (2)      (3)     (4)      (5)
```

`nivel` (columna) es la **profundidad real** del nodo en el árbol (1–5).
`tipo` (enum) es su posición en la taxonomía de arriba. Un nodo puede
saltarse niveles intermedios de la taxonomía (un `rack` puede colgar directo
de una `zona`, sin `pasillo` — así lo hace el mockup), pero nunca retroceder
(`ubicacion_tipo_rango(hijo) > ubicacion_tipo_rango(padre)`, si no se
cumple el trigger `ubicaciones_before_insert()` rechaza el insert).

## Flujo de alta de un nodo

1. `POST /api/ubicaciones` con `{ parent_id?, segmento, tipo, nombre,
   clasificacion?, uso_especial?, capacidad_posiciones?, responsable_id? }`.
2. El trigger, antes del insert:
   - Normaliza `segmento` a mayúsculas.
   - Si `parent_id` es `null`: `nivel = 1`, `codigo = segmento` (nodo raíz —
     un centro operativo como `ALM-PRINCIPAL`).
   - Si no: busca el padre, valida que no esté ya en `nivel = 5` (máximo de
     la jerarquía) y que el `tipo` del hijo sea más profundo que el del
     padre; calcula `nivel = padre.nivel + 1` y
     `codigo = padre.codigo || '-' || segmento`.
3. El código final es la ruta completa: `ALM-PRINCIPAL-ALM-A-R01-N2` para un
   nodo a 4 niveles de profundidad (ejemplo real verificado, ver
   `contexto/AUDITORIA_RTB-ENT-01.md` §Verificación).

## Inmutabilidad tras el alta

`parent_id`, `segmento`, `codigo`, `nivel` y `tipo` quedan fijos para
siempre — el trigger `ubicaciones_before_update()` los reescribe con su
propio valor anterior en cualquier `UPDATE`, sin importar qué mande el
cliente. Mover un nodo (cambiar de padre) exigiría recalcular el código de
toda su descendencia; no está implementado, es una limitación conocida.

Lo que sí se edita libremente: `nombre`, `descripcion`, `responsable_id`,
`capacidad_posiciones`, `clasificacion`, `uso_especial`, `activo` (con la
restricción de rol de arriba), y — sólo si `tipo = 'centro_operativo'` —
dirección y coordenada (`calle`…`codigo_postal`, `referencia`, `latitud`,
`longitud`; ver `direcciones-y-mapa.md`).

## Dirección y coordenada de un centro operativo (`024_ubicaciones_geo.sql`)

Sólo el nodo raíz del árbol (`tipo = 'centro_operativo'` — un almacén, una
oficina, una sucursal) puede tener dirección postal y coordenada propias;
una zona, pasillo, rack o posición hereda la ubicación de su centro. El
`CHECK` `ubicaciones_geo_solo_centro_chk` lo exige en la base: si `tipo`
no es `centro_operativo`, las 11 columnas nuevas deben ser todas `NULL` —
no es sólo una regla de la UI. Flujo de captura, geocodificación y mapa
compartido con las direcciones de entidades: ver
[`direcciones-y-mapa.md`](./direcciones-y-mapa.md).

## Clasificación vs. uso especial

`clasificacion` (`fisica|logica|especial`) es independiente del `tipo`
jerárquico — resuelve la confusión de P04, que mezclaba ambos conceptos bajo
un solo campo "tipo". `uso_especial` (`cuarentena|devoluciones|
material_danado|recepcion|embarque|picking`) sólo tiene sentido cuando
`clasificacion='especial'` — un `CHECK` lo exige.

## Ocupación — lo que esta tabla NO guarda

`capacidad_posiciones` existe (cuántas posiciones caben), pero la **ocupación
actual** no se almacena aquí: es un cálculo del módulo de Almacén, que
todavía no existe. La UI de `/dashboard/ubicaciones` muestra "—" para
capacidad si no está definida, y el bloque de "últimos movimientos" está
marcado explícitamente como pendiente de esa integración.

## Qué puede fallar

| Síntoma | Causa |
|---|---|
| "El tipo X no puede colgar de un padre de tipo Y (retrocede en la jerarquía)" | Se intentó un tipo menos profundo que el del padre |
| "La jerarquía no admite más de 5 niveles" | El padre ya está en `nivel = 5` |
| "Ya existe una ubicación con ese segmento bajo el mismo padre" | Índice único de `segmento` entre hermanos (o entre raíces, si `parent_id IS NULL`) |
| 403 al cambiar `activo` | El rol es `almacen` — sólo `super_admin`/`direccion` pueden activar/desactivar |
| "Sólo un centro operativo puede tener dirección y coordenada" | Se intentó capturar `calle`/`latitud`/etc. en una zona, pasillo, rack o posición — `ubicaciones_geo_solo_centro_chk` |
| "Captura ambas coordenadas (latitud y longitud) o ninguna" | `ubicaciones_geo_chk`, espejo de `direcciones_geo_chk` |
