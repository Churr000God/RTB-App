import { z } from 'zod';
import { CANAL_ORIGENES } from '@/types/entidades';
import {
  CLIENTE_TIPOS,
  CONSULTA_URGENCIAS,
  DATOS_FALTANTES,
  PRECIO_ORIGEN_VENTAS,
} from '@/types/ventas';

// Esquemas zod compartidos por las rutas de app/app/api/ventas/*. Cada
// *CreateSchema/*UpdateSchema es traducción literal del GRANT INSERT/
// UPDATE por columna de su tabla (db/migrations/028…034) — si el GRANT
// cambia, este archivo tiene que cambiar con él. Convención del repo:
// safeParse en la ruta, parsed.error.issues[0]?.message al cliente.

const monedaSchema = z.string().trim().toUpperCase().length(3, 'Moneda inválida (3 letras, ej. MXN)');
const motivoSchema = z.string().trim().min(3, 'El motivo es obligatorio').max(2000);
const uuidSchema = z.string().uuid();

// ---------- Cotizaciones ----------

export const cotizacionCreateSchema = z.object({
  entidad_id: uuidSchema,
  vendedor_id: uuidSchema.optional().nullable(),
  canal_entrada: z.enum(CANAL_ORIGENES, { errorMap: () => ({ message: 'Canal de entrada inválido' }) }),
  medio_seguimiento: z.enum(CANAL_ORIGENES).optional().nullable(),
  moneda: monedaSchema.optional().default('MXN'),
  vigencia_hasta: z.string().trim().optional().nullable(),
  observaciones: z.string().trim().max(4000).optional().nullable(),
});

// Editable sólo mientras estado='borrador' (ventas_cotizacion_before_update, 030).
export const cotizacionUpdateSchema = z.object({
  entidad_id: uuidSchema.optional(),
  canal_entrada: z.enum(CANAL_ORIGENES).optional(),
  medio_seguimiento: z.enum(CANAL_ORIGENES).optional().nullable(),
  moneda: monedaSchema.optional(),
  vigencia_hasta: z.string().trim().optional().nullable(),
  observaciones: z.string().trim().max(4000).optional().nullable(),
});

export const cotizacionRechazarSchema = z.object({ motivo: motivoSchema });
export const cotizacionCancelarSchema = z.object({ motivo: motivoSchema });

export const cotizacionAprobarSchema = z.object({
  canal: z.enum(CANAL_ORIGENES, { errorMap: () => ({ message: 'Falta el canal de la evidencia de aprobación' }) }),
  evidencia_path: z.string().trim().max(500).optional().nullable(),
  referencia: z.string().trim().max(500).optional().nullable(),
  contacto_id: uuidSchema.optional().nullable(),
  datos_faltantes: z.array(z.enum(DATOS_FALTANTES)).optional().default([]),
});

