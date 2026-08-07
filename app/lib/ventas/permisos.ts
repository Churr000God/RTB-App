import type { UserRole } from '@/types/database';

export type RecursoVentas =
  | 'cotizaciones'
  | 'cotizacion_lineas'
  | 'consultas_compras'
  | 'pedidos'
  | 'notas_remision'
  | 'nr_seguimientos'
  | 'ordenes_compra'
  | 'po_partidas'
  | 'vinculos'
  | 'cliente_congelamientos'
  | 'cliente_excepciones'
  | 'ventas_autorizaciones'
  | 'margenes'
  | 'precio_venta';

type Accion = 'select' | 'insert' | 'update';

/**
 * Espejo EXACTO de las políticas RLS de db/migrations/028…034 — sirve sólo
 * para que la UI muestre/oculte botones antes del round-trip. Postgres es
 * la barrera real; si esta tabla y las políticas SQL alguna vez divergen,
 * manda siempre la política SQL, nunca esta constante.
 *
 * Condiciones de fila que esta matriz NO puede expresar (documentadas aquí
 * porque no caben en un Record por rol):
 *  - 'cotizaciones'/'cotizacion_lineas': update real de 'ventas' sólo si
 *    vendedor_id = tu propio uid (dirección/super_admin sin restricción).
 *  - 'consultas_compras': la resolución (estado/producto/costo) es
 *    exclusiva de ventas_consulta_responder() — ningún rol la escribe por
 *    GRANT directo, ni siquiera compras.
 *  - 'pedidos'/'notas_remision'/'vinculos': SIN GRANT INSERT/UPDATE para
 *    ningún rol — nacen y transicionan únicamente por función SECURITY
 *    DEFINER. 'insert'/'update' aquí describen quién puede INVOCAR esas
 *    funciones (ver ROLES_* en config.ts), no un privilegio de tabla.
 *  - 'cliente_excepciones': update real es sólo por
 *    requireApiRole(['super_admin','direccion']) con service_role +
 *    comprobación de que el aprobador no sea el solicitante.
 */
const MATRIZ: Record<RecursoVentas, Partial<Record<Accion, UserRole[]>>> = {
  cotizaciones: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'ventas'],
    update: ['super_admin', 'direccion', 'ventas'],
  },
  cotizacion_lineas: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'ventas'],
    update: ['super_admin', 'direccion', 'ventas'],
  },
  consultas_compras: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'ventas'],
    // Sin 'update' real por GRANT: la respuesta pasa por función, ver docstring.
  },
  pedidos: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    // Sin insert/update por GRANT: nace y transiciona por función.
  },
  notas_remision: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
  },
  nr_seguimientos: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'ventas'],
  },
  ordenes_compra: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'ventas'],
  },
  po_partidas: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'ventas'],
  },
  vinculos: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
  },
  cliente_congelamientos: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion'],
    update: ['super_admin', 'direccion'],
  },
  cliente_excepciones: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'ventas'],
  },
  ventas_autorizaciones: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'ventas'],
  },
  margenes: {
    // producto_familias.margen_porcentaje: fuera del GRANT UPDATE de 009,
    // sólo escribible por API con service_role tras validar rol (028).
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    update: ['super_admin', 'direccion'],
  },
  precio_venta: {
    // producto_precio_venta: sólo por producto_precio_venta_fijar()/
    // _revertir() (028), invocables únicamente por super_admin/direccion.
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    update: ['super_admin', 'direccion'],
  },
};

export function puede(rol: UserRole | null | undefined, recurso: RecursoVentas, accion: Accion): boolean {
  if (!rol) return false;
  return MATRIZ[recurso]?.[accion]?.includes(rol) ?? false;
}

/** Lista de roles habilitados para `recurso`/`accion` — usada como
 *  argumento de requireApiRole(). Lista vacía ⇒ fallo cerrado. */
export function rolesQuePueden(recurso: RecursoVentas, accion: Accion): UserRole[] {
  return MATRIZ[recurso]?.[accion] ?? [];
}

/** Roles que pueden resolver una excepción/autorización de Ventas —
 *  siempre requiere que el aprobador no sea el propio solicitante
 *  (comprobado en la función SQL, no sólo aquí). */
export const ROLES_AUTORIZAN: UserRole[] = ['super_admin', 'direccion'];

/** Roles que pueden despachar una NR al kardex — espejo de
 *  ventas_nr_despachar() (032). */
export const ROLES_DESPACHAN: UserRole[] = ['super_admin', 'direccion', 'almacen', 'ventas'];

/** Roles que pueden responder una consulta de Compras-ligero — espejo de
 *  ventas_consulta_responder() (030). 'ventas' NUNCA está aquí: levanta la
 *  consulta pero no la resuelve. */
export const ROLES_RESPONDEN_CONSULTA: UserRole[] = ['super_admin', 'direccion', 'compras'];
