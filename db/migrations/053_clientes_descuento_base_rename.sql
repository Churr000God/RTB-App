-- 053_clientes_descuento_base_rename.sql
-- Renombra clientes.descuento_maximo -> clientes.descuento_base.
--
-- El nombre "máximo" prometía una validación que nunca existió: ninguna
-- función de RTB-VEN-01 topa el descuento_porcentaje de una línea de
-- cotización contra este valor (confirmado revisando 030/031/040 — sólo el
-- CHECK genérico 0..100 por línea). Se usa exclusivamente como valor de
-- partida para prellenar el campo "Descuento %" al agregar una línea
-- (editable, sin tope) — el nombre correcto es "base", que es como ya lo
-- rotulaba la UI (ver Historial de decisiones, sesión de renombrado del
-- campo "Lista de precios"/"Descuento base %", 2026-08-10). Decisión
-- explícita del dueño del proyecto: mantenerlo como sólo-prellenado (no
-- convertirlo en tope duro ni en tope con excepción autorizable) y corregir
-- el nombre en la base para que no siga sugiriendo una regla que no existe.
--
-- `rename column` conserva el GRANT UPDATE por columna que ya tenía
-- (037_roles_comerciales.sql) — el privilegio sigue al atributo, no al
-- nombre.

alter table public.clientes
  rename column descuento_maximo to descuento_base;
