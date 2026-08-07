'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/rbac/hooks';
import { ROLE_LABELS, SECCION_MODULOS, getNavForRole } from '@/lib/rbac/config';
import { LayoutDashboard, Users, ShoppingCart, Package } from 'lucide-react';

// Sólo el "cómo se ve" de cada tarjeta (color de marca, descripción). El
// "qué existe y para quién" vive en NAV_SECTIONS/getNavForRole — la misma
// fuente que ya usa el sidebar — para que esta cuadrícula no vuelva a
// desincronizarse de él (pasó con Ventas, ver contexto/AUDITORIA_RTB-VEN-01.md §7.5).
const PRESENTACION: Record<string, { color: string; description: string }> = {
  '/dashboard/ventas': { color: 'bg-rtb-teal', description: 'Cotizaciones, pedidos, remisiones y órdenes de compra' },
  '/dashboard/compras': { color: 'bg-blue-600', description: 'Compras, proveedores y faltantes' },
  '/dashboard/almacen': { color: 'bg-amber-600', description: 'Inventario, preparación y recepción' },
  '/dashboard/rutas': { color: 'bg-green-600', description: 'Planificación de rutas y entregas' },
  '/dashboard/facturacion': { color: 'bg-indigo-600', description: 'Facturación y timbrado SAT' },
  '/dashboard/finanzas': { color: 'bg-rose-600', description: 'Administración financiera y pagos' },
};

export default function DashboardPage() {
  const { profile, role } = useAuth();
  const modulos = role ? getNavForRole(role).find((s) => s.title === SECCION_MODULOS)?.items ?? [] : [];
  const disponibles = modulos.filter((m) => !m.badge).length;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight">
          Bienvenido, {profile?.full_name?.split(' ')?.[0] ?? 'Usuario'}
        </h1>
        <p className="text-muted-foreground mt-1">
          Panel principal del sistema — {role ? ROLE_LABELS[role] : ''}
        </p>
      </div>

      {/* Quick stats */}
      {/* "Módulos disponibles" cuenta los que este rol ve SIN badge
          "Próximamente" en NAV_SECTIONS — antes era MODULE_CARDS.length,
          un número fijo que ni distinguía por rol ni bajaba cuando un
          módulo seguía sin construirse (mismo defecto que ya se corrigió
          una vez, ver comentario original citado en
          contexto/AUDITORIA_RTB-VEN-01.md §7.5). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={LayoutDashboard} label="Módulos disponibles" value={String(disponibles)} />
        <StatCard icon={Users} label="Usuarios" value="—" />
        <StatCard icon={ShoppingCart} label="Pedidos Hoy" value="—" />
        <StatCard icon={Package} label="Productos" value="—" />
      </div>

      {/* Module grid — deriva de NAV_SECTIONS/getNavForRole, la misma
          fuente que el sidebar: un módulo sin `badge` ahí ya está activo
          aquí también, sin mantener una segunda lista aparte. */}
      <div>
        <h2 className="text-lg font-display font-semibold text-rtb-navy mb-4">Módulos del Sistema</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {modulos.map((mod) => {
            const Icon = mod.icon;
            const presentacion = PRESENTACION[mod.href];
            const contenido = (
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg ${presentacion?.color ?? 'bg-rtb-navy'} flex items-center justify-center shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-rtb-navy">{mod.label}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{presentacion?.description ?? ''}</p>
                  {mod.badge && (
                    <span className="inline-block mt-2 text-[10px] font-medium text-rtb-gold bg-rtb-gold/10 px-2 py-0.5 rounded-full">
                      {mod.badge}
                    </span>
                  )}
                </div>
              </div>
            );
            return mod.badge ? (
              <div key={mod.href} className="bg-white rounded-xl p-5 opacity-60 cursor-default" style={{ boxShadow: 'var(--shadow-sm)' }}>
                {contenido}
              </div>
            ) : (
              <Link
                key={mod.href}
                href={mod.href}
                className="bg-white rounded-xl p-5 hover:shadow-md transition-shadow"
                style={{ boxShadow: 'var(--shadow-sm)' }}
              >
                {contenido}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl p-4 flex items-center gap-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="w-10 h-10 rounded-lg bg-rtb-teal/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-rtb-teal" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-rtb-navy tabular-nums">{value}</p>
      </div>
    </div>
  );
}
