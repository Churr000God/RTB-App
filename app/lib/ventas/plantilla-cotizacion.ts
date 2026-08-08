import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CANAL_ORIGEN_LABELS } from '@/lib/entidades/config';
import { CLIENTE_TIPO_LABELS, VENTAS_COTIZACION_ESTADO_LABELS } from './config';
import { formatearMoneda } from './validaciones';
import type { DocumentoCotizacion, DocumentoLinea } from './documento-cotizacion';

/**
 * Plantilla del documento comercial de una cotización — una sola función de
 * render, usada tanto por GET /api/ventas/cotizaciones/[id]/pdf (ver/
 * imprimir) como por POST .../correo (adjunto). El diseño de partida lo dio
 * el dueño del proyecto (paleta/tipografías/layout), pero los CAMPOS están
 * adaptados al esquema real de RTB-VEN-01 — el original venía de otro
 * sistema (nombres tipo Notion: `nombre_de_cotizacion`, `po`, `pr`, interés,
 * envío) que no tienen columna aquí:
 *  - PO/PR: no existen en una cotización — la PO del cliente vive en
 *    ventas_ordenes_compra_cliente y aparece DESPUÉS de aprobar.
 *  - Interés/envío: no existen en el esquema — eliminados, sustituidos por
 *    una rejilla con datos reales (vendedor, canal, vigencia, crédito).
 *  - IVA 16% SÍ se conserva: es calculable (IVA_TASA en config.ts) aunque
 *    el esquema no tenga columna de impuesto — el CFDI real es
 *    RTB-PRO-FAC-01, módulo futuro.
 *
 * Paleta: la DIGITAL de app/tailwind.config.ts (coincide con la que ya
 * traía la plantilla del dueño del proyecto), NO la calibrada de
 * contexto/Prompt_Documentos_Impresion_RTB.md — esa está precompensada
 * para una impresora de oficina con deriva de tinta sobre papel bond; este
 * es un PDF digital adjunto a un correo, no una pieza que sale directo de
 * una impresora mal calibrada. No "corregir" estos colores por error.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapa cualquier valor a texto seguro para HTML. Obligatorio en TODO
 *  campo de texto libre del documento (observaciones, descripción de
 *  línea, nombre/cargo de contacto, dirección, asunto/mensaje del correo):
 *  Chromium genera el PDF con `--no-sandbox`, así que esto no es
 *  cosmético — es la defensa real contra HTML/script inyectado desde un
 *  campo de captura. */
export function escaparHtml(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

let logoCache: string | null = null;
async function logoDataUri(): Promise<string | null> {
  if (logoCache) return logoCache;
  try {
    // process.cwd() es /app tanto en el stage `dev` (bind mount ./app:/app)
    // como en `runner` (WORKDIR /app + COPY .../public ./public).
    const buf = await readFile(path.join(process.cwd(), 'public', 'logo-rtb.png'));
    logoCache = `data:image/png;base64,${buf.toString('base64')}`;
    return logoCache;
  } catch {
    // Nunca tumbar el documento por el logo — degradar a texto.
    return null;
  }
}

let fontsCache: string | null = null;
async function fontsCss(): Promise<string> {
  if (fontsCache) return fontsCache;
  try {
    const [inter, playfair] = await Promise.all([
      readFile(path.join(process.cwd(), 'public', 'fonts', 'inter-variable-latin.woff2')),
      readFile(path.join(process.cwd(), 'public', 'fonts', 'playfair-display-variable-latin.woff2')),
    ]);
    const interB64 = inter.toString('base64');
    const playfairB64 = playfair.toString('base64');
    // Fuentes variables auto-hospedadas e inlineadas en base64: el render de
    // Puppeteer queda 100% offline y determinista (sin networkidle0, sin
    // carrera de Google Fonts). Un solo archivo cubre todo el eje de peso;
    // varias reglas @font-face con el mismo `src` (una por peso exacto) es
    // el mismo patrón que emite la propia Google Fonts CSS2 API.
    fontsCache = `
      @font-face{font-family:'Inter';font-style:normal;font-weight:400;font-display:block;
        src:url(data:font/woff2;base64,${interB64}) format('woff2')}
      @font-face{font-family:'Inter';font-style:normal;font-weight:500;font-display:block;
        src:url(data:font/woff2;base64,${interB64}) format('woff2')}
      @font-face{font-family:'Inter';font-style:normal;font-weight:600;font-display:block;
        src:url(data:font/woff2;base64,${interB64}) format('woff2')}
      @font-face{font-family:'Inter';font-style:normal;font-weight:700;font-display:block;
        src:url(data:font/woff2;base64,${interB64}) format('woff2')}
      @font-face{font-family:'Playfair Display';font-style:normal;font-weight:600;font-display:block;
        src:url(data:font/woff2;base64,${playfairB64}) format('woff2')}
      @font-face{font-family:'Playfair Display';font-style:normal;font-weight:700;font-display:block;
        src:url(data:font/woff2;base64,${playfairB64}) format('woff2')}
    `;
    return fontsCache;
  } catch {
    // Fuentes ausentes (p.ej. entorno sin los .woff2 en public/fonts): el
    // documento sigue siendo válido con las pilas de respaldo del CSS.
    return '';
  }
}

function formatearFechaLarga(iso: string | null | undefined): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(fecha);
}

function formatearFechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(fecha);
}

function vigenciaTexto(doc: DocumentoCotizacion): { texto: string; vencida: boolean } {
  if (!doc.vigencia_hasta) return { texto: 'Sujeta a confirmación', vencida: false };
  const hasta = new Date(doc.vigencia_hasta);
  const vencida = !Number.isNaN(hasta.getTime()) && hasta.getTime() < Date.now();
  return { texto: formatearFechaCorta(doc.vigencia_hasta), vencida };
}

function filaProducto(linea: DocumentoLinea, indice: number): string {
  const nombreCompleto = [linea.nombre, linea.marca, linea.modelo].filter(Boolean).join(' · ');
  const imagenHtml = linea.imagen
    ? `<img src="${escaparHtml(linea.imagen)}" alt="" style="width:34px;height:34px;object-fit:cover;border-radius:6px;border:1px solid var(--linea)">`
    : `<span style="display:block;width:34px;height:34px;border-radius:6px;background:var(--superficie);border:1px solid var(--linea)"></span>`;
  const etiquetaConsulta = linea.en_consulta
    ? '<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:var(--oro-100);border:1px solid var(--oro-300);color:var(--navy-medio);font-size:8px;font-weight:600;letter-spacing:.06em;text-transform:uppercase">En consulta</span>'
    : '';
  const detalle = linea.detalle
    ? `<span style="display:block;font-size:9px;color:var(--navy-300)">${escaparHtml(linea.detalle)}</span>`
    : '';
  // Una línea en_consulta no tiene precio todavía (Compras aún no
  // responde) — mostrar "—", nunca "$0.00": no es gratis, es desconocido.
  const precioUnitarioTexto = linea.en_consulta ? '—' : formatearMoneda(linea.precio_unitario, 'MXN');
  const precioNetoTexto = linea.en_consulta ? '—' : formatearMoneda(linea.precio_neto, 'MXN');
  const importeTexto = linea.en_consulta ? '—' : formatearMoneda(linea.importe, 'MXN');
  return `
    <tr style="border-bottom:1px solid var(--linea)">
      <td style="padding:7px 8px;text-align:center;color:var(--navy-medio);font-size:10px">${indice}</td>
      <td style="padding:7px 8px">${imagenHtml}</td>
      <td style="padding:7px 8px;white-space:nowrap;font-weight:600;color:var(--navy)">${escaparHtml(linea.sku ?? '—')}</td>
      <td style="padding:7px 8px;color:var(--navy)">${escaparHtml(nombreCompleto)}${etiquetaConsulta}${detalle}</td>
      <td style="padding:7px 8px;text-align:center;color:var(--navy)">${escaparHtml(linea.cantidad)}${linea.unidad ? ` ${escaparHtml(linea.unidad)}` : ''}</td>
      <td style="padding:7px 8px;text-align:right;color:var(--navy)">${escaparHtml(precioUnitarioTexto)}</td>
      <td style="padding:7px 8px;text-align:right;color:var(--navy-medio)">${linea.descuento_porcentaje > 0 ? `${linea.descuento_porcentaje.toFixed(2)}%` : '—'}</td>
      <td style="padding:7px 8px;text-align:right;color:var(--navy)">${escaparHtml(precioNetoTexto)}</td>
      <td style="padding:7px 8px;text-align:right;font-weight:600;color:var(--navy)">${escaparHtml(importeTexto)}</td>
    </tr>`;
}

