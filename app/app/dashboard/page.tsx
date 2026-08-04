'use client';

import { useAuth } from '@/lib/rbac/hooks';
import { ROLE_LABELS } from '@/lib/rbac/config';
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Package,
  Truck,
  FileText,
  DollarSign,
  ShoppingBag,
} from 'lucide-react';

const MODULE_CARDS = [
  { key: 'ventas', label: 'Ventas', icon: ShoppingCart, color: 'bg-rtb-teal', description: 'Gestión de pedidos y seguimiento comercial' },
  { key: 'compras', label: 'Compras', icon: ShoppingBag, color: 'bg-blue-600', description: 'Compras, proveedores y faltantes' },
  { key: 'almacen', label: 'Almacén', icon: Package, color: 'bg-amber-600', description: 'Inventario, preparación y recepción' },
  { key: 'logistica', label: 'Rutas', icon: Truck, color: 'bg-green-600', description: 'Planificación de rutas y entregas' },
  { key: 'facturacion', label: 'Facturación', icon: FileText, color: 'bg-indigo-600', description: 'Facturación y timbrado SAT' },
  { key: 'finanzas', label: 'Finanzas', icon: DollarSign, color: 'bg-rose-600', description: 'Administración financiera y pagos' },
];

export default function DashboardPage() {
  const { profile, role } = useAuth();

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={LayoutDashboard} label="Módulos Activos" value="6" />
        <StatCard icon={Users} label="Usuarios" value="—" />
        <StatCard icon={ShoppingCart} label="Pedidos Hoy" value="—" />
        <StatCard icon={Package} label="Productos" value="—" />
      </div>

      {/* Module grid */}
      <div>
        <h2 className="text-lg font-display font-semibold text-rtb-navy mb-4">Módulos del Sistema</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULE_CARDS?.map((mod: any) => {
            const Icon = mod?.icon;
            return (
              <div
                key={mod?.key}
                className="bg-white rounded-xl p-5 hover:shadow-md transition-shadow cursor-default"
                style={{ boxShadow: 'var(--shadow-sm)' }}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg ${mod?.color} flex items-center justify-center shrink-0`}>
                    {Icon && <Icon className="w-5 h-5 text-white" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-rtb-navy">{mod?.label}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{mod?.description}</p>
                    <span className="inline-block mt-2 text-[10px] font-medium text-rtb-gold bg-rtb-gold/10 px-2 py-0.5 rounded-full">
                      Próximamente
                    </span>
                  </div>
                </div>
              </div>
            );
          }) ?? []}
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