// El corazón del snapshot: NO acepta precio_unitario/costo_base_snapshot/
// margen_snapshot — espejo exacto del GRANT INSERT de ventas_cotizacion_lineas.
export const cotizacionLineaCreateSchema = z
  .object({
    producto_id: uuidSchema.optional().nullable(),
    consulta_id: uuidSchema.optional().nullable(),
    descripcion_libre: z.string().trim().max(500).optional().nullable(),
    cantidad: z.coerce.number().positive('La cantidad debe ser mayor a cero'),
    unidad_medida_id: uuidSchema.optional().nullable(),
    precio_origen: z.enum(PRECIO_ORIGEN_VENTAS).optional().nullable(),
    descuento_porcentaje: z.coerce.number().min(0).max(100).optional().default(0),
    observaciones: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((v) => v.producto_id || (v.descripcion_libre && v.descripcion_libre.length > 0), {
    message: 'Describe lo que el cliente pidió si el producto todavía no existe en catálogo',
    path: ['descripcion_libre'],
  });

export const cotizacionLineaUpdateSchema = z.object({
  producto_id: uuidSchema.optional().nullable(),
  descripcion_libre: z.string().trim().max(500).optional().nullable(),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a cero').optional(),
  unidad_medida_id: uuidSchema.optional().nullable(),
  precio_origen: z.enum(PRECIO_ORIGEN_VENTAS).optional().nullable(),
  descuento_porcentaje: z.coerce.number().min(0).max(100).optional(),
  activo: z.boolean().optional(),
  observaciones: z.string().trim().max(2000).optional().nullable(),
});

// ---------- Consultas a Compras-ligero ----------

export const consultaCreateSchema = z.object({
  cotizacion_id: uuidSchema.optional().nullable(),
  entidad_id: uuidSchema.optional().nullable(),
  descripcion: z.string().trim().min(3, 'Describe lo que el cliente pidió').max(2000),
  marca_texto: z.string().trim().max(120).optional().nullable(),
  modelo_texto: z.string().trim().max(120).optional().nullable(),
  numero_parte: z.string().trim().max(120).optional().nullable(),
  cantidad: z.coerce.number().positive().optional().nullable(),
  unidad_texto: z.string().trim().max(60).optional().nullable(),
  urgencia: z.enum(CONSULTA_URGENCIAS).optional().default('normal'),
});

export const consultaResponderSchema = z.object({
  producto_id: uuidSchema,
  costo_unitario: z.coerce.number().nonnegative('El costo debe ser mayor o igual a cero'),
  moneda: monedaSchema.optional().default('MXN'),
  plazo_entrega_dias: z.coerce.number().int().nonnegative().optional().nullable(),
  disponibilidad: z.string().trim().max(500).optional().nullable(),
  proveedor_id: uuidSchema.optional().nullable(),
  notas_respuesta: z.string().trim().max(2000).optional().nullable(),
});

export const consultaCancelarSchema = z.object({ motivo: motivoSchema });

// ---------- Notas de Remisión ----------

export const nrDespacharSchema = z.object({
  lineas: z
    .array(
      z.object({
        nr_linea_id: uuidSchema,
        cantidad: z.coerce.number().positive('La cantidad a despachar debe ser mayor a cero'),
      })
    )
    .min(1, 'Indica al menos una línea a despachar'),
});

export const nrSeguimientoCreateSchema = z.object({
  canal: z.enum(CANAL_ORIGENES, { errorMap: () => ({ message: 'Canal inválido' }) }),
  nota: z.string().trim().min(3, 'La nota de seguimiento es obligatoria').max(2000),
});

// ---------- PO del cliente ----------

export const poCreateSchema = z.object({
  numero_po: z.string().trim().min(1, 'El número de PO es obligatorio').max(80),
  entidad_id: uuidSchema,
  pedido_id: uuidSchema.optional().nullable(),
  moneda: monedaSchema,
  subtotal_declarado: z.coerce.number().nonnegative().optional().nullable(),
  total_declarado: z.coerce.number().nonnegative().optional().nullable(),
  fecha_po: z.string().trim().optional().nullable(),
  canal_entrega: z.enum(CANAL_ORIGENES).optional().nullable(),
  evidencia_path: z.string().trim().max(500).optional().nullable(),
  razon_social_declarada: z.string().trim().max(255).optional().nullable(),
  rfc_declarado: z.string().trim().toUpperCase().max(13).optional().nullable(),
});

export const poPartidaCreateSchema = z.object({
  linea_numero: z.coerce.number().int().positive(),
  codigo_cliente: z.string().trim().max(80).optional().nullable(),
  descripcion: z.string().trim().max(2000).optional().nullable(),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a cero'),
  precio_unitario: z.coerce.number().nonnegative('El precio debe ser mayor o igual a cero'),
  producto_id: uuidSchema.optional().nullable(),
});

export const poValidarSchema = z.object({
  vinculos: z
    .array(
      z.object({
        po_partida_id: uuidSchema,
        nr_linea_id: uuidSchema,
        cantidad_cubierta: z.coerce.number().positive('La cantidad cubierta debe ser mayor a cero'),
      })
    )
    .min(1, 'Indica al menos un vínculo PO↔NR'),
  autorizacion_id: uuidSchema.optional().nullable(),
  aceptar_codigo_divergente: z.boolean().optional().default(false),
});

// ---------- Autorizaciones (excepciones/correcciones de Ventas) ----------

export const ventasAutorizacionCreateSchema = z.object({
  tipo: z.enum(['excepcion_subtotal', 'codigo_divergente', 'duplicidad_confirmada', 'correccion_documento']),
  documento_tipo: z.string().trim().min(1).max(40),
  documento_id: uuidSchema,
  motivo: motivoSchema,
  evidencia_path: z.string().trim().max(500).optional().nullable(),
  version_anterior: z.record(z.any()).optional().nullable(),
  cambios: z.record(z.any()).optional().nullable(),
});

export const ventasAutorizacionResolverSchema = z
  .object({
    decision: z.enum(['aprobar', 'rechazar']),
    comentario_resolucion: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((v) => v.decision !== 'rechazar' || (v.comentario_resolucion && v.comentario_resolucion.length > 0), {
    message: 'El comentario es obligatorio al rechazar',
    path: ['comentario_resolucion'],
  });

// ---------- Congelamiento de cartera y excepciones ----------

export const congelamientoCreateSchema = z.object({
  entidad_id: uuidSchema,
  motivo: motivoSchema,
  saldo_origen: z.coerce.number().nonnegative().optional().nullable(),
  evidencia_path: z.string().trim().max(500).optional().nullable(),
});

export const congelamientoLiberarSchema = z.object({
  motivo_liberacion: z.string().trim().min(3, 'El motivo de liberación es obligatorio').max(2000),
});

export const excepcionCreateSchema = z.object({
  entidad_id: uuidSchema,
  congelamiento_id: uuidSchema.optional().nullable(),
  monto_maximo: z.coerce.number().positive('El monto máximo debe ser mayor a cero'),
  vigente_desde: z.string().trim().optional(),
  vigente_hasta: z.string().trim().min(1, 'La vigencia es obligatoria'),
  evidencia_path: z.string().trim().min(1, 'La evidencia es obligatoria').max(500),
  motivo: motivoSchema,
});

export const excepcionResolverSchema = z
  .object({
    decision: z.enum(['aprobar', 'rechazar']),
    comentario_resolucion: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((v) => v.decision !== 'rechazar' || (v.comentario_resolucion && v.comentario_resolucion.length > 0), {
    message: 'El comentario es obligatorio al rechazar',
    path: ['comentario_resolucion'],
  });

// ---------- Política comercial del cliente ----------

export const clientePoliticaUpdateSchema = z.object({
  requiere_po: z.boolean().optional(),
  tipo_cliente: z.enum(CLIENTE_TIPOS).optional(),
});

// ---------- Precio de venta (margen y override manual) ----------

export const margenUpdateSchema = z.object({
  margen_porcentaje: z.coerce.number().min(0).max(1000).nullable(),
});

export const precioVentaFijarSchema = z.object({
  precio_manual: z.coerce.number().nonnegative('El precio debe ser mayor o igual a cero'),
  motivo: motivoSchema,
});

export const precioVentaRevertirSchema = z.object({
  motivo: z.string().trim().max(2000).optional().nullable(),
});

// ---------- Evidencia (subida a bucket privado) ----------

export const evidenciaUploadSchema = z.object({
  nombreArchivo: z
    .string()
    .trim()
    .min(1)
    .refine((n) => /\.(pdf|jpe?g|png)$/i.test(n), 'Sólo se admite PDF, JPG o PNG'),
});
