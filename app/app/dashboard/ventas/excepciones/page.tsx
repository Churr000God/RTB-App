export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { ExcepcionesBandeja } from './excepciones-bandeja';
import { AlertTriangle } from 'lucide-react';

const PAGE_SIZE = 20;

// Bandeja de excepciones de cartera (029): un cliente congelado puede
// pedir operar hasta un monto máximo mientras se resuelve. Antes de esta
// pantalla el endpoint (GET/POST /api/ventas/excepciones +
// [id]/resolver) estaba huérfano — sin ninguna pantalla que lo consumiera
// (auditoría de navegación de RTB-VEN-01, 2026-08-07).
export default async function ExcepcionesPage({ searchParams }: { searchParams: { estado?: string } }) {
  const auth = await requireRole(ACCESO_PANTALLA.excepciones);
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from('cliente_excepciones')
    .select('*, entidades(nombre_comercial, nombre_legal)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);
  if (searchParams.estado) query = query.eq('estado', searchParams.estado);
  const { data: excepciones, count } = await query;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <AlertTriangle className="w-6 h-6" /> Excepciones de cartera
        </h1>
        <p className="text-muted-foreground mt-1">
          Un cliente congelado puede operar hasta un monto máximo mientras se resuelve — requiere visto bueno.
        </p>
      </div>

      <ExcepcionesBandeja
        excepciones={excepciones ?? []}
        count={count ?? 0}
        pageSize={PAGE_SIZE}
        rol={auth.profile.role}
        userId={auth.userId}
        estadoInicial={searchParams.estado}
      />
    </div>
  );
}
