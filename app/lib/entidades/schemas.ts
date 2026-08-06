import { z } from 'zod';
import {
  CANAL_ORIGENES,
  CONDICION_PAGOS,
  CONTACTO_TIPOS,
  DIRECCION_TIPOS,
  ENTIDAD_TIPOS,
  PERSONA_TIPOS,
  UBICACION_CLASIFICACIONES,
  UBICACION_TIPOS,
  UBICACION_USOS_ESPECIALES,
} from '@/types/entidades';
import { clabeValida, cpValido, rfcValido } from './validaciones';

// Esquemas zod compartidos por las rutas de app/app/api/entidades,
// api/proveedores, api/ubicaciones y api/solicitudes-cambio. Mismo patrón
// que app/app/api/admin/users/route.ts: safeParse en la ruta, primer
// mensaje de error al cliente en español.

export const rfcSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(rfcValido, 'RFC inválido');

// Espejo del CHECK entidades_siglas_chk (020_entidades_siglas.sql). Sin
// espacio interno: unas siglas con espacio no sirven como identificador
// corto; & . - se permiten porque las razones sociales mexicanas los usan
// (AT&T, S.A. DE C.V.).
export const siglasSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9&.-]{2,12}$/, 'De 2 a 12 caracteres, sin espacios');

export const correoSchema = z.string().trim().toLowerCase().email('Correo electrónico inválido');
const codigoPostalSchema = z.string().trim().refine(cpValido, 'Código postal inválido (5 dígitos)');

// ---------- Entidades ----------

export const entidadDatosSchema = z.object({
  nombre_legal: z.string().trim().min(3, 'La razón social es obligatoria').max(200),
  nombre_comercial: z.string().trim().max(200).optional().nullable(),
  tipo: z.enum(ENTIDAD_TIPOS, { errorMap: () => ({ message: 'Tipo de entidad inválido' }) }),
  persona_tipo: z.enum(PERSONA_TIPOS, { errorMap: () => ({ message: 'Tipo de persona inválido' }) }),
  rfc: rfcSchema.optional().nullable(),
  curp: z.string().trim().toUpperCase().length(18, 'CURP inválida').optional().nullable(),
  regimen_fiscal: z.string().trim().max(100).optional().nullable(),
  correo_principal: correoSchema.optional().nullable(),
  telefono_principal: z.string().trim().max(30).optional().nullable(),
  sitio_web: z.string().trim().max(200).optional().nullable(),
  observaciones: z.string().trim().max(4000).optional().nullable(),
  siglas: siglasSchema.optional().nullable(),
});

/** Campos de entidades que se pueden editar sin pasar por
 *  solicitudes_cambio (P05: "modificación libre") — espejo del GRANT
 *  UPDATE por columna de 020_entidades_siglas.sql (que reafirma la lista
 *  completa de 002_entidades_core.sql + siglas). nombre_legal y rfc NO
 *  están aquí: son "modificación controlada". */
export const entidadUpdateLibreSchema = z.object({
  nombre_comercial: z.string().trim().max(200).optional().nullable(),
  correo_principal: correoSchema.optional().nullable(),
  telefono_principal: z.string().trim().max(30).optional().nullable(),
  sitio_web: z.string().trim().max(200).optional().nullable(),
  observaciones: z.string().trim().max(4000).optional().nullable(),
  siglas: siglasSchema.optional().nullable(),
});

export const clienteDatosSchema = z.object({
  limite_credito: z.coerce.number().min(0).default(0),
  dias_credito: z.coerce.number().int().min(0).default(0),
  dias_gracia: z.coerce.number().int().min(0).default(0),
  lista_precio: z.string().trim().max(50).optional().nullable(),
  descuento_maximo: z.coerce.number().min(0).max(100).default(0),
  vendedor_id: z.string().uuid().optional().nullable(),
  canal_origen: z.enum(CANAL_ORIGENES).optional().nullable(),
});

export const proveedorDatosSchema = z.object({
  categoria: z.string().trim().max(100).optional().nullable(),
  plazo_pago: z.coerce.number().int().min(0).default(0),
  credito_autorizado: z.coerce.number().min(0).default(0),
  moneda_default: z.string().trim().toUpperCase().length(3).default('MXN'),
  condicion_pago: z.enum(CONDICION_PAGOS).default('contado'),
});

export const contactoSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(200),
  cargo: z.string().trim().max(100).optional().nullable(),
  tipo: z.enum(CONTACTO_TIPOS).default('operativo'),
  correo: correoSchema.optional().nullable(),
  telefono: z.string().trim().max(30).optional().nullable(),
  extension: z.string().trim().max(10).optional().nullable(),
  es_principal: z.boolean().default(false),
});

export const direccionSchema = z.object({
  tipo: z.enum(DIRECCION_TIPOS),
  calle: z.string().trim().min(2, 'La calle es obligatoria').max(200),
  numero_exterior: z.string().trim().max(20).optional().nullable(),
  numero_interior: z.string().trim().max(20).optional().nullable(),
  colonia: z.string().trim().max(120).optional().nullable(),
  ciudad: z.string().trim().min(2, 'La ciudad es obligatoria').max(120),
  entidad_federativa: z.string().trim().min(2, 'El estado es obligatorio').max(120),
  pais: z.string().trim().max(120).default('México'),
  codigo_postal: codigoPostalSchema,
  referencia: z.string().trim().max(1000).optional().nullable(),
  latitud: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitud: z.coerce.number().min(-180).max(180).optional().nullable(),
  es_principal: z.boolean().default(false),
});

