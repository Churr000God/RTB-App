-- ==========================================
-- RTB Sistema — 022: corrige after_upd_producto_imagenes (021)
--
-- Bug encontrado en la verificación de 021_producto_imagenes.sql, antes de
-- que hubiera datos reales en riesgo (mismo patrón que el hueco de
-- autorización de 012_inventario_conteos.sql): promover una imagen a
-- principal con un UPDATE directo (`update producto_imagenes set
-- es_principal = true where id = ...`, el camino que usa la API) fallaba
-- con 23505 en uq_producto_imagen_principal, aunque el BEFORE trigger de
-- 021 sí degrada correctamente a la hermana antes de escribir la fila.
--
-- Causa real (diagnosticada reproduciendo el caso mínimo antes de tocar la
-- tabla real): after_upd_producto_imagenes escuchaba "of es_principal,
-- activo". El UPDATE anidado que el BEFORE trigger dispara para degradar
-- a la hermana (todavía DENTRO del BEFORE trigger de la fila que se está
-- promoviendo, antes de que esa fila termine de escribirse) ES una
-- sentencia completa por derecho propio — dispara su propio AFTER trigger
-- al terminar. En ese instante exacto la fila que se está promoviendo
-- TODAVÍA tiene su valor viejo en el heap (es_principal=false, la
-- sentencia externa no ha terminado), así que el AFTER trigger ve "cero
-- principales activas para este producto" y "arregla" la situación
-- repromoviendo a la hermana que se acababa de degradar. Cuando la
-- sentencia externa por fin escribe la fila que sí debía quedar
-- principal, la hermana ya volvió a estar en true → choque real con el
-- índice único. No es un problema de MVCC/snapshot de Postgres (se
-- descartó con una réplica mínima que SÍ funciona sin el AFTER trigger de
-- por medio) — es que el AFTER trigger reacciona a un estado transitorio
-- que no le correspondía atender.
--
-- Corrección: el AFTER trigger sólo debe reaccionar cuando una fila se da
-- de baja de verdad (activo pasa a false) — ahí sí puede faltar principal
-- de forma genuina y hace falta promover otra. Una degradación de
-- es_principal mientras la fila sigue activa (caso "se está reasignando
-- la principal a otra") no debe disparar la recuperación automática: la
-- fila que va a quedar principal ya está en camino en la MISMA operación.
-- Se estrecha el trigger a "after update of activo" únicamente — el
-- cuerpo de la función no cambia, sólo dispara con menos frecuencia.
--
-- Verificado tras el cambio (ver conversación/plan): promover una imagen
-- ya existente con UPDATE directo, desactivar la principal (promueve la
-- siguiente por orden automáticamente) y desactivar la última activa
-- (0 principales, 0 activas, sin error) — los tres casos sin 23505.
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

drop trigger after_upd_producto_imagenes on public.producto_imagenes;

create trigger after_upd_producto_imagenes
  after update of activo on public.producto_imagenes
  for each row execute function public.producto_imagenes_principal_after();
