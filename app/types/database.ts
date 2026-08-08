export const USER_ROLES = [
  'super_admin',
  'direccion',
  'ventas',
  'compras',
  'almacen',
  'logistica',
  'facturacion',
  'finanzas',
  // 037_roles_comerciales.sql (2026-08-07) — auditoría de navegación de
  // RTB-VEN-01: gerente_comercial es direccion, pero SÓLO dentro de
  // Ventas; cobranza es sólo lectura, precursor de RTB-PRO-FAC-01.
  'gerente_comercial',
  'cobranza',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Los 10 roles como arreglo — para las políticas RLS "role-agnostic"
 *  (`current_user_role() is not null`, la mayoría del sistema) cuyo
 *  espejo de UI en lib/*\/permisos.ts listaba antes los 8 roles a mano.
 *  Un alta de rol nueva que olvide uno de esos ~38 sitios deja ciego en
 *  silencio al rol nuevo — usar esta constante en vez de re-teclear la
 *  lista evita ese punto de omisión. */
export const TODOS_LOS_ROLES: UserRole[] = [...USER_ROLES];

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
}

export interface UpdateProfilePayload {
  full_name?: string;
  role?: UserRole;
  is_active?: boolean;
}
