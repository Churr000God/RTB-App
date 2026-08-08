export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/guards';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { CotizacionNuevaForm } from './cotizacion-nueva-form';

// Antes de 037 este archivo ERA el 'use client' completo, sin ningún guard
// de servidor — sólo el POST de la API lo protegía. Se separó en un Server
// Component (este archivo, con el guard real) + el formulario cliente
// (cotizacion-nueva-form.tsx), mismo patrón ya usado en el resto del
// módulo (ver ordenes-compra/[id]/page.tsx). ACCESO_PANTALLA.cotizaciones
// coincide exactamente con MATRIZ.cotizaciones.insert — no se amplía ni se
// restringe nada al reutilizar el guard de pantalla aquí.
export default async function NuevaCotizacionPage() {
  await requireRole(ACCESO_PANTALLA.cotizaciones);
  return <CotizacionNuevaForm />;
}
