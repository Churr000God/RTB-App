# Proceso — Redefinición de unidad de medida

Única vía para cambiar `productos.unidad_medida_id`/`contenido_por_unidad`.
Existe porque la unidad de medida mal definida es la causa **medida** de la
mayor pérdida de inventario de RTB: 14 de 27 folios de no conformidad del
corte de julio, −2,811 piezas, −$37,919.77 (Registro de Discrepancias real,
CIE-DIS-01).

## Quién puede

Solicitar: `super_admin`, `direccion`, `compras`, `almacen`. Autorizar/
rechazar: `super_admin`/`direccion`, nunca el propio solicitante. Aplicar:
`super_admin`/`direccion`.

## Dónde

UI: `app/app/dashboard/productos/[id]/redefinir-unidad/page.tsx`. API:
`app/app/api/productos/[id]/redefinir-unidad/route.ts` (crear),
`app/app/api/redefiniciones-unidad/` (cola, resolver, aplicar).

## Por qué no es un `UPDATE` directo

`productos_guard_unidad()` (`013_inventario_discrepancias_ajustes.sql`)
rechaza cualquier `UPDATE` de `unidad_medida_id`/`contenido_por_unidad` que
no venga respaldado por una fila `producto_unidad_redefiniciones` en estado
`autorizado` con esos valores exactos — y corre para **cualquier**
`UPDATE`, incluido uno hecho con `service_role`. No hay atajo.

## 1. Solicitar

`POST /api/productos/[id]/redefinir-unidad` con
`{ unidad_nueva_id, contenido_nuevo, motivo, requiere_reconteo?, conteo_id? }`.
El cliente **sólo elige la unidad nueva** — la API congela
`unidad_anterior_id`/`contenido_anterior` y el saldo base actual
(`existencia_base_anterior`/`existencia_base_convertida`) leyéndolos del
propio producto y sus existencias, para que nadie pueda declarar un "antes"
distinto al real.

## 2. Autorizar

`POST /api/redefiniciones-unidad/[id]/resolver` — mismo patrón que
`inventario_ajustes` (`rum_no_autoaprobacion_chk`): el autorizador nunca
puede ser el solicitante.

## 3. Aplicar

`POST /api/redefiniciones-unidad/[id]/aplicar`, en este orden exacto (el
orden importa):

1. Escribe la nueva unidad en `productos` **mientras la redefinición sigue
   en `autorizado`** — `productos_guard_unidad()` exige encontrar una fila
   `autorizado` en ese momento, no `aplicado`.
2. Sólo después marca la redefinición como `aplicado`.

Si `requiere_reconteo=true`, `rum_reconteo_chk` bloquea `aplicado` hasta
que exista un `conteo_id` — no se da por buena una conversión de unidad sin
haber vuelto a contar el producto bajo la unidad nueva.

## Qué puede fallar

| Síntoma | Causa |
|---|---|
| "La unidad nueva es igual a la actual; no hay cambio que redefinir" | `rum_cambio_real_chk` |
| "No puedes autorizar tu propia solicitud" | `rum_no_autoaprobacion_chk` |
| "Esta redefinición exige un reconteo antes de aplicarse" | `requiere_reconteo=true` sin `conteo_id` vinculado |
| Un `UPDATE` directo de `productos.unidad_medida_id` no tiene efecto o falla `42501` | `productos_guard_unidad()` — es la barrera intencional |

## Pantalla

`/dashboard/inventario/redefiniciones` (gap de UI cerrado 2026-08-06,
`contexto/AUDITORIA_QA_ROLES_2026-08-06.md` §4): antes se podía
*solicitar* una redefinición desde el detalle de producto, pero no había
ninguna pantalla para verla, autorizarla ni aplicarla — `POST .../resolver`
y `.../aplicar` existían y respondían, sin ningún botón que los llamara.
