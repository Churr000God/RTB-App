import type { UserRole } from '@/types/database';

export type RecursoEntidades =
  | 'entidades'
  | 'clientes'
  | 'proveedores'
  | 'contactos'
  | 'direcciones'
  | 'cuentas_bancarias'
  | 'ubicaciones'
  | 'solicitudes_cambio'
  | 'audit_log';

type Accion = 'select' | 'insert' | 'update';

/**
 * Espejo EXACTO de las políticas RLS de db/migrations/002_entidades_core.sql,
 * 003_ubicaciones_internas.sql y 004_cuentas_bancarias.sql — sirve sólo para
 * que la UI muestre/oculte botones antes del round-trip. Postgres es la
 * barrera real; si esta tabla y las políticas SQL alguna vez divergen,
 * manda siempre la política SQL, nunca esta constante.
 *
 * 'cuentas_bancarias' no incluye a 'direccion' en select: direccion sólo ve
 * el resumen enmascarado vía public.proveedor_cuentas_resumen() (P03 §II
 * "solo el estado"), no la tabla base con la CLABE completa.
 */
const MATRIZ: Record<RecursoEntidades, Partial<Record<Accion, UserRole[]>>> = {
  entidades: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'ventas', 'compras'],
    update: ['super_admin', 'direccion', 'ventas', 'compras'],
  },
  clientes: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'ventas'],
    update: ['super_admin', 'direccion', 'ventas'],
  },
  proveedores: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'compras'],
    update: ['super_admin', 'direccion', 'compras'],
  },
  contactos: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas'],
    update: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas'],
  },
  direcciones: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'ventas', 'compras', 'almacen', 'logistica'],
    update: ['super_admin', 'direccion', 'ventas', 'compras', 'almacen', 'logistica'],
  },
  cuentas_bancarias: {
    select: ['super_admin', 'finanzas'],
    insert: ['super_admin', 'finanzas'],
    update: ['super_admin', 'finanzas'],
  },
  ubicaciones: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'almacen'],
    update: ['super_admin', 'direccion', 'almacen'],
  },
  solicitudes_cambio: {
    // SELECT real también incluye "soy el solicitante" (RLS), imposible de
    // expresar aquí como lista de roles — esta entrada sólo cubre a quien
    // ve TODAS las solicitudes.
    select: ['super_admin', 'direccion'],
    insert: ['super_admin', 'direccion', 'ventas', 'compras'],
  },
  audit_log: {
    select: ['super_admin', 'direccion'],
  },
};

export function puede(rol: UserRole | null | undefined, recurso: RecursoEntidades, accion: Accion): boolean {
  if (!rol) return false;
  return MATRIZ[recurso]?.[accion]?.includes(rol) ?? false;
}

// ---------- Matriz de cambios controlados (P05 §II, traducida a roles RTB) ----------

export type CambioControlado =
  | 'rfc'
  | 'razon_social'
  | 'limite_credito'
  | 'condicion_proveedor'
  | 'reactivacion'
  | 'bloqueo_temporal'
  | 'bloqueo_permanente';

interface ReglaAprobacion {
  /** Roles que pueden solicitar este cambio. */
  inicia: UserRole[];
  /** Roles que pueden aprobarlo; null = quien inicia ya ejecuta directo. */
  aprueba: UserRole[] | null;
}

export const REGLAS_APROBACION: Record<CambioControlado, ReglaAprobacion> = {
  rfc: { inicia: ['super_admin'], aprueba: null },
  razon_social: { inicia: ['direccion'], aprueba: ['super_admin'] },
  limite_credito: { inicia: ['ventas'], aprueba: ['direccion'] },
  condicion_proveedor: { inicia: ['compras'], aprueba: ['direccion'] },
  reactivacion: { inicia: ['direccion'], aprueba: ['super_admin'] },
  bloqueo_temporal: { inicia: ['direccion'], aprueba: ['super_admin'] },
  bloqueo_permanente: { inicia: ['super_admin'], aprueba: null },
};

/** super_admin siempre puede ejecutar cualquier cambio controlado directo,
 *  sin pasar por solicitudes_cambio (matriz de permisos: "CRU+B+A" en
 *  todos los recursos). Para el resto de roles, sólo quien figura como
 *  'inicia' en REGLAS_APROBACION puede siquiera levantar la solicitud —
 *  eso se valida en la ruta de API, no aquí. */
export function ejecutaDirecto(cambio: CambioControlado, rol: UserRole | null | undefined): boolean {
  if (!rol) return false;
  if (rol === 'super_admin') return true;
  return REGLAS_APROBACION[cambio].aprueba === null && REGLAS_APROBACION[cambio].inicia.includes(rol);
}
