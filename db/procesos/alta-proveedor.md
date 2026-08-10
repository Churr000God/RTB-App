# Proceso — Alta y edición de proveedor

Mismo mecanismo que el alta de cliente
(`db/procesos/alta-cliente.md`) — este documento sólo cubre lo que cambia.

## Quién puede

Dar de alta: `super_admin`, `direccion`, `compras`. `compras` no puede dar de
alta un `tipo='cliente'` (bloqueado en la ruta antes de tocar la DB).

## Flujo

Igual que cliente: `POST /api/entidades` con `tipo: 'proveedor'` (o
`'mixta'`) y el sub-objeto `proveedor` (`categoria`, `plazo_pago`,
`condicion_pago`, `moneda_default`) validado por `proveedorDatosSchema`
(`app/lib/entidades/schemas.ts`). La entidad queda `activa` de inmediato.

## Campo que RTB-ENT-01 añadió sobre la spec original

`proveedores.condicion_pago` (`credito_abierto | contado |
anticipo_requerido`) no estaba en el paquete de AbacusAI — lo necesita
Compras (`contexto/RTB-PRO-COM-01_Modulo_Compras.md`, clasificación de
proveedores por condición de pago) y no tenía dónde vivir. Ver
`contexto/AUDITORIA_RTB-ENT-01.md`, hallazgo 24.

## Edición: libre vs. controlada

- **Libre:** `plazo_pago`, `credito_autorizado`, `moneda_default` — `UPDATE`
  directo vía RLS para `super_admin`/`direccion`/`compras`. Los campos de
  `entidades` (incluidas `siglas`) se editan aparte, desde la pestaña
  "General" del detalle — ver `alta-cliente.md` → "Edición: libre vs.
  controlada".
- **Controlada:** `categoria`/`condicion_pago` — "categoría de proveedor:
  compras inicia, direccion aprueba" (P05 §II). Sin `GRANT UPDATE`; el
  cambio exige una solicitud (`tipo_cambio: 'condicion_proveedor'`),
  resuelta por `direccion` en `/dashboard/solicitudes`. **Hasta 2026-08-10
  esto era una regla declarada sin interfaz real**: la tarjeta "Condiciones
  comerciales · Proveedor" era de sólo lectura, sin lápiz ni ruta —
  `compras` no tenía ninguna forma de siquiera proponer el cambio desde la
  app (el resolver ya sabía aplicarlo, pero era inalcanzable). Cerrado con
  `PATCH /api/entidades/[id]/proveedor` (ruta nueva, dedicada — decide sola
  directo-vs-solicitud con `ejecutaDirecto()`, mismo patrón que
  `.../cliente` para `limite_credito`) y **`CampoP05Multi`** en
  `entidad-detalle.tsx`: variante de `CampoP05` que cubre `categoria` +
  `condicion_pago` en una sola solicitud (a diferencia de `rfc`/`razon_social`/
  `persona_tipo`, que son de un solo campo cada uno).

## Siguiente paso natural: cuenta bancaria

Un proveedor recién dado de alta normalmente necesita al menos una cuenta
bancaria antes de poder recibir pagos. Ese es un flujo aparte, con acceso
mucho más restringido (sólo `finanzas`/`super_admin`) — ver
`db/procesos/cuenta-bancaria-proveedor.md`.

## Qué puede fallar

Los mismos casos que `alta-cliente.md` (RFC duplicado, campos comerciales
faltantes), más: `PATCH /api/entidades/[id]/proveedor` sólo acepta
`super_admin`/`compras` (`requireApiRole`) — cualquier otro rol, incluido
`direccion` (que sólo aprueba, no propone), recibe `403` ahí. Si `compras`
manda un motivo de menos de 5 caracteres, `400` "El motivo debe tener al
menos 5 caracteres" antes de crear la solicitud.
