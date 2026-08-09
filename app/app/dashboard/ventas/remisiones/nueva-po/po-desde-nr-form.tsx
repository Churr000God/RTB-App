'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, FileText, Loader2, Plus, Trash2, Truck,
} from 'lucide-react';
import { EntidadCombobox } from '@/components/ventas/entidad-combobox';
import { ProductoCombobox } from '@/components/inventario/producto-combobox';
import { CANAL_ORIGENES, type CanalOrigen } from '@/types/entidades';
import { CANAL_ORIGEN_LABELS } from '@/lib/entidades/config';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import type { CotizacionListadoRow, CotizacionLineaRow, NrLineaDisponibleRow } from '@/types/ventas';

const SELECT_CLASES = 'text-sm border border-border rounded-lg px-3 py-2 bg-white w-full';

interface SeleccionRespaldo {
  incluida: boolean;
  cantidad: number;
  precio_unitario: number;
}

interface PartidaNueva {
  key: string;
  producto_id: string | null;
  producto_label: string | null;
  cantidad: number;
  unidad_medida_id: string | null;
  precio_unitario: number;
  codigo_cliente: string;
}

function nuevaPartida(): PartidaNueva {
  return {
    key: crypto.randomUUID(),
    producto_id: null,
    producto_label: null,
    cantidad: 1,
    unidad_medida_id: null,
    precio_unitario: 0,
    codigo_cliente: '',
  };
}

