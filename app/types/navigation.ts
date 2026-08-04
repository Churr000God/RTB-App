import { type LucideIcon } from 'lucide-react';
import { type UserRole } from './database';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[] | 'all';
  badge?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}
