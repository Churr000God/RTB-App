# Proceso — Cuenta bancaria de proveedor

El control más estricto del esquema. Implementa P03 al pie de la letra —
manda sobre el DDL del documento maestro original, que le daba a `compras`
acceso completo (contradicción real del paquete, ver
`contexto/AUDITORIA_RTB-ENT-01.md`, hallazgo 5).

## Principio rector

> Solo finanzas inicia el proceso; solo super_admin aprueba; nadie más puede
> ver o modificar cuentas bancarias. — P03 §I

`direccion` es la única excepción parcial: ve el **estado**, con la CLABE
enmascarada, nunca la tabla base.

## Quién puede qué

| Rol | Ver tabla completa | Ver resumen enmascarado | Iniciar | Aprobar/Rechazar |
|---|---|---|---|---|
| `finanzas` | Sí (RLS) | — | Sí | No |
| `super_admin` | Sí (RLS) | — | Sí | Sí |
| `direccion` | No | Sí (`proveedor_cuentas_resumen()`) | No | No |
| Cualquier otro | No | No | No | No |

## Flujo de alta

1. `finanzas` sube el comprobante (PDF/JPG/PNG, máx. 10 MB) — primero pide
   una URL firmada de subida:
   `POST /api/proveedores/[id]/cuentas/comprobante-upload-url`, sube el
   archivo directo al bucket privado `comprobantes-bancarios` con esa URL, y
   se queda con el `path` devuelto.
2. `POST /api/proveedores/[id]/cuentas` con `{ banco, clabe, cuenta, titular,
   rfc_beneficiario, moneda, comprobante_path, motivo_cambio? }`.
   `cuentaBancariaCreateSchema` (`app/lib/entidades/schemas.ts`) valida la
   CLABE con `clabeValida()` — espejo exacto en TypeScript del algoritmo de
   dígito verificador que también corre en Postgres
   (`public.clabe_valida()`, `CHECK` de la tabla).
3. Si ya existe una cuenta `activa` para ese proveedor, `motivo_cambio` es
   obligatorio y esa cuenta pasa a `pendiente_reemplazo` (con el cliente
   admin — `estado` no es de escritura directa ni para `finanzas`).
4. La nueva cuenta queda `pendiente_aprobacion`.

## Aprobación

`POST /api/proveedores/[id]/cuentas/[cid]/aprobar` — sólo `super_admin`:

1. Verifica que la cuenta esté `pendiente_aprobacion` (`409` si no).
2. Cualquier otra cuenta del mismo proveedor en `pendiente_reemplazo` pasa a
   `inactiva` automáticamente — la nueva la reemplaza.
3. La cuenta objetivo pasa a `activa`, con `aprobada_por`/`aprobada_at`.
4. Evento explícito en `audit_log` (IP, `accion: 'aprobacion'`).

**Regla dura de la base de datos:** un índice único parcial garantiza que
nunca haya más de una cuenta `activa` por proveedor, sin importar qué haga la
API — es la barrera real, no una validación de aplicación.

## Rechazo

`POST /api/proveedores/[id]/cuentas/[cid]/rechazar` con
`{ motivo_rechazo }` — sólo `super_admin`. La cuenta pasa a `rechazada`;
`finanzas` puede volver a intentar con una fila nueva.

## Por qué nunca se elimina una cuenta

P03 §IV: *"no se puede eliminar una cuenta con pagos históricos — únicamente
se puede inactivar."* No hay `GRANT DELETE` para nadie salvo `service_role`
en `proveedor_cuentas_bancarias`, y ninguna ruta de la API expone un borrado.

## Ver el estado sin ver la CLABE (`direccion`)

`GET /api/proveedores/[id]/cuentas` decide internamente: si el rol es
`finanzas`/`super_admin`, consulta la tabla completa con RLS; para cualquier
otro rol autorizado, llama a `public.proveedor_cuentas_resumen(proveedor_id)`
— una función `SECURITY DEFINER` que devuelve la CLABE como `****1234` y
sólo produce filas si `current_user_role()` está en
`('direccion','finanzas','super_admin')`.

## Qué puede fallar

| Síntoma | Causa |
|---|---|
| "Ya existe una cuenta activa; indica el motivo del reemplazo" | Falta `motivo_cambio` al dar de alta con una `activa` existente |
| "CLABE inválida (dígito verificador incorrecto)" | `clabeValida()` — no es sólo cuestión de longitud |
| 403 / 0 filas para `compras` o cualquier otro rol | Comportamiento esperado — P03 lo exige |
| No aparece nada para `direccion` aunque hay cuentas | Está viendo el resumen enmascarado, revisar `enmascarado: true` en la respuesta |
