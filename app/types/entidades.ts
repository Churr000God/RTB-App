// Espejo TypeScript de los enums y tablas de RTB-ENT-01
// (db/migrations/002_entidades_core.sql, 003_ubicaciones_internas.sql,
// 004_cuentas_bancarias.sql). Mismo patrón que app/types/database.ts:
// tuplas `as const` que alimentan z.enum(...) sin duplicar literales.

export const ENTIDAD_TIPOS = ['cliente', 'proveedor', 'mixta'] as const;
export type EntidadTipo = (typeof ENTIDAD_TIPOS)[number];

export const ENTIDAD_ESTADOS = [
  'borrador',
  'activo',
  'bloqueado_temporal',
  'bloqueado_permanente',
  'inactivo',
] as const;
export type EntidadEstado = (typeof ENTIDAD_ESTADOS)[number];

export const PERSONA_TIPOS = ['fisica', 'moral'] as const;
export type PersonaTipo = (typeof PERSONA_TIPOS)[number];

export const CONTACTO_TIPOS = [
  'principal',
  'facturacion',
  'compras',
  'ventas',
  'tesoreria',
  'operativo',
] as const;
export type ContactoTipo = (typeof CONTACTO_TIPOS)[number];

export const DIRECCION_TIPOS = ['fiscal', 'envio', 'cobro', 'bodega', 'sucursal', 'oficina'] as const;
export type DireccionTipo = (typeof DIRECCION_TIPOS)[number];

export const CONDICION_PAGOS = ['credito_abierto', 'contado', 'anticipo_requerido'] as const;
export type CondicionPago = (typeof CONDICION_PAGOS)[number];

export const CANAL_ORIGENES = ['ariba', 'correo', 'whatsapp', 'telefono', 'mostrador', 'otro'] as const;
export type CanalOrigen = (typeof CANAL_ORIGENES)[number];

export const SOLICITUD_ESTADOS = ['pendiente', 'aprobada', 'rechazada', 'cancelada'] as const;
export type SolicitudEstado = (typeof SOLICITUD_ESTADOS)[number];

export const UBICACION_TIPOS = ['centro_operativo', 'zona', 'pasillo', 'rack', 'posicion'] as const;
export type UbicacionTipo = (typeof UBICACION_TIPOS)[number];

export const UBICACION_CLASIFICACIONES = ['fisica', 'logica', 'especial'] as const;
export type UbicacionClasificacion = (typeof UBICACION_CLASIFICACIONES)[number];

export const UBICACION_USOS_ESPECIALES = [
  'cuarentena',
  'devoluciones',
  'material_danado',
  'recepcion',
  'embarque',
  'picking',
] as const;
export type UbicacionUsoEspecial = (typeof UBICACION_USOS_ESPECIALES)[number];

export const CUENTA_BANCARIA_ESTADOS = [
  'pendiente_aprobacion',
  'activa',
  'pendiente_reemplazo',
  'inactiva',
  'rechazada',
] as const;
export type CuentaBancariaEstado = (typeof CUENTA_BANCARIA_ESTADOS)[number];

// ---------- Filas de tabla ----------

export interface Entidad {
  id: string;
  clave: string;
  nombre_legal: string;
  nombre_comercial: string | null;
  tipo: EntidadTipo;
  persona_tipo: PersonaTipo;
  rfc: string | null;
  curp: string | null;
  regimen_fiscal: string | null;
  correo_principal: string | null;
  telefono_principal: string | null;
  sitio_web: string | null;
  observaciones: string | null;
  estado: EntidadEstado;
  bloqueo_motivo: string | null;
  bloqueado_at: string | null;
  bloqueado_por: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Cliente {
  id: string;
  entidad_id: string;
  limite_credito: number;
  dias_credito: number;
  dias_gracia: number;
  lista_precio: string | null;
  descuento_maximo: number;
  vendedor_id: string | null;
  canal_origen: CanalOrigen | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Proveedor {
  id: string;
  entidad_id: string;
  categoria: string | null;
  plazo_pago: number;
  credito_autorizado: number;
  moneda_default: string;
  condicion_pago: CondicionPago;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contacto {
  id: string;
  entidad_id: string;
  nombre: string;
  cargo: string | null;
  tipo: ContactoTipo;
  correo: string | null;
  telefono: string | null;
  extension: string | null;
  es_principal: boolean;
  activo: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Direccion {
  id: string;
  entidad_id: string;
  tipo: DireccionTipo;
  calle: string;
  numero_exterior: string | null;
  numero_interior: string | null;
  colonia: string | null;
  ciudad: string;
  entidad_federativa: string;
  pais: string;
  codigo_postal: string;
  referencia: string | null;
  latitud: number | null;
  longitud: number | null;
  es_principal: boolean;
  activo: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UbicacionInterna {
  id: string;
  parent_id: string | null;
  nivel: number;
  segmento: string;
  codigo: string;
  tipo: UbicacionTipo;
  clasificacion: UbicacionClasificacion;
  uso_especial: UbicacionUsoEspecial | null;
  nombre: string;
  descripcion: string | null;
  capacidad_posiciones: number | null;
  responsable_id: string | null;
  activo: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProveedorCuentaBancaria {
  id: string;
  proveedor_id: string;
  banco: string;
  clabe: string;
  cuenta: string | null;
  titular: string;
  rfc_beneficiario: string;
  moneda: string;
  comprobante_path: string;
  estado: CuentaBancariaEstado;
  motivo_cambio: string | null;
  motivo_rechazo: string | null;
  aprobada_por: string | null;
  aprobada_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Fila de public.proveedor_cuentas_resumen() — CLABE enmascarada, sin campos sensibles. */
export interface ProveedorCuentaResumen {
  id: string;
  proveedor_id: string;
  banco: string;
  clabe_enmascarada: string;
  titular: string;
  estado: CuentaBancariaEstado;
  created_at: string;
}

export interface SolicitudCambio {
  id: string;
  tabla: string;
  registro_id: string;
  cambios: Record<string, unknown>;
  motivo: string;
  solicitante_id: string;
  estado: SolicitudEstado;
  aprobador_id: string | null;
  comentario_resolucion: string | null;
  resuelto_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  tabla: string;
  registro_id: string;
  accion: string;
  campo: string | null;
  datos_anteriores: Record<string, unknown> | null;
  datos_nuevos: Record<string, unknown> | null;
  motivo: string | null;
  usuario_id: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

/** Fila de public.usuarios_directorio() — para rotular "creado por"/"aprobó". */
export interface UsuarioDirectorio {
  id: string;
  full_name: string;
  role: string;
}
