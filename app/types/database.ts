export type UserRole =
  | 'super_admin'
  | 'direccion'
  | 'ventas'
  | 'compras'
  | 'almacen'
  | 'logistica'
  | 'facturacion'
  | 'finanzas';

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
