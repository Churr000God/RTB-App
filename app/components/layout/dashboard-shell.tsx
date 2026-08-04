'use client';

import { AuthProvider } from '@/components/layout/auth-provider';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/lib/rbac/hooks';
import { type ReactNode } from 'react';

function DashboardContent({ children }: { children: ReactNode }) {
  const { role } = useAuth();

  if (!role) return null;

  return (
    <div className="flex min-h-screen bg-rtb-surface">
      <Sidebar role={role} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <DashboardContent>{children}</DashboardContent>
    </AuthProvider>
  );
}
