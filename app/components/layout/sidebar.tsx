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

  // E-11 (contexto/AUDITORIA_QA_ROLES_2026-08-06.md): sidebar.tsx marcaba
  // "activo" cualquier item cuyo href fuera prefijo de pathname —
  // "Existencias" (/dashboard/inventario) y "Conteos físicos"
  // (/dashboard/inventario/conteos) quedaban ambos resaltados en
  // /dashboard/inventario/conteos/[id]. Se resuelve global: entre TODOS
  // los hrefs de la navegación, gana el más específico (el más largo) que
  // calce con la ruta actual — no cada item comparando sólo consigo mismo.
  const todosLosHrefs = sections?.flatMap((s: any) => s?.items?.map((i: any) => i?.href) ?? []) ?? [];
  const hrefActivo = todosLosHrefs
    .filter((href: string) => pathname === href || (href !== '/dashboard' && pathname?.startsWith?.(`${href}/`)))
    .sort((a: string, b: string) => b.length - a.length)[0];

  return (
    <aside
      className={cn(
        'h-screen bg-rtb-navy text-white flex flex-col transition-all duration-300 sticky top-0',
        collapsed ? 'w-[68px]' : 'w-[250px]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-center py-5 px-3 border-b border-white/10">
        <div
          className={cn(
            'relative rounded-full overflow-hidden bg-white shrink-0',
            collapsed ? 'w-10 h-10 p-3' : 'w-16 h-16 p-5'
          )}
        >
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
                const isActive = item?.href === hrefActivo;

                // M-08/E-11: un módulo sin pantalla (badge) se muestra
                // deshabilitado con su etiqueta, no como <Link> navegable a
                // un 404 — mismo tratamiento que ya usan las tarjetas
                // "Próximamente" del Dashboard.
                if (item?.badge) {
                  return (
                    <li key={item?.href}>
                      <div
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/30 cursor-default"
                        title={collapsed ? `${item?.label} — ${item.badge}` : undefined}
                      >
                        {Icon && <Icon className="w-5 h-5 shrink-0" />}
                        {!collapsed && (
                          <span className="flex items-center gap-2 truncate">
                            {item?.label}
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 shrink-0">
                              {item.badge}
                            </span>
                          </span>
                        )}
                      </div>
                    </li>
                  );
                }

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
