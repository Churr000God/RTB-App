import { TODOS_LOS_ROLES, type UserRole } from '@/types/database';

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
    select: TODOS_LOS_ROLES,
    insert: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
    update: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
  },
  cotizacion_lineas: {
    select: TODOS_LOS_ROLES,
    insert: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
    update: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
  },
  consultas_compras: {
    select: TODOS_LOS_ROLES,
    insert: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
    // Sin 'update' real por GRANT: la respuesta pasa por función, ver docstring.
  },
  pedidos: {
    select: TODOS_LOS_ROLES,
    // Sin insert/update por GRANT: nace y transiciona por función.
  },
  notas_remision: {
    select: TODOS_LOS_ROLES,
  },
  nr_seguimientos: {
    select: TODOS_LOS_ROLES,
    insert: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
  },
  ordenes_compra: {
    select: TODOS_LOS_ROLES,
    insert: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
  },
  po_partidas: {
    select: TODOS_LOS_ROLES,
    insert: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
  },
  vinculos: {
    select: TODOS_LOS_ROLES,
  },
  cliente_congelamientos: {
    select: TODOS_LOS_ROLES,
    insert: ['super_admin', 'direccion', 'gerente_comercial'],
    update: ['super_admin', 'direccion', 'gerente_comercial'],
  },
  cliente_excepciones: {
    select: TODOS_LOS_ROLES,
    insert: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
  },
  ventas_autorizaciones: {
    select: TODOS_LOS_ROLES,
    insert: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
  },
  margenes: {
    // producto_familias.margen_porcentaje: fuera del GRANT UPDATE de 009,
    // sólo escribible por API con service_role tras validar rol (028).
    // gerente_comercial NO está aquí a propósito: precio/margen de
    // catálogo es autoridad fuera de Ventas (037).
    select: TODOS_LOS_ROLES,
    update: ['super_admin', 'direccion'],
  },
  precio_venta: {
    // producto_precio_venta: sólo por producto_precio_venta_fijar()/
    // _revertir() (028), invocables únicamente por super_admin/direccion —
    // gerente_comercial NO está aquí a propósito, mismo motivo que margenes.
    select: TODOS_LOS_ROLES,
    update: ['super_admin', 'direccion'],
  },
};

/** Qué roles pueden ENTRAR a cada pantalla del módulo de Ventas — fuente
 *  única para el guard real de cada page.tsx/layout.tsx, los sub-items del
 *  sidebar (lib/rbac/config.ts) y los enlaces del tablero. Antes de 037 no
 *  existía ningún guard de este tipo: el sidebar y las páginas no
 *  compartían origen, que es la causa raíz de BUG-NAV-01/BUG-NAV-02
 *  (contexto/AUDITORIA_RTB-VEN-01.md, sesión de navegación 2026-08-07) —
 *  ambos síntomas eran de navegación ausente, no de permisos denegados.
 *  Quién puede *actuar* dentro de una pantalla permitida lo sigue
 *  decidiendo MATRIZ/RLS/RPC, no esta tabla. */
export type PantallaVentas =
  | 'tablero'
  | 'cotizaciones'
  | 'pedidos'
  | 'remisiones'
  | 'ordenes_compra'
  | 'autorizaciones'
  | 'congelamientos'
  | 'excepciones'
  | 'consultas';

// Record<PantallaVentas, UserRole[]> a propósito, sin `as const`: NavItem.roles
// (types/navigation.ts) exige un arreglo MUTABLE, y `as const` produciría
// tuplas readonly que TypeScript no acepta ahí.
export const ACCESO_PANTALLA: Record<PantallaVentas, UserRole[]> = {
  tablero: ['super_admin', 'direccion', 'gerente_comercial', 'ventas', 'compras', 'almacen', 'cobranza'],
  cotizaciones: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
  pedidos: ['super_admin', 'direccion', 'gerente_comercial', 'ventas', 'almacen'],
  remisiones: ['super_admin', 'direccion', 'gerente_comercial', 'ventas', 'almacen', 'cobranza'],
  ordenes_compra: ['super_admin', 'direccion', 'gerente_comercial', 'ventas', 'cobranza'],
  autorizaciones: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
  congelamientos: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
  excepciones: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
  consultas: ['super_admin', 'direccion', 'gerente_comercial', 'ventas', 'compras'],
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
export const ROLES_AUTORIZAN: UserRole[] = ['super_admin', 'direccion', 'gerente_comercial'];

/** Roles que pueden despachar una NR al kardex — espejo de
 *  ventas_nr_despachar() (037, sobre la base de 032/035). */
export const ROLES_DESPACHAN: UserRole[] = ['super_admin', 'direccion', 'gerente_comercial', 'almacen', 'ventas'];

/** Roles que pueden responder una consulta de Compras-ligero — espejo de
 *  ventas_consulta_responder() (030). 'ventas' NUNCA está aquí: levanta la
 *  consulta pero no la resuelve. */
export const ROLES_RESPONDEN_CONSULTA: UserRole[] = ['super_admin', 'direccion', 'compras'];
