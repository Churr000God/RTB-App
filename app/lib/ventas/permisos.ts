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
  | 'precio_venta'
  | 'devoluciones';

type Accion = 'select' | 'insert' | 'update' | 'delete';

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
 *  - 'cotizaciones'.delete: sólo invoca ventas_cotizacion_eliminar() (040) —
 *    la cabecera no tiene GRANT DELETE de tabla, valida estado='borrador'
 *    dentro de la función. 'cotizacion_lineas'.delete SÍ es un GRANT DELETE
 *    real (039) con política RLS `estado='borrador'` — aquí la fila importa.
 *  - 'devoluciones': nace únicamente por ventas_cotizacion_cancelar() (sin
 *    insert por GRANT); 'update' describe quién invoca
 *    ventas_devolucion_resolver() (mismos roles que ROLES_AUTORIZAN, no
 *    'ventas' — abrirla es consecuencia de cancelar, cerrarla es un acto
 *    gerencial).
 *  - 'ordenes_compra'/'po_partidas': SIN GRANT INSERT/UPDATE para ningún rol
 *    desde 043 — la PO nace dentro de ventas_cotizacion_aprobar() (Vía B) o
 *    de ventas_po_crear_desde_nr() (Vía A, 048, ver ROLES_REGISTRAN_PO más
 *    abajo), nunca de un alta manual por GRANT. 'insert' desapareció de
 *    ambos recursos a propósito, no es un olvido.
 */
const MATRIZ: Record<RecursoVentas, Partial<Record<Accion, UserRole[]>>> = {
  cotizaciones: {
    select: TODOS_LOS_ROLES,
    insert: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
    update: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
    delete: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
  },
  cotizacion_lineas: {
    select: TODOS_LOS_ROLES,
    insert: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
    update: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
    delete: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
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
    // Sin insert/update por GRANT desde 043: nace dentro de
    // ventas_cotizacion_aprobar() y transiciona sólo por función
    // (ventas_po_despachar()/ventas_po_adjuntar_evidencia()/
    // ventas_po_cancelar() — roles en ROLES_DESPACHAN/config de abajo).
  },
  po_partidas: {
    select: TODOS_LOS_ROLES,
    // Ídem: se copian 1:1 desde ventas_pedido_lineas al aprobar, ningún
    // rol las inserta por GRANT.
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
  devoluciones: {
    select: TODOS_LOS_ROLES,
    // Mismos roles que ROLES_AUTORIZAN (declarado más abajo en este mismo
    // archivo) — no se referencia directamente para no depender del orden
    // de inicialización de los `const` del módulo.
    update: ['super_admin', 'direccion', 'gerente_comercial'],
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
  | 'consultas'
  | 'devoluciones';

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
  // 'almacen' queda fuera a propósito: la recepción física de la
  // devolución (aún sin construir) es donde entraría, no el seguimiento.
  devoluciones: ['super_admin', 'direccion', 'gerente_comercial', 'ventas'],
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

/** Roles que pueden despachar al kardex — espejo de ventas_nr_despachar()
 *  (037, sobre la base de 032/035, 'ventas' retirado en 045) Y de
 *  ventas_po_despachar() (044, Vía B): mismo conjunto de roles en ambas
 *  funciones SQL, un solo lugar que actualizar si algún día divergen.
 *  Surtir es trabajo físico de Almacén — 'ventas' se quitó a propósito
 *  (045, pedido explícito del dueño del proyecto); `direccion`/
 *  `gerente_comercial`/`super_admin` conservan la capacidad como
 *  autoridad de override/soporte, no como flujo normal. En la UI, Almacén
 *  despacha la PO desde el detalle del pedido (no tiene acceso a la
 *  pantalla de Órdenes de Compra — ver ACCESO_PANTALLA.ordenes_compra). */
export const ROLES_DESPACHAN: UserRole[] = ['super_admin', 'direccion', 'gerente_comercial', 'almacen'];

/** Roles que pueden liberar un pedido a Almacén (reserva → compromiso) —
 *  espejo de ventas_pedido_liberar_almacen() (037), que SÍ conserva
 *  'ventas' en su propio guard: liberar es el hand-off comercial hacia
 *  Almacén, no el acto físico de surtir — 045 sólo pidió quitarle a
 *  Ventas la segunda cosa. Constante separada a propósito de
 *  ROLES_DESPACHAN: antes de 045 compartían el mismo arreglo porque
 *  coincidían por accidente, no por diseño — reutilizar ROLES_DESPACHAN
 *  aquí habría bloqueado a Ventas de liberar sin que nadie lo pidiera. */
export const ROLES_LIBERAN_ALMACEN: UserRole[] = ['super_admin', 'direccion', 'gerente_comercial', 'ventas', 'almacen'];

/** Roles que pueden adjuntar/reemplazar el documento de PO del cliente —
 *  espejo de ventas_po_adjuntar_evidencia() (044). Sin 'almacen': ese
 *  documento es responsabilidad de quien aprobó/da seguimiento comercial,
 *  no de quien surte. */
export const ROLES_ADJUNTAN_EVIDENCIA_PO: UserRole[] = ['super_admin', 'direccion', 'gerente_comercial', 'ventas'];

/** Roles que pueden responder una consulta de Compras-ligero — espejo de
 *  ventas_consulta_responder() (030). 'ventas' NUNCA está aquí: levanta la
 *  consulta pero no la resuelve. */
export const ROLES_RESPONDEN_CONSULTA: UserRole[] = ['super_admin', 'direccion', 'compras'];

/** Roles que pueden registrar una PO desde el tablero de NR (Vía A) —
 *  espejo de ventas_po_crear_desde_nr()/ventas_po_ampliar()/
 *  ventas_po_corregir_precio() (048). Mismo conjunto que aprueba una
 *  cotización (ventas_cotizacion_aprobar()) porque ventas_po_crear_desde_nr()
 *  delega en ella para el caso C — coincide hoy con
 *  ROLES_ADJUNTAN_EVIDENCIA_PO, constante separada a propósito (mismo
 *  criterio que ROLES_LIBERAN_ALMACEN/ROLES_DESPACHAN): son preocupaciones
 *  distintas que sólo comparten valor por ahora. */
export const ROLES_REGISTRAN_PO: UserRole[] = ['super_admin', 'direccion', 'gerente_comercial', 'ventas'];

/** Roles que pueden cancelar una PO o un vínculo PO↔NR — espejo de
 *  ventas_po_cancelar() (sólo autoridad gerencial, sin 'ventas') y de
 *  ventas_vinculo_cancelar() (048, restaurada — mismo conjunto que
 *  ROLES_REGISTRAN_PO). Se exponen separadas porque sus guards SQL
 *  difieren: cancelar la PO completa es más estrecho que cancelar un
 *  vínculo suyo. */
export const ROLES_CANCELAN_PO: UserRole[] = ['super_admin', 'direccion', 'gerente_comercial'];
export const ROLES_CANCELAN_VINCULO: UserRole[] = ROLES_REGISTRAN_PO;
