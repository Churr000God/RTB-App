'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { POEstadoBadge } from '@/components/ventas/estado-badge';
import { ProductoEtiqueta } from '@/components/inventario/producto-etiqueta';
import { ProductoCombobox } from '@/components/inventario/producto-combobox';
import { Actualizando } from '@/components/ui/actualizando';
import { Label } from '@/components/ui/label';
import { useAccionServidor } from '@/lib/ui/use-accion-servidor';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import { PO_ORIGEN_LABELS } from '@/lib/ventas/config';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, FileText, Loader2, Package, Plus, Trash2, Truck, Upload, X,
} from 'lucide-react';

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
  vinculos: any[];
  autorizacionPendiente: any;
  puedeAmpliar: boolean;
  puedeLiberar: boolean;
  puedeCancelarVinculo: boolean;
}

// po/partidas llegan como props del Server Component — sin espejo en
// useState (el patrón ya establecido en §7.3): cada mutación pasa por
// useAccionServidor(), que hace router.refresh(). Sin diálogo de despacho
// aquí: vive en el detalle del pedido (Almacén entra por ahí, no tiene
// acceso a esta pantalla — ver ACCESO_PANTALLA.ordenes_compra). Sin botón
// de cancelar la PO completa en esta entrega (función lista en 048, sin
// consumidor de UI todavía — la cancelación de negocio real pasa por
// "Cancelar cotización" en el detalle de la cotización).
export function PoDetalle({ po, partidas, vinculos, autorizacionPendiente, puedeAmpliar, puedeLiberar, puedeCancelarVinculo }: Props) {
  const { ejecutar, ocupado, refrescando, error, setError } = useAccionServidor();

  const partidasRespaldo = partidas.filter((p) => p.tipo === 'respaldo');
  const partidasCompromiso = partidas.filter((p) => p.tipo !== 'respaldo');
  const vinculoPorPartida = new Map(vinculos.map((v) => [v.po_partida_id, v]));

  const liberar = async () => {
    const res = await ejecutar(`/api/ventas/ordenes-compra/${po.id}/liberar`, { method: 'POST' });
    if (res.ok) toast.success('PO liberada a Almacén.');
  };

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
            PO #{po.numero_po} · {po.entidades?.nombre_comercial ?? po.entidades?.nombre_legal} · {po.moneda} ·{' '}
            {PO_ORIGEN_LABELS[po.origen as keyof typeof PO_ORIGEN_LABELS] ?? po.origen}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {puedeLiberar && po.estado === 'abierta' && partidasCompromiso.length > 0 && (
            <Button onClick={liberar} disabled={ocupado} variant="outline">
              <Truck className="w-4 h-4 mr-2" /> Liberar a Almacén
            </Button>
          )}
          {puedeAmpliar && !['cancelada', 'facturada', 'pagada_cerrada', 'pendiente_de_autorizacion'].includes(po.estado) && (
            <AmpliarDialog poId={po.id} ejecutar={ejecutar} ocupado={ocupado} />
          )}
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

      {po.estado === 'pendiente_de_autorizacion' && autorizacionPendiente && (
        <AutorizacionBanner
          po={po}
          autorizacion={autorizacionPendiente}
          partidasRespaldo={partidasRespaldo}
          ejecutar={ejecutar}
          ocupado={ocupado}
        />
      )}

      <DocumentoCard
        poId={po.id}
        tieneDocumento={!!po.evidencia_path}
        cancelada={po.estado === 'cancelada'}
        ejecutar={ejecutar}
        ocupado={ocupado}
        error={error}
        setError={setError}
      />

      {partidasRespaldo.length > 0 && (
        <RespaldoCard
          partidas={partidasRespaldo}
          vinculoPorPartida={vinculoPorPartida}
          moneda={po.moneda}
          puedeCancelar={puedeCancelarVinculo}
          poId={po.id}
          ejecutar={ejecutar}
          ocupado={ocupado}
        />
      )}

      <PartidasCard partidas={partidasCompromiso} moneda={po.moneda} soloRespaldo={partidas.length > 0 && partidasCompromiso.length === 0} />
    </div>
  );
}

