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

export const DEVOLUCION_ESTADOS = ['pendiente', 'resuelta'] as const;
export type DevolucionEstado = (typeof DEVOLUCION_ESTADOS)[number];

export const APARTADO_NIVELES = ['reserva', 'compromiso'] as const;
export type ApartadoNivel = (typeof APARTADO_NIVELES)[number];

export const NR_ESTADOS = [
  'abierta', 'en_preparacion', 'parcialmente_entregada', 'entregada_sin_po',
  'parcialmente_respaldada', 'po_vinculada', 'facturada', 'pagada_cerrada', 'cancelada', 'con_incidencia',
] as const;
export type NrEstado = (typeof NR_ESTADOS)[number];

export const PO_ESTADOS = [
  'recibida', 'en_validacion', 'parcialmente_vinculada', 'vinculada',
  'pendiente_de_confirmacion', 'rechazada', 'corregida', 'cancelada',
] as const;
export type PoEstado = (typeof PO_ESTADOS)[number];

export const VINCULO_ESTADOS = [
  'pendiente', 'validado', 'rechazado_por_precio', 'rechazado_por_cantidad',
  'rechazado_por_duplicidad', 'aprobado_para_facturacion', 'facturado', 'cancelado',
] as const;
export type VinculoEstado = (typeof VINCULO_ESTADOS)[number];

export const VENTAS_AUTORIZACION_TIPOS = [
  'excepcion_subtotal', 'codigo_divergente', 'duplicidad_confirmada', 'correccion_documento',
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

export interface OrdenCompraClienteRow {
  id: string;
  folio: string;
  numero_po: string;
  entidad_id: string;
  pedido_id: string | null;
  moneda: string;
  subtotal_declarado: number | null;
  total_declarado: number | null;
  fecha_po: string | null;
  canal_entrega: string | null;
  evidencia_path: string | null;
  razon_social_declarada: string | null;
  rfc_declarado: string | null;
  estado: PoEstado;
  motivo_rechazo: string | null;
  duplicada_de: string | null;
  created_at: string;
}

export interface PoPartidaRow {
  id: string;
  po_id: string;
  linea_numero: number;
  codigo_cliente: string | null;
  descripcion: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  producto_id: string | null;
  codigo_divergente: boolean;
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
