-- 054_entidades_persona_tipo_cambio_controlado.sql
-- Agrega 'persona_tipo' al enum cambio_controlado (005_solicitudes_tipo_cambio.sql).
--
-- La tarjeta "Modificación controlada (P05)" de la ficha de entidad mostraba
-- persona_tipo/nombre_legal/rfc como sólo lectura, sin ningún botón para
-- solicitar el cambio — el dueño del proyecto pidió que 'ventas' pudiera
-- solicitarlo. Investigando se encontró que persona_tipo, a diferencia de
-- nombre_legal/rfc, no tenía NINGÚN camino de escritura: ni GRANT, ni este
-- enum, ni campo en ningún schema zod — un hueco real, no sólo de UI.
--
-- Sólo se agrega el valor nuevo al enum; nada en esta misma migración lo
-- referencia (ni una función, ni un INSERT), así que no aplica el gotcha ya
-- documentado en CLAUDE.md de separar el ALTER TYPE de su primer uso en la
-- misma transacción — el primer uso real ocurre después, desde la app.

alter type public.cambio_controlado add value 'persona_tipo';
