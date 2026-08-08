import { type LucideIcon } from 'lucide-react';
import { type UserRole } from './database';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[] | 'all';
  badge?: string;
  /** Sub-items (submenú) — hoy sólo Ventas los usa (037). Cada uno filtra
   *  por rol igual que un NavItem de primer nivel; getNavForRole() los
   *  recorta también. */
  children?: NavItem[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}
