'use client';

import { useAuth } from '@/lib/rbac/hooks';
import { useRouter } from 'next/navigation';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/rbac/config';
import { LogOut, User, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function Header() {
  const { profile, signOut, role } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  const roleLabel = role ? ROLE_LABELS[role] ?? role : '';
  const roleColor = role ? ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-800' : '';

  return (
    <header className="h-16 bg-white border-b border-border flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-display font-semibold text-rtb-navy">
          Refacciones Tomás Badillo
        </h2>
      </div>

      <div className="flex items-center gap-3">
        {/* Notifications placeholder */}
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-rtb-navy">
          <Bell className="w-5 h-5" />
        </Button>

        {/* User info */}
        <div className="flex items-center gap-3 pl-3 border-l border-border">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-rtb-navy">
              {profile?.full_name ?? 'Cargando...'}
            </p>
            {role && (
              <span
                className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${roleColor}`}
              >
                {roleLabel}
              </span>
            )}
          </div>

          <Link
            href="/dashboard/perfil"
            className="w-9 h-9 rounded-full bg-rtb-teal/10 flex items-center justify-center text-rtb-teal hover:bg-rtb-teal/20 transition-colors"
          >
            <User className="w-4 h-4" />
          </Link>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-red-600"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
