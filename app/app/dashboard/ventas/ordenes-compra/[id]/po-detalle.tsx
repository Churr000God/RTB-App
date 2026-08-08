'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { POEstadoBadge } from '@/components/ventas/estado-badge';
import { ProductoEtiqueta } from '@/components/inventario/producto-etiqueta';
import { Actualizando } from '@/components/ui/actualizando';
import { useAccionServidor } from '@/lib/ui/use-accion-servidor';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import { ArrowLeft, CheckCircle2, FileText, Loader2, Upload, X } from 'lucide-react';

const DOCUMENTO_PO_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
const DOCUMENTO_PO_EXTENSIONES = '.pdf,.jpg,.jpeg,.png';

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  po: any;
  partidas: any[];
}

// po/partidas llegan como props del Server Component — sin espejo en
// useState (el patrón ya establecido en §7.3): cada mutación pasa por
// useAccionServidor(), que hace router.refresh(). Sin diálogo de despacho
// aquí: vive en el detalle del pedido (Almacén entra por ahí, no tiene
// acceso a esta pantalla — ver ACCESO_PANTALLA.ordenes_compra). Sin botón
// de cancelar: la cancelación de negocio real pasa por
// "Cancelar cotización" en el detalle de la cotización.
export function PoDetalle({ po, partidas }: Props) {
  const { ejecutar, ocupado, refrescando, error, setError } = useAccionServidor();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/ventas/ordenes-compra">
          <ArrowLeft className="w-4 h-4 mr-1" /> Órdenes de Compra
        </Link>
      </Button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-3">
            {po.folio}
            <POEstadoBadge estado={po.estado} />
            <Actualizando activo={refrescando} />
          </h1>
          <p className="text-muted-foreground mt-1">
            PO #{po.numero_po} · {po.entidades?.nombre_comercial ?? po.entidades?.nombre_legal} · {po.moneda}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        {po.pedido && (
          <Link
            href={`/dashboard/ventas/pedidos/${po.pedido.id}`}
            className="px-3 py-1.5 bg-rtb-surface/60 rounded-lg text-rtb-teal hover:underline"
          >
            Pedido {po.pedido.folio}
          </Link>
        )}
        {po.cotizacion && (
          <Link
            href={`/dashboard/ventas/cotizaciones/${po.cotizacion.id}`}
            className="px-3 py-1.5 bg-rtb-surface/60 rounded-lg text-rtb-teal hover:underline"
          >
            Cotización {po.cotizacion.folio}
          </Link>
        )}
      </div>

      <DocumentoCard
        poId={po.id}
        tieneDocumento={!!po.evidencia_path}
        cancelada={po.estado === 'cancelada'}
        ejecutar={ejecutar}
        ocupado={ocupado}
        error={error}
        setError={setError}
      />

      <PartidasCard partidas={partidas} moneda={po.moneda} />
    </div>
  );
}

