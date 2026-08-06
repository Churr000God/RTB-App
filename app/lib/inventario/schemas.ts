import { z } from 'zod';
import {
  AJUSTE_TIPOS,
  CONTEO_LINEA_ESTADOS,
  CONTEO_TIPOS,
  COSTO_ORIGENES,
  DISCREPANCIA_BANDAS,
  DISCREPANCIA_SALIDAS,
  FIRMA_ROLES,
  MOVIMIENTO_TIPOS,
  PRECIO_CANALES,
  PRODUCTO_ESTADOS,
  UNIDAD_TIPOS,
} from '@/types/inventario';
import { cantidadRespetaDecimales, discrepanciaRequiereCausa } from './validaciones';

// Esquemas zod compartidos por las rutas de app/app/api/{productos,catalogos,
// proveedor-productos,inventario/*}. Mismo patrón que lib/entidades/schemas.ts:
// safeParse en la ruta, primer mensaje de error al cliente en español. Cada
// *CreateSchema/*UpdateSchema es traducción literal del GRANT INSERT/UPDATE
// por columna de su tabla (db/migrations/009…013) — si el GRANT cambia,
// este archivo tiene que cambiar con él.

const motivoSchema = z.string().trim().min(5, 'El motivo es obligatorio (mínimo 5 caracteres)').max(2000);

// ---------- Catálogos: unidades de medida, familias, categorías ----------

export const unidadMedidaCreateSchema = z.object({
  clave: z.string().trim().toUpperCase().min(1, 'La clave es obligatoria').max(12),
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(60),
  tipo: z.enum(UNIDAD_TIPOS, { errorMap: () => ({ message: 'Tipo de unidad inválido' }) }),
  decimales: z.coerce.number().int().min(0).max(4).default(0),
  activo: z.boolean().default(true),
});

