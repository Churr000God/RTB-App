import type { RecursoInventario } from './permisos';

// Descriptor único de los 4 catálogos de apoyo de RTB-INV-01 (unidades de
// medida, familias, categorías, marcas — db/migrations/009 y 015). Sin zod
// y sin JSX a propósito: lo importan tanto los Route Handlers de
// /api/catalogos/[tipo] como los componentes 'use client' de
// /dashboard/catalogos, y no debe arrastrar ninguna de las dos capas hacia
// la otra.
//
// El orden de este array es el orden de las pestañas de la pantalla:
// Familias · Categorías · Marcas · Unidades de medida.
export const CATALOGO_TIPOS = ['familias', 'categorias', 'marcas', 'unidades-medida'] as const;
export type CatalogoTipo = (typeof CATALOGO_TIPOS)[number];

export type CampoCatalogoTipo =
  | 'texto'
  | 'textarea'
  | 'numero'
  | 'checkbox'
  | 'select_unidad'
  | 'select_unidad_tipo';

export interface CampoCatalogo {
  name: string;
  label: string;
  tipo: CampoCatalogoTipo;
  requerido?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  /** Fuera del GRANT UPDATE de su tabla — se renderiza disabled en edición. */
  soloAlta?: boolean;
  ayuda?: string;
  /** Sale como columna del listado, además de clave/nombre. */
  enTabla?: boolean;
}

export interface CatalogoMeta {
  tabla: string;
  recurso: RecursoInventario;
  orden: string;
  label: string;
  labelSingular: string;
  campos: CampoCatalogo[];
}

// Campos comunes a los 4 catálogos: clave inmutable tras el alta (espejo
// del GRANT UPDATE que la deja fuera en las cuatro tablas) y nombre.
const CLAVE = (maxLength: number): CampoCatalogo => ({
  name: 'clave',
  label: 'Clave',
  tipo: 'texto',
  requerido: true,
  maxLength,
  soloAlta: true,
  ayuda: 'La clave no se puede cambiar después del alta.',
});

const NOMBRE = (maxLength: number): CampoCatalogo => ({
  name: 'nombre',
  label: 'Nombre',
  tipo: 'texto',
  requerido: true,
  maxLength,
  // Sin enTabla (E-09, contexto/AUDITORIA_QA_ROLES_2026-08-06.md): la
  // tabla genérica (catalogo-tabla.tsx) ya pinta una columna "Nombre" fija
  // para los 4 catálogos; enTabla:true aquí la duplicaba, siempre con el
  // mismo valor. "Sale como columna del listado, además de clave/nombre"
  // describía el campo `enTabla` en general, no que Nombre debiera usarlo.
});

const DESCRIPCION: CampoCatalogo = {
  name: 'descripcion',
  label: 'Descripción',
  tipo: 'textarea',
};

export const CATALOGO_META: Record<CatalogoTipo, CatalogoMeta> = {
  familias: {
    tabla: 'producto_familias',
    recurso: 'catalogo_familias',
    orden: 'clave',
    label: 'Familias',
    labelSingular: 'familia',
    campos: [
      CLAVE(10),
      NOMBRE(120),
      {
        name: 'unidad_medida_default_id',
        label: 'Unidad de medida por defecto',
        tipo: 'select_unidad',
        enTabla: true,
      },
      {
        name: 'requiere_recuento',
        label: 'Requiere recuento',
        tipo: 'checkbox',
        ayuda: 'Se enciende cuando la familia entera necesita redefinición de unidad y reconteo.',
      },
      DESCRIPCION,
    ],
  },
  categorias: {
    tabla: 'producto_categorias',
    recurso: 'catalogo_categorias',
    orden: 'clave',
    label: 'Categorías',
    labelSingular: 'categoría',
    campos: [CLAVE(20), NOMBRE(120), DESCRIPCION],
  },
  marcas: {
    tabla: 'producto_marcas',
    recurso: 'catalogo_marcas',
    orden: 'clave',
    label: 'Marcas',
    labelSingular: 'marca',
    campos: [CLAVE(20), NOMBRE(120), DESCRIPCION],
  },
  'unidades-medida': {
    tabla: 'unidades_medida',
    recurso: 'catalogo_unidades',
    orden: 'clave',
    label: 'Unidades de medida',
    labelSingular: 'unidad de medida',
    // unidades_medida NO tiene columna descripcion (009) — a diferencia de
    // los otros tres catálogos, no se incluye aquí.
    campos: [
      CLAVE(12),
      NOMBRE(60),
      { name: 'tipo', label: 'Tipo', tipo: 'select_unidad_tipo', requerido: true, enTabla: true },
      {
        name: 'decimales',
        label: 'Decimales',
        tipo: 'numero',
        min: 0,
        max: 4,
        enTabla: true,
        ayuda: '0 impide capturar "2.5 piezas" como error de captura silencioso.',
      },
    ],
  },
};

export function resolverCatalogoTipo(tipo: string): CatalogoMeta | null {
  return (CATALOGO_TIPOS as readonly string[]).includes(tipo) ? CATALOGO_META[tipo as CatalogoTipo] : null;
}
