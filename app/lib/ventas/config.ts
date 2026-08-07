// Constantes y etiquetas de RTB-VEN-01. Sin lógica — mismo patrón que
// app/lib/entidades/config.ts y app/lib/inventario/config.ts. Cada
// constante es un espejo declarado de algo que vive en SQL; si diverge,
// manda SQL (db/migrations/028…034).
import {
  CONSULTA_ESTADOS,
  type ClienteCarteraEstado,
  type ClienteTipo,
  type ConsultaEstado,
  type ConsultaUrgencia,
  type DatoFaltante,
  type NrEstado,
  type PedidoEstado,
  type PoEstado,
  type PrecioOrigenVenta,
  type VentasAutorizacionEstado,
  type VentasAutorizacionTipo,
  type VentasCotizacionEstado,
  type VinculoEstado,
} from '@/types/ventas';

export type Tono = 'activo' | 'bloqueado' | 'pendiente' | 'inactivo';

export const VENTAS_COTIZACION_ESTADO_LABELS: Record<VentasCotizacionEstado, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  expirada: 'Expirada',
  cancelada: 'Cancelada',
};

export const VENTAS_COTIZACION_ESTADO_TONO: Record<VentasCotizacionEstado, Tono> = {
  borrador: 'pendiente',
  enviada: 'pendiente',
  aprobada: 'activo',
  rechazada: 'bloqueado',
  expirada: 'inactivo',
  cancelada: 'inactivo',
};

export const PRECIO_ORIGEN_LABELS: Record<PrecioOrigenVenta, string> = {
  refaccion: 'Costo Refacción',
  ariba: 'Costo Ariba',
  costo_venta: 'Costo de Venta',
};

export const CONSULTA_ESTADO_LABELS: Record<ConsultaEstado, string> = {
  abierta: 'Abierta',
  en_proceso: 'En proceso',
  respondida: 'Respondida',
  sin_disponibilidad: 'Sin disponibilidad',
  cancelada: 'Cancelada',
};

export const CONSULTA_ESTADO_TONO: Record<ConsultaEstado, Tono> = {
  abierta: 'pendiente',
  en_proceso: 'pendiente',
  respondida: 'activo',
  sin_disponibilidad: 'bloqueado',
  cancelada: 'inactivo',
};

// Partición de la bandeja de Compras-ligero (consultas-bandeja.tsx) en
// pestañas Abiertas/Resueltas. Única definición — antes vivía como
// predicado duplicado en el cliente (`c.estado === 'abierta' || ...`);
// ahora también la usa GET /api/ventas/consultas para paginar cada
// pestaña por separado sin perder el contador "Abiertas (N)".
export const CONSULTA_ESTADOS_ABIERTOS = ['abierta', 'en_proceso'] as const;
export const CONSULTA_ESTADOS_RESUELTOS = CONSULTA_ESTADOS.filter(
  (e) => !(CONSULTA_ESTADOS_ABIERTOS as readonly string[]).includes(e)
);

export const CONSULTA_URGENCIA_LABELS: Record<ConsultaUrgencia, string> = {
  normal: 'Normal',
  alta: 'Alta',
  critica: 'Crítica',
};

export const PEDIDO_ESTADO_LABELS: Record<PedidoEstado, string> = {
  aprobado: 'Aprobado',
  liberado: 'Liberado a Almacén',
  en_preparacion: 'En preparación',
  entregado_parcial: 'Entregado parcial',
  entregado: 'Entregado',
  cerrado: 'Cerrado',
  cancelado: 'Cancelado',
};

export const PEDIDO_ESTADO_TONO: Record<PedidoEstado, Tono> = {
  aprobado: 'pendiente',
  liberado: 'pendiente',
  en_preparacion: 'pendiente',
  entregado_parcial: 'pendiente',
  entregado: 'activo',
  cerrado: 'inactivo',
  cancelado: 'inactivo',
};

// "Estado de máxima vigilancia" (RTB-PRO-VEN-01 §III): entregada_sin_po es
// el foco del tablero de seguimiento — hay valor entregado sin factura.
export const NR_ESTADO_LABELS: Record<NrEstado, string> = {
  abierta: 'Abierta',
  en_preparacion: 'En preparación',
  parcialmente_entregada: 'Parcialmente entregada',
  entregada_sin_po: 'Entregada / sin PO',
  parcialmente_respaldada: 'Parcialmente respaldada',
  po_vinculada: 'PO vinculada',
  facturada: 'Facturada',
  pagada_cerrada: 'Pagada / cerrada',
  cancelada: 'Cancelada',
  con_incidencia: 'Con incidencia',
};

export const NR_ESTADO_TONO: Record<NrEstado, Tono> = {
  abierta: 'pendiente',
  en_preparacion: 'pendiente',
  parcialmente_entregada: 'pendiente',
  entregada_sin_po: 'bloqueado',
  parcialmente_respaldada: 'pendiente',
  po_vinculada: 'activo',
  facturada: 'activo',
  pagada_cerrada: 'inactivo',
  cancelada: 'inactivo',
  con_incidencia: 'bloqueado',
};

