// Espejo TypeScript de los enums y tablas de RTB-INV-01
// (db/migrations/009_inventario_catalogo.sql … 014_inventario_kpis.sql).
// Mismo patrón que app/types/entidades.ts: tuplas `as const` que alimentan
// z.enum(...) sin duplicar literales, en el mismo orden que el SQL.

export const UNIDAD_TIPOS = ['conteo', 'agrupacion', 'longitud', 'peso', 'volumen'] as const;
export type UnidadTipo = (typeof UNIDAD_TIPOS)[number];

export const PRODUCTO_ESTADOS = [
  'borrador',
  'activo',
  'requiere_depuracion',
  'descontinuado',
  'fusionado',
] as const;
export type ProductoEstado = (typeof PRODUCTO_ESTADOS)[number];

export const COSTO_ORIGENES = ['compra', 'catalogo_manual', 'proveedor_preferente', 'carga_inicial'] as const;
export type CostoOrigen = (typeof COSTO_ORIGENES)[number];

export const PRECIO_CANALES = ['refaccion', 'ariba', 'mostrador', 'lista_general'] as const;
export type PrecioCanal = (typeof PRECIO_CANALES)[number];

export const APARTADO_ESTADOS = ['activo', 'liberado', 'consumido'] as const;
export type ApartadoEstado = (typeof APARTADO_ESTADOS)[number];

export const MOVIMIENTO_TIPOS = [
  'entrada_compra',
  'entrada_crossdock',
  'entrada_recoleccion',
  'entrada_devolucion_cliente',
  'entrada_sobrante_ruta',
  'entrada_transferencia',
  'entrada_conteo',
  'entrada_ajuste',
  'salida_venta',
  'salida_crossdock',
  'salida_devolucion_proveedor',
  'salida_consumo_interno',
  'salida_merma',
  'salida_transferencia',
  'salida_conteo',
  'salida_ajuste',
] as const;
export type MovimientoTipo = (typeof MOVIMIENTO_TIPOS)[number];

export const CONTEO_ESTADOS = [
  'planificado',
  'congelado',
  'en_captura',
  'en_conciliacion',
  'cerrado',
  'aplicado',
  'cancelado',
] as const;
export type ConteoEstado = (typeof CONTEO_ESTADOS)[number];

export const CONTEO_TIPOS = ['general', 'ciclico', 'por_ubicacion', 'por_familia', 'puntual', 'reconteo'] as const;
export type ConteoTipo = (typeof CONTEO_TIPOS)[number];

export const CONTEO_LINEA_ESTADOS = [
  'no_visitada',
  'contada',
  'recontada',
  'no_localizada',
  'ubicacion_incorrecta',
  'bloqueada',
] as const;
export type ConteoLineaEstado = (typeof CONTEO_LINEA_ESTADOS)[number];

export const FIRMA_ROLES = ['contador', 'supervisor', 'gerente_operaciones', 'testigo'] as const;
export type FirmaRol = (typeof FIRMA_ROLES)[number];

export const AJUSTE_ESTADOS = [
  'borrador',
  'pendiente_autorizacion',
  'autorizado',
  'aplicado',
  'rechazado',
  'cancelado',
] as const;
export type AjusteEstado = (typeof AJUSTE_ESTADOS)[number];

export const AJUSTE_TIPOS = [
  'conteo',
  'reubicacion',
  'correccion_captura',
  'redefinicion_unidad',
  'carga_inicial',
  'merma',
  'otro',
] as const;
export type AjusteTipo = (typeof AJUSTE_TIPOS)[number];

export const DISCREPANCIA_BANDAS = ['documental', 'movimiento', 'regularizacion', 'sistema'] as const;
export type DiscrepanciaBanda = (typeof DISCREPANCIA_BANDAS)[number];

export const DISCREPANCIA_SALIDAS = [
  'ubi',
  'cap',
  'aju',
  'aju_sin_soporte',
  'justificado',
  'hal',
  'men',
] as const;
export type DiscrepanciaSalida = (typeof DISCREPANCIA_SALIDAS)[number];

