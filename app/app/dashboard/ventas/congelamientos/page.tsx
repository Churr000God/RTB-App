export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { CongelamientosBandeja } from './congelamientos-bandeja';
import { Snowflake } from 'lucide-react';

const PAGE_SIZE = 20;

// Bandeja de congelamientos de cartera (029). Antes de esta pantalla la
// única vía para congelar era cartera-comercial-tab.tsx (dentro de la
// ficha de entidad) y NO había ninguna para liberar desde la UI — el
// endpoint POST /api/ventas/congelamientos/[id]/liberar existía huérfano
// (auditoría de navegación de RTB-VEN-01, 2026-08-07): un cliente
// congelado quedaba irreversible salvo por SQL directo.
export default async function CongelamientosPage({ searchParams }: { searchParams: { estado?: string } }) {
  const auth = await requireRole(ACCESO_PANTALLA.congelamientos);
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from('cliente_congelamientos')
    .select('*, entidades(nombre_comercial, nombre_legal)', { count: 'exact' })
    .order('congelado_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);
  if (searchParams.estado) query = query.eq('estado', searchParams.estado);
  const { data: congelamientos, count } = await query;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <Snowflake className="w-6 h-6" /> Congelamientos de cartera
        </h1>
        <p className="text-muted-foreground mt-1">
          Historial de cuentas congeladas y liberadas — congelar se hace desde la ficha del cliente.
        </p>
      </div>

      <CongelamientosBandeja
        congelamientos={congelamientos ?? []}
        count={count ?? 0}
        pageSize={PAGE_SIZE}
        rol={auth.profile.role}
        estadoInicial={searchParams.estado}
      />
    </div>
  );
}
