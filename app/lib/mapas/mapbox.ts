import 'server-only';

import { tokenSecreto } from './config';
import type { DireccionGeocodificada } from './schemas';

// Cliente de Mapbox Geocoding v6 — SOLO se llama desde servidor (el token
// sk. nunca sale de aquí). fetch nativo: el repo no usa axios (ver
// app/lib/entidades/http.ts, mismo criterio).
//
// `permanent=true` es obligatorio: el resultado se guarda en `direcciones`/
// `ubicaciones_internas`, y el modo temporal (default) de Mapbox prohíbe
// persistir el resultado — sólo mostrarlo y descartarlo. Se factura aparte
// del nivel gratuito (ver CLAUDE.md, decisión confirmada con el dueño del
// proyecto).
const BASE_URL = 'https://api.mapbox.com/search/geocode/v6';
const TIMEOUT_MS = 8000;

interface MapboxContextEntry {
  name?: string;
}

interface MapboxFeature {
  properties: {
    full_address?: string;
    place_formatted?: string;
    address_number?: string;
    coordinates?: { longitude: number; latitude: number };
    context?: {
      street?: MapboxContextEntry;
      neighborhood?: MapboxContextEntry;
      postcode?: MapboxContextEntry;
      place?: MapboxContextEntry;
      region?: MapboxContextEntry;
      country?: MapboxContextEntry;
    };
  };
}

interface MapboxResponse {
  features: MapboxFeature[];
}

function aDireccion(feature: MapboxFeature, latitud: number, longitud: number): DireccionGeocodificada {
  const ctx = feature.properties.context ?? {};
  return {
    calle: ctx.street?.name?.trim() || null,
    numero_exterior: feature.properties.address_number?.trim() || null,
    colonia: ctx.neighborhood?.name?.trim() || null,
    ciudad: ctx.place?.name?.trim() || null,
    entidad_federativa: ctx.region?.name?.trim() || null,
    pais: ctx.country?.name?.trim() || null,
    codigo_postal: ctx.postcode?.name?.trim() || null,
    latitud,
    longitud,
    texto_completo: feature.properties.full_address ?? feature.properties.place_formatted ?? '',
  };
}

async function llamarMapbox(path: string, params: Record<string, string>): Promise<MapboxResponse> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('access_token', tokenSecreto());
  url.searchParams.set('language', 'es');
  url.searchParams.set('country', 'mx');
  url.searchParams.set('permanent', 'true');
  url.searchParams.set('limit', '1');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Mapbox respondió ${res.status} al geocodificar.`);
  }
  return res.json();
}

/** Latitud/longitud -> dirección postal ("¿dónde estoy?"). */
export async function geocodificarInverso(latitud: number, longitud: number): Promise<DireccionGeocodificada | null> {
  const data = await llamarMapbox('/reverse', {
    longitude: String(longitud),
    latitude: String(latitud),
  });
  const feature = data.features?.[0];
  if (!feature) return null;
  return aDireccion(feature, latitud, longitud);
}

/** Texto libre -> dirección + coordenada ("¿dónde está esto?"). */
export async function geocodificarDirecto(texto: string): Promise<DireccionGeocodificada | null> {
  const data = await llamarMapbox('/forward', { q: texto });
  const feature = data.features?.[0];
  const coords = feature?.properties.coordinates;
  if (!feature || !coords) return null;
  return aDireccion(feature, coords.latitude, coords.longitude);
}
