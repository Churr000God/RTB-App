import { z } from 'zod';

// Esquemas zod de GET /api/geocodificacion — mismo patrón que
// app/lib/entidades/schemas.ts (safeParse en la ruta, primer mensaje de
// error al cliente en español).

export const geocodificacionInversaSchema = z.object({
  modo: z.literal('inverso'),
  latitud: z.coerce.number().min(-90, 'Latitud fuera de rango').max(90, 'Latitud fuera de rango'),
  longitud: z.coerce.number().min(-180, 'Longitud fuera de rango').max(180, 'Longitud fuera de rango'),
});

export const geocodificacionDirectaSchema = z.object({
  modo: z.literal('directo'),
  q: z.string().trim().min(3, 'Escribe al menos 3 caracteres'),
});

export const geocodificacionQuerySchema = z.discriminatedUnion('modo', [
  geocodificacionInversaSchema,
  geocodificacionDirectaSchema,
]);

/** Dirección normalizada al vocabulario de RTB, resultado de geocodificar
 *  con Mapbox — mismos nombres de campo que `direccionSchema`
 *  (entidades/schemas.ts), sin `tipo`/`es_principal`/`numero_interior`/
 *  `referencia`: eso lo decide quien captura, no Mapbox. */
export interface DireccionGeocodificada {
  calle: string | null;
  numero_exterior: string | null;
  colonia: string | null;
  ciudad: string | null;
  entidad_federativa: string | null;
  pais: string | null;
  codigo_postal: string | null;
  latitud: number;
  longitud: number;
  /** `properties.full_address` / `place_formatted` de Mapbox — para
   *  mostrar en `PropuestaDireccion` antes de que el usuario confirme. */
  texto_completo: string;
}