export const PO_ESTADO_LABELS: Record<PoEstado, string> = {
  recibida: 'Recibida',
  en_validacion: 'En validación',
  parcialmente_vinculada: 'Parcialmente vinculada',
  vinculada: 'Vinculada',
  pendiente_de_confirmacion: 'Pendiente de confirmación',
  rechazada: 'Rechazada',
  corregida: 'Corregida',
  cancelada: 'Cancelada',
};

export const PO_ESTADO_TONO: Record<PoEstado, Tono> = {
  recibida: 'pendiente',
  en_validacion: 'pendiente',
  parcialmente_vinculada: 'pendiente',
  vinculada: 'activo',
  pendiente_de_confirmacion: 'bloqueado',
  rechazada: 'bloqueado',
  corregida: 'pendiente',
  cancelada: 'inactivo',
};

export const VINCULO_ESTADO_LABELS: Record<VinculoEstado, string> = {
  pendiente: 'Pendiente',
  validado: 'Validado',
  rechazado_por_precio: 'Rechazado por precio',
  rechazado_por_cantidad: 'Rechazado por cantidad',
  rechazado_por_duplicidad: 'Rechazado por duplicidad',
  aprobado_para_facturacion: 'Aprobado para facturación',
  facturado: 'Facturado',
  cancelado: 'Cancelado',
};

export const VENTAS_AUTORIZACION_TIPO_LABELS: Record<VentasAutorizacionTipo, string> = {
  excepcion_subtotal: 'Excepción por subtotal coincidente',
  codigo_divergente: 'Código de producto divergente',
  duplicidad_confirmada: 'Duplicidad confirmada',
  correccion_documento: 'Corrección de documento',
};

export const VENTAS_AUTORIZACION_ESTADO_LABELS: Record<VentasAutorizacionEstado, string> = {
  pendiente: 'Pendiente',
  autorizada: 'Autorizada',
  rechazada: 'Rechazada',
};

export const CLIENTE_TIPO_LABELS: Record<ClienteTipo, string> = {
  credito: 'Crédito',
  contado: 'Contado',
  pago_anticipado: 'Pago anticipado',
  facturacion_inmediata: 'Facturación inmediata',
};

// Estados conceptuales de cliente_puede_operar() (029) — NO es
// entidades.estado (eso sigue siendo sólo el bloqueo administrativo).
export const CLIENTE_CARTERA_ESTADO_LABELS: Record<ClienteCarteraEstado, string> = {
  normal: 'Normal',
  descongelada: 'Descongelada recientemente',
  excepcion_autorizada: 'Excepción autorizada',
  en_revision: 'En revisión',
  congelada: 'Congelada',
  bloqueada: 'Bloqueada (administrativo)',
};

export const CLIENTE_CARTERA_ESTADO_TONO: Record<ClienteCarteraEstado, Tono> = {
  normal: 'activo',
  descongelada: 'activo',
  excepcion_autorizada: 'pendiente',
  en_revision: 'pendiente',
  congelada: 'bloqueado',
  bloqueada: 'bloqueado',
};

export const DATOS_FALTANTES_LABELS: Record<DatoFaltante, string> = {
  contacto_no_identificado: 'Contacto no identificado',
  monto_no_confirmado: 'Monto no confirmado',
  fecha_entrega_no_confirmada: 'Fecha de entrega no confirmada',
  condicion_pago_no_confirmada: 'Condición de pago no confirmada',
  po_pendiente: 'PO pendiente',
  datos_fiscales_pendientes: 'Datos fiscales pendientes',
};

/** Bucket privado de evidencia (029) — mismo criterio que
 *  soportes-inventario: documento con dato de un tercero, URL firmada. */
export const EVIDENCIA_VENTAS_BUCKET = 'evidencias-ventas';
export const EVIDENCIA_VENTAS_MIME_REGEX = /\.(pdf|jpe?g|png)$/i;
export const EVIDENCIA_VENTAS_BYTES_MAX = 10 * 1024 * 1024;

/** Espejo de VIGENCIA por defecto propuesta en la UI al crear una
 *  cotización — el vendedor puede cambiarla; ventas_cotizacion_enviar()
 *  (030) exige que exista, sin importar el valor. */
export const VIGENCIA_COTIZACION_DIAS_DEFAULT = 15;

/** Roles que pueden autorizar excepciones/correcciones de Ventas —
 *  espejo de ventas_autorizacion_resolver() (033) y
 *  cliente_excepciones (029, resolución vía API). */
export const ROLES_AUTORIZAN_VENTAS = ['super_admin', 'direccion'] as const;

/** Roles que pueden responder una consulta de Compras-ligero — espejo de
 *  ventas_consulta_responder() (030). */
export const ROLES_RESPONDEN_CONSULTA = ['super_admin', 'direccion', 'compras'] as const;

/** Roles que pueden despachar una NR (kardex) — espejo de
 *  ventas_nr_despachar() (032). */
export const ROLES_DESPACHAN_NR = ['super_admin', 'direccion', 'almacen', 'ventas'] as const;
