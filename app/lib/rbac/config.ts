import {
  Users,
  Settings,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  FileText,
  DollarSign,
  BarChart3,
  ShoppingBag,
  Building2,
  Map,
  MapPinned,
  Boxes,
  ClipboardCheck,
  AlertTriangle,
  ClipboardList,
  FileEdit,
  Library,
  Repeat,
  FileCheck2,
} from 'lucide-react';
import { type NavSection, type NavItem } from '@/types/navigation';
import { USER_ROLES, type UserRole } from '@/types/database';

const ALL_ROLES: UserRole[] = [...USER_ROLES];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  direccion: 'Dirección',
  ventas: 'Ventas',
  compras: 'Compras',
  almacen: 'Almacén',
  logistica: 'Logística',
  facturacion: 'Facturación',
  finanzas: 'Finanzas',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-red-100 text-red-800',
  direccion: 'bg-purple-100 text-purple-800',
  ventas: 'bg-teal-100 text-teal-800',
  compras: 'bg-blue-100 text-blue-800',
  almacen: 'bg-amber-100 text-amber-800',
  logistica: 'bg-green-100 text-green-800',
  facturacion: 'bg-indigo-100 text-indigo-800',
  finanzas: 'bg-rose-100 text-rose-800',
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        roles: 'all',
      },
    ],
  },
  {
    title: 'Datos maestros',
    items: [
      {
        label: 'Entidades',
        href: '/dashboard/entidades',
        icon: Building2,
        roles: 'all',
      },
      {
        label: 'Ubicaciones',
        href: '/dashboard/ubicaciones',
        icon: MapPinned,
        roles: 'all',
      },
      {
        label: 'Mapa',
        href: '/dashboard/mapa',
        icon: Map,
        roles: 'all',
      },
      {
        label: 'Productos',
        href: '/dashboard/productos',
        icon: Package,
        roles: 'all',
      },
      {
        label: 'Catálogos',
        href: '/dashboard/catalogos',
        icon: Library,
        roles: 'all',
      },
    ],
  },
  {
    title: 'Inventario',
    items: [
      {
        label: 'Existencias',
        href: '/dashboard/inventario',
        icon: Boxes,
        roles: 'all',
      },
      {
        label: 'Conteos físicos',
        href: '/dashboard/inventario/conteos',
        icon: ClipboardCheck,
        roles: ['super_admin', 'direccion', 'almacen', 'compras', 'finanzas'],
      },
      {
        label: 'Discrepancias',
        href: '/dashboard/inventario/discrepancias',
        icon: AlertTriangle,
        roles: ['super_admin', 'direccion', 'almacen', 'compras'],
      },
      {
        label: 'Hallazgos',
        href: '/dashboard/inventario/hallazgos',
        icon: ClipboardList,
        roles: ['super_admin', 'direccion', 'almacen', 'compras'],
      },
      {
        label: 'Ajustes',
        href: '/dashboard/inventario/ajustes',
        icon: FileEdit,
        roles: ['super_admin', 'direccion', 'almacen', 'compras'],
      },
      {
        label: 'Redefiniciones de unidad',
        href: '/dashboard/inventario/redefiniciones',
        icon: Repeat,
        roles: ['super_admin', 'direccion', 'almacen', 'compras'],
      },
    ],
  },
  {
    title: 'Módulos',
    items: [
      {
        label: 'Ventas',
        href: '/dashboard/ventas',
        icon: ShoppingCart,
        roles: ['super_admin', 'direccion', 'ventas'],
        badge: 'Próximamente',
      },
      {
        label: 'Compras',
        href: '/dashboard/compras',
        icon: ShoppingBag,
        roles: ['super_admin', 'direccion', 'compras'],
        badge: 'Próximamente',
      },
      {
        label: 'Almacén',
        href: '/dashboard/almacen',
        icon: Package,
        roles: ['super_admin', 'direccion', 'almacen'],
        badge: 'Próximamente',
      },
      {
        label: 'Rutas',
        href: '/dashboard/rutas',
        icon: Truck,
        roles: ['super_admin', 'direccion', 'logistica'],
        badge: 'Próximamente',
      },
      {
        label: 'Facturación',
        href: '/dashboard/facturacion',
        icon: FileText,
        roles: ['super_admin', 'direccion', 'facturacion'],
        badge: 'Próximamente',
      },
      {
        label: 'Finanzas',
        href: '/dashboard/finanzas',
        icon: DollarSign,
        roles: ['super_admin', 'direccion', 'finanzas'],
        badge: 'Próximamente',
      },
    ],
  },
  {
    title: 'Aprobaciones',
    items: [
      {
        label: 'Solicitudes de cambio',
        href: '/dashboard/solicitudes',
        icon: FileCheck2,
        roles: ['super_admin', 'direccion'],
      },
    ],
  },
  {
    title: 'Reportes',
    items: [
      {
        label: 'Reportes',
        href: '/dashboard/reportes',
        icon: BarChart3,
        roles: ['super_admin', 'direccion'],
        badge: 'Próximamente',
      },
    ],
  },
  {
    title: 'Administración',
    items: [
      {
        label: 'Usuarios',
        href: '/dashboard/admin/users',
        icon: Users,
        roles: ['super_admin'],
      },
      {
        label: 'Configuración',
        href: '/dashboard/admin/settings',
        icon: Settings,
        roles: ['super_admin'],
        badge: 'Próximamente',
      },
    ],
  },
];

export function getNavForRole(role: UserRole): NavSection[] {
  return NAV_SECTIONS.map((section: NavSection) => ({
    ...section,
    items: section.items.filter(
      (item: NavItem) => item.roles === 'all' || (item.roles as UserRole[]).includes(role)
    ),
  })).filter((section: NavSection) => section.items.length > 0);
}

export function hasAccess(userRole: UserRole, allowedRoles: UserRole[] | 'all'): boolean {
  if (allowedRoles === 'all') return true;
  return allowedRoles.includes(userRole);
}
