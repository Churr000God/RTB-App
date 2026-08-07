'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ProductoCombobox } from '@/components/inventario/producto-combobox';
import { POEstadoBadge, VinculoEstadoBadge } from '@/components/ventas/estado-badge';
import { formatearMoneda } from '@/lib/ventas/validaciones';
import { rfcCoincide } from '@/lib/ventas/validaciones';
import { ArrowLeft, AlertCircle, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';

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

export function PoDetalle({ po: poInicial, partidas: partidasIniciales, vinculos: vinculosIniciales, nrLineas }: Props) {
  const router = useRouter();
  const [po, setPo] = useState(poInicial);
  const [partidas, setPartidas] = useState(partidasIniciales);
  const [vinculos, setVinculos] = useState(vinculosIniciales);
  const [propuestos, setPropuestos] = useState<VinculoPropuesto[]>([]);
  const [resultado, setResultado] = useState<any>(null);
  const [aceptarCodigo, setAceptarCodigo] = useState(false);
  const [autorizacionId, setAutorizacionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rfcSospechoso = !rfcCoincide(po.rfc_declarado, po.entidades?.rfc);

  const recargar = async () => {
    const res = await fetch(`/api/ventas/ordenes-compra/${po.id}`);
    const data = await res.json().catch(() => null);
    if (data?.data) {
      const { partidas: p, vinculos: v, ...cabecera } = data.data;
      setPo((prev: any) => ({ ...prev, ...cabecera }));
      setPartidas(p ?? []);
      setVinculos(v ?? []);
    }
  };

  const agregarVinculo = (v: VinculoPropuesto) => setPropuestos((prev) => [...prev, v]);
  const quitarVinculo = (i: number) => setPropuestos((prev) => prev.filter((_, idx) => idx !== i));

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
      await recargar();
      router.refresh();
    }
  };

  const solicitarAutorizacion = async (tipo: string, motivo: string) => {
    const res = await fetch('/api/ventas/autorizaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, documento_tipo: 'purchase_order', documento_id: po.id, motivo }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setResultado((r: any) => ({ ...r, autorizacionSolicitada: data.data.id }));
    }
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
                  Solicitud enviada (id {resultado.autorizacionSolicitada}). Una vez autorizada en{' '}
                  <Link href="/dashboard/ventas/autorizaciones" className="underline">
                    Autorizaciones
                  </Link>
                  , pega el id abajo y vuelve a validar.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <PartidasCard poId={po.id} partidas={partidas} vinculos={vinculos} onAgregada={recargar} />

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
            <Label className="text-xs">ID de autorización ya aprobada (opcional)</Label>
            <input
              value={autorizacionId}
              onChange={(e) => setAutorizacionId(e.target.value)}
              className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
            />
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

function PartidasCard({ poId, partidas, vinculos, onAgregada }: { poId: string; partidas: any[]; vinculos: any[]; onAgregada: () => Promise<void> }) {
  const [agregando, setAgregando] = useState(false);
  const [lineaNumero, setLineaNumero] = useState(String(partidas.length + 1));
  const [codigoCliente, setCodigoCliente] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [precioUnitario, setPrecioUnitario] = useState('');
  const [productoId, setProductoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const agregar = async () => {
    setError(null);
    setEnviando(true);
    const res = await fetch(`/api/ventas/ordenes-compra/${poId}/partidas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        linea_numero: Number(lineaNumero),
        codigo_cliente: codigoCliente || undefined,
        descripcion: descripcion || undefined,
        cantidad: Number(cantidad),
        precio_unitario: Number(precioUnitario),
        producto_id: productoId ?? undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo agregar la partida.');
      return;
    }
    setAgregando(false);
    setLineaNumero(String(partidas.length + 2));
    setCodigoCliente('');
    setDescripcion('');
    setCantidad('1');
    setPrecioUnitario('');
    setProductoId(null);
    await onAgregada();
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
                <div className="flex flex-wrap gap-1">
                  {vinculos
                    .filter((v) => v.po_partida_id === p.id)
                    .map((v) => (
                      <VinculoEstadoBadge key={v.id} estado={v.estado} />
                    ))}
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
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Línea #</Label>
              <input
                type="number"
                value={lineaNumero}
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
          <Button size="sm" onClick={agregar} disabled={enviando} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {enviando && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
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
