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

Todos describen el estado real implementado el 2026-08-05 (submódulo
RTB-ENT-01). Para el detalle de qué se corrigió respecto al paquete original
de AbacusAI, ver `contexto/AUDITORIA_RTB-ENT-01.md`.