export function PoDesdeNrForm({
  entidadIdInicial,
  nrIdInicial,
  entidadLabelInicial,
}: {
  entidadIdInicial: string | null;
  nrIdInicial: string | null;
  entidadLabelInicial: string | null;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Paso 1: cliente + datos de la PO ----
  const [entidadId, setEntidadId] = useState<string | null>(entidadIdInicial);
  const [numeroPo, setNumeroPo] = useState('');
  const [fechaPo, setFechaPo] = useState('');
  const [canalEntrega, setCanalEntrega] = useState<CanalOrigen | ''>('');
  const [moneda, setMoneda] = useState('MXN');
  const [razonSocialDeclarada, setRazonSocialDeclarada] = useState('');
  const [rfcDeclarado, setRfcDeclarado] = useState('');
  const [evidenciaPath, setEvidenciaPath] = useState<string | null>(null);
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false);

  // ---- Paso 2: NR y partidas de respaldo ----
  const [lineasDisponibles, setLineasDisponibles] = useState<NrLineaDisponibleRow[]>([]);
  const [cargandoLineas, setCargandoLineas] = useState(false);
  const [seleccionRespaldo, setSeleccionRespaldo] = useState<Record<string, SeleccionRespaldo>>({});

  // ---- Paso 3: partidas por entregar ----
  const [subPestana, setSubPestana] = useState<'cotizacion' | 'nuevas'>('cotizacion');
  const [cotizacionesDisponibles, setCotizacionesDisponibles] = useState<CotizacionListadoRow[]>([]);
  const [cargandoCotizaciones, setCargandoCotizaciones] = useState(false);
  const [cotizacionSeleccionadaId, setCotizacionSeleccionadaId] = useState<string | null>(null);
  const [cotizacionLineas, setCotizacionLineas] = useState<CotizacionLineaRow[]>([]);
  const [cargandoCotizacionLineas, setCargandoCotizacionLineas] = useState(false);
  const [lineasCotizacionIncluidas, setLineasCotizacionIncluidas] = useState<Record<string, boolean>>({});
  const [canalAprobacionCotizacion, setCanalAprobacionCotizacion] = useState<CanalOrigen | ''>('');
  const [partidasNuevas, setPartidasNuevas] = useState<PartidaNueva[]>([]);

  // Cargar líneas de NR disponibles y cotizaciones 'enviada' del cliente en
  // cuanto se elige el cliente en el paso 1 — ambas dependen sólo de
  // entidadId, así que se piden una vez, no en cada cambio de paso.
  useEffect(() => {
    if (!entidadId) {
      setLineasDisponibles([]);
      setCotizacionesDisponibles([]);
      return;
    }
    setCargandoLineas(true);
    const nrParam = nrIdInicial ? `&nr_ids=${nrIdInicial}` : '';
    fetch(`/api/ventas/notas-remision/lineas-disponibles?entidad_id=${entidadId}${nrParam}`)
      .then((r) => r.json())
      .then((d) => setLineasDisponibles(d.data ?? []))
      .finally(() => setCargandoLineas(false));

    setCargandoCotizaciones(true);
    fetch(`/api/ventas/cotizaciones?vista=lista&estado=enviada&entidad_id=${entidadId}`)
      .then((r) => r.json())
      .then((d) => setCotizacionesDisponibles(d.data ?? []))
      .finally(() => setCargandoCotizaciones(false));
  }, [entidadId, nrIdInicial]);

  useEffect(() => {
    if (!cotizacionSeleccionadaId) {
      setCotizacionLineas([]);
      setLineasCotizacionIncluidas({});
      return;
    }
    setCargandoCotizacionLineas(true);
    fetch(`/api/ventas/cotizaciones/${cotizacionSeleccionadaId}`)
      .then((r) => r.json())
      .then((d) => {
        const lineas = (d.lineas ?? []) as CotizacionLineaRow[];
        setCotizacionLineas(lineas.filter((l) => l.activo));
        setLineasCotizacionIncluidas(Object.fromEntries(lineas.filter((l) => l.activo).map((l) => [l.id, true])));
      })
      .finally(() => setCargandoCotizacionLineas(false));
  }, [cotizacionSeleccionadaId]);

  async function subirEvidencia(file: File) {
    setSubiendoEvidencia(true);
    setError(null);
    try {
      const res = await fetch('/api/ventas/evidencias/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombreArchivo: file.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'No se pudo iniciar la subida.');
      const put = await fetch(data.signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!put.ok) throw new Error('No se pudo subir el archivo.');
      setEvidenciaPath(data.path);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo subir el archivo.');
    } finally {
      setSubiendoEvidencia(false);
    }
  }

  const respaldoSeleccionado = useMemo(
    () =>
      lineasDisponibles
        .filter((l) => seleccionRespaldo[l.nr_linea_id]?.incluida)
        .map((l) => ({
          nr_linea_id: l.nr_linea_id,
          cantidad: seleccionRespaldo[l.nr_linea_id].cantidad,
          precio_unitario: seleccionRespaldo[l.nr_linea_id].precio_unitario,
          _linea: l,
        })),
    [lineasDisponibles, seleccionRespaldo]
  );

  const divergenciasRespaldo = respaldoSeleccionado.filter((r) => r.precio_unitario !== r._linea.precio_unitario);

  const compromisoNuevasValidas = partidasNuevas.filter(
    (p) => p.producto_id && p.unidad_medida_id && p.cantidad > 0
  );
  const lineasCotizacionSeleccionadas = cotizacionLineas.filter((l) => lineasCotizacionIncluidas[l.id]);

  const totalCalculado =
    respaldoSeleccionado.reduce((n, r) => n + r.cantidad * r.precio_unitario, 0) +
    compromisoNuevasValidas.reduce((n, p) => n + p.cantidad * p.precio_unitario, 0) +
    lineasCotizacionSeleccionadas.reduce((n, l) => n + (l.importe ?? 0), 0);

  const hayAlMenosUnaPartida =
    respaldoSeleccionado.length > 0 || compromisoNuevasValidas.length > 0 || (cotizacionSeleccionadaId && lineasCotizacionSeleccionadas.length > 0);

  function puedeAvanzarDe(p: 1 | 2 | 3 | 4): boolean {
    if (p === 1) return !!entidadId && numeroPo.trim().length > 0;
    return true; // respaldo (2) y compromiso (3) son opcionales entre sí, ver hayAlMenosUnaPartida en el paso 4
  }

  async function registrarPo() {
    if (!entidadId) return;
    setEnviando(true);
    setError(null);

    const payload: Record<string, any> = {
      entidad_id: entidadId,
      numero_po: numeroPo,
      moneda,
      fecha_po: fechaPo || undefined,
      canal_entrega: canalEntrega || undefined,
      evidencia_path: evidenciaPath || undefined,
      razon_social_declarada: razonSocialDeclarada || undefined,
      rfc_declarado: rfcDeclarado || undefined,
      respaldo: respaldoSeleccionado.map((r) => ({
        nr_linea_id: r.nr_linea_id,
        cantidad: r.cantidad,
        precio_unitario: r.precio_unitario,
      })),
      compromiso_nuevas: compromisoNuevasValidas.map((p) => ({
        producto_id: p.producto_id,
        cantidad: p.cantidad,
        unidad_medida_id: p.unidad_medida_id,
        precio_unitario: p.precio_unitario,
        codigo_cliente: p.codigo_cliente || undefined,
      })),
    };
    if (cotizacionSeleccionadaId && lineasCotizacionSeleccionadas.length > 0) {
      payload.compromiso_cotizacion = {
        cotizacion_id: cotizacionSeleccionadaId,
        lineas_incluidas: lineasCotizacionSeleccionadas.map((l) => l.id),
        aprobacion: { canal: canalAprobacionCotizacion || canalEntrega || 'correo' },
      };
    }

    const res = await fetch('/api/ventas/ordenes-compra', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo registrar la orden de compra.');
      return;
    }

    if (data.data?.estado === 'pendiente_de_autorizacion') {
      toast.warning(`PO ${data.data.po_folio} registrada — congelada hasta que Dirección autorice el precio divergente.`);
    } else {
      toast.success(`PO ${data.data?.po_folio ?? ''} registrada.`);
    }
    router.push(`/dashboard/ventas/ordenes-compra/${data.data.po_id}`);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/ventas/remisiones">
          <ArrowLeft className="w-4 h-4 mr-1" /> Notas de Remisión
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <Truck className="w-6 h-6" /> Registrar orden de compra del cliente
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Para cuando la PO física llega DESPUÉS de una o varias notas de remisión ya emitidas — no se rellena como
          una cotización nueva.
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        {(['Cliente y PO', 'Respaldar entregas', 'Por entregar', 'Resumen'] as const).map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center ${
                paso === i + 1 ? 'bg-rtb-teal text-white' : paso > i + 1 ? 'bg-rtb-teal/20 text-rtb-teal' : 'bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}
            </span>
            <span className={paso === i + 1 ? 'text-rtb-navy' : 'text-muted-foreground'}>{label}</span>
            {i < 3 && <span className="text-muted-foreground mx-1">—</span>}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        {paso === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold text-rtb-navy-mid">Cliente</Label>
              <div className="mt-1">
                <EntidadCombobox value={entidadId} onChange={(id) => setEntidadId(id)} />
              </div>
              {/* EntidadCombobox no expone forma de mostrar un value preseleccionado
                  sin que el usuario busque primero — entidadId ya queda bien puesto
                  (lo confirman los pasos 2/3), esto es sólo para que no parezca vacío
                  cuando se llega desde "Registrar PO" en el detalle de una NR. */}
              {entidadId === entidadIdInicial && entidadLabelInicial && (
                <p className="text-xs text-muted-foreground mt-1">Cliente preseleccionado: {entidadLabelInicial}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold text-rtb-navy-mid">Número de PO del cliente</Label>
                <input
                  value={numeroPo}
                  onChange={(e) => setNumeroPo(e.target.value)}
                  className={`${SELECT_CLASES} mt-1`}
                  placeholder="Ej. OC-4821"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-rtb-navy-mid">Fecha de la PO</Label>
                <input type="date" value={fechaPo} onChange={(e) => setFechaPo(e.target.value)} className={`${SELECT_CLASES} mt-1`} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-rtb-navy-mid">Canal de entrega</Label>
                <select value={canalEntrega} onChange={(e) => setCanalEntrega(e.target.value as CanalOrigen)} className={`${SELECT_CLASES} mt-1`}>
                  <option value="">Sin especificar</option>
                  {CANAL_ORIGENES.map((c) => (
                    <option key={c} value={c}>
                      {CANAL_ORIGEN_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-rtb-navy-mid">Moneda</Label>
                <input value={moneda} onChange={(e) => setMoneda(e.target.value.toUpperCase())} maxLength={3} className={`${SELECT_CLASES} mt-1`} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-rtb-navy-mid">Razón social declarada (opcional)</Label>
                <input
                  value={razonSocialDeclarada}
                  onChange={(e) => setRazonSocialDeclarada(e.target.value)}
                  className={`${SELECT_CLASES} mt-1`}
                  placeholder="Se usa la del cliente si se deja vacío"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-rtb-navy-mid">RFC declarado (opcional)</Label>
                <input value={rfcDeclarado} onChange={(e) => setRfcDeclarado(e.target.value.toUpperCase())} className={`${SELECT_CLASES} mt-1`} />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-rtb-navy-mid">Documento de la PO (opcional)</Label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => e.target.files?.[0] && subirEvidencia(e.target.files[0])}
                  className="text-sm"
                />
                {subiendoEvidencia && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                {evidenciaPath && !subiendoEvidencia && (
                  <span className="text-xs text-green-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Adjuntado
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">También se puede subir después desde el detalle de la PO.</p>
            </div>
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Líneas de NR de este cliente con cantidad entregada todavía sin respaldar por una PO. Una línea ya
              cubierta por completo no aparece.
            </p>
            {cargandoLineas && (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!cargandoLineas && lineasDisponibles.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Este cliente no tiene entregas pendientes de respaldar.
              </p>
            )}
            {!cargandoLineas && lineasDisponibles.length > 0 && (
              <div className="border border-border rounded-lg divide-y divide-border">
                {lineasDisponibles.map((l) => {
                  const sel = seleccionRespaldo[l.nr_linea_id] ?? {
                    incluida: false,
                    cantidad: l.disponible,
                    precio_unitario: l.precio_unitario,
                  };
                  const divergente = sel.incluida && sel.precio_unitario !== l.precio_unitario;
                  return (
                    <div key={l.nr_linea_id} className="p-3 flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={sel.incluida}
                        onChange={(e) =>
                          setSeleccionRespaldo((prev) => ({
                            ...prev,
                            [l.nr_linea_id]: {
                              incluida: e.target.checked,
                              cantidad: prev[l.nr_linea_id]?.cantidad ?? l.disponible,
                              precio_unitario: prev[l.nr_linea_id]?.precio_unitario ?? l.precio_unitario,
                            },
                          }))
                        }
                        className="mt-1 w-4 h-4 rounded border-border text-rtb-teal focus:ring-rtb-teal"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-sm font-medium">{l.producto_nombre}</span>
                            <span className="text-xs text-muted-foreground ml-2 tabular-nums">{l.producto_codigo}</span>
                          </div>
                          <span className="text-xs text-rtb-teal font-medium">{l.nr_folio}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Disponible: {l.disponible} · Precio de la NR: {formatearMoneda(l.precio_unitario)}
                        </p>
                        {sel.incluida && (
                          <div className="flex items-center gap-3 mt-2">
                            <div>
                              <Label className="text-[11px] text-muted-foreground">Cantidad</Label>
                              <input
                                type="number"
                                min={0.0001}
                                max={l.disponible}
                                step="any"
                                value={sel.cantidad}
                                onChange={(e) =>
                                  setSeleccionRespaldo((prev) => ({
                                    ...prev,
                                    [l.nr_linea_id]: { ...sel, cantidad: Number(e.target.value) },
                                  }))
                                }
                                className="w-24 text-sm border border-border rounded px-2 py-1"
                              />
                            </div>
                            <div>
                              <Label className="text-[11px] text-muted-foreground">Precio unitario (según la PO)</Label>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={sel.precio_unitario}
                                onChange={(e) =>
                                  setSeleccionRespaldo((prev) => ({
                                    ...prev,
                                    [l.nr_linea_id]: { ...sel, precio_unitario: Number(e.target.value) },
                                  }))
                                }
                                className="w-28 text-sm border border-border rounded px-2 py-1"
                              />
                            </div>
                            {divergente && (
                              <span className="text-[11px] text-amber-700 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Difiere de la NR — congelará la PO
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {paso === 3 && (
          <div className="space-y-4">
            <div className="flex gap-2 border-b border-border">
              <button
                onClick={() => setSubPestana('cotizacion')}
                className={`px-3 py-2 text-sm font-medium ${subPestana === 'cotizacion' ? 'border-b-2 border-rtb-teal text-rtb-teal' : 'text-muted-foreground'}`}
              >
                Desde una cotización
              </button>
              <button
                onClick={() => setSubPestana('nuevas')}
                className={`px-3 py-2 text-sm font-medium ${subPestana === 'nuevas' ? 'border-b-2 border-rtb-teal text-rtb-teal' : 'text-muted-foreground'}`}
              >
                Partidas nuevas
              </button>
            </div>

            {subPestana === 'cotizacion' && (
              <div className="space-y-3">
                {!entidadId && <p className="text-sm text-muted-foreground">Elige primero el cliente en el paso 1.</p>}
                {cargandoCotizaciones && (
                  <div className="py-6 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!cargandoCotizaciones && entidadId && cotizacionesDisponibles.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">Este cliente no tiene cotizaciones enviadas.</p>
                )}
                {!cargandoCotizaciones && cotizacionesDisponibles.length > 0 && (
                  <select
                    value={cotizacionSeleccionadaId ?? ''}
                    onChange={(e) => setCotizacionSeleccionadaId(e.target.value || null)}
                    className={SELECT_CLASES}
                  >
                    <option value="">Sin seleccionar</option>
                    {cotizacionesDisponibles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.folio} — {formatearMoneda(c.total, c.moneda)}
                      </option>
                    ))}
                  </select>
                )}

                {cargandoCotizacionLineas && (
                  <div className="py-6 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {cotizacionSeleccionadaId && !cargandoCotizacionLineas && cotizacionLineas.length > 0 && (
                  <>
                    <div className="border border-border rounded-lg divide-y divide-border">
                      {cotizacionLineas.map((l) => (
                        <label key={l.id} className="p-3 flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!lineasCotizacionIncluidas[l.id]}
                            onChange={(e) => setLineasCotizacionIncluidas((prev) => ({ ...prev, [l.id]: e.target.checked }))}
                            className="w-4 h-4 rounded border-border text-rtb-teal focus:ring-rtb-teal"
                          />
                          <div className="flex-1">
                            <span className="text-sm">{l.productos?.nombre ?? l.descripcion_libre ?? 'Producto'}</span>
                            <span className="text-xs text-muted-foreground ml-2 tabular-nums">
                              {l.cantidad} × {formatearMoneda(l.precio_unitario)}
                            </span>
                          </div>
                          <span className="text-sm tabular-nums">{formatearMoneda(l.importe)}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Las líneas no marcadas se excluyen de la PO (quedan registradas como "no incluidas", no se
                      borran) y la cotización se aprueba sólo por lo seleccionado.
                    </p>
                    <div>
                      <Label className="text-xs font-semibold text-rtb-navy-mid">Canal de la aprobación de esta cotización</Label>
                      <select
                        value={canalAprobacionCotizacion}
                        onChange={(e) => setCanalAprobacionCotizacion(e.target.value as CanalOrigen)}
                        className={`${SELECT_CLASES} mt-1`}
                      >
                        <option value="">Usar el canal de entrega del paso 1</option>
                        {CANAL_ORIGENES.map((c) => (
                          <option key={c} value={c}>
                            {CANAL_ORIGEN_LABELS[c]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

            {subPestana === 'nuevas' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Producto del catálogo que no viene de ninguna cotización — se surtirá directamente contra esta PO.
                </p>
                {partidasNuevas.map((p) => (
                  <div key={p.key} className="flex items-end gap-2 border border-border rounded-lg p-3">
                    <div className="flex-1">
                      <Label className="text-[11px] text-muted-foreground">Producto</Label>
                      <ProductoCombobox
                        value={p.producto_id}
                        onChange={(id, prod) => {
                          if (!id) return;
                          fetch(`/api/productos/${id}`)
                            .then((r) => r.json())
                            .then((d) => {
                              setPartidasNuevas((prev) =>
                                prev.map((row) =>
                                  row.key === p.key
                                    ? {
                                        ...row,
                                        producto_id: id,
                                        producto_label: prod ? `${prod.codigo_interno} — ${prod.nombre}` : id,
                                        unidad_medida_id: d.producto?.unidad_medida_id ?? null,
                                      }
                                    : row
                                )
                              );
                            });
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
                        onChange={(e) =>
                          setPartidasNuevas((prev) => prev.map((row) => (row.key === p.key ? { ...row, cantidad: Number(e.target.value) } : row)))
                        }
                        className="w-24 text-sm border border-border rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Precio unitario</Label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={p.precio_unitario}
                        onChange={(e) =>
                          setPartidasNuevas((prev) =>
                            prev.map((row) => (row.key === p.key ? { ...row, precio_unitario: Number(e.target.value) } : row))
                          )
                        }
                        className="w-28 text-sm border border-border rounded px-2 py-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Código del cliente (opcional)</Label>
                      <input
                        value={p.codigo_cliente}
                        onChange={(e) =>
                          setPartidasNuevas((prev) => prev.map((row) => (row.key === p.key ? { ...row, codigo_cliente: e.target.value } : row)))
                        }
                        className="w-32 text-sm border border-border rounded px-2 py-1"
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setPartidasNuevas((prev) => prev.filter((row) => row.key !== p.key))}>
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setPartidasNuevas((prev) => [...prev, nuevaPartida()])}>
                  <Plus className="w-4 h-4 mr-1" /> Agregar partida
                </Button>
              </div>
            )}
          </div>
        )}

        {paso === 4 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Número de PO</span>
                <p className="font-medium">{numeroPo || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Total calculado</span>
                <p className="font-medium tabular-nums">{formatearMoneda(totalCalculado, moneda)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Partidas de respaldo</span>
                <p className="font-medium">{respaldoSeleccionado.length}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Partidas por entregar</span>
                <p className="font-medium">
                  {compromisoNuevasValidas.length + (cotizacionSeleccionadaId ? lineasCotizacionSeleccionadas.length : 0)}
                </p>
              </div>
            </div>

            {divergenciasRespaldo.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {divergenciasRespaldo.length} partida(s) de respaldo tienen un precio distinto al de su NR — la PO
                  se registrará <strong>pendiente de autorización</strong> y no respaldará ninguna NR hasta que
                  Dirección la resuelva.
                </span>
              </div>
            )}

            {!hayAlMenosUnaPartida && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Agrega al menos una partida (de respaldo, de una cotización o nueva) antes de registrar.</span>
              </div>
            )}

            <Button
              onClick={registrarPo}
              disabled={enviando || !hayAlMenosUnaPartida}
              className="w-full bg-rtb-teal hover:bg-rtb-teal/90 text-white"
            >
              {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              Registrar orden de compra
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setPaso((p) => (p > 1 ? ((p - 1) as any) : p))} disabled={paso === 1}>
          Atrás
        </Button>
        {paso < 4 && (
          <Button
            onClick={() => setPaso((p) => (p < 4 ? ((p + 1) as any) : p))}
            disabled={!puedeAvanzarDe(paso)}
            className="bg-rtb-navy hover:bg-rtb-navy/90 text-white"
          >
            Siguiente <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