export const DISCREPANCIA_ESTADOS = [
  'abierta',
  'en_investigacion',
  'con_causa',
  'resuelta',
  'hallazgo',
  'cancelada',
] as const;
export type DiscrepanciaEstado = (typeof DISCREPANCIA_ESTADOS)[number];

export const HALLAZGO_ESTADOS = ['abierto', 'en_seguimiento', 'cerrado_con_causa', 'cerrado_sin_causa'] as const;
export type HallazgoEstado = (typeof HALLAZGO_ESTADOS)[number];

// ---------- Filas de tabla — 009: catálogo ----------

export interface UnidadMedida {
  id: string;
  clave: string;
  nombre: string;
  tipo: UnidadTipo;
  decimales: number;
  activo: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductoFamilia {
  id: string;
  clave: string;
  nombre: string;
  unidad_medida_default_id: string | null;
  requiere_recuento: boolean;
  activo: boolean;
  descripcion: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductoCategoria {
  id: string;
  clave: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Producto {
  id: string;
  codigo_interno: string;
  familia_id: string;
  sku: string | null;
  sku_normalizado: string | null;
  producto_canonico_id: string | null;
  nombre: string;
  descripcion: string | null;
  marca: string | null;
  modelo: string | null;
  categoria_id: string | null;
  codigo_barras: string | null;
  unidad_medida_id: string;
  contenido_por_unidad: number;
  unidad_contenido_id: string | null;
  stock_minimo: number | null;
  stock_maximo: number | null;
  es_estrategico: boolean;
  requiere_ubicacion: boolean;
  costo_catalogo: number | null;
  estado: ProductoEstado;
  observaciones: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Filas de tabla — 010: costos ----------

export interface ProveedorProducto {
  id: string;
  proveedor_id: string;
  producto_id: string;
  codigo_proveedor: string | null;
  costo_unitario: number;
  moneda: string;
  unidad_medida_id: string;
  contenido_por_unidad: number;
  plazo_entrega_dias: number | null;
  minimo_compra: number | null;
  es_preferente: boolean;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductoCosto {
  id: string;
  producto_id: string;
  costo_unitario: number;
  moneda: string;
  origen: CostoOrigen;
  proveedor_producto_id: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  soporte_referencia: string | null;
  motivo: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductoPrecioReferencia {
  id: string;
  producto_id: string;
  canal: PrecioCanal;
  precio: number;
  moneda: string;
  vigente_desde: string;
  vigente_hasta: string | null;
  fuente: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Filas de tabla — 011: existencias, apartados, kardex ----------

export interface InventarioExistencia {
  id: string;
  producto_id: string;
  ubicacion_id: string | null;
  cantidad_teorica: number;
  cantidad_fisica: number | null;
  cantidad_apartada: number;
  cantidad_disponible: number;
  diferencia_ultimo_conteo: number | null;
  costo_promedio: number | null;
  valor_teorico: number;
  fecha_ultimo_movimiento: string | null;
  fecha_ultimo_conteo: string | null;
  conteo_id_ultimo: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventarioApartado {
  id: string;
  producto_id: string;
  ubicacion_id: string | null;
  cantidad: number;
  pedido_folio: string | null;
  estado: ApartadoEstado;
  solicitante_id: string;
  liberado_at: string | null;
  liberado_por: string | null;
  motivo_liberacion: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventarioMovimiento {
  id: string;
  folio: string;
  tipo: MovimientoTipo;
  subtipo: string | null;
  producto_id: string;
  ubicacion_id: string | null;
  unidad_captura_id: string;
  cantidad_capturada: number;
  factor_conversion: number;
  unidad_base_id: string;
  cantidad: number;
  costo_unitario: number | null;
  costo_promedio_posterior: number | null;
  saldo_teorico_posterior: number | null;
  referencia_tipo: string | null;
  referencia_folio: string | null;
  entidad_id: string | null;
  operacion_id: string;
  conteo_id: string | null;
  ajuste_id: string | null;
  apartado_id: string | null;
  fecha_movimiento: string;
  permite_negativo: boolean;
  motivo_negativo: string | null;
  observaciones: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Filas de tabla — 012: conteos físicos ----------

export interface InventarioConteo {
  id: string;
  folio: string;
  nombre: string;
  tipo: ConteoTipo;
  alcance: Record<string, unknown>;
  alcance_descripcion: string;
  estado: ConteoEstado;
  version: number;
  conteo_origen_id: string | null;
  corte_at: string | null;
  congelado_at: string | null;
  congelado_por: string | null;
  descongelado_at: string | null;
  descongelado_por: string | null;
  vista_ciega: boolean;
  fecha_programada: string | null;
  responsable_id: string;
  supervisor_id: string | null;
  exactitud_registro: number | null;
  exactitud_pieza: number | null;
  exactitud_valor: number | null;
  cobertura: number | null;
  cerrado_at: string | null;
  cerrado_por: string | null;
  aplicado_at: string | null;
  aplicado_por: string | null;
  cancelado_at: string | null;
  cancelado_por: string | null;
  motivo_cancelacion: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventarioConteoAsignacion {
  id: string;
  conteo_id: string;
  ubicacion_id: string | null;
  familia_id: string | null;
  asignado_a: string;
  asignado_por: string;
  iniciado_at: string | null;
  finalizado_at: string | null;
  created_at: string;
}

export interface InventarioCongelamiento {
  id: string;
  conteo_id: string;
  ubicacion_id: string | null;
  incluye_descendientes: boolean;
  producto_id: string | null;
  congelado_at: string;
  congelado_por: string;
  liberado_at: string | null;
  liberado_por: string | null;
  motivo_liberacion: string | null;
  updated_at: string;
}

/** Fila de la tabla base. NO trae cantidad_teorica/diferencia/valor_diferencia/
 *  costo_unitario_snapshot/costo_origen — el GRANT SELECT las omite (vista
 *  ciega). Para esas columnas usar ConteoConciliacionFila vía RPC
 *  conteo_conciliacion(). */
export interface InventarioConteoDetalle {
  id: string;
  conteo_id: string;
  producto_id: string;
  ubicacion_id: string | null;
  unidad_base_id: string;
  contenido_por_unidad_snapshot: number;
  estado_conteo: ConteoLineaEstado;
  cantidad_fisica: number | null;
  unidad_captura_id: string | null;
  cantidad_capturada: number | null;
  contado_por: string | null;
  contado_at: string | null;
  ubicacion_contada_id: string | null;
  cantidad_fisica_recuento: number | null;
  recontado_por: string | null;
  recontado_at: string | null;
  solicitud_compra_folio: string | null;
  cantidad_en_transito: number;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventarioConteoVersion {
  id: string;
  conteo_id: string;
  version: number;
  corte_at: string;
  que_corrigio: string;
  snapshot: Record<string, unknown>;
  generado_por: string;
  generado_at: string;
}

export interface InventarioConteoFirma {
  id: string;
  conteo_id: string;
  version: number;
  firmante_id: string;
  rol_firma: FirmaRol;
  hash_contenido: string;
  comentario: string | null;
  firmado_at: string;
}

// ---------- Filas de tabla — 013: discrepancias, ajustes, hallazgos ----------

export interface InventarioHallazgo {
  id: string;
  folio: string;
  origen_conteo_id: string | null;
  descripcion: string;
  impacto_piezas: number | null;
  impacto_valor: number | null;
  banda: DiscrepanciaBanda | null;
  estado: HallazgoEstado;
  responsable_id: string | null;
  fecha_limite: string | null;
  conclusion: string | null;
  cerrado_at: string | null;
  cerrado_por: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventarioAjuste {
  id: string;
  folio: string;
  tipo: AjusteTipo;
  motivo: string;
  conteo_id: string | null;
  soporte_path: string | null;
  sin_soporte: boolean;
  motivo_sin_soporte: string | null;
  estado: AjusteEstado;
  solicitante_id: string;
  autorizador_id: string | null;
  autorizado_at: string | null;
  comentario_autorizacion: string | null;
  motivo_rechazo: string | null;
  aplicado_at: string | null;
  aplicado_por: string | null;
  impacto_piezas: number | null;
  impacto_valor: number | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventarioDiscrepancia {
  id: string;
  folio: string;
  conteo_id: string | null;
  conteo_detalle_id: string | null;
  producto_id: string;
  ubicacion_id: string | null;
  cantidad_teorica: number;
  cantidad_fisica: number;
  diferencia: number;
  costo_unitario_snapshot: number | null;
  valor_diferencia: number | null;
  causa_presunta: string | null;
  banda: DiscrepanciaBanda | null;
  salida: DiscrepanciaSalida | null;
  estado: DiscrepanciaEstado;
  discrepancia_par_id: string | null;
  par_confirmado_por: string | null;
  par_confirmado_at: string | null;
  investigador_id: string | null;
  ajuste_id: string | null;
  hallazgo_id: string | null;
  resuelto_at: string | null;
  resuelto_por: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventarioAjusteLinea {
  id: string;
  ajuste_id: string;
  producto_id: string;
  ubicacion_id: string | null;
  discrepancia_id: string | null;
  cantidad_ajuste: number;
  costo_unitario: number | null;
  movimiento_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductoUnidadRedefinicion {
  id: string;
  folio: string;
  producto_id: string;
  familia_id: string | null;
  unidad_anterior_id: string;
  contenido_anterior: number;
  unidad_nueva_id: string;
  contenido_nuevo: number;
  motivo: string;
  existencia_base_anterior: number;
  existencia_base_convertida: number;
  requiere_reconteo: boolean;
  conteo_id: string | null;
  ajuste_id: string | null;
  estado: AjusteEstado;
  solicitante_id: string;
  autorizador_id: string | null;
  autorizado_at: string | null;
  aplicado_at: string | null;
  aplicado_por: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Filas de funciones RPC ----------

/** Fila de public.conteo_conciliacion() — la única puerta al teórico
 *  durante la captura (vista ciega). Vacío si el rol no está autorizado. */
export interface ConteoConciliacionFila {
  detalle_id: string;
  producto_id: string;
  codigo_interno: string;
  nombre: string;
  ubicacion_id: string | null;
  codigo_ubicacion: string | null;
  estado_conteo: ConteoLineaEstado;
  cantidad_teorica: number;
  cantidad_fisica: number | null;
  diferencia: number | null;
  costo_unitario: number | null;
  valor_diferencia: number | null;
  costo_origen: string | null;
  cantidad_en_transito: number;
  contado_por: string | null;
  contado_at: string | null;
}

/** Fila de public.inventario_exactitud(). base ∈ 'cobertura'|'registro'|'pieza'|'valor'. */
export interface InventarioExactitudFila {
  base: 'cobertura' | 'registro' | 'pieza' | 'valor';
  universo: number;
  exactos: number;
  exactitud: number | null;
  cumple: boolean | null;
}

export type InventarioAlertaStockTipo = 'sin_definir' | 'bajo_minimo' | 'ok';
export type InventarioAccionSugerida =
  | 'revisar'
  | 'bloquear_compra'
  | 'reabastecer'
  | 'depurar'
  | 'liquidar'
  | 'mantener';

/** Fila de public.inventario_alerta_stock() — RTB-PRO-COM-01 §III. */
export interface InventarioAlertaStockFila {
  producto_id: string;
  codigo_interno: string;
  nombre: string;
  cantidad_teorica: number;
  cantidad_fisica: number | null;
  cantidad_apartada: number;
  stock_minimo: number | null;
  stock_maximo: number | null;
  dias_sin_movimiento: number | null;
  alerta: InventarioAlertaStockTipo;
  bloqueo_compra: boolean;
  cantidad_sugerida: number | null;
  accion_sugerida: InventarioAccionSugerida;
}

/** Fila de public.inventario_verificar_consistencia() — sólo super_admin/direccion. */
export interface InventarioConsistenciaFila {
  categoria: string;
  referencia_id: string;
  detalle: string;
}
