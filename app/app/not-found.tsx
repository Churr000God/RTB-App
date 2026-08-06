import Link from 'next/link';
import Image from 'next/image';
import { Compass } from 'lucide-react';

// Red de seguridad para cualquier URL fuera de /dashboard (que ya tiene su
// propio not-found.tsx con sidebar) — antes caía en el 404 en blanco y en
// inglés de Next.js (E-11, contexto/AUDITORIA_QA_ROLES_2026-08-06.md).
// Vive fuera del árbol de /dashboard: no hay sesión garantizada aquí, así
// que no depende de DashboardShell ni de ningún guard.
export default function RootNotFound() {
  return (
    <div className="min-h-screen bg-rtb-surface flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="relative w-14 h-14 mx-auto">
          <Image src="/logo-rtb.png" alt="RTB" fill className="object-contain" />
        </div>
        <div className="w-16 h-16 mx-auto rounded-2xl bg-white flex items-center justify-center" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <Compass className="w-8 h-8 text-rtb-teal" />
        </div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy">Página no encontrada</h1>
        <p className="text-sm text-muted-foreground">La página que buscas no existe.</p>
        <Link href="/dashboard" className="inline-block text-sm font-medium text-rtb-teal hover:underline">
          Ir al Dashboard
        </Link>
      </div>
    </div>
  );
}