export const unidadMedidaUpdateSchema = z
  .object({
    nombre: z.string().trim().min(2).max(60).optional(),
    tipo: z.enum(UNIDAD_TIPOS).optional(),
    decimales: z.coerce.number().int().min(0).max(4).optional(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

export const familiaCreateSchema = z.object({
  clave: z.string().trim().toUpperCase().min(1, 'La clave es obligatoria').max(10),
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(120),
  unidad_medida_default_id: z.string().uuid().optional().nullable(),
  requiere_recuento: z.boolean().default(false),
  activo: z.boolean().default(true),
  descripcion: z.string().trim().max(2000).optional().nullable(),
});

export const familiaUpdateSchema = z
  .object({
    nombre: z.string().trim().min(2).max(120).optional(),
    unidad_medida_default_id: z.string().uuid().optional().nullable(),
    requiere_recuento: z.boolean().optional(),
    activo: z.boolean().optional(),
    descripcion: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

export const categoriaCreateSchema = z.object({
  clave: z.string().trim().toUpperCase().min(1, 'La clave es obligatoria').max(20),
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(120),
  descripcion: z.string().trim().max(2000).optional().nullable(),
  activo: z.boolean().default(true),
});

export const categoriaUpdateSchema = z
  .object({
    nombre: z.string().trim().min(2).max(120).optional(),
    descripcion: z.string().trim().max(2000).optional().nullable(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

// Sustituye a productos.marca (texto libre) — 015_catalogo_marcas_y_gobierno.sql.
export const marcaCreateSchema = z.object({
  clave: z.string().trim().toUpperCase().min(1, 'La clave es obligatoria').max(20),
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(120),
  descripcion: z.string().trim().max(2000).optional().nullable(),
  activo: z.boolean().default(true),
});

export const marcaUpdateSchema = z
  .object({
    nombre: z.string().trim().min(2).max(120).optional(),
    descripcion: z.string().trim().max(2000).optional().nullable(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

// ---------- Productos ----------

export const productoCreateSchema = z
  .object({
    codigo_interno: z.string().trim().toUpperCase().max(60).optional(),
    familia_id: z.string().uuid('Selecciona una familia'),
    sku: z.string().trim().toUpperCase().max(80).optional().nullable(),
    nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(200),
    descripcion: z.string().trim().max(4000).optional().nullable(),
    marca_id: z.string().uuid().optional().nullable(),
    modelo: z.string().trim().max(120).optional().nullable(),
    categoria_id: z.string().uuid().optional().nullable(),
    codigo_barras: z.string().trim().max(60).optional().nullable(),
    unidad_medida_id: z.string().uuid('Selecciona la unidad de medida base'),
    contenido_por_unidad: z.coerce.number().positive().default(1),
    unidad_contenido_id: z.string().uuid().optional().nullable(),
    stock_minimo: z.coerce.number().min(0).optional().nullable(),
    stock_maximo: z.coerce.number().min(0).optional().nullable(),
    es_estrategico: z.boolean().default(false),
    requiere_ubicacion: z.boolean().default(true),
    estado: z.enum(PRODUCTO_ESTADOS).default('borrador'),
    observaciones: z.string().trim().max(4000).optional().nullable(),
  })
  // Espejo de productos_unidad_contenido_chk: si agrupa (contenido≠1), hace
  // falta decir en qué unidad está el contenido.
  .refine((v) => v.contenido_por_unidad === 1 || !!v.unidad_contenido_id, {
    message: 'Si el contenido por unidad no es 1, indica la unidad del contenido',
    path: ['unidad_contenido_id'],
  })
  // Espejo de productos_stock_chk.
  .refine((v) => v.stock_maximo == null || v.stock_minimo == null || v.stock_maximo >= v.stock_minimo, {
    message: 'El stock máximo no puede ser menor que el mínimo',
    path: ['stock_maximo'],
  });

/** Espejo EXACTO del GRANT UPDATE por columna de productos (009, ampliado
 *  por 015 con marca_id en lugar de marca) — codigo_interno/sku/familia_id/
 *  estado/unidad_medida_id/contenido_por_unidad/stock_minimo/stock_maximo/
 *  es_estrategico NO están: identidad, ciclo de vida y la causa #1 de
 *  pérdida sólo cambian vía API con service_role o vía
 *  producto_unidad_redefiniciones (013). */
export const productoUpdateLibreSchema = z
  .object({
    nombre: z.string().trim().min(2).max(200).optional(),
    descripcion: z.string().trim().max(4000).optional().nullable(),
    marca_id: z.string().uuid().optional().nullable(),
    modelo: z.string().trim().max(120).optional().nullable(),
    categoria_id: z.string().uuid().optional().nullable(),
    codigo_barras: z.string().trim().max(60).optional().nullable(),
    requiere_ubicacion: z.boolean().optional(),
    observaciones: z.string().trim().max(4000).optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

/** Campos controlados de productos (stock_minimo/stock_maximo/es_estrategico):
 *  fuera del GRANT UPDATE por ser de 'compras', no distinguible por rol de
 *  Postgres — los escribe la API con service_role tras validar el rol de negocio. */
export const productoComercialUpdateSchema = z
  .object({
    stock_minimo: z.coerce.number().min(0).optional().nullable(),
    stock_maximo: z.coerce.number().min(0).optional().nullable(),
    es_estrategico: z.boolean().optional(),
  })
  .refine((v) => v.stock_maximo == null || v.stock_minimo == null || v.stock_maximo >= v.stock_minimo, {
    message: 'El stock máximo no puede ser menor que el mínimo',
    path: ['stock_maximo'],
  });

/** Fusión de duplicados (RTB-ILU-SL18B/SL18C…): API con service_role. */
export const productoFusionarSchema = z.object({
  producto_canonico_id: z.string().uuid('Selecciona el producto canónico'),
  motivo: motivoSchema,
});

// ---------- Redefinición de unidad de medida (causa #1 de pérdida medida) ----------

export const redefinicionCreateSchema = z
  .object({
    producto_id: z.string().uuid(),
    familia_id: z.string().uuid().optional().nullable(),
    unidad_nueva_id: z.string().uuid('Selecciona la unidad nueva'),
    contenido_nuevo: z.coerce.number().positive(),
    motivo: motivoSchema,
    requiere_reconteo: z.boolean().default(true),
    conteo_id: z.string().uuid().optional().nullable(),
  })
  .refine((v) => !v.requiere_reconteo || v.conteo_id || true, {
    // El reconteo puede asignarse después (antes de aplicar); no se exige aquí.
    message: '',
  });

// ---------- Costos: producto_costos, proveedor_productos, precios de referencia ----------

export const productoCostoCreateSchema = z
  .object({
    producto_id: z.string().uuid(),
    costo_unitario: z.coerce.number().min(0, 'El costo no puede ser negativo'),
    moneda: z.string().trim().toUpperCase().length(3).default('MXN'),
    origen: z.enum(COSTO_ORIGENES, { errorMap: () => ({ message: 'Origen de costo inválido' }) }),
    proveedor_producto_id: z.string().uuid().optional().nullable(),
    vigente_desde: z.string().date().optional(),
    soporte_referencia: z.string().trim().max(80).optional().nullable(),
    motivo: z.string().trim().max(2000).optional().nullable(),
  })
  // Espejo de pc_retroactivo_chk: si vigente_desde es pasado, el motivo es obligatorio.
  .refine(
    (v) => {
      if (!v.vigente_desde) return true;
      const hoy = new Date().toISOString().slice(0, 10);
      return v.vigente_desde >= hoy || !!v.motivo?.trim();
    },
    { message: 'Una carga retroactiva exige motivo', path: ['motivo'] }
  );

export const proveedorProductoCreateSchema = z.object({
  proveedor_id: z.string().uuid(),
  producto_id: z.string().uuid(),
  codigo_proveedor: z.string().trim().max(80).optional().nullable(),
  costo_unitario: z.coerce.number().min(0, 'El costo no puede ser negativo'),
  moneda: z.string().trim().toUpperCase().length(3).default('MXN'),
  unidad_medida_id: z.string().uuid('Indica en qué unidad cotiza el proveedor'),
  contenido_por_unidad: z.coerce.number().positive().default(1),
  plazo_entrega_dias: z.coerce.number().int().min(0).optional().nullable(),
  minimo_compra: z.coerce.number().min(0).optional().nullable(),
  es_preferente: z.boolean().default(false),
  vigente_hasta: z.string().date().optional().nullable(),
});

export const proveedorProductoUpdateSchema = z
  .object({
    codigo_proveedor: z.string().trim().max(80).optional().nullable(),
    costo_unitario: z.coerce.number().min(0).optional(),
    moneda: z.string().trim().toUpperCase().length(3).optional(),
    unidad_medida_id: z.string().uuid().optional(),
    contenido_por_unidad: z.coerce.number().positive().optional(),
    plazo_entrega_dias: z.coerce.number().int().min(0).optional().nullable(),
    minimo_compra: z.coerce.number().min(0).optional().nullable(),
    es_preferente: z.boolean().optional(),
    vigente_hasta: z.string().date().optional().nullable(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

export const precioReferenciaCreateSchema = z.object({
  producto_id: z.string().uuid(),
  canal: z.enum(PRECIO_CANALES, { errorMap: () => ({ message: 'Canal de precio inválido' }) }),
  precio: z.coerce.number().min(0, 'El precio no puede ser negativo'),
  moneda: z.string().trim().toUpperCase().length(3).default('MXN'),
  vigente_hasta: z.string().date().optional().nullable(),
  fuente: z.string().trim().max(120).optional().nullable(),
});

export const precioReferenciaUpdateSchema = z
  .object({
    precio: z.coerce.number().min(0).optional(),
    vigente_hasta: z.string().date().optional().nullable(),
    fuente: z.string().trim().max(120).optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

// ---------- Apartados (reservas) ----------

export const apartadoCreateSchema = z.object({
  producto_id: z.string().uuid(),
  ubicacion_id: z.string().uuid().optional().nullable(),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a cero'),
  pedido_folio: z.string().trim().max(40).optional().nullable(),
});

export const apartadoLiberarSchema = z.object({
  estado: z.enum(['liberado', 'consumido']),
  motivo_liberacion: z.string().trim().min(3, 'El motivo es obligatorio').max(2000),
});

// ---------- Movimientos (kardex) ----------

/** Espejo EXACTO del GRANT INSERT por columna de inventario_movimientos
 *  (011) — folio/factor_conversion/unidad_base_id/cantidad/costo_promedio_
 *  posterior/saldo_teorico_posterior los calcula el trigger;
 *  permite_negativo/motivo_negativo/ajuste_id son sólo de service_role. */
export const movimientoCreateSchema = z
  .object({
    tipo: z.enum(MOVIMIENTO_TIPOS, { errorMap: () => ({ message: 'Tipo de movimiento inválido' }) }),
    subtipo: z.string().trim().max(40).optional().nullable(),
    producto_id: z.string().uuid(),
    ubicacion_id: z.string().uuid().optional().nullable(),
    unidad_captura_id: z.string().uuid('Indica en qué unidad capturas la cantidad'),
    cantidad_capturada: z.coerce.number().positive('La cantidad debe ser mayor a cero'),
    costo_unitario: z.coerce.number().min(0).optional().nullable(),
    referencia_tipo: z.string().trim().max(40).optional().nullable(),
    referencia_folio: z.string().trim().max(80).optional().nullable(),
    entidad_id: z.string().uuid().optional().nullable(),
    operacion_id: z.string().uuid().optional(),
    conteo_id: z.string().uuid().optional().nullable(),
    apartado_id: z.string().uuid().optional().nullable(),
    fecha_movimiento: z.string().datetime().optional(),
    observaciones: z.string().trim().max(2000).optional().nullable(),
  })
  // Espejo de mov_conteo_chk: entrada_conteo/salida_conteo exigen conteo_id.
  .refine((v) => !v.tipo.endsWith('_conteo') || !!v.conteo_id, {
    message: 'Este tipo de movimiento requiere indicar el conteo de origen',
    path: ['conteo_id'],
  });

/** Cross-dock/transferencia: dos filas con el mismo operacion_id en un solo
 *  POST (PostgREST/la ruta las inserta en una sola transacción — la pareja
 *  faltante hace fallar el commit, ver movimiento_valida_par() en 011). */
export const movimientoParSchema = z
  .array(movimientoCreateSchema)
  .length(2, 'Cross-dock/transferencia exige exactamente dos movimientos (entrada y salida)');

// ---------- Conteos físicos ----------

/** Espejo EXACTO del GRANT INSERT de inventario_conteos (012) — estado no
 *  está: toda fila nace 'planificado' y recorre la máquina de estados por
 *  UPDATE, nunca ya creada en otro estado. */
export const conteoCreateSchema = z.object({
  tipo: z.enum(CONTEO_TIPOS, { errorMap: () => ({ message: 'Tipo de conteo inválido' }) }),
  nombre: z.string().trim().min(3, 'El nombre es obligatorio').max(160),
  alcance: z.record(z.string(), z.unknown()),
  alcance_descripcion: z.string().trim().min(3, 'Describe el alcance para el acta').max(2000),
  conteo_origen_id: z.string().uuid().optional().nullable(),
  vista_ciega: z.boolean().default(true),
  fecha_programada: z.string().date().optional().nullable(),
  responsable_id: z.string().uuid('Selecciona un responsable'),
  supervisor_id: z.string().uuid().optional().nullable(),
});

export const conteoUpdateSchema = z
  .object({
    nombre: z.string().trim().min(3).max(160).optional(),
    alcance_descripcion: z.string().trim().min(3).max(2000).optional(),
    fecha_programada: z.string().date().optional().nullable(),
    supervisor_id: z.string().uuid().optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

/** Transición de estado — espejo de CONTEO_TRANSICIONES (config.ts) /
 *  inventario_conteos_before_update() (012). 'cancelado' exige motivo. */
export const conteoTransicionSchema = z
  .object({
    estado: z.enum(['congelado', 'en_captura', 'en_conciliacion', 'cerrado', 'aplicado', 'cancelado']),
    motivo_cancelacion: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.estado !== 'cancelado' || (v.motivo_cancelacion && v.motivo_cancelacion.length >= 5), {
    message: 'El motivo de cancelación es obligatorio',
    path: ['motivo_cancelacion'],
  });

export const conteoAsignacionCreateSchema = z
  .object({
    ubicacion_id: z.string().uuid().optional().nullable(),
    familia_id: z.string().uuid().optional().nullable(),
    asignado_a: z.string().uuid('Selecciona a quién se asigna'),
  })
  .refine((v) => !!v.ubicacion_id || !!v.familia_id, {
    message: 'Indica ubicación o familia para la asignación',
    path: ['ubicacion_id'],
  });

export const conteoCongelamientoCreateSchema = z
  .object({
    ubicacion_id: z.string().uuid().optional().nullable(),
    incluye_descendientes: z.boolean().default(true),
    producto_id: z.string().uuid().optional().nullable(),
  })
  .refine((v) => !!v.ubicacion_id || !!v.producto_id, {
    message: 'Indica ubicación o producto para el congelamiento',
    path: ['ubicacion_id'],
  });

export const conteoCongelamientoLiberarSchema = z.object({
  motivo_liberacion: z.string().trim().min(3, 'El motivo es obligatorio').max(2000),
});

/**
 * Captura de una línea de conteo — VISTA CIEGA: este schema es deliberadamente
 * ciego a cantidad_teorica/diferencia (ni siquiera existen como campo aquí,
 * como espejo de que el GRANT SELECT tampoco las expone). contado_por/
 * contado_at los estampa el trigger, no este payload.
 */
export const conteoDetalleCapturaSchema = z
  .object({
    estado_conteo: z.enum(CONTEO_LINEA_ESTADOS, { errorMap: () => ({ message: 'Estado de conteo inválido' }) }),
    cantidad_capturada: z.coerce.number().min(0).optional().nullable(),
    unidad_captura_id: z.string().uuid().optional().nullable(),
    ubicacion_contada_id: z.string().uuid().optional().nullable(),
    observaciones: z.string().trim().max(2000).optional().nullable(),
  })
  // Espejo de det_estado_cantidad_chk.
  .refine(
    (v) => {
      if (v.estado_conteo === 'no_visitada' || v.estado_conteo === 'bloqueada') return true;
      if (v.estado_conteo === 'no_localizada') return true; // cantidad_fisica se fuerza a 0 en la API
      return v.cantidad_capturada != null && !!v.unidad_captura_id;
    },
    { message: 'Captura la cantidad y la unidad para este estado', path: ['cantidad_capturada'] }
  )
  // Espejo de det_reubicacion_chk (Paso 0 · Reubicación).
  .refine((v) => v.estado_conteo !== 'ubicacion_incorrecta' || !!v.ubicacion_contada_id, {
    message: 'Indica dónde apareció realmente la pieza',
    path: ['ubicacion_contada_id'],
  });

export const conteoRecuentoSchema = z.object({
  cantidad_fisica_recuento: z.coerce.number().min(0, 'La cantidad no puede ser negativa'),
});

export const conteoFirmaCreateSchema = z.object({
  rol_firma: z.enum(FIRMA_ROLES, { errorMap: () => ({ message: 'Rol de firma inválido' }) }),
  comentario: z.string().trim().max(2000).optional().nullable(),
});

export const conteoVersionCreateSchema = z.object({
  que_corrigio: z.string().trim().min(5, 'Describe qué corrigió esta versión').max(2000),
});

// ---------- Discrepancias ----------

/** Espejo EXACTO del GRANT INSERT de inventario_discrepancias (013) —
 *  estado/salida/ajuste_id/hallazgo_id/resuelto_(por|at)/par_confirmado_(por|at) fuera:
 *  una discrepancia nace 'abierta' y sin resolución. */
export const discrepanciaCreateSchema = z.object({
  conteo_id: z.string().uuid().optional().nullable(),
  conteo_detalle_id: z.string().uuid().optional().nullable(),
  producto_id: z.string().uuid(),
  ubicacion_id: z.string().uuid().optional().nullable(),
  cantidad_teorica: z.coerce.number(),
  cantidad_fisica: z.coerce.number().min(0, 'El físico no puede ser negativo'),
  costo_unitario_snapshot: z.coerce.number().min(0).optional().nullable(),
  causa_presunta: z.string().trim().max(2000).optional().nullable(),
  banda: z.enum(DISCREPANCIA_BANDAS).optional().nullable(),
  discrepancia_par_id: z.string().uuid().optional().nullable(),
  investigador_id: z.string().uuid().optional().nullable(),
});

/**
 * Resolución de una discrepancia — espejo de dis_causa_chk: sólo 'hal'/'men'
 * pueden ir sin causa_presunta+banda; el resto exige ambas. La regla real
 * vive en el CHECK de SQL; este refine sólo evita el round-trip.
 */
export const discrepanciaResolverSchema = z
  .object({
    salida: z.enum(DISCREPANCIA_SALIDAS, { errorMap: () => ({ message: 'Selecciona cómo se resuelve' }) }),
    causa_presunta: z.string().trim().max(2000).optional().nullable(),
    banda: z.enum(DISCREPANCIA_BANDAS).optional().nullable(),
    investigador_id: z.string().uuid().optional().nullable(),
    ajuste_id: z.string().uuid().optional().nullable(),
    hallazgo_id: z.string().uuid().optional().nullable(),
    discrepancia_par_id: z.string().uuid().optional().nullable(),
    estado: z.enum(['en_investigacion', 'con_causa', 'resuelta', 'hallazgo', 'cancelada']).optional(),
  })
  .refine((v) => !discrepanciaRequiereCausa(v.salida) || (!!v.banda && !!v.causa_presunta?.trim()), {
    message: 'Esta salida exige causa presunta y banda (RTB-CIE-01: no se ajusta sin causa)',
    path: ['causa_presunta'],
  })
  .refine((v) => !(v.salida === 'aju' || v.salida === 'aju_sin_soporte') || !!v.ajuste_id, {
    message: 'Vincula el ajuste autorizado que resuelve esta discrepancia',
    path: ['ajuste_id'],
  })
  .refine((v) => v.salida !== 'hal' || !!v.hallazgo_id, {
    message: 'Vincula el hallazgo abierto',
    path: ['hallazgo_id'],
  })
  .refine((v) => v.salida !== 'ubi' || !!v.discrepancia_par_id, {
    message: 'Paso 0 · Reubicación: indica cuál es la discrepancia pareja',
    path: ['discrepancia_par_id'],
  });

// ---------- Hallazgos ----------

export const hallazgoCreateSchema = z.object({
  origen_conteo_id: z.string().uuid().optional().nullable(),
  descripcion: z.string().trim().min(5, 'La descripción es obligatoria').max(4000),
  impacto_piezas: z.coerce.number().optional().nullable(),
  impacto_valor: z.coerce.number().optional().nullable(),
  banda: z.enum(DISCREPANCIA_BANDAS).optional().nullable(),
  responsable_id: z.string().uuid().optional().nullable(),
  fecha_limite: z.string().date().optional().nullable(),
});

export const hallazgoUpdateSchema = z
  .object({
    descripcion: z.string().trim().min(5).max(4000).optional(),
    impacto_piezas: z.coerce.number().optional().nullable(),
    impacto_valor: z.coerce.number().optional().nullable(),
    banda: z.enum(DISCREPANCIA_BANDAS).optional().nullable(),
    responsable_id: z.string().uuid().optional().nullable(),
    fecha_limite: z.string().date().optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

export const hallazgoCerrarSchema = z.object({
  estado: z.enum(['cerrado_con_causa', 'cerrado_sin_causa']),
  conclusion: z.string().trim().min(5, 'La conclusión es obligatoria').max(4000),
});

// ---------- Ajustes autorizados (CIE-AJU-01) ----------

/** Espejo EXACTO del GRANT INSERT/UPDATE de inventario_ajustes (013) —
 *  estado/autorizador_id/autorizado_at/aplicado_(at|por)/comentario_autorizacion/
 *  motivo_rechazo fuera: la resolución SIEMPRE pasa por el API con
 *  service_role. */
export const ajusteCreateSchema = z
  .object({
    tipo: z.enum(AJUSTE_TIPOS, { errorMap: () => ({ message: 'Tipo de ajuste inválido' }) }),
    motivo: motivoSchema,
    conteo_id: z.string().uuid().optional().nullable(),
    soporte_path: z.string().trim().max(500).optional().nullable(),
    sin_soporte: z.boolean().default(false),
    motivo_sin_soporte: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((v) => !v.sin_soporte || !!v.motivo_sin_soporte?.trim(), {
    message: 'Explica por qué no hay soporte documental',
    path: ['motivo_sin_soporte'],
  });

export const ajusteUpdateSchema = ajusteCreateSchema
  .innerType()
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

export const ajusteLineaCreateSchema = z.object({
  producto_id: z.string().uuid(),
  ubicacion_id: z.string().uuid().optional().nullable(),
  discrepancia_id: z.string().uuid().optional().nullable(),
  cantidad_ajuste: z.coerce.number().refine((v) => v !== 0, 'La cantidad no puede ser cero'),
  costo_unitario: z.coerce.number().min(0).optional().nullable(),
});

/** Enviar un ajuste en 'borrador' a autorización — sólo transición de
 *  estado, la resuelve la API con service_role tras validar soporte/líneas. */
export const ajusteEnviarSchema = z.object({});

/** Resolver (autorizar/rechazar) — mismo patrón que
 *  cuentaBancariaResolverSchema (lib/entidades/schemas.ts). El API valida
 *  además que quien resuelve no sea el propio solicitante
 *  (aju_no_autoaprobacion_chk lo hace estructural). */
export const ajusteResolverSchema = z
  .object({
    decision: z.enum(['autorizar', 'rechazar']),
    comentario_autorizacion: z.string().trim().max(2000).optional(),
    motivo_rechazo: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.decision !== 'rechazar' || (v.motivo_rechazo && v.motivo_rechazo.length > 0), {
    message: 'El motivo de rechazo es obligatorio',
    path: ['motivo_rechazo'],
  });

// ---------- Redefinición de unidad — resolución ----------

export const redefinicionResolverSchema = z
  .object({
    decision: z.enum(['autorizar', 'rechazar']),
    motivo_rechazo: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.decision !== 'rechazar' || (v.motivo_rechazo && v.motivo_rechazo.length > 0), {
    message: 'El motivo de rechazo es obligatorio',
    path: ['motivo_rechazo'],
  });

// ---------- Validación de decimales de captura (espejo del trigger) ----------

export function validarDecimales(cantidad: number, decimales: number, campo = 'cantidad_capturada') {
  if (!cantidadRespetaDecimales(cantidad, decimales)) {
    throw new Error(`La cantidad no respeta los ${decimales} decimales permitidos por la unidad (${campo})`);
  }
}
