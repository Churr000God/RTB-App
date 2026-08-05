import { DashboardShell } from '@/components/layout/dashboard-shell';
import { requireActiveUser } from '@/lib/supabase/guards';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireActiveUser();
  return <DashboardShell>{children}</DashboardShell>;
}
