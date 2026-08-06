import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Compass, LayoutDashboard } from 'lucide-react';

// E-11 (contexto/AUDITORIA_QA_ROLES_2026-08-06.md): los 8 enlaces a
// módulos futuros (Ventas, Compras, Almacén, Rutas, Facturación,
// Finanzas, Reportes, Configuración) caían en el 404 en blanco y en
// inglés por defecto de Next.js — sin sidebar, sin header, sin marca. El
// sidebar ya los muestra deshabilitados con "Próximamente" (M-08), pero
// esto cubre cualquier otra ruta bajo /dashboard escrita a mano.
// Al vivir dentro de app/dashboard/, Next.js la renderiza envuelta por
// DashboardShell (layout.tsx) — mismo sidebar y header que el resto.
export default function DashboardNotFound() {
  return (
    <div className="max-w-lg mx-auto py-16 text-center space-y-4">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-rtb-surface flex items-center justify-center">
        <Compass className="w-8 h-8 text-rtb-teal" />
      </div>
      <h1 className="text-2xl font-display font-bold text-rtb-navy">Página no encontrada</h1>
      <p className="text-sm text-muted-foreground">
        Esta ruta no existe o el módulo todavía no está disponible. Revisa el enlace o vuelve al panel principal.
      </p>
      <Button asChild className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
        <Link href="/dashboard">
          <LayoutDashboard className="w-4 h-4 mr-2" /> Ir al Dashboard
        </Link>
      </Button>
    </div>
  );
}
