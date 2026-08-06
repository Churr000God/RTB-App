import type { UserRole } from '@/types/database';

export type RecursoInventario =
  | 'catalogo_unidades'
  | 'catalogo_familias'
  | 'catalogo_categorias'
  | 'catalogo_marcas'
  | 'productos'
  | 'producto_imagenes'
  | 'proveedor_productos'
  | 'producto_costos'
  | 'precios_referencia'
  | 'existencias'
  | 'apartados'
  | 'movimientos'
  | 'conteos'
  | 'conteo_detalles'
  | 'congelamientos'
  | 'firmas'
  | 'hallazgos'
  | 'ajustes'
  | 'discrepancias'
  | 'redefiniciones_unidad';

type Accion = 'select' | 'insert' | 'update';

/**
 * Espejo EXACTO de las políticas RLS de db/migrations/009…013 — sirve sólo
 * para que la UI muestre/oculte botones antes del round-trip. Postgres es
 * la barrera real; si esta tabla y las políticas SQL alguna vez divergen,
 * manda siempre la política SQL, nunca esta constante.
 *
 * Varias políticas reales añaden una condición de fila que esta tabla no
 * puede expresar (documentada en el comentario de cada entrada):
 *  - 'ajustes'/'redefiniciones_unidad': update sólo si eres el
 *    solicitante Y el registro sigue en 'borrador'/'pendiente_autorizacion'.
 *  - 'conteo_detalles': 'almacen' sólo puede escribir dentro de su propia
 *    asignación activa y mientras el conteo está 'en_captura'.
 *  - 'firmas': insert sólo con firmante_id = tu propio uid.
 */
const MATRIZ: Record<RecursoInventario, Partial<Record<Accion, UserRole[]>>> = {
  // 015_catalogo_marcas_y_gobierno.sql estrechó unidades/familias: 'almacen'
  // sale del insert/update. La unidad de medida mal definida es la causa #1
  // de pérdida medida por RTB (14/27 folios de no conformidad, -$37,919.77,
  // ver 009) y la familia es su unidad de gobierno — quien las define no
  // debe ser quien opera el conteo contra ellas. Categorías y marcas sí
  // quedan con 'almacen': es quien recibe mercancía nueva y clasifica.
  catalogo_unidades: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'compras'],
    update: ['super_admin', 'direccion', 'compras'],
  },
  catalogo_familias: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'compras'],
    update: ['super_admin', 'direccion', 'compras'],
  },
  catalogo_categorias: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'compras', 'almacen'],
    update: ['super_admin', 'direccion', 'compras', 'almacen'],
  },
  catalogo_marcas: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'compras', 'almacen'],
    update: ['super_admin', 'direccion', 'compras', 'almacen'],
  },
  productos: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'compras', 'almacen'],
    update: ['super_admin', 'direccion', 'compras', 'almacen'],
  },
  // Espejo de 021_producto_imagenes.sql — mismos 4 roles de productos.
  // es_principal/activo no son "update" de esta matriz: se cambian por
  // rutas dedicadas con el cliente admin, fuera del GRANT UPDATE de columna.
  producto_imagenes: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'compras', 'almacen'],
    update: ['super_admin', 'direccion', 'compras', 'almacen'],
  },
  proveedor_productos: {
    // 'almacen' NO lee esta tabla (es la lista de precios de compras);
    // llega al costo por public.costo_unitario_vigente().
    select: ['super_admin', 'direccion', 'compras', 'finanzas'],
    insert: ['super_admin', 'direccion', 'compras'],
    update: ['super_admin', 'direccion', 'compras'],
  },
  producto_costos: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'compras', 'finanzas'],
    // Sin UPDATE: una corrección de costo es una fila nueva que cierra la vigencia anterior.
  },
  precios_referencia: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'ventas', 'compras'],
    update: ['super_admin', 'direccion', 'ventas', 'compras'],
  },
  existencias: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    // Sin INSERT/UPDATE: sólo el trigger del kardex y la aplicación de un conteo la escriben.
  },
  apartados: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'ventas', 'almacen'],
    update: ['super_admin', 'direccion', 'ventas', 'almacen'],
  },
  movimientos: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'almacen', 'compras', 'logistica'],
    // Sin UPDATE/DELETE: kardex append-only, ni siquiera service_role lo reescribe.
  },
  conteos: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'almacen'],
    update: ['super_admin', 'direccion', 'almacen'],
  },
  conteo_detalles: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    // Update real: super_admin/direccion siempre; 'almacen' sólo en su
    // asignación activa y con el conteo en_captura (ver docstring arriba).
    update: ['super_admin', 'direccion', 'almacen'],
  },
  congelamientos: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'almacen'],
    update: ['super_admin', 'direccion', 'almacen'],
  },
  firmas: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'almacen'],
  },
  hallazgos: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'almacen', 'compras'],
    update: ['super_admin', 'direccion', 'almacen', 'compras'],
  },
  ajustes: {
    // Select real también incluye "soy el solicitante" (RLS) — esta
    // entrada sólo cubre a quien ve TODOS los ajustes.
    select: ['super_admin', 'direccion', 'almacen', 'compras'],
    insert: ['super_admin', 'direccion', 'almacen', 'compras'],
    // Update real: sólo el propio solicitante, y sólo mientras estado='borrador'.
    update: ['super_admin', 'direccion', 'almacen', 'compras'],
  },
  discrepancias: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'almacen', 'compras'],
    update: ['super_admin', 'direccion', 'almacen', 'compras'],
  },
  redefiniciones_unidad: {
    select: ['super_admin', 'direccion', 'ventas', 'compras', 'finanzas', 'almacen', 'logistica', 'facturacion'],
    insert: ['super_admin', 'direccion', 'compras', 'almacen'],
    // Update real: sólo el propio solicitante, y sólo mientras estado='pendiente_autorizacion'.
    update: ['super_admin', 'direccion', 'compras', 'almacen'],
  },
};

export function puede(rol: UserRole | null | undefined, recurso: RecursoInventario, accion: Accion): boolean {
  if (!rol) return false;
  return MATRIZ[recurso]?.[accion]?.includes(rol) ?? false;
}

/** Lista de roles habilitados para `recurso`/`accion` — usada por las rutas
 *  de /api/catalogos como argumento de requireApiRole(), derivada del mismo
 *  espejo que gatea los botones de la UI. Lista vacía ⇒ requireApiRole([])
 *  deniega a todos: fallo cerrado, que es el correcto. */
export function rolesQuePueden(recurso: RecursoInventario, accion: Accion): UserRole[] {
  return MATRIZ[recurso]?.[accion] ?? [];
}

/** Roles que pueden AUTORIZAR un ajuste o una redefinición de unidad — la
 *  resolución siempre pasa por el API con service_role
 *  (requireApiRole(['super_admin','direccion'])), nunca por RLS directa. */
export const ROLES_AUTORIZAN_AJUSTES: UserRole[] = ['super_admin', 'direccion'];

/** Roles que pueden firmar el cierre de un conteo como 'supervisor' o
 *  'gerente_operaciones' — en RTB esos roles de firma los cubre dirección/
 *  super_admin; 'almacen' firma como 'contador'/'testigo'. La regla fina
 *  (qué rol_firma puede reclamar cada usuario) se valida en la API, no aquí. */
export const ROLES_FIRMAN_SUPERVISION: UserRole[] = ['super_admin', 'direccion'];
