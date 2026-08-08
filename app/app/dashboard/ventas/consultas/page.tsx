export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ConsultasBandeja } from './consultas-bandeja';
import { CONSULTA_ESTADOS_ABIERTOS } from '@/lib/ventas/config';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { MessageCircleQuestion } from 'lucide-react';

const PAGE_SIZE = 20;

// Bandeja de Compras-ligero (formalizado en 030): 'ventas' levanta la
// consulta con descripción libre sin que el producto exista; 'compras'
// la responde con el producto ya dado de alta (sus rutas normales) y el
// costo real. Server Component: primera carga vía Supabase directo, sólo
// la pestaña Abiertas (la que se ve al entrar) — paginación posterior y
// la pestaña Resueltas las resuelve ConsultasBandeja contra
// /api/ventas/consultas (antes .limit(100) sin paginación real y con las
// dos pestañas filtradas en memoria — AUDITORIA_RTB-VEN-01.md §3.2).
export default async function ConsultasPage() {
  const auth = await requireRole(ACCESO_PANTALLA.consultas);
  const supabase = createSupabaseServerClient();

  const { data: consultas, count } = await supabase
    .from('ventas_consultas_compras')
    .select('*', { count: 'exact' })
    .in('estado', CONSULTA_ESTADOS_ABIERTOS as readonly string[])
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <MessageCircleQuestion className="w-6 h-6" /> Consultas a Compras
        </h1>
        <p className="text-muted-foreground mt-1">
          Compras-ligero: sólo consulta disponibilidad y costo, no genera una orden de compra.
        </p>
      </div>

      <ConsultasBandeja
        consultas={consultas ?? []}
        count={count ?? 0}
        abiertas={count ?? 0}
        pageSize={PAGE_SIZE}
        rol={auth.profile.role}
      />
    </div>
  );
}
