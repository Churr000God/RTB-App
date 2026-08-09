// Espejo TypeScript de los enums y tablas de RTB-VEN-01
// (db/migrations/028_ventas_precios.sql … 034_ventas_tablero.sql). Mismo
// patrón que app/types/entidades.ts / app/types/inventario.ts: tuplas
// `as const` que alimentan z.enum(...) sin duplicar literales.

import type { ProductoResumen } from './inventario';
import type { CanalOrigen } from './entidades';

export const VENTAS_COTIZACION_ESTADOS = [
  'borrador', 'enviada', 'aprobada', 'rechazada', 'expirada', 'cancelada', 'en_devolucion',
] as const;
export type VentasCotizacionEstado = (typeof VENTAS_COTIZACION_ESTADOS)[number];

export const PRECIO_ORIGEN_VENTAS = ['refaccion', 'ariba', 'costo_venta'] as const;
export type PrecioOrigenVenta = (typeof PRECIO_ORIGEN_VENTAS)[number];

export const CONSULTA_ESTADOS = ['abierta', 'en_proceso', 'respondida', 'sin_disponibilidad', 'cancelada'] as const;
export type ConsultaEstado = (typeof CONSULTA_ESTADOS)[number];

export const CONSULTA_URGENCIAS = ['normal', 'alta', 'critica'] as const;
export type ConsultaUrgencia = (typeof CONSULTA_URGENCIAS)[number];

export const PEDIDO_ESTADOS = [
  'aprobado', 'liberado', 'en_preparacion', 'entregado_parcial', 'entregado', 'cerrado', 'cancelado', 'en_devolucion',
] as const;
export type PedidoEstado = (typeof PEDIDO_ESTADOS)[number];

// Vía elegida al aprobar la cotización (043) — determina si el pedido se
// surte por Nota de Remisión (ciclo NR, 032/035) o directo contra la PO del
// cliente (Vía B, sin NR: ventas_po_despachar()).
export const PEDIDO_VIAS = ['nota_remision', 'orden_compra'] as const;
export type PedidoVia = (typeof PEDIDO_VIAS)[number];

export const DEVOLUCION_ESTADOS = ['pendiente', 'resuelta'] as const;
export type DevolucionEstado = (typeof DEVOLUCION_ESTADOS)[number];

export const APARTADO_NIVELES = ['reserva', 'compromiso'] as const;
export type ApartadoNivel = (typeof APARTADO_NIVELES)[number];

export const NR_ESTADOS = [
  'abierta', 'en_preparacion', 'parcialmente_entregada', 'entregada_sin_po',
  'parcialmente_respaldada', 'po_vinculada', 'facturada', 'pagada_cerrada', 'cancelada', 'con_incidencia',
] as const;
export type NrEstado = (typeof NR_ESTADOS)[number];

// Ciclo de surtido de la Vía B (043) — sustituye al ciclo de validación por
// partida de 033 (recibida/en_validacion/parcialmente_vinculada/vinculada/
// pendiente_de_confirmacion/rechazada/corregida), retirado porque la PO ya
// nace de datos consistentes (copiados 1:1 del pedido al aprobar).
// pendiente_de_autorizacion/vinculada (046-048, Vía A): una PO se congela
// completa si una partida de respaldo tiene precio distinto al de la NR que
// cubre, o si se solicitó ampliarla — no respalda nada ni admite surtido
// hasta que Dirección resuelva. 'vinculada' es el reposo cuando TODO lo que
// la PO debía cubrir (respaldo con vínculo activo + compromiso surtido) ya
// está resuelto; una PO sin ninguna partida de respaldo (todo Vía B) nunca
// pasa de 'surtida' — no hay nada que "vincular" (ver
// ventas_po_recalcular_estado(), 048/050).
export const PO_ESTADOS = [
  'pendiente_de_autorizacion', 'abierta', 'parcialmente_surtida', 'surtida', 'vinculada',
  'facturada', 'pagada_cerrada', 'cancelada',
] as const;
export type PoEstado = (typeof PO_ESTADOS)[number];