function AutorizacionBanner({
  po,
  autorizacion,
  partidasRespaldo,
  ejecutar,
  ocupado,
}: {
  po: any;
  autorizacion: any;
  partidasRespaldo: any[];
  ejecutar: (url: string, init?: RequestInit) => Promise<{ ok: boolean; data: any }>;
  ocupado: boolean;
}) {
  const rechazada = autorizacion.estado === 'rechazada';
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2 text-amber-800">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">
            {autorizacion.tipo === 'precio_po_divergente' ? 'Precio distinto al de la NR' : 'Ampliación de PO'} —{' '}
            {rechazada ? 'rechazada' : 'esperando autorización de Dirección'}
          </p>
          <p className="mt-0.5">
            {rechazada
              ? 'Corrige el precio abajo para volver a intentar, o solicita una nueva autorización.'
              : 'Esta PO no respalda ninguna NR ni se puede surtir hasta que se resuelva.'}
          </p>
          {!rechazada && (
            <Link href="/dashboard/ventas/autorizaciones" className="text-xs text-rtb-teal hover:underline mt-1 inline-block">
              Ver en la bandeja de autorizaciones →
            </Link>
          )}
        </div>
      </div>
      {rechazada && autorizacion.tipo === 'precio_po_divergente' && (
        <CorregirPrecioForm poId={po.id} partidasRespaldo={partidasRespaldo} ejecutar={ejecutar} ocupado={ocupado} />
      )}
    </div>
  );
}

