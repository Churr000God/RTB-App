import 'server-only';
import puppeteer from 'puppeteer-core';

/**
 * Genera un PDF a partir de HTML autónomo (sin recursos remotos: la
 * plantilla de plantilla-cotizacion.ts inlinea logo/fotos/fuentes como data
 * URI a propósito, para que este render sea 100% offline y determinista).
 *
 * Un browser de Chromium POR REQUEST, no un pool/singleton: este es un ERP
 * interno con un puñado de vendedores — el volumen realista es de unos
 * pocos PDF por hora. Un pool obligaría a resolver reconexión tras un
 * crash de Chromium, fugas de página, e invalidación en el hot-reload de
 * `next dev` (que re-evalúa módulos y dejaría procesos zombis
 * acumulándose en el contenedor). Todo eso es complejidad permanente para
 * ahorrar un arranque de ~1-2s que el usuario ya percibe como "generando
 * documento" — se paga el arranque, se gana que cada PDF empieza en un
 * proceso limpio y que un cuelgue no envenena los siguientes.
 */

const ARGS = [
  '--no-sandbox', // el contenedor corre como usuario no-root (nextjs, uid 1001), sin CAP_SYS_ADMIN
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage', // /dev/shm son 64 MB por defecto en Docker; evita depender de subir shm_size
  '--disable-gpu',
  '--font-render-hinting=none',
];

export async function generarPdfDesdeHtml(html: string): Promise<Buffer> {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser';
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ARGS });
  try {
    const page = await browser.newPage();
    // El documento es estático (todo ya viene resuelto en el HTML) — no
    // necesita JS. Deshabilitarlo es además la segunda capa de defensa
    // (la primera es escaparHtml() en la plantilla) contra un <script>
    // que hubiera llegado a colarse desde un campo de texto libre.
    await page.setJavaScriptEnabled(false);
    // 'load' basta: todo (logo, fotos de producto, fuentes) va inlineado
    // como data URI, sin ningún fetch de red disparado por el HTML.
    await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true, // sin esto se pierden los degradados y los campos de color
      preferCSSPageSize: true, // respeta el @page{size:letter;margin:...} de la plantilla
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width:100%;font-size:8px;color:#6b7280;padding:0 10mm;
          font-family:Arial,sans-serif;display:flex;justify-content:space-between">
          <span>RTB Refacciones</span>
          <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>`,
      timeout: 30_000,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}