// Origen de la PO (047): si nació dentro de ventas_cotizacion_aprobar()
// (Vía B, 043) o desde el tablero de NR (Vía A, 048) cuando llega la PO
// física después de una o varias NR ya emitidas.
export const PO_ORIGENES = ['cotizacion_aprobada', 'posterior_a_entrega'] as const;
export type PoOrigen = (typeof PO_ORIGENES)[number];

// Tipo de partida (047): 'respaldo' = ya entregada por una NR (sólo Vía A,
// nace con cantidad_entregada = cantidad); 'compromiso' = por entregar, se
// surte contra la PO (Vía A y Vía B, default).
export const PO_PARTIDA_TIPOS = ['compromiso', 'respaldo'] as const;
export type PoPartidaTipo = (typeof PO_PARTIDA_TIPOS)[number];

export const VINCULO_ESTADOS = [
  'pendiente', 'validado', 'rechazado_por_precio', 'rechazado_por_cantidad',
  'rechazado_por_duplicidad', 'aprobado_para_facturacion', 'facturado', 'cancelado',
] as const;
export type VinculoEstado = (typeof VINCULO_ESTADOS)[number];

// precio_po_divergente/ampliacion_po (046-048, Vía A): los dos motivos de
// congelamiento de una PO — precio de una partida de respaldo distinto al
// de su línea de NR, o solicitud de agregar más NR/partidas a una PO ya
// creada. Documento polimórfico: documento_tipo='orden_compra_cliente'.
export const VENTAS_AUTORIZACION_TIPOS = [
  'excepcion_subtotal', 'codigo_divergente', 'duplicidad_confirmada', 'correccion_documento',
  'precio_po_divergente', 'ampliacion_po',
] as const;
export type VentasAutorizacionTipo = (typeof VENTAS_AUTORIZACION_TIPOS)[number];

export const VENTAS_AUTORIZACION_ESTADOS = ['pendiente', 'autorizada', 'rechazada'] as const;
export type VentasAutorizacionEstado = (typeof VENTAS_AUTORIZACION_ESTADOS)[number];

export const CLIENTE_TIPOS = ['credito', 'contado', 'pago_anticipado', 'facturacion_inmediata'] as const;
export type ClienteTipo = (typeof CLIENTE_TIPOS)[number];

export const CLIENTE_CARTERA_ESTADOS = [
  'normal', 'descongelada', 'excepcion_autorizada', 'en_revision', 'congelada', 'bloqueada',
] as const;
export type ClienteCarteraEstado = (typeof CLIENTE_CARTERA_ESTADOS)[number];

// Datos formales que pueden faltar en una aprobación del cliente (documento
// de reglas del dueño del proyecto §7) — espejo de aprob_faltantes_chk (030).
export const DATOS_FALTANTES = [
  'contacto_no_identificado',
  'monto_no_confirmado',
  'fecha_entrega_no_confirmada',
  'condicion_pago_no_confirmada',
  'po_pendiente',
  'datos_fiscales_pendientes',
] as const;
export type DatoFaltante = (typeof DATOS_FALTANTES)[number];

// ---------- Formas de fila (subconjunto de columnas usado por la UI/API) ----------

export interface CotizacionRow {
  id: string;
  folio: string;
  entidad_id: string;
  vendedor_id: string | null;
  canal_entrada: string;
  medio_seguimiento: string | null;
  moneda: string;
  vigencia_hasta: string | null;
  estado: VentasCotizacionEstado;
  enviada_at: string | null;
  resuelta_at: string | null;
  motivo_resolucion: string | null;
  observaciones: string | null;
  created_at: string;
}

/** Fila de public.ventas_cotizaciones_listado (038) — NO es CotizacionRow:
 *  aplana el cliente (entidades) y agrega el total de líneas ACTIVAS.
 *  ventas_cotizaciones no tiene columna de total y no debe tenerla — el
 *  snapshot de precio vive en la línea (030). `total` es numeric(18,4)
 *  serializado por PostgREST como float64: sólo para mostrar/ordenar,
 *  nunca para una comparación de negocio (ver lib/ventas/validaciones.ts). */
