export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/guards';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';

// Guard real de todo el módulo — antes de 037 NO EXISTÍA ningún layout.tsx
// aquí, y los 13 page.tsx del árbol llamaban requireActiveUser() (sesión +
// is_active) sin comprobar rol. RLS es role-agnostic en las 15 tablas
// ventas_* y las API GET no pasaban rol a requireApiRole(), así que
// cualquier usuario activo de CUALQUIER rol —logistica, facturacion,
// finanzas incluidos— podía teclear la URL y ver datos reales. Ese vacío
// nunca fue el síntoma reportado (BUG-NAV-01/02 eran de navegación
// ausente, no de fuga de datos), pero es la misma clase de bug que la
// auditoría pidió cerrar en todas las pantallas, no sólo las dos con
// síntoma visible.
//
// La unión de ACCESO_PANTALLA es el primer filtro (nadie fuera de las 7
// roles con AL MENOS una pantalla permitida llega ni al tablero); cada
// page.tsx añade después su propio requireRole(ACCESO_PANTALLA.<pantalla>)
// para la restricción fina por sub-sección.
const ROLES_MODULO = Array.from(new Set(Object.values(ACCESO_PANTALLA).flat()));

export default async function VentasLayout({ children }: { children: React.ReactNode }) {
  await requireRole(ROLES_MODULO);
  return <>{children}</>;
}