function selloEstado(doc: DocumentoCotizacion): string {
  if (doc.estado === 'enviada' || doc.estado === 'aprobada') return '';
  const textos: Record<string, string> = {
    borrador: 'BORRADOR — documento sin validez comercial',
    rechazada: 'COTIZACIÓN RECHAZADA',
    expirada: 'COTIZACIÓN EXPIRADA',
    cancelada: 'COTIZACIÓN CANCELADA',
    en_devolucion: 'PEDIDO EN DEVOLUCIÓN',
  };
  const texto = textos[doc.estado] ?? `ESTADO: ${VENTAS_COTIZACION_ESTADO_LABELS[doc.estado as keyof typeof VENTAS_COTIZACION_ESTADO_LABELS] ?? doc.estado}`;
  return `
    <div style="background:#7A2E2E;color:#FFFFFF;text-align:center;padding:6px 12px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border-radius:8px;margin-bottom:10px">
      ${escaparHtml(texto)}
    </div>`;
}

export async function renderCotizacionHtml(doc: DocumentoCotizacion): Promise<string> {
  const [logo, fuentes] = await Promise.all([logoDataUri(), fontsCss()]);
  const logoHtml = logo
    ? `<img src="${logo}" alt="Refacciones Tomás Badillo" style="width:78px;height:78px;object-fit:contain;display:block">`
    : `<span style="font-family:'Playfair Display',Georgia,serif;font-size:20px;font-weight:700;color:var(--navy)">RTB</span>`;

  const vigencia = vigenciaTexto(doc);
  const nombreCliente = doc.cliente.nombre_comercial || doc.cliente.nombre_legal || 'Cliente';
  const direccionTexto = doc.direccion
    ? [doc.direccion.linea1, doc.direccion.linea2, doc.direccion.ciudad, doc.direccion.entidad_federativa, doc.direccion.codigo_postal]
        .filter(Boolean)
        .join(', ')
    : '—';
  const creditoTexto = doc.credito
    ? `${CLIENTE_TIPO_LABELS[doc.credito.tipo_cliente as keyof typeof CLIENTE_TIPO_LABELS] ?? doc.credito.tipo_cliente ?? '—'}${doc.credito.dias_credito ? ` · ${doc.credito.dias_credito} días` : ''}`
    : '—';
  const canalTexto = doc.canal_entrada
    ? (CANAL_ORIGEN_LABELS[doc.canal_entrada as keyof typeof CANAL_ORIGEN_LABELS] ?? doc.canal_entrada)
    : '—';

  const filasProductos = doc.lineas.length
    ? doc.lineas.map((l, i) => filaProducto(l, i + 1)).join('')
    : `<tr><td colspan="9" style="padding:16px;text-align:center;color:var(--navy-300);font-size:11px">Sin partidas</td></tr>`;

  const notasTexto = doc.observaciones ? escaparHtml(doc.observaciones) : 'Sin notas adicionales.';

  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<title>Cotización ${escaparHtml(doc.folio)}</title>
<style>
  ${fuentes}
  :root{
    --teal:#159895; --teal-light:#57C5B6;
    --blanco:#FFFFFF; --superficie:#EEF8F7;
    --navy-medio:#1A5F7A; --navy:#002B5B; --navy-300:#5B87A0;
    --oro:#AD9551; --oro-300:#C9B784; --oro-100:#F3EEE1;
    --linea:#D8E2EA;
    --font-title:'Playfair Display',Georgia,'Times New Roman',serif;
    --font-body:'Inter',system-ui,'Noto Sans',sans-serif;
  }
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:#FFFFFF;font-family:var(--font-body);color:var(--navy);line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h1,h2{font-family:var(--font-title)}
  .num{font-variant-numeric:tabular-nums}
  @page{size:letter;margin:12mm 10mm 16mm 10mm}
  thead{display:table-header-group}
  tr,.bloque{break-inside:avoid;page-break-inside:avoid}
</style>
</head>
<body>
<div style="width:100%;font-size:11px;line-height:1.5">

  ${selloEstado(doc)}

  <div style="background:linear-gradient(135deg,var(--navy) 0%,var(--navy) 25%,var(--teal) 75%,var(--teal) 100%);border-bottom:3px solid var(--oro);padding:16px 20px 14px;display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;border-radius:10px 10px 0 0" class="bloque">
    <div>
      <h1 style="font-size:20px;font-weight:700;line-height:1.2;color:#FFFFFF">Refacciones Tomás Badillo, S.A. de C.V.</h1>
      <p style="margin:6px 0 0;color:#EAF4F3;font-size:9.5px;line-height:1.6">T. 55 4004 4707 &nbsp;·&nbsp; refacrtb.com.mx</p>
      <p style="margin:0;color:#EAF4F3;font-size:9.5px;line-height:1.6">Av. Hda. de Sotelo Secc. 2 Mz. 3 Casa 10, U. Hab. Fco. Villa, Azcapotzalco, C.P. 02420, Ciudad de México</p>
      <span style="display:inline-block;margin-top:7px;padding:2px 9px;border:1px solid var(--oro-300);border-radius:999px;background:#1F446F;color:#EAF4F3;font-size:9px;font-weight:600;letter-spacing:.08em;text-transform:uppercase">RFC RTB181127HC7</span>
    </div>
    <div style="width:96px;height:96px;border-radius:50%;background:#FFFFFF;padding:9px;display:flex;align-items:center;justify-content:center">
      ${logoHtml}
    </div>
  </div>

  <div style="padding:14px 4px 4px">

    <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:8px 0;border-bottom:1px solid var(--linea);margin-bottom:10px" class="bloque">
      <div>
        <span style="font-size:9.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--teal)">Cotización · Documento comercial</span>
        <span style="display:block;margin-top:4px;font-size:10.5px;color:var(--navy-medio)">Ciudad de México, a <b style="color:var(--navy)">${formatearFechaLarga(doc.fecha_emision)}</b></span>
      </div>
      <div style="text-align:right">
        <span style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--navy-300)">No. de cotización</span>
        <span class="num" style="display:block;font-family:var(--font-title);font-size:18px;font-weight:700;color:var(--navy)">${escaparHtml(doc.folio)}</span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;background:var(--superficie);border-left:4px solid var(--teal);border-radius:0 10px 10px 0;padding:12px 16px;margin-bottom:10px" class="bloque">
      <div style="grid-column:1/-1;font-size:9.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--navy-medio)">Datos del cliente</div>
      <div><label style="display:block;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--navy-300)">Cliente</label><span style="font-size:11px;font-weight:600;color:var(--navy)">${escaparHtml(nombreCliente)}${doc.cliente.siglas ? ` (${escaparHtml(doc.cliente.siglas)})` : ''}</span></div>
      <div><label style="display:block;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--navy-300)">Clave</label><span class="num" style="font-size:11px;font-weight:600;color:var(--navy)">${escaparHtml(doc.cliente.clave ?? '—')}</span></div>
      <div><label style="display:block;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--navy-300)">Razón social</label><span style="font-size:11px;font-weight:600;color:var(--navy)">${escaparHtml(doc.cliente.nombre_legal ?? '—')}</span></div>
      <div><label style="display:block;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--navy-300)">RFC</label><span class="num" style="font-size:11px;font-weight:600;color:var(--navy)">${escaparHtml(doc.cliente.rfc ?? '—')}</span></div>
      <div><label style="display:block;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--navy-300)">Contacto</label><span style="font-size:11px;font-weight:600;color:var(--navy)">${escaparHtml(doc.contacto?.nombre ?? '—')}${doc.contacto?.cargo ? ` (${escaparHtml(doc.contacto.cargo)})` : ''}</span></div>
      <div><label style="display:block;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--navy-300)">Teléfono / correo</label><span style="font-size:11px;font-weight:600;color:var(--navy)">${escaparHtml(doc.contacto?.telefono ?? doc.cliente.telefono_principal ?? '—')} · ${escaparHtml(doc.contacto?.correo ?? doc.cliente.correo_principal ?? '—')}</span></div>
      <div style="grid-column:1/-1"><label style="display:block;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--navy-300)">Dirección</label><span style="font-size:11px;font-weight:600;color:var(--navy)">${escaparHtml(direccionTexto)}</span></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px" class="bloque">
      <div style="background:var(--superficie);border-left:3px solid var(--teal-light);border-radius:0 8px 8px 0;padding:8px 12px"><label style="display:block;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--navy-300)">Vendedor</label><span style="font-size:11px;font-weight:600;color:var(--navy)">${escaparHtml(doc.vendedor?.nombre ?? '—')}</span></div>
      <div style="background:var(--superficie);border-left:3px solid var(--teal-light);border-radius:0 8px 8px 0;padding:8px 12px"><label style="display:block;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--navy-300)">Canal</label><span style="font-size:11px;font-weight:600;color:var(--navy)">${escaparHtml(canalTexto)}</span></div>
      <div style="background:var(--superficie);border-left:3px solid var(--teal-light);border-radius:0 8px 8px 0;padding:8px 12px"><label style="display:block;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--navy-300)">Vigencia</label><span style="font-size:11px;font-weight:600;color:${vigencia.vencida ? '#7A2E2E' : 'var(--navy)'}">${escaparHtml(vigencia.texto)}${vigencia.vencida ? ' (vencida)' : ''}</span></div>
      <div style="background:var(--superficie);border-left:3px solid var(--teal-light);border-radius:0 8px 8px 0;padding:8px 12px"><label style="display:block;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--navy-300)">Condiciones</label><span style="font-size:11px;font-weight:600;color:var(--navy)">${escaparHtml(creditoTexto)}</span></div>
    </div>

    <div style="display:flex;align-items:baseline;gap:10px;border-bottom:1px solid var(--linea);padding-bottom:6px;margin-bottom:9px" class="bloque">
      <span style="font-family:var(--font-title);font-size:14px;font-weight:700;color:var(--oro)">I</span>
      <h2 style="font-size:16px;font-weight:600;color:var(--navy)">Partidas solicitadas</h2>
      <span style="margin-left:auto;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:var(--navy-medio);border:1px solid var(--oro-300);background:var(--oro-100);border-radius:999px;padding:2px 9px">Precios en ${escaparHtml(doc.moneda)}</span>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:10px">
      <thead>
        <tr style="background:var(--navy)">
          <th style="padding:7px 8px;text-align:center;color:#EAF4F3;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase">#</th>
          <th style="padding:7px 8px;text-align:left;color:#EAF4F3;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase">Img</th>
          <th style="padding:7px 8px;text-align:left;color:#EAF4F3;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap">SKU</th>
          <th style="padding:7px 8px;text-align:left;color:#EAF4F3;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase">Producto / Descripción</th>
          <th style="padding:7px 8px;text-align:center;color:#EAF4F3;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase">Cant.</th>
          <th style="padding:7px 8px;text-align:right;color:#EAF4F3;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap">P. unitario</th>
          <th style="padding:7px 8px;text-align:right;color:#EAF4F3;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase">Desc.</th>
          <th style="padding:7px 8px;text-align:right;color:#EAF4F3;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap">P. neto</th>
          <th style="padding:7px 8px;text-align:right;color:#EAF4F3;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase">Importe</th>
        </tr>
      </thead>
      <tbody>${filasProductos}</tbody>
    </table>

    <div style="display:flex;justify-content:flex-end;margin-top:10px" class="bloque">
      <div style="min-width:260px">
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11.5px;color:var(--navy-medio)"><span>Subtotal</span><span class="num" style="font-weight:600;color:var(--navy)">${escaparHtml(formatearMoneda(doc.totales.subtotal, doc.moneda))}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11.5px;color:var(--navy-medio)"><span>IVA (${(doc.totales.iva_tasa * 100).toFixed(0)}%)</span><span class="num" style="font-weight:600;color:var(--navy)">${escaparHtml(formatearMoneda(doc.totales.iva, doc.moneda))}</span></div>
        <div style="display:flex;justify-content:space-between;border-top:1.5px solid var(--oro);margin-top:6px;padding-top:8px;font-family:var(--font-title);font-size:16px;font-weight:700;color:var(--navy)"><span>Total</span><span class="num">${escaparHtml(formatearMoneda(doc.totales.total, doc.moneda))}</span></div>
      </div>
    </div>

    <div style="background:var(--navy);border-radius:12px;padding:12px 18px;margin-top:14px;display:flex;gap:12px;align-items:flex-start" class="bloque">
      <span style="width:3px;align-self:stretch;background:var(--oro);border-radius:2px"></span>
      <p style="font-family:var(--font-title);font-size:12.5px;line-height:1.5;color:#FFFFFF">Continuidad y cero riesgo de refaccionamiento. Un hotel no puede detenerse; nosotros tampoco.</p>
    </div>

    <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px" class="bloque">
      <div style="background:var(--superficie);border-left:3px solid var(--oro);border-radius:0 8px 8px 0;padding:10px 14px">
        <div style="font-size:9px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--navy-medio);margin-bottom:5px">Notas adicionales</div>
        <p style="font-size:10px;color:var(--navy-medio);line-height:1.6">${notasTexto}</p>
      </div>
      <div style="background:var(--superficie);border-left:3px solid var(--oro);border-radius:0 8px 8px 0;padding:10px 14px">
        <div style="font-size:9px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--navy-medio);margin-bottom:5px">Condiciones</div>
        <p style="font-size:10px;color:var(--navy-medio);line-height:1.6"><b style="color:var(--navy)">Vigencia:</b> ${escaparHtml(vigencia.texto)}${vigencia.vencida ? ' (vencida)' : ''}.<br><b style="color:var(--navy)">Proceso:</b> contra entrega o según condiciones pactadas.<br><b style="color:var(--navy)">Precios:</b> en ${escaparHtml(doc.moneda)}, más IVA.</p>
      </div>
    </div>

    <!-- Sin línea de marca aparte aquí a propósito: el pie real del PDF
         (generar-pdf.ts, footerTemplate) ya imprime "RTB Refacciones ·
         Página X de Y" en cada hoja — repetirlo en el contenido empujaba
         una cotización de una sola página a desbordar una segunda hoja
         casi en blanco sólo para esta línea. La voluta dorada se queda
         como remate visual, sin texto debajo. -->
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:10px">
      <span style="display:block;height:1px;width:80px;background:var(--oro)"></span>
      <span style="display:block;width:5px;height:5px;border-radius:50%;background:var(--oro)"></span>
      <span style="display:block;height:1px;width:80px;background:var(--oro)"></span>
    </div>

  </div>
</div>
</body></html>`;
}
