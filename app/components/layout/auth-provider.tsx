'use client';

import { useAuth } from '@/lib/rbac/hooks';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, profile, loading, isActive } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      } else if (profile && !isActive) {
        router.replace('/login');
      }
    }
  }, [loading, user, profile, isActive, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-rtb-surface">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-rtb-teal animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando sistema...</p>
        </div>
      </div>
    );
  }

  if (!user || (profile && !isActive)) {
    return null;
  }

  return <>{children}</>;
}
