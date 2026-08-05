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
  directo vía RLS para `super_admin`/`direccion`/`compras`.
- **Controlada:** `categoria`/`condicion_pago` — "categoría de proveedor:
  compras inicia, direccion aprueba" (P05 §II). Sin `GRANT UPDATE`; el
  cambio exige `POST /api/solicitudes-cambio` con
  `tipo_cambio: 'condicion_proveedor'`, resuelto por `direccion`.

## Siguiente paso natural: cuenta bancaria

Un proveedor recién dado de alta normalmente necesita al menos una cuenta
bancaria antes de poder recibir pagos. Ese es un flujo aparte, con acceso
mucho más restringido (sólo `finanzas`/`super_admin`) — ver
`db/procesos/cuenta-bancaria-proveedor.md`.

## Qué puede fallar

Los mismos casos que `alta-cliente.md` (RFC duplicado, campos comerciales
faltantes), más: `403` al intentar `PATCH categoria`/`condicion_pago` desde
cualquier rol que no sea `super_admin` — el mensaje señala explícitamente
`POST /api/solicitudes-cambio`.
