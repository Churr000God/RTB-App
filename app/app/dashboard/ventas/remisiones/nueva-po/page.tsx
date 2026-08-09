export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/guards';
import { ROLES_REGISTRAN_PO } from '@/lib/ventas/permisos';
import { PoDesdeNrForm } from './po-desde-nr-form';

// Registrar una PO desde el tablero de NR (Vía A, 048) — punto de entrada
// pedido por el dueño del proyecto: cuando llega la PO física del cliente
// DESPUÉS de una o varias NR ya emitidas, se registra aquí, nunca como una
// cotización nueva. Guard por ROLES_REGISTRAN_PO (no ACCESO_PANTALLA.
// remisiones): 'cobranza' tiene esa pantalla en sólo lectura y no debe
// llegar hasta aquí, mismo criterio que ordenes-compra/nueva ya usaba en
// Vía B antes de retirarse (043). ?entidad_id=/?nr_id= opcionales para
// preseleccionar cuando se lanza desde el detalle de una NR. ?entidad_label=
// es sólo cosmético — EntidadCombobox no tiene forma de mostrar un value
// preseleccionado sin buscarlo primero, así que el nombre viaja ya resuelto
// en vez de forzar un fetch extra en el cliente.
export default async function NuevaPoDesdeNrPage({
  searchParams,
}: {
  searchParams: { entidad_id?: string; nr_id?: string; entidad_label?: string };
}) {
  await requireRole(ROLES_REGISTRAN_PO);
  return (
    <PoDesdeNrForm
      entidadIdInicial={searchParams.entidad_id ?? null}
      nrIdInicial={searchParams.nr_id ?? null}
      entidadLabelInicial={searchParams.entidad_label ?? null}
    />
  );
}