export interface CotizacionListadoRow {
  id: string;
  folio: string;
  entidad_id: string;
  entidad_clave: string | null;
  entidad_siglas: string | null;
  entidad_nombre_legal: string | null;
  entidad_nombre_comercial: string | null;
  vendedor_id: string | null;
  canal_entrada: CanalOrigen;
  medio_seguimiento: CanalOrigen | null;
  moneda: string;
  vigencia_hasta: string | null;
  estado: VentasCotizacionEstado;
  enviada_at: string | null;
  resuelta_at: string | null;
  motivo_resolucion: string | null;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
  total: number;
  lineas_count: number;
  lineas_en_consulta: number;
}

/** Campo de fecha que puede elegir el selector de rango del listado.
 *  'resolucion' cubre aprobada/rechazada/cancelada (resuelta_at es
 *  genérico, 030 — no existe aprobada_at). */
export const COTIZACION_FECHA_CAMPOS = ['creacion', 'envio', 'resolucion', 'vigencia'] as const;
export type CotizacionFechaCampo = (typeof COTIZACION_FECHA_CAMPOS)[number];

export const COTIZACION_ORDENES = ['reciente', 'antigua', 'monto_desc', 'monto_asc', 'vigencia'] as const;
export type CotizacionOrden = (typeof COTIZACION_ORDENES)[number];

export const COTIZACION_VIGENCIA_FILTROS = ['vigente', 'vencida'] as const;
export type CotizacionVigenciaFiltro = (typeof COTIZACION_VIGENCIA_FILTROS)[number];

export const COTIZACIONES_VISTAS = ['tablero', 'tabla'] as const;
export type CotizacionesVista = (typeof COTIZACIONES_VISTAS)[number];

/** Una columna del tablero — count real de la columna (no data.length, que
 *  está acotado por el tope de tarjetas). */
export interface CotizacionTableroColumna {
  estado: VentasCotizacionEstado;
  count: number;
  data: CotizacionListadoRow[];
}

export interface CotizacionLineaRow {
  id: string;
  cotizacion_id: string;
  producto_id: string | null;
  consulta_id: string | null;
  descripcion_libre: string | null;
  cantidad: number;
  unidad_medida_id: string | null;
  en_consulta: boolean;
  precio_origen: PrecioOrigenVenta | null;
  precio_unitario: number | null;
  costo_base_snapshot: number | null;
  margen_snapshot: number | null;
  descuento_porcentaje: number;
  importe: number | null;
  activo: boolean;
  observaciones: string | null;
  /** Embed PostgREST `productos(codigo_interno, nombre)` — null si producto_id es null o RLS lo oculta. */
  productos?: ProductoResumen | null;
}

export interface ConsultaComprasRow {
  id: string;
  folio: string;
  cotizacion_id: string | null;
  entidad_id: string | null;
  descripcion: string;
  marca_texto: string | null;
  modelo_texto: string | null;
  numero_parte: string | null;
  cantidad: number | null;
  unidad_texto: string | null;
  urgencia: ConsultaUrgencia;
  estado: ConsultaEstado;
  solicitante_id: string;
  producto_id: string | null;
  costo_unitario: number | null;
  moneda: string | null;
  plazo_entrega_dias: number | null;
  disponibilidad: string | null;
  proveedor_id: string | null;
  notas_respuesta: string | null;
  created_at: string;
}

export const VENTAS_ENVIO_RESULTADOS = ['exitoso', 'fallido'] as const;
export type VentasEnvioResultado = (typeof VENTAS_ENVIO_RESULTADOS)[number];

/** Fila de public.ventas_cotizacion_envios (042) — bitácora append-only de
 *  cada intento de envío por correo del PDF de una cotización. */
export interface CotizacionEnvioRow {
  id: string;
  cotizacion_id: string;
  para: string;
  cc: string[];
  asunto: string;
  mensaje: string | null;
  adjunto_nombre: string | null;
  resultado: VentasEnvioResultado;
  proveedor: string;
  mensaje_id: string | null;
  error_detalle: string | null;
  enviado_por: string | null;
  enviado_at: string;
}

export interface PedidoRow {
  id: string;
  folio: string;
  cotizacion_id: string;
  entidad_id: string;
  vendedor_id: string | null;
  moneda: string;
  requiere_po: boolean;
  via: PedidoVia;
  estado: PedidoEstado;
  liberado_at: string | null;
  cancelado_at: string | null;
  motivo_cancelacion: string | null;
  created_at: string;
}

