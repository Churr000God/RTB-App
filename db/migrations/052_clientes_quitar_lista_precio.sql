-- 052_clientes_quitar_lista_precio.sql
-- Retira clientes.lista_precio: se capturaba en el alta y se mostraba en la
-- ficha, pero ninguna función de RTB-VEN-01 la consulta (el precio de línea
-- es costo x margen de familia con snapshot, no una tarifa por lista) — el
-- dueño del proyecto confirmó que no se va a usar. Verificado antes de
-- dropear: 0 de 2 clientes reales tenían el campo capturado. `drop column`
-- retira también el GRANT UPDATE (columna) por sí solo, sin revoke aparte.

alter table public.clientes
  drop column if exists lista_precio;
