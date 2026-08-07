'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ProductoCombobox } from '@/components/inventario/producto-combobox';
import { MotivoDialog } from '@/components/inventario/motivo-dialog';
import { POEstadoBadge, VinculoEstadoBadge } from '@/components/ventas/estado-badge';
import { Actualizando } from '@/components/ui/actualizando';
import { useAccionServidor } from '@/lib/ui/use-accion-servidor';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import { rfcCoincide } from '@/lib/ventas/validaciones';
import { ArrowLeft, AlertCircle, CheckCircle2, Loader2, Plus, Trash2, Ban } from 'lucide-react';

// Estados de vinculo_estado que ya tienen consecuencia de facturación —
// ventas_vinculo_cancelar() (036) los rechaza con 42501; no se ofrece el
// botón para no invitar a un intento que sabemos que fallará.
const VINCULO_NO_CANCELABLE = ['aprobado_para_facturacion', 'facturado', 'cancelado'];

interface Props {
  po: any;
  partidas: any[];
  vinculos: any[];
  nrLineas: any[];
}

interface VinculoPropuesto {
  po_partida_id: string;
  nr_linea_id: string;
  cantidad_cubierta: number;
}

// po/partidas/vinculos llegan como props del Server Component. propuestos
// (vínculos aún no enviados) y resultado (veredicto de la última
// validación) NO vienen del servidor — sobreviven al router.refresh() sin
// necesidad de espejo, porque refresh() no desmonta componentes cliente.
export function PoDetalle({ po, partidas, vinculos, nrLineas }: Props) {
  const router = useRouter();
  const [refrescando, iniciarRefresco] = useTransition();
  const [propuestos, setPropuestos] = useState<VinculoPropuesto[]>([]);
  const [resultado, setResultado] = useState<any>(null);
  const [aceptarCodigo, setAceptarCodigo] = useState(false);
  const [autorizacionId, setAutorizacionId] = useState('');
  const [autorizadas, setAutorizadas] = useState<any[]>([]);
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rfcSospechoso = !rfcCoincide(po.rfc_declarado, po.entidades?.rfc);

  // Autorizaciones de subtotal ya vigentes para ESTA PO — así el usuario
  // elige de una lista en vez de copiar/pegar el UUID a mano (§3.4 de
  // AUDITORIA_RTB-VEN-01.md). ventas_po_validar() (033:501-505) sólo acepta
  // exactamente estas cuatro condiciones (tipo/estado/documento_tipo/
  // documento_id); el filtro aquí las replica para no ofrecer nunca una
  // opción que el SQL fuera a rechazar.
  const cargarAutorizaciones = async () => {
    const params = new URLSearchParams({
      documento_tipo: 'purchase_order',
      documento_id: po.id,
      tipo: 'excepcion_subtotal',
    });
    const [resAut, resPend] = await Promise.all([
      fetch(`/api/ventas/autorizaciones?${params.toString()}&estado=autorizada`, { cache: 'no-store' }),
      fetch(`/api/ventas/autorizaciones?${params.toString()}&estado=pendiente`, { cache: 'no-store' }),
    ]);
    const [dataAut, dataPend] = await Promise.all([
      resAut.json().catch(() => ({})),
      resPend.json().catch(() => ({})),
    ]);
    const lista = resAut.ok ? (dataAut?.data ?? []) : [];
    setAutorizadas(lista);
    setPendientes(resPend.ok ? (dataPend?.data ?? []) : []);
    // Con exactamente una vigente, se preselecciona sola — sigue siendo el
    // usuario quien pulsa "Validar y vincular"; nada se aplica solo.
    if (lista.length === 1) setAutorizacionId(lista[0].id);
  };

  useEffect(() => {
    cargarAutorizaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po.id]);

  const agregarVinculo = (v: VinculoPropuesto) => setPropuestos((prev) => [...prev, v]);
  const quitarVinculo = (i: number) => setPropuestos((prev) => prev.filter((_, idx) => idx !== i));

  // ventas_po_validar() responde 200 con {success:false, motivo, mensaje}
  // como resultado de negocio válido (PO bloqueada/rechazada) — no es un
  // error HTTP y no persiste nada, así que sólo refrescamos cuando
  // success===true (a diferencia del resto del módulo, aquí res.ok !=
  // "algo cambió"; por eso esta pantalla no usa useAccionServidor para
  // validar()).
  const validar = async () => {
    if (propuestos.length === 0) {
      setError('Agrega al menos un vínculo PO↔NR antes de validar.');
      return;
    }
    setError(null);
    setResultado(null);
    setLoading(true);
    const res = await fetch(`/api/ventas/ordenes-compra/${po.id}/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        vinculos: propuestos,
        autorizacion_id: autorizacionId || undefined,
        aceptar_codigo_divergente: aceptarCodigo,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo validar la PO.');
      return;
    }
    setResultado(data);
    if (data.success) {
      setPropuestos([]);
      iniciarRefresco(() => router.refresh());
    }
  };

  const solicitarAutorizacion = async (tipo: string, motivo: string) => {
    const res = await fetch('/api/ventas/autorizaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ tipo, documento_tipo: 'purchase_order', documento_id: po.id, motivo }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo solicitar la autorización.');
      return;
    }
    setResultado((r: any) => ({ ...r, autorizacionSolicitada: data?.data?.id }));
    await cargarAutorizaciones();
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
            PO #{po.numero_po} · {po.entidades?.nombre_comercial ?? po.entidades?.nombre_legal} · {po.moneda}
          </p>
        </div>
      </div>

      {rfcSospechoso && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          El RFC declarado en la PO no coincide con el de la entidad — la validación lo rechazará.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {resultado && (
        <div className={`p-4 rounded-lg text-sm ${resultado.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {resultado.success ? (
            <>
              <CheckCircle2 className="w-4 h-4 inline mr-1" /> PO vinculada. Estado: {resultado.estado_po}, vínculos creados:{' '}
              {resultado.vinculos_creados}
            </>
          ) : (
            <>
              <p>{resultado.mensaje}</p>
              {resultado.motivo === 'requiere_autorizacion_subtotal' && !resultado.autorizacionSolicitada && (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    solicitarAutorizacion('excepcion_subtotal', 'Los unitarios varían pero el subtotal de la PO coincide.')
                  }
                >
                  Solicitar autorización a Dirección
                </Button>
              )}
              {resultado.autorizacionSolicitada && (
                <p className="mt-2 text-xs">
                  Solicitud enviada. Una vez que{' '}
                  <Link href="/dashboard/ventas/autorizaciones" className="underline">
                    Dirección la autorice
                  </Link>
                  , aparecerá sola en "Autorización de subtotal" abajo — no hace falta copiar ningún id.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <PartidasCard poId={po.id} partidas={partidas} vinculos={vinculos} />

      {partidas.length > 0 && nrLineas.length > 0 && po.estado !== 'vinculada' && (
        <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <h2 className="text-sm font-display font-semibold text-rtb-navy">Vincular partidas a líneas de NR</h2>
          <AgregarVinculoForm partidas={partidas} nrLineas={nrLineas} onAgregar={agregarVinculo} />

          {propuestos.length > 0 && (
            <div className="space-y-2">
              {propuestos.map((v, i) => {
                const partida = partidas.find((p) => p.id === v.po_partida_id);
                const nrl = nrLineas.find((n) => n.id === v.nr_linea_id);
                return (
                  <div key={i} className="flex items-center justify-between text-xs bg-rtb-surface/60 rounded-lg px-3 py-2">
                    <span>
                      Partida #{partida?.linea_numero} ({formatearMoneda(partida?.precio_unitario)}) → {nrl?.nr_folio} · cantidad{' '}
                      {v.cantidad_cubierta}
                    </span>
                    <button onClick={() => quitarVinculo(i)} className="text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={aceptarCodigo} onChange={(e) => setAceptarCodigo(e.target.checked)} />
              Aceptar código de producto divergente (si costo/subtotal cuadran)
            </label>
          </div>
          <div>
            <Label className="text-xs">Autorización de subtotal (opcional, sólo si los unitarios varían)</Label>
            <select
              value={autorizacionId}
              onChange={(e) => setAutorizacionId(e.target.value)}
              className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
            >
              <option value="">Ninguna</option>
              {autorizadas.map((a) => (
                <option key={a.id} value={a.id}>
                  Autorizada {new Date(a.autorizado_at ?? a.created_at).toLocaleDateString('es-MX')} — {a.motivo}
                </option>
              ))}
            </select>
            {pendientes.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {pendientes.length === 1
                  ? 'Hay 1 solicitud pendiente de Dirección para esta PO.'
                  : `Hay ${pendientes.length} solicitudes pendientes de Dirección para esta PO.`}{' '}
                Aparecerá aquí en cuanto la autoricen.
              </p>
            )}
          </div>
          <Button onClick={validar} disabled={loading} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Validar y vincular
          </Button>
        </div>
      )}
    </div>
  );
}

function PartidasCard({ poId, partidas, vinculos }: { poId: string; partidas: any[]; vinculos: any[] }) {
  const { ejecutar, ocupado, error } = useAccionServidor();
  const [agregando, setAgregando] = useState(false);
  // Se deriva de `partidas` (prop del servidor) en cada render en vez de
  // congelarse en el useState inicial — con el patrón anterior
  // (partidas.length + 2 tras cada alta) el número propuesto se
  // desincronizaba a partir de la segunda partida.
  const siguienteNumero = partidas.length > 0 ? Math.max(...partidas.map((p) => Number(p.linea_numero))) + 1 : 1;
  const [lineaNumero, setLineaNumero] = useState<string | null>(null);
  const [codigoCliente, setCodigoCliente] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [precioUnitario, setPrecioUnitario] = useState('');
  const [productoId, setProductoId] = useState<string | null>(null);

  const agregar = async () => {
    const res = await ejecutar(`/api/ventas/ordenes-compra/${poId}/partidas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        linea_numero: Number(lineaNumero ?? siguienteNumero),
        codigo_cliente: codigoCliente || undefined,
        descripcion: descripcion || undefined,
        cantidad: Number(cantidad),
        precio_unitario: Number(precioUnitario),
        producto_id: productoId ?? undefined,
      }),
    });
    if (!res.ok) return;
    setAgregando(false);
    setLineaNumero(null);
    setCodigoCliente('');
    setDescripcion('');
    setCantidad('1');
    setPrecioUnitario('');
    setProductoId(null);
  };

  // Deshace un vínculo capturado por error (ventas_vinculo_cancelar(), 036)
  // — nunca borra la fila, sólo la marca 'cancelado'. Reusa el mismo
  // `ejecutar` de arriba: refresca el árbol de Server Components solo, sin
  // necesidad de un callback aparte hacia el padre.
  const cancelarVinculo = (vinculoId: string) => async (motivo: string) => {
    const res = await ejecutar(`/api/ventas/ordenes-compra/${poId}/vinculos/${vinculoId}/cancelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
    });
    return res.ok;
  };

  return (
    <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-display font-semibold text-rtb-navy">Partidas declaradas</h2>
        {!agregando && (
          <Button size="sm" onClick={() => setAgregando(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Agregar partida
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground uppercase">
            <th className="py-1">#</th>
            <th className="py-1">Código cliente</th>
            <th className="py-1 text-right">Cantidad</th>
            <th className="py-1 text-right">Unitario</th>
            <th className="py-1 text-right">Subtotal</th>
            <th className="py-1">Vínculos</th>
          </tr>
        </thead>
        <tbody>
          {partidas.map((p) => (
            <tr key={p.id} className="border-t border-border/50">
              <td className="py-2">{p.linea_numero}</td>
              <td className="py-2">
                {p.codigo_cliente}
                {p.codigo_divergente && <span className="ml-1 text-[10px] text-amber-700">(divergente aceptado)</span>}
              </td>
              <td className="py-2 text-right tabular-nums">{p.cantidad}</td>
              <td className="py-2 text-right tabular-nums">{formatearMoneda(p.precio_unitario)}</td>
              <td className="py-2 text-right tabular-nums">{formatearMoneda(p.subtotal)}</td>
              <td className="py-2">
                <div className="flex flex-col gap-1">
                  {vinculos
                    .filter((v) => v.po_partida_id === p.id)
                    .map((v) => (
                      <div key={v.id} className="flex items-center gap-1.5">
                        <VinculoEstadoBadge estado={v.estado} />
                        <span className="text-[10px] text-muted-foreground tabular-nums">×{v.cantidad_cubierta}</span>
                        {!VINCULO_NO_CANCELABLE.includes(v.estado) && (
                          <MotivoDialog
                            trigger={
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-destructive"
                                title="Cancelar vínculo"
                              >
                                <Ban className="w-3 h-3" />
                              </button>
                            }
                            titulo="Cancelar vínculo PO↔NR"
                            descripcion="La fila no se borra: queda marcada como cancelada, con quién y por qué. Puedes volver a vincular el mismo par después."
                            confirmLabel="Cancelar vínculo"
                            destructivo
                            onConfirm={cancelarVinculo(v.id)}
                          />
                        )}
                      </div>
                    ))}
                  {vinculos.filter((v) => v.po_partida_id === p.id).length === 0 && (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {partidas.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-muted-foreground text-xs">
                Sin partidas capturadas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {agregando && (
        <div className="p-3 bg-rtb-surface/60 rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Línea #</Label>
              <input
                type="number"
                value={lineaNumero ?? String(siguienteNumero)}
                onChange={(e) => setLineaNumero(e.target.value)}
                className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <Label className="text-xs">Código del cliente</Label>
              <input
                value={codigoCliente}
                onChange={(e) => setCodigoCliente(e.target.value)}
                className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <Label className="text-xs">Cantidad</Label>
              <input
                type="number"
                min="0"
                step="any"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <Label className="text-xs">Precio unitario</Label>
              <input
                type="number"
                min="0"
                step="any"
                value={precioUnitario}
                onChange={(e) => setPrecioUnitario(e.target.value)}
                className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Descripción (opcional)</Label>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <Label className="text-xs">Producto (opcional, ayuda a comparar el código)</Label>
            <div className="mt-1">
              <ProductoCombobox value={productoId} onChange={(id) => setProductoId(id)} />
            </div>
          </div>
          <Button size="sm" onClick={agregar} disabled={ocupado} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {ocupado && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Guardar partida
          </Button>
        </div>
      )}
    </div>
  );
}

function AgregarVinculoForm({
  partidas,
  nrLineas,
  onAgregar,
}: {
  partidas: any[];
  nrLineas: any[];
  onAgregar: (v: VinculoPropuesto) => void;
}) {
  const [partidaId, setPartidaId] = useState('');
  const [nrLineaId, setNrLineaId] = useState('');
  const [cantidad, setCantidad] = useState('1');

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label className="text-xs">Partida</Label>
        <select value={partidaId} onChange={(e) => setPartidaId(e.target.value)} className="mt-1 text-sm border border-border rounded-lg px-3 py-2">
          <option value="">Selecciona…</option>
          {partidas.map((p) => (
            <option key={p.id} value={p.id}>
              #{p.linea_numero} — {formatearMoneda(p.precio_unitario)} × {p.cantidad}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-xs">Línea de NR</Label>
        <select value={nrLineaId} onChange={(e) => setNrLineaId(e.target.value)} className="mt-1 text-sm border border-border rounded-lg px-3 py-2">
          <option value="">Selecciona…</option>
          {nrLineas.map((n) => (
            <option key={n.id} value={n.id}>
              {n.nr_folio} — {formatearMoneda(n.precio_unitario)} (entregado {n.cantidad_entregada})
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-xs">Cantidad a cubrir</Label>
        <input
          type="number"
          min="0"
          step="any"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          className="mt-1 w-24 text-sm border border-border rounded-lg px-3 py-2"
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (!partidaId || !nrLineaId || !cantidad) return;
          onAgregar({ po_partida_id: partidaId, nr_linea_id: nrLineaId, cantidad_cubierta: Number(cantidad) });
          setPartidaId('');
          setNrLineaId('');
          setCantidad('1');
        }}
      >
        <Plus className="w-3.5 h-3.5 mr-1" /> Agregar a la lista
      </Button>
    </div>
  );
}
