# Procesos — RTB Sistema

Cómo funciona cada flujo operativo de punta a punta: quién puede hacerlo, qué
ruta de API se llama, qué pasa en la base de datos, y qué puede salir mal.
Complementa a `db/ESQUEMA.md` (qué es cada tabla) con el "cómo se usa".

| Documento | Cubre |
|---|---|
| [`alta-usuario.md`](./alta-usuario.md) | Cómo se da de alta una cuenta interna (módulo Auth) |
| [`alta-cliente.md`](./alta-cliente.md) | Alta de un cliente, promoción a `mixta`, modificación libre vs. controlada (incluida `siglas` y la edición de datos generales) |
| [`alta-proveedor.md`](./alta-proveedor.md) | Alta de un proveedor y su condición de pago |
| [`bloqueo-y-aprobaciones.md`](./bloqueo-y-aprobaciones.md) | Bloqueo temporal/permanente y la cola de `solicitudes_cambio` |
| [`cuenta-bancaria-proveedor.md`](./cuenta-bancaria-proveedor.md) | Alta/reemplazo de cuenta bancaria, validación de CLABE, control antifraude |
| [`ubicaciones-internas.md`](./ubicaciones-internas.md) | Construcción del árbol de ubicaciones internas |
| [`alta-producto.md`](./alta-producto.md) | Alta de producto, identificadores dobles, fusión de duplicados, fotos de catálogo y vista de galería |
| [`movimientos-de-inventario.md`](./movimientos-de-inventario.md) | Kardex: unidad de medida, cross-dock, bloqueo de saldo negativo |
| [`conteo-fisico.md`](./conteo-fisico.md) | Congelamiento, asignación, captura con vista ciega, conciliación, firmas |
| [`discrepancias-y-ajustes.md`](./discrepancias-y-ajustes.md) | Investigación de discrepancias y ajuste autorizado del teórico |
| [`redefinicion-unidad-medida.md`](./redefinicion-unidad-medida.md) | Única vía para cambiar la unidad de medida de un producto |
| [`administracion-catalogos.md`](./administracion-catalogos.md) | Familias, categorías, marcas y unidades de medida: pantalla, permisos, diferencia familia/categoría |

Los primeros seis describen el estado real implementado el 2026-08-05
(submódulo RTB-ENT-01); los siguientes cinco, el submódulo RTB-INV-01
(mismo día). Para el detalle de qué se corrigió respecto a cada paquete
original, ver `contexto/AUDITORIA_RTB-ENT-01.md` y
`contexto/AUDITORIA_RTB-INV-01.md` respectivamente. El último
(`administracion-catalogos.md`) documenta `015_catalogo_marcas_y_gobierno.sql`
(2026-08-06): catálogo de marcas nuevo, pantalla de administración que no
existía, y permisos de gobierno de unidad/familia estrechados.

`alta-cliente.md` y `alta-producto.md` se ampliaron el 2026-08-06 (mismo
día, entrega aparte): `siglas` + edición de datos generales de entidad
(`020_entidades_siglas.sql`) y fotos de producto con vista de galería
(`021`-`023_producto_imagenes*.sql`).
