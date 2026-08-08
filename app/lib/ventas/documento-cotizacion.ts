import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adjuntarImagenPrincipal } from '@/lib/inventario/imagenes';
import { IVA_TASA } from './config';

/**
 * Arma TODO lo necesario para el documento comercial (PDF/impresión/correo)
 * de una cotización, a partir de su id — capa compartida entre
 * GET /api/ventas/cotizaciones/[id]/pdf y POST .../correo, para que ambos
 * flujos nunca puedan divergir en qué se muestra.
 *
 * También hace de guard de acceso: si devuelve `null`, el llamador responde
 * 404 — cubre a la vez "no existe" y "la RLS de este usuario no la deja
 * ver", sin distinguir uno de otro (mismo criterio que el resto del API de
 * Ventas).
 *
 * El nombre del vendedor se resuelve por usuarios_directorio() (RPC,
 * SECURITY DEFINER), NUNCA por un embed a profiles: profiles_select limita
 * cada usuario a su propia fila, así que un embed dejaría el nombre en
 * blanco para gerente_comercial/dirección viendo la cotización de otro
 * vendedor.
 */

export interface DocumentoLinea {
  id: string;
  sku: string | null;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  detalle: string | null;
  unidad: string | null;
  cantidad: number;
  precio_unitario: number;
  descuento_porcentaje: number;
  precio_neto: number;
  importe: number;
  en_consulta: boolean;
  /** data URI ya inlineado (o null si el producto no tiene foto, o si no
   *  se pudo descargar a tiempo) — nunca una URL remota: el render de
   *  Puppeteer debe ser 100% offline y determinista. */
  imagen: string | null;
}

export interface DocumentoCotizacion {
  id: string;
  folio: string;
  estado: string;
  moneda: string;
  canal_entrada: string | null;
  fecha_emision: string;
  vigencia_hasta: string | null;
  observaciones: string | null;
  cliente: {
    clave: string | null;
    siglas: string | null;
    nombre_legal: string | null;
    nombre_comercial: string | null;
    rfc: string | null;
    correo_principal: string | null;
    telefono_principal: string | null;
  };
  credito: {
    tipo_cliente: string | null;
    dias_credito: number | null;
    dias_gracia: number | null;
  } | null;
  contacto: {
    nombre: string;
    cargo: string | null;
    correo: string | null;
    telefono: string | null;
  } | null;
  direccion: {
    linea1: string;
    linea2: string | null;
    ciudad: string | null;
    entidad_federativa: string | null;
    codigo_postal: string | null;
  } | null;
  vendedor: { nombre: string | null } | null;
  lineas: DocumentoLinea[];
  totales: { subtotal: number; iva_tasa: number; iva: number; total: number };
  /** Destinatario sugerido para el diálogo "Enviar por correo": contacto
   *  principal, o entidades.correo_principal como respaldo. */
  correo_sugerido: string | null;
}

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Tamaño máximo de cada imagen inlineada (400 KB) y tope de imágenes por
 *  documento (40) — un catálogo con fotos muy pesadas o una cotización con
 *  decenas de líneas distintas no debe poder inflar el PDF sin control ni
 *  colgar el render esperando descargas. */
const IMAGEN_MAX_BYTES = 400_000;
const IMAGEN_MAX_POR_DOCUMENTO = 40;
const IMAGEN_TIMEOUT_MS = 4_000;

/** Descarga una URL pública de Storage y la convierte a data URI para
 *  inlinearla en el HTML. NUNCA lanza: una foto caída o demasiado pesada no
 *  puede tumbar la generación del documento — sólo se omite (queda `null`,
 *  la plantilla dibuja un placeholder). */
