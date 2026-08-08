export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CotizacionEstadoBadge } from '@/components/ventas/estado-badge';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import { puede, ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { FileText, Plus } from 'lucide-react';

// Listado de cotizaciones. Acceso de pantalla: ACCESO_PANTALLA.cotizaciones
// (037); alta restringida a super_admin/direccion/gerente_comercial/ventas
// — mismo criterio que /dashboard/inventario/ajustes.
export default async function CotizacionesPage({ searchParams }: { searchParams: { estado?: string } }) {
  const auth = await requireRole(ACCESO_PANTALLA.cotizaciones);
  const puedeCrear = puede(auth.profile.role, 'cotizaciones', 'insert');

  const supabase = createSupabaseServerClient();
  let query = supabase
    .from('ventas_cotizaciones')
    .select('id, folio, entidad_id, vendedor_id, canal_entrada, moneda, estado, vigencia_hasta, created_at, entidades(nombre_comercial, nombre_legal)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (searchParams.estado) query = query.eq('estado', searchParams.estado);
  const { data: cotizaciones } = await query;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6" /> Cotizaciones
          </h1>
          <p className="text-muted-foreground mt-1">RTB-PRO-VEN-01 §II · el precio elegido se fotografía y nunca cambia</p>
        </div>
        {puedeCrear && (
          <Link
            href="/dashboard/ventas/cotizaciones/nueva"
            className="inline-flex items-center rounded-lg bg-rtb-teal hover:bg-rtb-teal/90 text-white text-sm font-medium px-4 py-2"
          >
            <Plus className="w-4 h-4 mr-2" /> Nueva cotización
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <table className="w-full">
          <thead>
            <tr className="bg-rtb-navy text-white">
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Folio</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Cliente</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Canal</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Vigencia</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Moneda</th>
            </tr>
          </thead>
          <tbody>
            {(cotizaciones ?? []).map((c: any, i) => (
              <tr key={c.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
                <td className="py-3 px-4">
                  <Link href={`/dashboard/ventas/cotizaciones/${c.id}`} className="text-xs tabular-nums text-rtb-teal hover:underline">
                    {c.folio}
                  </Link>
                </td>
                <td className="py-3 px-4 text-sm">{c.entidades?.nombre_comercial ?? c.entidades?.nombre_legal ?? '—'}</td>
                <td className="py-3 px-4 text-sm text-muted-foreground">{c.canal_entrada}</td>
                <td className="py-3 px-4">
                  <CotizacionEstadoBadge estado={c.estado} />
                </td>
                <td className="py-3 px-4 text-sm text-muted-foreground">{c.vigencia_hasta ?? '—'}</td>
                <td className="py-3 px-4 text-sm text-muted-foreground">{c.moneda}</td>
              </tr>
            ))}
            {(cotizaciones ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
                  Sin cotizaciones registradas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
