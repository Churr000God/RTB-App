export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { AjusteEstadoBadge } from '@/components/inventario/estado-badge';
import { AJUSTE_TIPO_LABELS } from '@/lib/inventario/config';
import { puede } from '@/lib/inventario/permisos';
import { FileEdit, Plus } from 'lucide-react';

// Bandeja de ajustes (CIE-AJU-01). "Ajustes aplicados sin autorización
// registrada: 34 de 34" es el hallazgo real que este flujo cierra —
// autorizar/rechazar/aplicar viven en el detalle, nunca aquí.
export default async function AjustesPage() {
  const auth = await requireActiveUser();
  // E-08 (contexto/AUDITORIA_QA_ROLES_2026-08-06.md): "Nuevo Ajuste" se
  // mostraba a cualquier rol autenticado sin mirar puede() — a diferencia
  // de Catálogos/Ubicaciones/Productos/Entidades, que sí lo hacen. Un rol
  // sin permiso llenaba el formulario entero y sólo fallaba al final con
  // 403. Server Component: el rol ya viene resuelto por requireActiveUser(),
  // no hace falta useAuth() en cliente para esto.
  const puedeCrear = puede(auth.profile.role, 'ajustes', 'insert');

  const supabase = createSupabaseServerClient();
  const [{ data: ajustes }, pendientes] = await Promise.all([
    supabase.from('inventario_ajustes').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('inventario_ajustes').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente_autorizacion'),
  ]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <FileEdit className="w-6 h-6" /> Ajustes de Inventario
          </h1>
          <p className="text-muted-foreground mt-1">CIE-AJU-01 · ningún ajuste mueve inventario sin autorización de un tercero</p>
        </div>
        {puedeCrear && (
          <Button asChild className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            <Link href="/dashboard/inventario/ajustes/nuevo">
              <Plus className="w-4 h-4 mr-2" /> Nuevo Ajuste
            </Link>
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl p-4 border-l-4 border-l-rtb-gold w-fit" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pendientes de autorización</p>
        <p className="text-2xl font-display font-bold text-rtb-navy mt-1 tabular-nums">{pendientes.count ?? 0}</p>
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <table className="w-full">
          <thead>
            <tr className="bg-rtb-navy text-white">
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Folio</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Tipo</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Motivo</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Impacto (piezas)</th>
            </tr>
          </thead>
          <tbody>
            {(ajustes ?? []).map((a, i) => (
              <tr key={a.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
                <td className="py-3 px-4">
                  <Link href={`/dashboard/inventario/ajustes/${a.id}`} className="text-xs tabular-nums text-rtb-teal hover:underline">
                    {a.folio}
                  </Link>
                </td>
                <td className="py-3 px-4 text-sm">{AJUSTE_TIPO_LABELS[a.tipo as keyof typeof AJUSTE_TIPO_LABELS]}</td>
                <td className="py-3 px-4 text-sm text-muted-foreground truncate max-w-xs">{a.motivo}</td>
                <td className="py-3 px-4">
                  <AjusteEstadoBadge estado={a.estado} />
                </td>
                <td className="py-3 px-4 text-right tabular-nums text-sm">{a.impacto_piezas ?? '—'}</td>
              </tr>
            ))}
            {(ajustes ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-muted-foreground text-sm">
                  Sin ajustes registrados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
