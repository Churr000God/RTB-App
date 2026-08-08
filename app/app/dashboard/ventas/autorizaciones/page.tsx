export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AutorizacionesBandeja } from './autorizaciones-bandeja';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { ShieldCheck } from 'lucide-react';

const PAGE_SIZE = 20;

// Bandeja de excepciones/correcciones de Ventas (033): excepción de
// subtotal, código divergente, duplicidad confirmada, corrección de
// documento. Resolver exige que el aprobador no sea el solicitante
// (CHECK + comprobación en ventas_autorizacion_resolver()). Paginada
// (antes .limit(100) sin paginación real — AUDITORIA_RTB-VEN-01.md §3.2).
export default async function AutorizacionesPage({ searchParams }: { searchParams: { estado?: string } }) {
  const auth = await requireRole(ACCESO_PANTALLA.autorizaciones);
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from('ventas_autorizaciones')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);
  if (searchParams.estado) query = query.eq('estado', searchParams.estado);
  const { data: autorizaciones, count } = await query;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6" /> Autorizaciones de Ventas
        </h1>
        <p className="text-muted-foreground mt-1">Excepciones y correcciones que requieren visto bueno de Dirección.</p>
      </div>

      <AutorizacionesBandeja
        autorizaciones={autorizaciones ?? []}
        count={count ?? 0}
        pageSize={PAGE_SIZE}
        rol={auth.profile.role}
        userId={auth.userId}
        estadoInicial={searchParams.estado}
      />
    </div>
  );
}