export interface PedidoLineaRow {
  id: string;
  pedido_id: string;
  cotizacion_linea_id: string | null;
  producto_id: string;
  cantidad: number;
  unidad_medida_id: string;
  precio_unitario: number;
  descuento_porcentaje: number;
  importe: number;
  /** Embed PostgREST `productos(codigo_interno, nombre)`. */
  productos?: ProductoResumen | null;
}

export interface NotaRemisionRow {
  id: string;
  folio: string;
  pedido_id: string;
  entidad_id: string;
  vendedor_id: string | null;
  moneda: string;
  estado: NrEstado;
  emitida_at: string;
  entregada_at: string | null;
  valor_total: number | null;
  ultimo_contacto_at: string | null;
  nota_ultimo_contacto: string | null;
  cancelado_at: string | null;
  motivo_cancelacion: string | null;
}

/** Fila de public.ventas_devoluciones (039/041) — seguimiento básico de
 *  devoluciones. Nace únicamente por ventas_cotizacion_cancelar() cuando el
 *  pedido asociado ya muestra entrega; se cierra únicamente por
 *  ventas_devolucion_resolver(). Sin reembolso/factura real todavía —
 *  Facturación (RTB-PRO-FAC-01) no existe. */
export interface DevolucionRow {
  id: string;
  folio: string;
  cotizacion_id: string;
  pedido_id: string;
  nr_id: string | null;
  /** Poblado (043) cuando la devolución nace de un pedido de Vía B
   *  (nr_id queda NULL en ese caso). */
  po_id: string | null;
  entidad_id: string;
  motivo: string;
  estado: DevolucionEstado;
  valor_entregado: number | null;
  registrado_por: string | null;
  resuelta_at: string | null;
  resuelta_por: string | null;
  notas_resolucion: string | null;
  created_at: string;
  /** Embed PostgREST `entidades(nombre_comercial, nombre_legal)`. */
  entidades?: { nombre_comercial: string | null; nombre_legal: string } | null;
}

/** @deprecated Sustituida por NrListadoRow / ventas_notas_remision_listado
 *  (049) — ventas_tablero_nr() se retira una vez migrados sus 3
 *  consumidores. Se conserva el tipo mientras dure esa migración. */
export interface TableroNrRow {
  nr_id: string;
  folio: string;
  entidad_id: string;
  entidad_nombre: string | null;
  vendedor_id: string | null;
  canal_origen: string;
  estado: NrEstado;
  emitida_at: string;
  antiguedad_dias: number;
  valor_total: number | null;
  monto_respaldado: number;
  monto_pendiente: number;
  po_folios: string | null;
  ultimo_contacto_at: string | null;
  nota_ultimo_contacto: string | null;
}

/** Fila de public.ventas_notas_remision_listado (049) — mismo patrón que
 *  CotizacionListadoRow (038): aplana cliente/pedido/cotización y agrega
 *  totales de línea + cobertura por PO (excluyendo vínculos de una PO
 *  congelada, 048 — ver monto_pendiente_po). */
export interface NrListadoRow {
  id: string;
  folio: string;
  pedido_id: string | null;
  entidad_id: string;
  entidad_clave: string | null;
  entidad_siglas: string | null;
  entidad_nombre_legal: string | null;
  entidad_nombre_comercial: string | null;
  vendedor_id: string | null;
  moneda: string;
  estado: NrEstado;
  emitida_at: string;
  entregada_at: string | null;
  valor_total: number | null;
  ultimo_contacto_at: string | null;
  nota_ultimo_contacto: string | null;
  cancelado_at: string | null;
  motivo_cancelacion: string | null;
  created_at: string;
  updated_at: string;
  pedido_folio: string | null;
  pedido_estado: PedidoEstado | null;
  cotizacion_id: string | null;
  cotizacion_folio: string | null;
  /** Sale del pedido/cotización — la NR no tiene esta columna. */
  canal_origen: CanalOrigen | null;
  antiguedad_dias: number;
  lineas_count: number;
  cantidad_total: number;
  cantidad_entregada_total: number;
  monto_entregado: number;
  /** Ya excluye vínculos de una PO pendiente_de_autorizacion (048). */
  monto_respaldado: number;
  monto_pendiente_po: number;
  po_folios: string | null;
}

