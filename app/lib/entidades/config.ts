import type {
  CanalOrigen,
  CondicionPago,
  ContactoTipo,
  CuentaBancariaEstado,
  DireccionTipo,
  EntidadEstado,
  EntidadTipo,
  PersonaTipo,
  SolicitudEstado,
  UbicacionClasificacion,
  UbicacionTipo,
  UbicacionUsoEspecial,
} from '@/types/entidades';

/** P05 §II: "Límite de crédito > $100,000 → ventas inicia, direccion aprueba".
 *  El mockup del paquete decía $50,000; se usa P05 por ser el documento
 *  normativo (ver contexto/AUDITORIA_RTB-ENT-01.md, hallazgo 13). */
export const UMBRAL_APROBACION_CREDITO = 100_000;

/** Espejo de CambioControlado (lib/entidades/permisos.ts) — para la
 *  pantalla de solicitudes de cambio (gap de UI,
 *  contexto/AUDITORIA_QA_ROLES_2026-08-06.md §4). */
export const CAMBIO_CONTROLADO_LABELS: Record<string, string> = {
  rfc: 'RFC',
  razon_social: 'Razón social',
  limite_credito: 'Límite de crédito',
  condicion_proveedor: 'Condición de proveedor',
  reactivacion: 'Reactivación',
  bloqueo_temporal: 'Bloqueo temporal',
  bloqueo_permanente: 'Bloqueo permanente',
};

export const ENTIDAD_ESTADO_LABELS: Record<EntidadEstado, string> = {
  borrador: 'Borrador',
  activo: 'Activo',
  bloqueado_temporal: 'Bloqueado (temporal)',
  bloqueado_permanente: 'Bloqueado (permanente)',
  inactivo: 'Inactivo',
};

/** Tono semántico que los componentes de UI traducen a los tokens de
 *  app/app/globals.css (--estado-activo/--estado-bloqueado/--estado-pendiente/
 *  --estado-inactivo) — nunca a un hex directo (STYLE_GUIDE.md: "never
 *  hardcode color values"). "Pendiente" no es un EntidadEstado real (ver
 *  types/entidades.ts): la UI lo deriva de una solicitudes_cambio abierta. */
export const ENTIDAD_ESTADO_TONO: Record<EntidadEstado, 'activo' | 'bloqueado' | 'pendiente' | 'inactivo'> = {
  borrador: 'pendiente',
  activo: 'activo',
  bloqueado_temporal: 'bloqueado',
  bloqueado_permanente: 'bloqueado',
  inactivo: 'inactivo',
};

export const ENTIDAD_TIPO_LABELS: Record<EntidadTipo, string> = {
  cliente: 'Cliente',
  proveedor: 'Proveedor',
  mixta: 'Mixta',
};

export const PERSONA_TIPO_LABELS: Record<PersonaTipo, string> = {
  fisica: 'Persona física',
  moral: 'Persona moral',
};

export const CONTACTO_TIPO_LABELS: Record<ContactoTipo, string> = {
  principal: 'Principal',
  facturacion: 'Facturación',
  compras: 'Compras',
  ventas: 'Ventas',
  tesoreria: 'Tesorería',
  operativo: 'Operativo',
};

export const DIRECCION_TIPO_LABELS: Record<DireccionTipo, string> = {
  fiscal: 'Fiscal',
  envio: 'Envío',
  cobro: 'Cobro',
  bodega: 'Bodega',
  sucursal: 'Sucursal',
  oficina: 'Oficina',
};

export const CONDICION_PAGO_LABELS: Record<CondicionPago, string> = {
  credito_abierto: 'Crédito abierto',
  contado: 'Contado',
  anticipo_requerido: 'Anticipo requerido',
};

export const CANAL_ORIGEN_LABELS: Record<CanalOrigen, string> = {
  ariba: 'Ariba',
  correo: 'Correo',
  whatsapp: 'WhatsApp',
  telefono: 'Teléfono',
  mostrador: 'Mostrador',
  otro: 'Otro',
};

export const SOLICITUD_ESTADO_LABELS: Record<SolicitudEstado, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
};

export const UBICACION_TIPO_LABELS: Record<UbicacionTipo, string> = {
  centro_operativo: 'Centro operativo',
  zona: 'Zona',
  pasillo: 'Pasillo',
  rack: 'Rack',
  posicion: 'Posición',
};

export const UBICACION_CLASIFICACION_LABELS: Record<UbicacionClasificacion, string> = {
  fisica: 'Física',
  logica: 'Lógica',
  especial: 'Especial',
};

export const UBICACION_USO_ESPECIAL_LABELS: Record<UbicacionUsoEspecial, string> = {
  cuarentena: 'Cuarentena',
  devoluciones: 'Devoluciones',
  material_danado: 'Material dañado',
  recepcion: 'Recepción',
  embarque: 'Embarque',
  picking: 'Picking',
};

export const CUENTA_BANCARIA_ESTADO_LABELS: Record<CuentaBancariaEstado, string> = {
  pendiente_aprobacion: 'Pendiente de aprobación',
  activa: 'Activa',
  pendiente_reemplazo: 'Pendiente de reemplazo',
  inactiva: 'Inactiva',
  rechazada: 'Rechazada',
};

/** RFC genéricos que el SAT permite repetir (público en general /
 *  residente en el extranjero) — espejo del índice único parcial de
 *  db/migrations/002_entidades_core.sql, para que la UI no los marque
 *  como duplicado antes de tiempo. */
export const RFC_GENERICOS = ['XAXX010101000', 'XEXX010101000'] as const;
