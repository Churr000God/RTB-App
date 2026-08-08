export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // explícito: puppeteer-core no corre en el runtime edge

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireApiRole } from '@/lib/supabase/guards';
import { ACCESO_PANTALLA } from '@/lib/ventas/permisos';
import { armarDocumentoCotizacion } from '@/lib/ventas/documento-cotizacion';
import { renderCotizacionHtml } from '@/lib/ventas/plantilla-cotizacion';
import { generarPdfDesdeHtml } from '@/lib/ventas/generar-pdf';

// GET - documento comercial de la cotización (ver/imprimir): abre en una
// pestaña nueva y el propio visor de PDF del navegador da "imprimir" y
// "descargar" gratis, sin JS adicional en el cliente. Disponible en
// CUALQUIER estado de la cotización (la plantilla dibuja un sello de
// BORRADOR/CANCELADA/etc. cuando aplica) — ver es de lectura, la misma
// barrera de ACCESO_PANTALLA.cotizaciones que ya protege el resto del
// módulo, no una regla nueva.
//
// ?html=1 devuelve el MISMO render como text/html en vez de PDF — vía
// barata de depurar la plantilla sin Chromium de por medio, y plan B si
// Puppeteer resultara inviable en algún hosting futuro (el usuario podría
// imprimir con Ctrl+P del navegador).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { response } = await requireApiRole(ACCESO_PANTALLA.cotizaciones);
    if (response) return response;

    const supabase = createSupabaseServerClient();
    const doc = await armarDocumentoCotizacion(supabase, params.id);
    if (!doc) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });

    const html = await renderCotizacionHtml(doc);

    const { searchParams } = new URL(request.url);
    if (searchParams.get('html') === '1') {
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const descargar = searchParams.get('descargar') === '1';
    const pdf = await generarPdfDesdeHtml(html);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${descargar ? 'attachment' : 'inline'}; filename="${doc.folio}.pdf"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    // Loguear completo en servidor: "spawn ENOENT" (Chromium ausente) es
    // el fallo esperado #1 tras un despliegue nuevo, y sólo se ve aquí.
    console.error('[ventas/cotizaciones/pdf] Error generando PDF:', err);
    return NextResponse.json({ error: `No se pudo generar el documento: ${err?.message ?? err}` }, { status: 500 });
  }
}