export const NR_FECHA_CAMPOS = ['emision', 'entrega', 'creacion', 'ultimo_contacto'] as const;
export type NrFechaCampo = (typeof NR_FECHA_CAMPOS)[number];

export const NR_ORDENES = [
  'reciente', 'antigua', 'antiguedad_desc', 'monto_desc', 'monto_asc', 'pendiente_desc',
] as const;
export type NrOrden = (typeof NR_ORDENES)[number];

/** Una columna del tablero de NR — count real (no data.length, acotado por
 *  el tope de tarjetas). */
export interface NrTableroColumna {
  estado: NrEstado;
  count: number;
  data: NrListadoRow[];
}

export interface OrdenCompraClienteRow {
  id: string;
  folio: string;
  numero_po: string;
  entidad_id: string;
  pedido_id: string | null;
  /** Cotización que la aprobó como PO (043) — null en las PO relic de
   *  Vía A, previas a este cambio, y en una PO de Vía A puramente de
   *  respaldo/partidas nuevas (sin caso C). */
  cotizacion_id: string | null;
  /** origen (047): 'cotizacion_aprobada' (Vía B) | 'posterior_a_entrega'
   *  (Vía A, desde el tablero de NR). */
  origen: PoOrigen;
  moneda: string;
  subtotal_declarado: number | null;
  total_declarado: number | null;
  fecha_po: string | null;
  canal_entrega: string | null;
  evidencia_path: string | null;
  razon_social_declarada: string | null;
  rfc_declarado: string | null;
  estado: PoEstado;
  surtida_at: string | null;
  cancelada_at: string | null;
  cancelada_por: string | null;
  motivo_cancelacion: string | null;
  /** Vestigiales de la Vía A (033) — sin escritor desde 043. */
  motivo_rechazo: string | null;
  duplicada_de: string | null;
  created_at: string;
}

export interface PoPartidaRow {
  id: string;
  po_id: string;
  /** Poblados (043) cuando la partida nace de una línea de pedido de
   *  Vía B — null en las partidas relic de Vía A. */
  pedido_id: string | null;
  pedido_linea_id: string | null;
  linea_numero: number;
  codigo_cliente: string | null;
  descripcion: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  producto_id: string | null;
  unidad_medida_id: string | null;
  cantidad_entregada: number;
  codigo_divergente: boolean;
  /** tipo (047): 'respaldo' = ya entregada por una NR (Vía A, cantidad_entregada
   *  nace igual a cantidad); 'compromiso' = por entregar, se surte contra la PO. */
  tipo: PoPartidaTipo;
  /** Embed PostgREST `productos(codigo_interno, nombre)`. */
  productos?: ProductoResumen | null;
}

/** Fila de public.ventas_ordenes_compra_listado (045) — NO es
 *  OrdenCompraClienteRow: aplana el cliente/pedido/cotización y agrega las
 *  partidas. Mismo patrón que CotizacionListadoRow (038). */
export interface OrdenCompraListadoRow {
  id: string;
  folio: string;
  numero_po: string;
  entidad_id: string;
  entidad_clave: string | null;
  entidad_siglas: string | null;
  entidad_nombre_legal: string | null;
  entidad_nombre_comercial: string | null;
  pedido_id: string | null;
  pedido_folio: string | null;
  cotizacion_id: string | null;
  cotizacion_folio: string | null;
  moneda: string;
  subtotal_declarado: number | null;
  total_declarado: number | null;
  fecha_po: string | null;
  canal_entrega: string | null;
  evidencia_path: string | null;
  razon_social_declarada: string | null;
  rfc_declarado: string | null;
  estado: PoEstado;
  surtida_at: string | null;
  cancelada_at: string | null;
  cancelada_por: string | null;
  motivo_cancelacion: string | null;
  recibida_por: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  partidas_count: number;
  total: number;
  cantidad_total: number;
  cantidad_entregada_total: number;
  /** origen/respaldo/compromiso/nr_folios/diferencia_precio_total/
   *  autorizacion_pendiente_id (047) — columnas añadidas al final de la
   *  vista, create or replace view no permite reordenar. */
  origen: PoOrigen;
  respaldo_partidas: number;
  compromiso_partidas: number;
  /** Folios de NR que esta PO respalda (join vía vínculos activos), null si
   *  no tiene ninguna partida de respaldo. */
  nr_folios: string | null;
  /** Σ cantidad_cubierta·(precio_po - precio_nr) de sus vínculos activos —
   *  0 si no hay divergencia. Sólo informativo, la congelación real la
   *  decide el backend al crear/corregir la PO. */
  diferencia_precio_total: number;
  /** id de la autorización pendiente más reciente (precio_po_divergente/
   *  ampliacion_po) sobre esta PO, null si no hay ninguna. */
  autorizacion_pendiente_id: string | null;
}

