import type {
  AjusteEstado,
  AjusteTipo,
  ApartadoEstado,
  ConteoEstado,
  ConteoLineaEstado,
  ConteoTipo,
  CostoOrigen,
  DiscrepanciaBanda,
  DiscrepanciaEstado,
  DiscrepanciaSalida,
  FirmaRol,
  HallazgoEstado,
  MovimientoTipo,
  PrecioCanal,
  ProductoEstado,
  UnidadTipo,
} from '@/types/inventario';

/** Espejo de public.umbral_exactitud() (014_inventario_kpis.sql). Si
 *  divergen, manda SQL. */
export const UMBRAL_EXACTITUD = 95.0;

/** Espejo de public.dias_sin_movimiento_umbral(). RTB-PRO-COM-01 §III:
 *  "stock real > 0 y más de 180 días sin movimiento" → bloqueo de compra. */
export const DIAS_SIN_MOVIMIENTO_UMBRAL = 180;

export const UNIDAD_TIPO_LABELS: Record<UnidadTipo, string> = {
  conteo: 'Conteo',
  agrupacion: 'Agrupación',
  longitud: 'Longitud',
  peso: 'Peso',
  volumen: 'Volumen',
};

export const PRODUCTO_ESTADO_LABELS: Record<ProductoEstado, string> = {
  borrador: 'Borrador',
  activo: 'Activo',
  requiere_depuracion: 'Requiere depuración',
  descontinuado: 'Descontinuado',
  fusionado: 'Fusionado',
};

/** Tono semántico para los tokens de app/app/globals.css, mismo criterio
 *  que ENTIDAD_ESTADO_TONO en lib/entidades/config.ts. */
export const PRODUCTO_ESTADO_TONO: Record<ProductoEstado, 'activo' | 'pendiente' | 'inactivo' | 'bloqueado'> = {
  borrador: 'pendiente',
  activo: 'activo',
  requiere_depuracion: 'pendiente',
  descontinuado: 'inactivo',
  fusionado: 'inactivo',
};

export const COSTO_ORIGEN_LABELS: Record<CostoOrigen, string> = {
  compra: 'Compra',
  catalogo_manual: 'Catálogo (manual)',
  proveedor_preferente: 'Proveedor preferente',
  carga_inicial: 'Carga inicial',
};

export const PRECIO_CANAL_LABELS: Record<PrecioCanal, string> = {
  refaccion: 'Costo Refacción',
  ariba: 'Costo Ariba',
  mostrador: 'Mostrador',
  lista_general: 'Lista general',
};

export const APARTADO_ESTADO_LABELS: Record<ApartadoEstado, string> = {
  activo: 'Activo',
  liberado: 'Liberado',
  consumido: 'Consumido',
};

export const MOVIMIENTO_TIPO_LABELS: Record<MovimientoTipo, string> = {
  entrada_compra: 'Entrada por compra',
  entrada_crossdock: 'Entrada cross-dock',
  entrada_recoleccion: 'Entrada por recolección',
  entrada_devolucion_cliente: 'Devolución de cliente',
  entrada_sobrante_ruta: 'Sobrante de ruta',
  entrada_transferencia: 'Entrada por transferencia',
  entrada_conteo: 'Entrada por conteo',
  entrada_ajuste: 'Entrada por ajuste',
  salida_venta: 'Salida por venta',
  salida_crossdock: 'Salida cross-dock',
  salida_devolucion_proveedor: 'Devolución a proveedor',
  salida_consumo_interno: 'Consumo interno',
  salida_merma: 'Merma',
  salida_transferencia: 'Salida por transferencia',
  salida_conteo: 'Salida por conteo',
  salida_ajuste: 'Salida por ajuste',
};

/** true = entrada (signo +), false = salida (signo −). Espejo de
 *  public.movimiento_signo(). */
export const MOVIMIENTO_ES_ENTRADA: Record<MovimientoTipo, boolean> = Object.fromEntries(
  Object.keys(MOVIMIENTO_TIPO_LABELS).map((tipo) => [tipo, tipo.startsWith('entrada_')])
) as Record<MovimientoTipo, boolean>;

export const CONTEO_ESTADO_LABELS: Record<ConteoEstado, string> = {
  planificado: 'Planificado',
  congelado: 'Congelado',
  en_captura: 'En captura',
  en_conciliacion: 'En conciliación',
  cerrado: 'Cerrado',
  aplicado: 'Aplicado',
  cancelado: 'Cancelado',
};

export const CONTEO_ESTADO_TONO: Record<ConteoEstado, 'activo' | 'pendiente' | 'inactivo' | 'bloqueado'> = {
  planificado: 'pendiente',
  congelado: 'pendiente',
  en_captura: 'activo',
  en_conciliacion: 'pendiente',
  cerrado: 'activo',
  aplicado: 'activo',
  cancelado: 'inactivo',
};

/** Transiciones válidas — espejo EXACTO de la máquina de estados en
 *  inventario_conteos_before_update() (012_inventario_conteos.sql). Sólo
 *  para habilitar/deshabilitar botones; Postgres es la barrera real. */
