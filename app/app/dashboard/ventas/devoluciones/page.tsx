export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { DevolucionesBandeja } from './devoluciones-bandeja';
import { Undo2 } from 'lucide-react';

const PAGE_SIZE = 20;

// Bandeja de devoluciones (039/040) — seguimiento básico. Nace
// únicamente por ventas_cotizacion_cancelar() cuando se intenta cancelar
// una cotización aprobada cuyo pedido ya mostró entrega (total o
// parcial): en vez de cancelar, abre esta fila. Alcance deliberadamente
// limitado: SIN reembolso, SIN nota de crédito y SIN recepción física al
// inventario — Facturación (RTB-PRO-FAC-01) todavía no existe.
export default async function DevolucionesPage({ searchParams }: { searchParams: { estado?: string } }) {
  const auth = await requireRole(ACCESO_PANTALLA.devoluciones);
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from('ventas_devoluciones')
    .select('*, entidades(nombre_comercial, nombre_legal)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);
  if (searchParams.estado) query = query.eq('estado', searchParams.estado);
  const { data: devoluciones, count } = await query;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <Undo2 className="w-6 h-6" /> Devoluciones
        </h1>
        <p className="text-muted-foreground mt-1">
          Seguimiento únicamente. El reembolso, la nota de crédito y la recepción física al inventario se atenderán
          cuando exista el módulo de Facturación.
        </p>
      </div>

      <DevolucionesBandeja
        devoluciones={devoluciones ?? []}
        count={count ?? 0}
        pageSize={PAGE_SIZE}
        rol={auth.profile.role}
        estadoInicial={searchParams.estado}
      />
    </div>
  );
}