async function imagenComoDataUri(url: string): Promise<string | null> {
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), IMAGEN_TIMEOUT_MS);
  try {
    const respuesta = await fetch(url, { signal: controlador.signal, cache: 'no-store' });
    if (!respuesta.ok) return null;
    const tipo = respuesta.headers.get('content-type') ?? '';
    if (!tipo.startsWith('image/')) return null;
    const buffer = await respuesta.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > IMAGEN_MAX_BYTES) return null;
    return `data:${tipo};base64,${Buffer.from(buffer).toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function armarDocumentoCotizacion(
  supabase: SupabaseClient,
  cotizacionId: string
): Promise<DocumentoCotizacion | null> {
  const { data: cotizacion } = await supabase
    .from('ventas_cotizaciones')
    .select(
      `*, entidades(clave, siglas, nombre_legal, nombre_comercial, rfc,
        correo_principal, telefono_principal,
        clientes(tipo_cliente, dias_credito, dias_gracia))`
    )
    .eq('id', cotizacionId)
    .maybeSingle();
  if (!cotizacion) return null;

  // El embed 1:1 de PostgREST no siempre se detecta como objeto — normalizar.
  const entidadRaw = Array.isArray(cotizacion.entidades) ? cotizacion.entidades[0] : cotizacion.entidades;
  const entidad = entidadRaw ?? null;
  const clientesRaw = entidad ? (Array.isArray(entidad.clientes) ? entidad.clientes[0] : entidad.clientes) : null;
  const credito = clientesRaw
    ? {
        tipo_cliente: clientesRaw.tipo_cliente ?? null,
        dias_credito: clientesRaw.dias_credito ?? null,
        dias_gracia: clientesRaw.dias_gracia ?? null,
      }
    : null;

  const [{ data: lineasRaw }, { data: contacto }, { data: direccion }, directorio] = await Promise.all([
    supabase
      .from('ventas_cotizacion_lineas')
      // productos.marca (texto libre) se retiró en 015 a favor de marca_id
      // → producto_marcas — mismo patrón de embed que GET /api/productos.
      .select('*, productos(codigo_interno, nombre, modelo, producto_marcas(nombre)), unidades_medida(clave)')
      .eq('cotizacion_id', cotizacionId)
      .eq('activo', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('contactos')
      .select('nombre, cargo, correo, telefono')
      .eq('entidad_id', cotizacion.entidad_id)
      .eq('es_principal', true)
      .eq('activo', true)
      .maybeSingle(),
    supabase
      .from('direcciones')
      .select('calle, numero_exterior, numero_interior, colonia, ciudad, entidad_federativa, codigo_postal')
      .eq('entidad_id', cotizacion.entidad_id)
      .eq('es_principal', true)
      .eq('activo', true)
      .maybeSingle(),
    cotizacion.vendedor_id ? supabase.rpc('usuarios_directorio') : Promise.resolve({ data: null }),
  ]);

  let nombreVendedor: string | null = null;
  if (cotizacion.vendedor_id && directorio.data) {
    const fila = (directorio.data as { id: string; full_name: string | null }[]).find(
      (u) => u.id === cotizacion.vendedor_id
    );
    nombreVendedor = fila?.full_name ?? null;
  }

  const lineas = lineasRaw ?? [];

  // Imágenes de producto: una sola consulta por producto_id único (reutiliza
  // el helper ya escrito para /dashboard/productos), preferir la miniatura.
  const productoIds = Array.from(
    new Set(lineas.map((l: any) => l.producto_id).filter((id: unknown): id is string => typeof id === 'string'))
  );
  const conImagen = await adjuntarImagenPrincipal(
    supabase,
    productoIds.map((id) => ({ id }))
  );
  const urlPorProducto = new Map(conImagen.map((p) => [p.id, p.imagen_principal]));

  const idsConDataUri = productoIds.slice(0, IMAGEN_MAX_POR_DOCUMENTO);
  const dataUriPorProducto = new Map<string, string | null>();
  await Promise.all(
    idsConDataUri.map(async (id) => {
      const imagen = urlPorProducto.get(id);
      const url = imagen?.url_miniatura ?? imagen?.url ?? null;
      dataUriPorProducto.set(id, url ? await imagenComoDataUri(url) : null);
    })
  );

  const documentoLineas: DocumentoLinea[] = lineas.map((linea: any) => {
    const producto = Array.isArray(linea.productos) ? linea.productos[0] : linea.productos;
    const marcaProducto = producto
      ? Array.isArray(producto.producto_marcas)
        ? producto.producto_marcas[0]
        : producto.producto_marcas
      : null;
    const unidad = Array.isArray(linea.unidades_medida) ? linea.unidades_medida[0] : linea.unidades_medida;
    const precioUnitario = Number(linea.precio_unitario ?? 0);
    const descuento = Number(linea.descuento_porcentaje ?? 0);
    return {
      id: linea.id,
      sku: producto?.codigo_interno ?? null,
      nombre: producto?.nombre ?? linea.descripcion_libre ?? 'Sin descripción',
      marca: marcaProducto?.nombre ?? null,
      modelo: producto?.modelo ?? null,
      detalle: linea.observaciones ?? null,
      unidad: unidad?.clave ?? null,
      cantidad: Number(linea.cantidad ?? 0),
      precio_unitario: precioUnitario,
      descuento_porcentaje: descuento,
      precio_neto: redondear2(precioUnitario * (1 - descuento / 100)),
      importe: Number(linea.importe ?? 0),
      en_consulta: Boolean(linea.en_consulta),
      imagen: linea.producto_id ? (dataUriPorProducto.get(linea.producto_id) ?? null) : null,
    };
  });

  const subtotal = redondear2(documentoLineas.reduce((s, l) => s + l.importe, 0));
  const iva = redondear2(subtotal * IVA_TASA);
  const total = redondear2(subtotal + iva);

  const direccionArmada = direccion
    ? {
        linea1: [direccion.calle, direccion.numero_exterior, direccion.numero_interior]
          .filter(Boolean)
          .join(' '),
        linea2: direccion.colonia ?? null,
        ciudad: direccion.ciudad ?? null,
        entidad_federativa: direccion.entidad_federativa ?? null,
        codigo_postal: direccion.codigo_postal ?? null,
      }
    : null;

  return {
    id: cotizacion.id,
    folio: cotizacion.folio,
    estado: cotizacion.estado,
    moneda: cotizacion.moneda,
    canal_entrada: cotizacion.canal_entrada ?? null,
    fecha_emision: cotizacion.created_at,
    vigencia_hasta: cotizacion.vigencia_hasta ?? null,
    observaciones: cotizacion.observaciones ?? null,
    cliente: {
      clave: entidad?.clave ?? null,
      siglas: entidad?.siglas ?? null,
      nombre_legal: entidad?.nombre_legal ?? null,
      nombre_comercial: entidad?.nombre_comercial ?? null,
      rfc: entidad?.rfc ?? null,
      correo_principal: entidad?.correo_principal ?? null,
      telefono_principal: entidad?.telefono_principal ?? null,
    },
    credito,
    contacto: contacto ?? null,
    direccion: direccionArmada,
    vendedor: cotizacion.vendedor_id ? { nombre: nombreVendedor } : null,
    lineas: documentoLineas,
    totales: { subtotal, iva_tasa: IVA_TASA, iva, total },
    correo_sugerido: contacto?.correo ?? entidad?.correo_principal ?? null,
  };
}
