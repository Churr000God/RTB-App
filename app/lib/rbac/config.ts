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
  Snowflake,
  HelpCircle,
  Undo2,
} from 'lucide-react';
import { type NavSection, type NavItem } from '@/types/navigation';
import { type UserRole } from '@/types/database';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  direccion: 'Dirección',
  ventas: 'Ventas',
  compras: 'Compras',
  almacen: 'Almacén',
  logistica: 'Logística',
  facturacion: 'Facturación',
  finanzas: 'Finanzas',
  gerente_comercial: 'Gerente Comercial',
  cobranza: 'Cobranza',
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
  gerente_comercial: 'bg-cyan-100 text-cyan-800',
  cobranza: 'bg-orange-100 text-orange-800',
};

// Unión de todos los roles que aparecen en ACCESO_PANTALLA (lib/ventas/
// permisos.ts) — una sola fuente para el item de nav de Ventas y para el
// guard real de app/dashboard/ventas/layout.tsx, en vez de mantener el
// mismo conjunto de roles escrito dos veces.
const ROLES_VENTAS: UserRole[] = Array.from(
  new Set(Object.values(ACCESO_PANTALLA).flat())
) as UserRole[];

// Título de la sección de NAV_SECTIONS que /dashboard reutiliza como
// fuente única de qué módulos existen y a qué rol se le muestran — evita
// que dashboard/page.tsx mantenga su propia lista, que ya se desincronizó
// una vez (Ventas quedó "Próximamente" ahí mucho después de activarse en
// el sidebar; ver contexto/AUDITORIA_RTB-VEN-01.md §7.5).
export const SECCION_MODULOS = 'Módulos';

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
    title: SECCION_MODULOS,
    items: [
      {
        label: 'Ventas',
        href: '/dashboard/ventas',
        icon: ShoppingCart,
        // roles = unión de ACCESO_PANTALLA (037) — antes esta lista se
        // mantenía a mano y perdía sincronía con las pantallas reales, la
        // causa raíz de BUG-NAV-01/02 (contexto/AUDITORIA_RTB-VEN-01.md).
        roles: ROLES_VENTAS,
        children: [
          { label: 'Tablero', href: '/dashboard/ventas', icon: LayoutDashboard, roles: ACCESO_PANTALLA.tablero },
          {
            label: 'Cotizaciones',
            href: '/dashboard/ventas/cotizaciones',
            icon: FileText,
            roles: ACCESO_PANTALLA.cotizaciones,
          },
          { label: 'Pedidos', href: '/dashboard/ventas/pedidos', icon: ClipboardList, roles: ACCESO_PANTALLA.pedidos },
          { label: 'Remisiones', href: '/dashboard/ventas/remisiones', icon: Truck, roles: ACCESO_PANTALLA.remisiones },
          {
            label: 'Órdenes de compra',
            href: '/dashboard/ventas/ordenes-compra',
            icon: ShoppingBag,
            roles: ACCESO_PANTALLA.ordenes_compra,
          },
          {
            label: 'Autorizaciones',
            href: '/dashboard/ventas/autorizaciones',
            icon: FileCheck2,
            roles: ACCESO_PANTALLA.autorizaciones,
          },
          {
            label: 'Congelamientos',
            href: '/dashboard/ventas/congelamientos',
            icon: Snowflake,
            roles: ACCESO_PANTALLA.congelamientos,
          },
          {
            label: 'Excepciones',
            href: '/dashboard/ventas/excepciones',
            icon: AlertTriangle,
            roles: ACCESO_PANTALLA.excepciones,
          },
          { label: 'Consultas', href: '/dashboard/ventas/consultas', icon: HelpCircle, roles: ACCESO_PANTALLA.consultas },
          {
            label: 'Devoluciones',
            href: '/dashboard/ventas/devoluciones',
            icon: Undo2,
            roles: ACCESO_PANTALLA.devoluciones,
          },
        ],
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

function filtraItem(item: NavItem, role: UserRole): NavItem | null {
  const visible = item.roles === 'all' || (item.roles as UserRole[]).includes(role);
  if (!visible) return null;
  if (!item.children) return item;
  const children = item.children.filter((hijo) => filtraItem(hijo, role) !== null);
  return { ...item, children };
}

export function getNavForRole(role: UserRole): NavSection[] {
  return NAV_SECTIONS.map((section: NavSection) => ({
    ...section,
    items: section.items.map((item) => filtraItem(item, role)).filter((item): item is NavItem => item !== null),
  })).filter((section: NavSection) => section.items.length > 0);
}

export function hasAccess(userRole: UserRole, allowedRoles: UserRole[] | 'all'): boolean {
  if (allowedRoles === 'all') return true;
  return allowedRoles.includes(userRole);
}