/** Fila de public.ventas_nr_lineas_disponibles() (048) — requisito 3 hecho
 *  consulta: una línea de NR cubierta del todo (disponible <= 0) no
 *  aparece. Alimenta el paso 2 del asistente "Registrar PO" (Vía A). */
export interface NrLineaDisponibleRow {
  nr_id: string;
  nr_folio: string;
  nr_linea_id: string;
  producto_id: string;
  producto_codigo: string;
  producto_nombre: string;
  unidad_medida_id: string;
  cantidad_entregada: number;
  cantidad_asociada: number;
  disponible: number;
  precio_unitario: number;
}

/** Campo de fecha que puede elegir el selector de rango del listado de PO —
 *  mismo patrón que CotizacionFechaCampo (038). */
export const PO_FECHA_CAMPOS = ['creacion', 'fecha_po', 'surtido'] as const;
export type PoFechaCampo = (typeof PO_FECHA_CAMPOS)[number];

export const PO_ORDENES = ['reciente', 'antigua', 'monto_desc', 'monto_asc', 'fecha_po'] as const;
export type PoOrden = (typeof PO_ORDENES)[number];

/** Una columna del tablero de PO — count real de la columna (no
 *  data.length, acotado por el tope de tarjetas). */
export interface PoTableroColumna {
  estado: PoEstado;
  count: number;
  data: OrdenCompraListadoRow[];
}

export interface PoNrVinculoRow {
  id: string;
  po_partida_id: string;
  nr_linea_id: string;
  cantidad_cubierta: number;
  monto_cubierto: number;
  estado: VinculoEstado;
  autorizacion_id: string | null;
  motivo: string | null;
  // Cancelación (ventas_vinculo_cancelar(), 036) — nunca se borra la fila.
  cancelado_at: string | null;
  cancelado_por: string | null;
  motivo_cancelacion: string | null;
}

export interface VentasAutorizacionRow {
  id: string;
  tipo: VentasAutorizacionTipo;
  documento_tipo: string;
  documento_id: string;
  motivo: string;
  evidencia_path: string | null;
  solicitante_id: string;
  autorizador_id: string | null;
  autorizado_at: string | null;
  comentario_resolucion: string | null;
  estado: VentasAutorizacionEstado;
}

export interface ClienteCongelamientoRow {
  id: string;
  entidad_id: string;
  motivo: string;
  saldo_origen: number | null;
  autorizado_por: string;
  evidencia_path: string | null;
  estado: 'activo' | 'liberado';
  congelado_at: string;
  liberado_at: string | null;
  liberado_por: string | null;
  motivo_liberacion: string | null;
}

export interface ClienteExcepcionRow {
  id: string;
  entidad_id: string;
  congelamiento_id: string | null;
  monto_maximo: number;
  vigente_desde: string;
  vigente_hasta: string;
  evidencia_path: string;
  motivo: string;
  solicitante_id: string;
  autorizador_id: string | null;
  autorizado_at: string | null;
  comentario_resolucion: string | null;
  estado: 'pendiente' | 'autorizada' | 'rechazada' | 'cancelada';
}

export interface ClientePuedeOperar {
  puede: boolean;
  estado: ClienteCarteraEstado;
  motivo: string | null;
  congelamiento_id: string | null;
  monto_maximo: number | null;
}

export interface CostoVentaDetalle {
  producto_id: string;
  costo_base: number | null;
  familia_id: string;
  margen_porcentaje: number | null;
  familia_sin_margen: boolean;
  es_manual: boolean;
  precio_manual: number | null;
  definido_por: string | null;
  definido_at: string | null;
  calculado: number | null;
  costo_venta: number | null;
  calculable: boolean;
}
