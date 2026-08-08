export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/supabase/guards';
import { rolesQuePueden } from '@/lib/ventas/permisos';
import { PoNuevaForm } from './po-nueva-form';

// Antes de 037 este archivo ERA el 'use client' completo, sin ningún guard
// de servidor — sólo el POST de la API lo protegía. Se separó en un Server
// Component (este archivo) + el formulario cliente (po-nueva-form.tsx).
// Guard por rolesQuePueden('ordenes_compra','insert'), no por
// ACCESO_PANTALLA.ordenes_compra: ese último incluye 'cobranza' (sólo
// lectura del listado) — dejarlo entrar a un formulario de alta que su
// POST igual rechazaría sería un guard cosmético, no real.
export default async function NuevaPoPage() {
  await requireRole(rolesQuePueden('ordenes_compra', 'insert'));
  return <PoNuevaForm />;
}
