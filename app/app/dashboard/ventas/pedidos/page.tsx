export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PedidoEstadoBadge } from '@/components/ventas/estado-badge';
import { PackageCheck } from 'lucide-react';

export default async function PedidosPage() {
  await requireActiveUser();
  const supabase = createSupabaseServerClient();
  const { data: pedidos } = await supabase
    .from('ventas_pedidos')
    .select('*, entidades(nombre_comercial, nombre_legal)')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <PackageCheck className="w-6 h-6" /> Pedidos
        </h1>
        <p className="text-muted-foreground mt-1">Nace al aprobar una cotización — reserva de inventario automática.</p>
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <table className="w-full">
          <thead>
            <tr className="bg-rtb-navy text-white">
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Folio</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Cliente</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Requiere PO</th>
            </tr>
          </thead>
          <tbody>
            {(pedidos ?? []).map((p: any, i) => (
              <tr key={p.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
                <td className="py-3 px-4">
                  <Link href={`/dashboard/ventas/pedidos/${p.id}`} className="text-xs tabular-nums text-rtb-teal hover:underline">
                    {p.folio}
                  </Link>
                </td>
                <td className="py-3 px-4 text-sm">{p.entidades?.nombre_comercial ?? p.entidades?.nombre_legal ?? '—'}</td>
                <td className="py-3 px-4">
                  <PedidoEstadoBadge estado={p.estado} />
                </td>
                <td className="py-3 px-4 text-sm text-muted-foreground">{p.requiere_po ? 'Sí' : 'No'}</td>
              </tr>
            ))}
            {(pedidos ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-muted-foreground text-sm">
                  Sin pedidos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