function CorregirPrecioForm({
  poId,
  partidasRespaldo,
  ejecutar,
  ocupado,
}: {
  poId: string;
  partidasRespaldo: any[];
  ejecutar: (url: string, init?: RequestInit) => Promise<{ ok: boolean; data: any }>;
  ocupado: boolean;
}) {
  const [precios, setPrecios] = useState<Record<string, number>>(() =>
    Object.fromEntries(partidasRespaldo.map((p) => [p.id, Number(p.precio_unitario)]))
  );
  const [motivo, setMotivo] = useState('');

  const corregir = async () => {
    if (motivo.trim().length < 3) {
      toast.error('Describe el motivo de la corrección.');
      return;
    }
    const res = await ejecutar(`/api/ventas/ordenes-compra/${poId}/corregir-precio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partidas: partidasRespaldo.map((p) => ({ po_partida_id: p.id, precio_unitario: precios[p.id] })),
        motivo,
      }),
    });
    if (!res.ok) return;
    if (res.data?.data?.sigue_divergente) {
      toast.warning('Sigue habiendo diferencia de precio — se generó una nueva autorización.');
    } else {
      toast.success('Precio corregido — la PO se descongeló.');
    }
    setMotivo('');
  };

  return (
    <div className="space-y-2 pt-2 border-t border-amber-200">
      {partidasRespaldo.map((p) => (
        <div key={p.id} className="flex items-center gap-3">
          <span className="text-xs flex-1 truncate">{p.productos?.nombre ?? p.descripcion ?? 'Producto'}</span>
          <input
            type="number"
            min={0}
            step="any"
            value={precios[p.id] ?? 0}
            onChange={(e) => setPrecios((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))}
            className="w-28 text-sm border border-border rounded px-2 py-1"
          />
        </div>
      ))}
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo de la corrección"
        className="w-full text-sm border border-border rounded px-2 py-1"
      />
      <Button size="sm" onClick={corregir} disabled={ocupado} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
        Corregir precio
      </Button>
    </div>
  );
}

function AmpliarDialog({
  poId,
  ejecutar,
  ocupado,
}: {
  poId: string;
  ejecutar: (url: string, init?: RequestInit) => Promise<{ ok: boolean; data: any }>;
  ocupado: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [partidas, setPartidas] = useState<
    { key: string; producto_id: string | null; unidad_medida_id: string | null; cantidad: number; precio_unitario: number }[]
  >([]);
  const [motivo, setMotivo] = useState('');

  const agregar = () =>
    setPartidas((prev) => [
      ...prev,
      { key: crypto.randomUUID(), producto_id: null, unidad_medida_id: null, cantidad: 1, precio_unitario: 0 },
    ]);

  const enviar = async () => {
    const validas = partidas.filter((p) => p.producto_id && p.unidad_medida_id && p.cantidad > 0);
    if (validas.length === 0) {
      toast.error('Agrega al menos una partida.');
      return;
    }
    if (motivo.trim().length < 3) {
      toast.error('Describe el motivo de la ampliación.');
      return;
    }
    const res = await ejecutar(`/api/ventas/ordenes-compra/${poId}/ampliar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compromiso_nuevas: validas.map((p) => ({
          producto_id: p.producto_id,
          unidad_medida_id: p.unidad_medida_id,
          cantidad: p.cantidad,
          precio_unitario: p.precio_unitario,
        })),
        motivo,
      }),
    });
    if (!res.ok) return;
    toast.warning('Ampliación solicitada — la PO queda congelada hasta que Dirección la autorice.');
    setAbierto(false);
    setPartidas([]);
    setMotivo('');
  };

  if (!abierto) {
    return (
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <Plus className="w-4 h-4 mr-2" /> Ampliar
      </Button>
    );
  }

  return (
    <div className="w-full bg-white rounded-xl p-5 space-y-3 border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold text-rtb-navy">Ampliar PO — requiere autorización</h3>
        <button onClick={() => setAbierto(false)} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Producto nuevo del catálogo, sin cotización — se materializa sólo si Dirección aprueba.
      </p>
      {partidas.map((p) => (
        <div key={p.key} className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-[11px] text-muted-foreground">Producto</Label>
            <ProductoCombobox
              value={p.producto_id}
              onChange={(id) => {
                if (!id) return;
                fetch(`/api/productos/${id}`)
                  .then((r) => r.json())
                  .then((d) =>
                    setPartidas((prev) =>
                      prev.map((row) => (row.key === p.key ? { ...row, producto_id: id, unidad_medida_id: d.producto?.unidad_medida_id ?? null } : row))
                    )
                  );
              }}
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Cantidad</Label>
            <input
              type="number"
              min={0.0001}
              step="any"
              value={p.cantidad}
              onChange={(e) => setPartidas((prev) => prev.map((row) => (row.key === p.key ? { ...row, cantidad: Number(e.target.value) } : row)))}
              className="w-24 text-sm border border-border rounded px-2 py-1"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Precio</Label>
            <input
              type="number"
              min={0}
              step="any"
              value={p.precio_unitario}
              onChange={(e) =>
                setPartidas((prev) => prev.map((row) => (row.key === p.key ? { ...row, precio_unitario: Number(e.target.value) } : row)))
              }
              className="w-28 text-sm border border-border rounded px-2 py-1"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={() => setPartidas((prev) => prev.filter((row) => row.key !== p.key))}>
            <Trash2 className="w-4 h-4 text-red-600" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={agregar}>
        <Plus className="w-4 h-4 mr-1" /> Agregar partida
      </Button>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo de la ampliación"
        className="w-full text-sm border border-border rounded px-2 py-1"
      />
      <Button onClick={enviar} disabled={ocupado} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
        Solicitar ampliación
      </Button>
    </div>
  );
}

function RespaldoCard({
  partidas,
  vinculoPorPartida,
  moneda,
  puedeCancelar,
  poId,
  ejecutar,
  ocupado,
}: {
  partidas: any[];
  vinculoPorPartida: Map<string, any>;
  moneda: string;
  puedeCancelar: boolean;
  poId: string;
  ejecutar: (url: string, init?: RequestInit) => Promise<{ ok: boolean; data: any }>;
  ocupado: boolean;
}) {
  const cancelar = async (vinculoId: string) => {
    const motivo = window.prompt('Motivo de la cancelación del vínculo:');
    if (!motivo || motivo.trim().length < 3) return;
    const res = await ejecutar(`/api/ventas/ordenes-compra/${poId}/vinculos/${vinculoId}/cancelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
    });
    if (res.ok) toast.success('Vínculo cancelado.');
  };

  return (
    <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h2 className="text-sm font-display font-semibold text-rtb-navy">Respalda entregas ya hechas</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground uppercase">
            <th className="py-1">Producto</th>
            <th className="py-1">NR</th>
            <th className="py-1 text-right">Cantidad</th>
            <th className="py-1 text-right">Precio NR</th>
            <th className="py-1 text-right">Precio PO</th>
            <th className="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {partidas.map((p) => {
            const vinculo = vinculoPorPartida.get(p.id);
            const precioNr = vinculo?.ventas_nr_lineas?.precio_unitario;
            const divergente = precioNr !== undefined && Number(precioNr) !== Number(p.precio_unitario);
            return (
              <tr key={p.id} className="border-t border-border/50">
                <td className="py-2">
                  <ProductoEtiqueta producto={p.productos} descripcion={p.descripcion} productoId={p.producto_id} />
                </td>
                <td className="py-2 text-xs text-muted-foreground">{vinculo?.ventas_nr_lineas?.ventas_notas_remision?.folio ?? '—'}</td>
                <td className="py-2 text-right tabular-nums">{p.cantidad}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{precioNr !== undefined ? formatearMoneda(precioNr, moneda) : '—'}</td>
                <td className={`py-2 text-right tabular-nums ${divergente ? 'text-amber-700 font-medium' : ''}`}>
                  {formatearMoneda(p.precio_unitario, moneda)}
                </td>
                <td className="py-2 text-right">
                  {puedeCancelar && vinculo && (
                    <Button variant="ghost" size="sm" onClick={() => cancelar(vinculo.id)} disabled={ocupado}>
                      Cancelar
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

function PartidasCard({ partidas, moneda, soloRespaldo }: { partidas: any[]; moneda: string; soloRespaldo: boolean }) {
  return (
    <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h2 className="text-sm font-display font-semibold text-rtb-navy flex items-center gap-2">
        <Package className="w-4 h-4" /> Por entregar
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
                {soloRespaldo ? 'Esta PO sólo respalda entregas ya hechas — nada por entregar.' : 'Sin partidas todavía.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
