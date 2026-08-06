# Procesos — RTB Sistema

Cómo funciona cada flujo operativo de punta a punta: quién puede hacerlo, qué
ruta de API se llama, qué pasa en la base de datos, y qué puede salir mal.
Complementa a `db/ESQUEMA.md` (qué es cada tabla) con el "cómo se usa".

| Documento | Cubre |
|---|---|
| [`alta-usuario.md`](./alta-usuario.md) | Cómo se da de alta una cuenta interna (módulo Auth) |
| [`alta-cliente.md`](./alta-cliente.md) | Alta de un cliente, promoción a `mixta`, modificación libre vs. controlada |
| [`alta-proveedor.md`](./alta-proveedor.md) | Alta de un proveedor y su condición de pago |
| [`bloqueo-y-aprobaciones.md`](./bloqueo-y-aprobaciones.md) | Bloqueo temporal/permanente y la cola de `solicitudes_cambio` |
| [`cuenta-bancaria-proveedor.md`](./cuenta-bancaria-proveedor.md) | Alta/reemplazo de cuenta bancaria, validación de CLABE, control antifraude |
| [`ubicaciones-internas.md`](./ubicaciones-internas.md) | Construcción del árbol de ubicaciones internas |
| [`alta-producto.md`](./alta-producto.md) | Alta de producto, identificadores dobles, fusión de duplicados |
| [`movimientos-de-inventario.md`](./movimientos-de-inventario.md) | Kardex: unidad de medida, cross-dock, bloqueo de saldo negativo |
| [`conteo-fisico.md`](./conteo-fisico.md) | Congelamiento, asignación, captura con vista ciega, conciliación, firmas |
| [`discrepancias-y-ajustes.md`](./discrepancias-y-ajustes.md) | Investigación de discrepancias y ajuste autorizado del teórico |
| [`redefinicion-unidad-medida.md`](./redefinicion-unidad-medida.md) | Única vía para cambiar la unidad de medida de un producto |

Los primeros seis describen el estado real implementado el 2026-08-05
(submódulo RTB-ENT-01); los últimos cinco, el submódulo RTB-INV-01
(mismo día). Para el detalle de qué se corrigió respecto a cada paquete
original, ver `contexto/AUDITORIA_RTB-ENT-01.md` y
`contexto/AUDITORIA_RTB-INV-01.md` respectivamente.
