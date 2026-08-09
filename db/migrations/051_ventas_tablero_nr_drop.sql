-- 051_ventas_tablero_nr_drop.sql
-- RTB-VEN-01 — cierre del explorer de NR (049): ventas_tablero_nr() (034)
-- ya no tiene ningún consumidor real. Verificado por grep sobre todo
-- app/ antes de escribir este archivo: sus 3 consumidores
-- (api/ventas/notas-remision/route.ts, dashboard/ventas/page.tsx,
-- dashboard/ventas/remisiones/page.tsx) ya migraron a
-- ventas_notas_remision_listado. Se retira, no se deja inerte —a
-- diferencia de ventas_po_nr_vinculos (043), esta función no le sirve a
-- ningún trabajo futuro, es estrictamente el listado viejo.
drop function if exists public.ventas_tablero_nr(public.nr_estado, uuid, integer, integer);