function DocumentoCard({
  poId,
  tieneDocumento,
  cancelada,
  ejecutar,
  ocupado,
  error,
  setError,
}: {
  poId: string;
  tieneDocumento: boolean;
  cancelada: boolean;
  ejecutar: (url: string, init?: RequestInit) => Promise<{ ok: boolean; data: any }>;
  ocupado: boolean;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [viendo, setViendo] = useState(false);

  const elegirArchivo = (file: File | null) => {
    if (!file) return;
    if (!DOCUMENTO_PO_MIMES.includes(file.type)) {
      setError('Sólo se admite PDF, JPG o PNG.');
      return;
    }
    setError(null);
    setArchivo(file);
  };

  // Mismo flujo de 3 pasos que inventario/ajustes/[id]/page.tsx: pedir la
  // URL firmada de SUBIDA, subir directo al bucket desde el navegador, y
  // sólo entonces registrar la ruta (ventas_po_adjuntar_evidencia(), 044) —
  // nunca al revés, para no dejar un estado "fila apunta a un archivo que
  // no llegó a subirse".
  const subir = async () => {
    if (!archivo) return;
    setError(null);
    const resUrl = await fetch('/api/ventas/evidencias/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombreArchivo: archivo.name }),
    });
    const dataUrl = await resUrl.json().catch(() => ({}));
    if (!resUrl.ok) {
      setError(dataUrl?.error ?? 'No se pudo iniciar la subida del documento.');
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const { error: uploadError } = await supabase.storage
      .from('evidencias-ventas')
      .uploadToSignedUrl(dataUrl.path, dataUrl.token, archivo);
    if (uploadError) {
      setError('No se pudo subir el archivo: ' + uploadError.message);
      return;
    }
    const res = await ejecutar(`/api/ventas/ordenes-compra/${poId}/evidencia`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidencia_path: dataUrl.path }),
    });
    if (!res.ok) return;
    toast.success('Documento de PO guardado.');
    setArchivo(null);
  };

  const ver = async () => {
    setViendo(true);
    const res = await fetch(`/api/ventas/ordenes-compra/${poId}/evidencia`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    setViendo(false);
    if (!res.ok) {
      toast.error(data?.error ?? 'No se pudo abrir el documento.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h2 className="text-sm font-display font-semibold text-rtb-navy flex items-center gap-2">
        <FileText className="w-4 h-4" /> Documento de PO del cliente
      </h2>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Input real oculto — la zona de abajo (clic o arrastrar) es lo que
          el usuario ve; nunca el <input type="file"> nativo del navegador. */}
      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENTO_PO_EXTENSIONES}
        className="hidden"
        onChange={(e) => {
          elegirArchivo(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />

      {/* Archivo elegido, todavía sin subir — tiene prioridad sobre
          cualquier otro estado: reemplazar también pasa por aquí. */}
      {archivo ? (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-dashed border-rtb-teal bg-rtb-teal/5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-lg bg-rtb-teal/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-rtb-teal" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-rtb-navy truncate">{archivo.name}</p>
              <p className="text-xs text-muted-foreground">{formatearTamano(archivo.size)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setArchivo(null)}
              disabled={ocupado}
              title="Quitar"
              className="text-muted-foreground hover:text-destructive p-1"
            >
              <X className="w-4 h-4" />
            </button>
            <Button size="sm" onClick={subir} disabled={ocupado} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
              {ocupado ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
              {tieneDocumento ? 'Reemplazar' : 'Subir'}
            </Button>
          </div>
        </div>
      ) : tieneDocumento ? (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-rtb-surface/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-lg bg-rtb-teal/10 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-rtb-teal" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-rtb-navy">Documento adjunto</p>
              <p className="text-xs text-muted-foreground">PDF, JPG o PNG</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={ver} disabled={viendo}>
              {viendo && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Ver documento
            </Button>
            {!cancelada && (
              <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
                Reemplazar
              </Button>
            )}
          </div>
        </div>
      ) : cancelada ? (
        <p className="text-xs text-muted-foreground">Sin documento adjunto.</p>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            elegirArchivo(e.dataTransfer.files?.[0] ?? null);
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-rtb-teal bg-rtb-teal/5' : 'border-border hover:border-rtb-teal/40 hover:bg-rtb-surface/40'
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-rtb-surface flex items-center justify-center">
            <Upload className="w-5 h-5 text-rtb-teal" />
          </div>
          <p className="text-sm text-foreground">
            <span className="text-rtb-teal font-medium">Haz clic para elegir un archivo</span> o arrástralo aquí
          </p>
          <p className="text-xs text-muted-foreground">PDF, JPG o PNG</p>
        </div>
      )}
    </div>
  );
}

function PartidasCard({ partidas, moneda }: { partidas: any[]; moneda: string }) {
  return (
    <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h2 className="text-sm font-display font-semibold text-rtb-navy">
        Partidas — copiadas del pedido al aprobar, no se capturan a mano
      </h2>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground uppercase">
            <th className="py-1">#</th>
            <th className="py-1">Producto</th>
            <th className="py-1 text-right">Cantidad</th>
            <th className="py-1 text-right">Entregado</th>
            <th className="py-1 text-right">Pendiente</th>
            <th className="py-1 text-right">Unitario</th>
            <th className="py-1 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {partidas.map((p) => (
            <tr key={p.id} className="border-t border-border/50">
              <td className="py-2">{p.linea_numero}</td>
              <td className="py-2">
                <ProductoEtiqueta producto={p.productos} descripcion={p.descripcion} productoId={p.producto_id} />
              </td>
              <td className="py-2 text-right tabular-nums">{p.cantidad}</td>
              <td className="py-2 text-right tabular-nums">{p.cantidad_entregada}</td>
              <td className="py-2 text-right tabular-nums">{Number(p.cantidad) - Number(p.cantidad_entregada)}</td>
              <td className="py-2 text-right tabular-nums">{formatearMoneda(p.precio_unitario, moneda)}</td>
              <td className="py-2 text-right tabular-nums font-medium">{formatearMoneda(p.subtotal, moneda)}</td>
            </tr>
          ))}
          {partidas.length === 0 && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-muted-foreground text-xs">
                Sin partidas — es una PO de la Vía A (previa a este cambio).
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