/** Alta compuesta: entidad + su extensión de rol + contacto/dirección
 *  principales opcionales, en un solo POST — así están armadas las
 *  pantallas del mockup (alta-cliente.html trae las 4 secciones juntas). */
export const entidadCreateSchema = entidadDatosSchema
  .extend({
    cliente: clienteDatosSchema.optional(),
    proveedor: proveedorDatosSchema.optional(),
    contacto_principal: contactoSchema.omit({ es_principal: true }).optional(),
    direccion_fiscal: direccionSchema.omit({ tipo: true, es_principal: true }).optional(),
  })
  .refine((v) => v.tipo !== 'cliente' || v.cliente, {
    message: 'Faltan los datos comerciales de cliente',
    path: ['cliente'],
  })
  .refine((v) => v.tipo !== 'proveedor' || v.proveedor, {
    message: 'Faltan los datos comerciales de proveedor',
    path: ['proveedor'],
  })
  .refine((v) => v.tipo !== 'mixta' || (v.cliente && v.proveedor), {
    message: 'Una entidad mixta necesita datos de cliente y de proveedor',
    path: ['tipo'],
  });

// ---------- Ubicaciones internas ----------

export const ubicacionCreateSchema = z.object({
  parent_id: z.string().uuid().optional().nullable(),
  segmento: z.string().trim().min(1, 'El segmento es obligatorio').max(30),
  tipo: z.enum(UBICACION_TIPOS, { errorMap: () => ({ message: 'Tipo de ubicación inválido' }) }),
  clasificacion: z.enum(UBICACION_CLASIFICACIONES).default('fisica'),
  uso_especial: z.enum(UBICACION_USOS_ESPECIALES).optional().nullable(),
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(120),
  descripcion: z.string().trim().max(2000).optional().nullable(),
  capacidad_posiciones: z.coerce.number().int().positive().optional().nullable(),
  responsable_id: z.string().uuid().optional().nullable(),
});

export const ubicacionUpdateSchema = z
  .object({
    nombre: z.string().trim().min(2).max(120).optional(),
    descripcion: z.string().trim().max(2000).optional().nullable(),
    responsable_id: z.string().uuid().optional().nullable(),
    capacidad_posiciones: z.coerce.number().int().positive().optional().nullable(),
    clasificacion: z.enum(UBICACION_CLASIFICACIONES).optional(),
    uso_especial: z.enum(UBICACION_USOS_ESPECIALES).optional().nullable(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

// ---------- Cuentas bancarias de proveedor ----------

export const cuentaBancariaCreateSchema = z.object({
  proveedor_id: z.string().uuid(),
  banco: z.string().trim().min(2, 'El banco es obligatorio').max(120),
  clabe: z.string().trim().refine(clabeValida, 'CLABE inválida (dígito verificador incorrecto)'),
  cuenta: z.string().trim().max(20).optional().nullable(),
  titular: z.string().trim().min(3, 'El beneficiario es obligatorio').max(200),
  rfc_beneficiario: rfcSchema,
  moneda: z.string().trim().toUpperCase().length(3).default('MXN'),
  comprobante_path: z.string().trim().min(1, 'El comprobante es obligatorio'),
  motivo_cambio: z.string().trim().max(2000).optional().nullable(),
});

export const cuentaBancariaResolverSchema = z
  .object({
    decision: z.enum(['aprobar', 'rechazar']),
    motivo_rechazo: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.decision !== 'rechazar' || (v.motivo_rechazo && v.motivo_rechazo.length > 0), {
    message: 'El motivo de rechazo es obligatorio',
    path: ['motivo_rechazo'],
  });

// ---------- Solicitudes de cambio (P05: "modificación controlada") ----------

export const SOLICITUD_TABLAS = ['entidades', 'clientes', 'proveedores'] as const;
// Espejo de public.cambio_controlado (005_solicitudes_tipo_cambio.sql).
// 'bloqueo_temporal' normalmente se solicita vía POST
// /api/entidades/[id]/bloquear (que arma el payload por su cuenta), no
// creando una solicitud a mano con este schema — pero comparte la misma
// cola y el mismo aprobador, así que vive en el mismo enum.
export const CAMBIOS_CONTROLADOS = [
  'rfc',
  'razon_social',
  'limite_credito',
  'condicion_proveedor',
  'reactivacion',
  'bloqueo_temporal',
] as const;

export const solicitudCambioCreateSchema = z.object({
  tabla: z.enum(SOLICITUD_TABLAS),
  registro_id: z.string().uuid(),
  tipo_cambio: z.enum(CAMBIOS_CONTROLADOS),
  cambios: z.record(z.string(), z.unknown()).refine((v) => Object.keys(v).length > 0, 'Sin cambios que solicitar'),
  motivo: z.string().trim().min(5, 'El motivo es obligatorio').max(2000),
});

export const solicitudCambioResolverSchema = z
  .object({
    decision: z.enum(['aprobar', 'rechazar']),
    comentario_resolucion: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.decision !== 'rechazar' || (v.comentario_resolucion && v.comentario_resolucion.length > 0), {
    message: 'El comentario es obligatorio al rechazar',
    path: ['comentario_resolucion'],
  });

// ---------- Bloqueo / desbloqueo de entidad (P05 §IV) ----------

export const bloqueoEntidadSchema = z.object({
  tipo: z.enum(['temporal', 'permanente']),
  motivo: z.string().trim().min(5, 'El motivo de bloqueo es obligatorio').max(2000),
});
