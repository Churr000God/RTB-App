-- 046_ventas_po_via_a_enums.sql
-- RTB-VEN-01 — Vía A: PO que llega DESPUÉS de una o varias NR ya emitidas.
-- Pedido del dueño del proyecto (2026-08-08, misma jornada que 043/044/045
-- de la Vía B): la cotización sigue convirtiéndose en NR exactamente igual
-- que hoy; cuando llega la PO física del cliente, se registra desde el
-- tablero de Notas de Remisión — nunca como cotización nueva. Ver
-- contexto/AUDITORIA_RTB-VEN-01.md y sessions/2026-08-08-* para el diseño
-- completo (validado dos veces contra el estado vivo de Supabase).
--
-- Archivo propio: ALTER TYPE ... ADD VALUE no puede compartir transacción
-- con su uso (gotcha ya documentado en CLAUDE.md) — 047/048 dependen de
-- que estos valores existan y hayan hecho commit.
--
-- Verificado antes de escribir este archivo que ninguna comparación en el
-- esquema depende de la posición de un valor en el enum (todas son por
-- enumeración positiva: uq_po_numero usa estado <> 'cancelada',
-- po_cancelacion_chk usa estado = 'cancelada', ventas_kpis()/
-- tiene_operaciones_abiertas() usan `in (...)`), así que insertar valores
-- en medio del enum es seguro.

-- po_estado: dos estados nuevos, no siete — no se revive el ciclo de
-- validación de 033 (recibida/en_validacion/parcialmente_vinculada/
-- vinculada/pendiente_de_confirmacion/rechazada/corregida), que 043 retiró
-- a propósito. 'pendiente_de_autorizacion' congela la PO completa cuando
-- una partida de respaldo tiene precio distinto al de su línea de NR (o
-- cuando se solicita ampliarla) — no respalda ninguna NR, no admite
-- surtido. 'vinculada' es el reposo de una PO cuando ya no le falta nada
-- por cubrir (todas sus partidas de respaldo con vínculo activo y todas
-- sus partidas de compromiso ya surtidas), antes de facturada. No se
-- agrega 'parcialmente_vinculada': sería redundante con
-- abierta/parcialmente_surtida (una PO mixta con compromiso pendiente ya
-- queda ahí) y reproduciría el defecto histórico de escalar comparando
-- agregados en vez de contar partidas — ver 048.
alter type public.po_estado add value 'pendiente_de_autorizacion' before 'abierta';
alter type public.po_estado add value 'vinculada' after 'surtida';

-- ventas_autorizacion_tipo: dos tipos nuevos para los dos motivos de
-- congelamiento de la Vía A. 'precio_po_divergente' — la PO completa se
-- congela si cualquier partida de respaldo tiene precio distinto al de su
-- línea de NR (decisión del dueño del proyecto: bloquea TODA la PO, no
-- sólo las partidas afectadas). 'ampliacion_po' — agregar más NR/partidas a
-- una PO ya creada requiere autorización propia, distinta de la de precio,
-- para que la bandeja de Dirección distinga de un vistazo qué está
-- aprobando (ver ventas_autorizaciones.cambios en 048).
alter type public.ventas_autorizacion_tipo add value 'precio_po_divergente';
alter type public.ventas_autorizacion_tipo add value 'ampliacion_po';
