export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { requireActiveUser } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ConteoEstadoBadge } from '@/components/inventario/estado-badge';
import { CONTEO_TIPO_LABELS } from '@/lib/inventario/config';
import { puede } from '@/lib/inventario/permisos';
import { ClipboardCheck, Plus } from 'lucide-react';

export default async function ConteosPage() {
  const auth = await requireActiveUser();
  // E-08 (contexto/AUDITORIA_QA_ROLES_2026-08-06.md) — mismo hallazgo que
  // en /ajustes: "Nuevo Conteo" se mostraba sin condición a cualquier rol.
  const puedeCrear = puede(auth.profile.role, 'conteos', 'insert');

  const supabase = createSupabaseServerClient();
  const { data: conteos } = await supabase
    .from('inventario_conteos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6" /> Conteos Físicos
          </h1>
          <p className="text-muted-foreground mt-1">RTB-CIE-01 · vista ciega, congelamiento, firmas y acta versionada</p>
        </div>
        {puedeCrear && (
          <Button asChild className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            <Link href="/dashboard/inventario/conteos/nuevo">
              <Plus className="w-4 h-4 mr-2" /> Nuevo Conteo
            </Link>
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <table className="w-full">
          <thead>
            <tr className="bg-rtb-navy text-white">
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Folio</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Nombre</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Tipo</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Exactitud (registro)</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Creado</th>
            </tr>
          </thead>
          <tbody>
            {(conteos ?? []).map((c, i) => (
              <tr key={c.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
                <td className="py-3 px-4">
                  <Link href={`/dashboard/inventario/conteos/${c.id}`} className="text-xs tabular-nums text-rtb-teal hover:underline">
                    {c.folio}
                  </Link>
                </td>
                <td className="py-3 px-4 text-sm font-medium text-rtb-navy">{c.nombre}</td>
                <td className="py-3 px-4 text-sm">{CONTEO_TIPO_LABELS[c.tipo as keyof typeof CONTEO_TIPO_LABELS]}</td>
                <td className="py-3 px-4">
                  <ConteoEstadoBadge estado={c.estado} />
                </td>
                <td className="py-3 px-4 text-right tabular-nums text-sm">
                  {c.exactitud_registro != null ? `${c.exactitud_registro}%` : '—'}
                </td>
                <td className="py-3 px-4 text-xs text-muted-foreground tabular-nums">
                  {new Date(c.created_at).toLocaleDateString('es-MX', { timeZone: 'UTC' })}
                </td>
              </tr>
            ))}
            {(conteos ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
                  Sin conteos registrados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
