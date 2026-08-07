export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { POEstadoBadge } from '@/components/ventas/estado-badge';
import { puede } from '@/lib/ventas/permisos';
import { FileSignature, Plus } from 'lucide-react';

export default async function OrdenesCompraPage() {
  const auth = await requireActiveUser();
  const puedeCrear = puede(auth.profile.role, 'ordenes_compra', 'insert');

  const supabase = createSupabaseServerClient();
  const { data: ordenes } = await supabase
    .from('ventas_ordenes_compra_cliente')
    .select('*, entidades(nombre_comercial, nombre_legal)')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <FileSignature className="w-6 h-6" /> Órdenes de Compra del cliente
          </h1>
          <p className="text-muted-foreground mt-1">
            Una sola partida con costo distinto bloquea la PO completa — sin excepción de Dirección.
          </p>
        </div>
        {puedeCrear && (
          <Link
            href="/dashboard/ventas/ordenes-compra/nueva"
            className="inline-flex items-center rounded-lg bg-rtb-teal hover:bg-rtb-teal/90 text-white text-sm font-medium px-4 py-2"
          >
            <Plus className="w-4 h-4 mr-2" /> Registrar PO
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <table className="w-full">
          <thead>
            <tr className="bg-rtb-navy text-white">
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Folio</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Número de PO</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Cliente</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(ordenes ?? []).map((po: any, i) => (
              <tr key={po.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
                <td className="py-3 px-4">
                  <Link href={`/dashboard/ventas/ordenes-compra/${po.id}`} className="text-xs tabular-nums text-rtb-teal hover:underline">
                    {po.folio}
                  </Link>
                </td>
                <td className="py-3 px-4 text-sm">{po.numero_po}</td>
                <td className="py-3 px-4 text-sm">{po.entidades?.nombre_comercial ?? po.entidades?.nombre_legal ?? '—'}</td>
                <td className="py-3 px-4">
                  <POEstadoBadge estado={po.estado} />
                </td>
              </tr>
            ))}
            {(ordenes ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-muted-foreground text-sm">
                  Sin órdenes de compra registradas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
