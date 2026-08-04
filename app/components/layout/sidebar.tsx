'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getNavForRole } from '@/lib/rbac/config';
import { type UserRole } from '@/types/database';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface SidebarProps {
  role: UserRole;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const sections = getNavForRole(role);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'h-screen bg-rtb-navy text-white flex flex-col transition-all duration-300 sticky top-0',
        collapsed ? 'w-[68px]' : 'w-[250px]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-center py-5 px-3 border-b border-white/10">
        <div className={cn('relative', collapsed ? 'w-10 h-10' : 'w-16 h-16')}>
          <Image
            src="/logo-rtb.png"
            alt="RTB"
            fill
            className="object-contain"
          />
        </div>
        {!collapsed && (
          <div className="ml-3">
            <p className="font-display text-sm font-semibold text-white">Sistema RTB</p>
            <p className="text-[10px] text-white/50">Gestión Interna</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {sections?.map((section: any) => (
          <div key={section?.title}>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                {section?.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section?.items?.map((item: any) => {
                const Icon = item?.icon;
                const isActive = pathname === item?.href ||
                  (item?.href !== '/dashboard' && pathname?.startsWith?.(item?.href ?? ''));
                return (
                  <li key={item?.href}>
                    <Link
                      href={item?.href ?? '#'}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-rtb-teal text-white'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      )}
                      title={collapsed ? item?.label : undefined}
                    >
                      {Icon && <Icon className="w-5 h-5 shrink-0" />}
                      {!collapsed && <span>{item?.label}</span>}
                    </Link>
                  </li>
                );
              }) ?? []}
            </ul>
          </div>
        )) ?? []}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center py-3 border-t border-white/10 text-white/50 hover:text-white transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}