export const CONTEO_TRANSICIONES: Record<ConteoEstado, ConteoEstado[]> = {
  planificado: ['congelado', 'cancelado'],
  congelado: ['en_captura', 'cancelado'],
  en_captura: ['en_conciliacion', 'cancelado'],
  en_conciliacion: ['cerrado', 'cancelado'],
  cerrado: ['aplicado'],
  aplicado: [],
  cancelado: [],
};

export const CONTEO_TIPO_LABELS: Record<ConteoTipo, string> = {
  general: 'General',
  ciclico: 'Cíclico',
  por_ubicacion: 'Por ubicación',
  por_familia: 'Por familia',
  puntual: 'Puntual',
  reconteo: 'Reconteo',
};

export const CONTEO_LINEA_ESTADO_LABELS: Record<ConteoLineaEstado, string> = {
  no_visitada: 'No visitada',
  contada: 'Contada',
  recontada: 'Recontada',
  no_localizada: 'No localizada',
  ubicacion_incorrecta: 'Ubicación incorrecta',
  bloqueada: 'Bloqueada',
};

export const FIRMA_ROL_LABELS: Record<FirmaRol, string> = {
  contador: 'Contador',
  supervisor: 'Supervisor',
  gerente_operaciones: 'Gerente de Operaciones',
  testigo: 'Testigo',
};

/** Firmas obligatorias para cerrar un conteo — espejo de
 *  inventario_conteos_before_update() (012). */
export const FIRMAS_REQUERIDAS_CIERRE: FirmaRol[] = ['supervisor', 'gerente_operaciones'];

export const AJUSTE_ESTADO_LABELS: Record<AjusteEstado, string> = {
  borrador: 'Borrador',
  pendiente_autorizacion: 'Pendiente de autorización',
  autorizado: 'Autorizado',
  aplicado: 'Aplicado',
  rechazado: 'Rechazado',
  cancelado: 'Cancelado',
};

export const AJUSTE_ESTADO_TONO: Record<AjusteEstado, 'activo' | 'pendiente' | 'inactivo' | 'bloqueado'> = {
  borrador: 'pendiente',
  pendiente_autorizacion: 'pendiente',
  autorizado: 'activo',
  aplicado: 'activo',
  rechazado: 'bloqueado',
  cancelado: 'inactivo',
};

export const AJUSTE_TIPO_LABELS: Record<AjusteTipo, string> = {
  conteo: 'Conteo',
  reubicacion: 'Reubicación',
  correccion_captura: 'Corrección de captura',
  redefinicion_unidad: 'Redefinición de unidad',
  carga_inicial: 'Carga inicial',
  merma: 'Merma',
  otro: 'Otro',
};

export const DISCREPANCIA_BANDA_LABELS: Record<DiscrepanciaBanda, string> = {
  documental: 'Documental (Compras/Facturación)',
  movimiento: 'Movimiento (Almacén/Logística)',
  regularizacion: 'Regularización',
  sistema: 'Sistema',
};

/** Vocabulario real de RTB (Registro de Discrepancias CIE-DIS-01 §X). */
export const DISCREPANCIA_SALIDA_LABELS: Record<DiscrepanciaSalida, string> = {
  ubi: 'UBI · Corrección de ubicación',
  cap: 'CAP · Corrección de captura',
  aju: 'AJU · Ajuste autorizado con soporte',
  aju_sin_soporte: 'AJU s/s · Ajuste sin soporte',
  justificado: 'Justificado (material en tránsito)',
  hal: 'HAL · Hallazgo abierto',
  men: 'MEN · Diferencia menor no rastreada',
};

/** Salidas que NO exigen causa_presunta/banda — espejo de dis_causa_chk (013). */
export const DISCREPANCIA_SALIDAS_SIN_CAUSA: DiscrepanciaSalida[] = ['hal', 'men'];

export const DISCREPANCIA_ESTADO_LABELS: Record<DiscrepanciaEstado, string> = {
  abierta: 'Abierta',
  en_investigacion: 'En investigación',
  con_causa: 'Con causa',
  resuelta: 'Resuelta',
  hallazgo: 'Hallazgo',
  cancelada: 'Cancelada',
};

export const DISCREPANCIA_ESTADO_TONO: Record<DiscrepanciaEstado, 'activo' | 'pendiente' | 'inactivo' | 'bloqueado'> = {
  abierta: 'bloqueado',
  en_investigacion: 'pendiente',
  con_causa: 'pendiente',
  resuelta: 'activo',
  hallazgo: 'bloqueado',
  cancelada: 'inactivo',
};

export const HALLAZGO_ESTADO_LABELS: Record<HallazgoEstado, string> = {
  abierto: 'Abierto',
  en_seguimiento: 'En seguimiento',
  cerrado_con_causa: 'Cerrado (con causa)',
  cerrado_sin_causa: 'Cerrado (sin causa)',
};
