# Proceso — Discrepancias y ajustes autorizados

Investigación de diferencias (CIE-DIS-01) y corrección autorizada del
teórico (CIE-AJU-01). Cierra el hallazgo real medido por RTB: *"Ajustes
aplicados sin autorización registrada: 34 de 34."*

## Quién puede

Registrar/investigar discrepancias: `super_admin`, `direccion`, `almacen`,
`compras`. Crear/enviar un ajuste: el mismo grupo, pero sólo el propio
solicitante lo edita y sólo mientras está en `borrador`. Autorizar/rechazar
un ajuste: `super_admin`/`direccion`, **nunca el propio solicitante** — es
estructural (`aju_no_autoaprobacion_chk`), no una regla de la API. Aplicar
un ajuste autorizado: `super_admin`/`direccion`.

## Dónde

UI: `app/app/dashboard/inventario/discrepancias/`,
`app/app/dashboard/inventario/ajustes/`. API:
`app/app/api/inventario/discrepancias/`, `app/app/api/inventario/ajustes/`.

## La regla dura, como `CHECK`

*"Una diferencia sin causa identificada no se ajusta: se declara como
hallazgo. Ajustar sin entender es hacer que el problema desaparezca de la
vista sin que desaparezca del almacén."* (Registro de Discrepancias real).
`dis_causa_chk` en `013_inventario_discrepancias_ajustes.sql` lo hace
imposible de saltarse: sólo las salidas `hal` (hallazgo) y `men` (diferencia
menor) pueden ir sin `causa_presunta` + `banda`. Ni `service_role` puede
insertar una discrepancia `salida='cap'` sin causa.

## 1. Investigar una discrepancia

`POST /api/inventario/discrepancias/[id]/resolver` con
`{ salida, banda?, causa_presunta?, discrepancia_par_id?, ajuste_id?, hallazgo_id?, estado? }`.

`salida` — vocabulario real de CIE-DIS-01 §X:

| Código | Significado |
|---|---|
| `ubi` | Corrección de ubicación (Paso 0 · Reubicación, ver abajo) |
| `cap` | Corrección de captura |
| `aju` | Ajuste autorizado con soporte |
| `aju_sin_soporte` | Ajuste autorizado sin soporte documental ("AJU s/s") |
| `justificado` | Material en tránsito, no es una pérdida real |
| `hal` | Hallazgo abierto — sin causa identificada |
| `men` | Diferencia menor no rastreada |

## Paso 0 · Reubicación

*"Una pieza mal ubicada genera DOS discrepancias: un faltante donde debía
estar y un sobrante donde apareció. Antes de rastrear se busca el par."*
`discrepancia_par_id` + `dis_ubi_chk` exigen que toda discrepancia con
`salida='ubi'` señale su pareja; un trigger (`discrepancias_valida_par()`)
valida que la pareja sea el **mismo producto** con **signo opuesto** — un
faltante no puede emparejarse con otro faltante.

## 2. Crear y enviar un ajuste

1. `POST /api/inventario/ajustes` — nace en `borrador`; `estado` no está
   en el `GRANT INSERT`.
2. `POST /api/inventario/ajustes/[id]/lineas` — una o más líneas
   `{ producto_id, ubicacion_id?, cantidad_ajuste, costo_unitario? }`,
   sólo mientras el ajuste sigue en `borrador` y eres su solicitante.
3. `POST /api/inventario/ajustes/[id]/enviar` — pasa a
   `pendiente_autorizacion`. Exige soporte (`soporte_path` o `sin_soporte`
   con `motivo_sin_soporte`) y al menos una línea.

## 3. Autorizar y aplicar

`POST /api/inventario/ajustes/[id]/resolver` con
`{ decision: 'autorizar'|'rechazar', ... }` — sólo `super_admin`/
`direccion` que **no** sea el solicitante (comprobado en la API y de nuevo,
estructuralmente, por `aju_no_autoaprobacion_chk`).

`POST /api/inventario/ajustes/[id]/aplicar` genera un
`inventario_movimientos` (`entrada_ajuste`/`salida_ajuste`, con este
`ajuste_id`) por cada línea, vía `service_role` — `ajuste_id` no está en el
`GRANT INSERT` del kardex para `authenticated` bajo ninguna circunstancia.
La propia inserción del movimiento vuelve a comprobar
`ajuste_autorizado(ajuste_id)` dentro del trigger del kardex: aunque este
endpoint tuviera un bug, Postgres exige de nuevo que el ajuste esté
`autorizado`/`aplicado` antes de mover una sola pieza — dos capas
independientes, no una.

## Hallazgo — sobrevive al conteo

Cuando la salida es `hal`, se crea/vincula un `inventario_hallazgos`. **No
se cancela al cerrar el acta del conteo que lo originó** — es lo que
impide que "el problema desaparezca de la vista". Se cierra aparte
(`POST /api/inventario/hallazgos/[id]/cerrar`), con o sin causa finalmente
identificada.

## Qué puede fallar

| Síntoma | Causa |
|---|---|
| "Esta salida exige causa presunta y banda" | `dis_causa_chk` — la salida no es `hal`/`men` |
| "Paso 0 · Reubicación: la pareja debe ser del mismo producto" / "...signo opuesto" | `discrepancias_valida_par()` |
| "Sube el soporte documental o marca 'sin soporte' con motivo" | `aju_soporte_chk`, al enviar a autorización |
| "El ajuste necesita al menos una línea" | Se intentó enviar sin líneas |
| "No puedes autorizar tu propia solicitud" | `aju_no_autoaprobacion_chk` |
| "No se puede mover inventario con un ajuste no autorizado" | Se intentó aplicar (o el trigger del kardex detectó) un ajuste que no está `autorizado`/`aplicado` |

## Pantallas

Gaps de UI cerrados 2026-08-06 (`contexto/AUDITORIA_QA_ROLES_2026-08-06.md`
§4) — las tres rutas ya existían y respondían, sin ninguna pantalla que
las llamara:

- `/dashboard/inventario/discrepancias` — antes sólo listaba y resolvía;
  ahora también da de alta una discrepancia manual (`POST
  /api/inventario/discrepancias`), para diferencias detectadas fuera de
  un conteo formal.
- `/dashboard/inventario/hallazgos` — pantalla nueva completa (listar,
  crear, cerrar con o sin causa), con `HallazgoEstadoBadge` nuevo.
- Soporte documental de un ajuste: antes un `<input>` de texto libre para
  pegar la ruta a mano; ahora sube de verdad al bucket privado
  `soportes-inventario` vía URL firmada (`POST /api/inventario/ajustes/[id]/soporte-upload-url`,
  mismo patrón que `comprobante-upload-url` de RTB-ENT-01).
- Selectores de producto/ubicación en las líneas de ajuste: antes
  `<Input>` de texto libre pidiendo un UUID pegado a mano (ningún lugar
  de la app lo mostraba para copiarlo); ahora `ProductoCombobox`
  (`cmdk`, respaldado por `GET /api/productos?q=`) y `UbicacionSelect`.
