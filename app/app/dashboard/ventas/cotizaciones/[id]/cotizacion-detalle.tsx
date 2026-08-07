'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ProductoCombobox } from '@/components/inventario/producto-combobox';
import { ProductoEtiqueta } from '@/components/inventario/producto-etiqueta';
import { CotizacionEstadoBadge } from '@/components/ventas/estado-badge';
import { MotivoDialog } from '@/components/inventario/motivo-dialog';
import { Actualizando } from '@/components/ui/actualizando';
import { useAccionServidor } from '@/lib/ui/use-accion-servidor';
import { puede } from '@/lib/ventas/permisos';
import { DATOS_FALTANTES_LABELS, PRECIO_ORIGEN_LABELS } from '@/lib/ventas/config';
import { formatearMoneda, formatearPorcentaje } from '@/lib/ventas/validaciones';
import { CANAL_ORIGENES } from '@/types/entidades';
import { CANAL_ORIGEN_LABELS } from '@/lib/entidades/config';
import { DATOS_FALTANTES, type CotizacionLineaRow, type PrecioOrigenVenta } from '@/types/ventas';
import { AlertCircle, ArrowLeft, HelpCircle, Loader2, Plus, Trash2 } from 'lucide-react';

interface Props {
  cotizacion: any;
  lineasIniciales: CotizacionLineaRow[];
  rol: string;
  userId: string;
}

// El servidor manda: cotizacion/lineas llegan como props del Server
// Component (page.tsx) y ya no se espejan en useState — cada mutación
// exitosa pasa por useAccionServidor(), que hace router.refresh() y deja
// que Next vuelva a pedir esas props. Ver contexto/AUDITORIA_RTB-VEN-01.md
// §7.3 (causa raíz: un useState(prop) sólo lee su valor inicial).
export function CotizacionDetalle({ cotizacion, lineasIniciales: lineas, rol, userId }: Props) {
  const { ejecutar, ocupado, refrescando, error, setError } = useAccionServidor();

  const esBorrador = cotizacion.estado === 'borrador';
  const puedeAdministrar = rol === 'super_admin' || rol === 'direccion' || (rol === 'ventas' && cotizacion.vendedor_id === userId);
  const puedeEditar = esBorrador && puedeAdministrar && puede(rol, 'cotizaciones', 'update');
  const lineasActivas = lineas.filter((l) => l.activo);
  const hayPendientes = lineasActivas.some((l) => l.en_consulta);

  const accion = async (url: string, body?: unknown) => {
    const res = await ejecutar(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.ok;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/ventas/cotizaciones">
          <ArrowLeft className="w-4 h-4 mr-1" /> Cotizaciones
        </Link>
      </Button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-3">
            {cotizacion.folio}
            <CotizacionEstadoBadge estado={cotizacion.estado} />
            <Actualizando activo={refrescando} />
          </h1>
          <p className="text-muted-foreground mt-1">
            {cotizacion.entidades?.nombre_comercial ?? cotizacion.entidades?.nombre_legal} · Vigencia: {cotizacion.vigencia_hasta ?? '—'}
          </p>
        </div>
        <div className="flex gap-2">
          {esBorrador && puedeAdministrar && (
            <Button
              onClick={() => accion(`/api/ventas/cotizaciones/${cotizacion.id}/enviar`)}
              disabled={ocupado || lineasActivas.length === 0 || hayPendientes || !cotizacion.vigencia_hasta}
              className="bg-rtb-teal hover:bg-rtb-teal/90 text-white"
              title={hayPendientes ? 'Hay líneas en consulta con Compras' : !cotizacion.vigencia_hasta ? 'Define la vigencia' : ''}
            >
              {ocupado && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enviar al cliente
            </Button>
          )}
          {cotizacion.estado === 'enviada' && puedeAdministrar && <AprobarDialog cotizacionId={cotizacion.id} accion={accion} />}
          {cotizacion.estado === 'enviada' && puedeAdministrar && (
            <MotivoDialog
              trigger={
                <Button variant="outline" disabled={ocupado}>
                  Rechazar
                </Button>
              }
              titulo="Rechazar cotización"
              descripcion="El cliente no aprobó — registra por qué."
              confirmLabel="Rechazar"
              destructivo
              onConfirm={(motivo) => accion(`/api/ventas/cotizaciones/${cotizacion.id}/rechazar`, { motivo })}
            />
          )}
          {(esBorrador || cotizacion.estado === 'enviada') && puedeAdministrar && (
            <MotivoDialog
              trigger={
                <Button variant="outline" className="text-destructive" disabled={ocupado}>
                  Cancelar
                </Button>
              }
              titulo="Cancelar cotización"
              confirmLabel="Cancelar cotización"
              destructivo
              onConfirm={(motivo) => accion(`/api/ventas/cotizaciones/${cotizacion.id}/cancelar`, { motivo })}
            />
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {cotizacion.motivo_resolucion && (
        <div className="p-3 bg-rtb-surface/60 rounded-lg text-sm text-muted-foreground">
          <span className="font-semibold">Motivo de resolución:</span> {cotizacion.motivo_resolucion}
        </div>
      )}

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-rtb-navy text-white">
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Producto / descripción</th>
              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider">Cantidad</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Precio</th>
              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider">Unitario</th>
              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider">Desc. %</th>
              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider">Importe</th>
              {puedeEditar && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {lineasActivas.map((l) => (
              <LineaRow key={l.id} linea={l} puedeEditar={puedeEditar} />
            ))}
            {lineasActivas.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  Sin líneas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {puedeEditar && <AgregarLineaForm cotizacionId={cotizacion.id} entidadId={cotizacion.entidad_id} />}
    </div>
  );
}

function LineaRow({ linea, puedeEditar }: { linea: CotizacionLineaRow; puedeEditar: boolean }) {
  const { ejecutar, ocupado, error } = useAccionServidor();

  const patch = (body: Record<string, unknown>) =>
    ejecutar(`/api/ventas/cotizaciones/${linea.cotizacion_id}/lineas/${linea.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  if (linea.en_consulta) {
    return (
      <tr className="border-b border-border/50 bg-amber-50/60">
        <td className="py-2 px-3">
          <div className="flex flex-col">
            <ProductoEtiqueta producto={linea.productos} descripcion={linea.descripcion_libre} productoId={linea.producto_id} />
            <span className="text-xs font-medium text-amber-700">
              {linea.producto_id ? 'Compras respondió — elige el precio' : 'Esperando respuesta de Compras'}
            </span>
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </td>
        <td className="py-2 px-3 text-right tabular-nums">{linea.cantidad}</td>
        <td className="py-2 px-3" colSpan={puedeEditar ? 4 : 3}>
          {linea.producto_id && puedeEditar ? (
            <ToggleGroup
              type="single"
              size="sm"
              onValueChange={(v) => v && patch({ precio_origen: v })}
              className="justify-start"
            >
              {(['refaccion', 'ariba', 'costo_venta'] as PrecioOrigenVenta[]).map((p) => (
                <ToggleGroupItem key={p} value={p} disabled={ocupado} className="text-xs">
                  {PRECIO_ORIGEN_LABELS[p]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        {puedeEditar && (
          <td className="py-2 px-3">
            <button onClick={() => patch({ activo: false })} disabled={ocupado} className="text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </td>
        )}
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/50">
      <td className="py-2 px-3">
        <ProductoEtiqueta producto={linea.productos} descripcion={linea.descripcion_libre} productoId={linea.producto_id} />
        {error && <span className="block text-xs text-destructive mt-0.5">{error}</span>}
      </td>
      <td className="py-2 px-3 text-right tabular-nums">{linea.cantidad}</td>
      <td className="py-2 px-3 text-xs text-muted-foreground">
        {linea.precio_origen ? PRECIO_ORIGEN_LABELS[linea.precio_origen] : '—'}
        {linea.margen_snapshot != null && (
          <span className="block text-[10px]">margen {formatearPorcentaje(linea.margen_snapshot)}</span>
        )}
      </td>
      <td className="py-2 px-3 text-right tabular-nums">{formatearMoneda(linea.precio_unitario)}</td>
      <td className="py-2 px-3 text-right tabular-nums">{linea.descuento_porcentaje}%</td>
      <td className="py-2 px-3 text-right tabular-nums font-semibold">{formatearMoneda(linea.importe)}</td>
      {puedeEditar && (
        <td className="py-2 px-3">
          <button onClick={() => patch({ activo: false })} disabled={ocupado} className="text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}

function AgregarLineaForm({ cotizacionId, entidadId }: { cotizacionId: string; entidadId: string }) {
  const { ejecutar, ocupado, error, setError } = useAccionServidor();
  const [productoId, setProductoId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [precioOrigen, setPrecioOrigen] = useState<PrecioOrigenVenta | null>(null);
  const [precios, setPrecios] = useState<any>(null);
  const [consultaOpen, setConsultaOpen] = useState(false);

  useEffect(() => {
    if (!productoId) {
      setPrecios(null);
      return;
    }
    fetch(`/api/ventas/precios/${productoId}`)
      .then((r) => r.json())
      .then((d) => setPrecios(d.data));
  }, [productoId]);

  const agregar = async () => {
    if (!productoId) {
      setError('Elige un producto.');
      return;
    }
    if (!precioOrigen) {
      setError('Elige un precio.');
      return;
    }
    const res = await ejecutar(`/api/ventas/cotizaciones/${cotizacionId}/lineas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto_id: productoId, cantidad: Number(cantidad), precio_origen: precioOrigen }),
    });
    if (!res.ok) return;
    setProductoId(null);
    setCantidad('1');
    setPrecioOrigen(null);
  };

  return (
    <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-display font-semibold text-rtb-navy">Agregar línea</h2>
        <Dialog open={consultaOpen} onOpenChange={setConsultaOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <HelpCircle className="w-3.5 h-3.5 mr-1" /> Consultar a Compras
            </Button>
          </DialogTrigger>
          <ConsultarComprasDialogContent
            cotizacionId={cotizacionId}
            entidadId={entidadId}
            onCreada={() => setConsultaOpen(false)}
          />
        </Dialog>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Producto</Label>
          <div className="mt-1">
            <ProductoCombobox value={productoId} onChange={(id) => setProductoId(id)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Cantidad</Label>
          <input
            type="number"
            min="0"
            step="any"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className="mt-1 w-24 text-sm border border-border rounded-lg px-3 py-2"
          />
        </div>
      </div>

      {productoId && (
        <div>
          <Label className="text-xs">Precio</Label>
          <ToggleGroup type="single" value={precioOrigen ?? undefined} onValueChange={(v) => v && setPrecioOrigen(v as PrecioOrigenVenta)} className="justify-start mt-1">
            <ToggleGroupItem value="refaccion" disabled={!precios?.refaccion} className="text-xs">
              Refacción {precios?.refaccion ? formatearMoneda(precios.refaccion.precio) : '(sin dato)'}
            </ToggleGroupItem>
            <ToggleGroupItem value="ariba" disabled={!precios?.ariba} className="text-xs">
              Ariba {precios?.ariba ? formatearMoneda(precios.ariba.precio) : '(sin dato)'}
            </ToggleGroupItem>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <ToggleGroupItem value="costo_venta" disabled={!precios?.costo_venta?.calculable} className="text-xs">
                      Costo de Venta {precios?.costo_venta?.calculable ? formatearMoneda(precios.costo_venta.costo_venta) : '(sin margen/costo)'}
                    </ToggleGroupItem>
                  </span>
                </TooltipTrigger>
                {!precios?.costo_venta?.calculable && (
                  <TooltipContent>
                    {precios?.costo_venta?.familia_sin_margen ? 'La familia no tiene margen configurado.' : 'El producto no tiene costo.'}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </ToggleGroup>
        </div>
      )}

      <Button onClick={agregar} disabled={ocupado || !productoId} size="sm" className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
        {ocupado ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
        Agregar línea
      </Button>
    </div>
  );
}

function ConsultarComprasDialogContent({
  cotizacionId,
  entidadId,
  onCreada,
}: {
  cotizacionId: string;
  entidadId: string;
  onCreada: () => void;
}) {
  const [descripcion, setDescripcion] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [numeroParte, setNumeroParte] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [urgencia, setUrgencia] = useState('normal');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Dos peticiones secuenciales (consulta, luego línea) — sólo la segunda
  // dispara el refresco de servidor, con useAccionServidor.
  const { ejecutar: ejecutarLinea, refrescando } = useAccionServidor();

  const crear = async () => {
    if (descripcion.trim().length < 3) {
      setError('Describe lo que el cliente pidió.');
      return;
    }
    setError(null);
    setEnviando(true);
    const resConsulta = await fetch('/api/ventas/consultas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cotizacion_id: cotizacionId,
        entidad_id: entidadId,
        descripcion,
        marca_texto: marca || undefined,
        modelo_texto: modelo || undefined,
        numero_parte: numeroParte || undefined,
        cantidad: Number(cantidad),
        urgencia,
      }),
    });
    const dataConsulta = await resConsulta.json().catch(() => ({}));
    if (!resConsulta.ok) {
      setEnviando(false);
      setError(dataConsulta?.error ?? 'No se pudo crear la consulta.');
      return;
    }

    const resLinea = await ejecutarLinea(`/api/ventas/cotizaciones/${cotizacionId}/lineas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consulta_id: dataConsulta.data.id, descripcion_libre: descripcion, cantidad: Number(cantidad) }),
    });
    setEnviando(false);
    if (!resLinea.ok) {
      setError(resLinea.data?.error ?? 'La consulta se creó, pero no se pudo agregar la línea.');
      return;
    }
    onCreada();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Consultar a Compras</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Descripción de lo que pidió el cliente</Label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Marca</Label>
            <input value={marca} onChange={(e) => setMarca(e.target.value)} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2" />
          </div>
          <div>
            <Label className="text-xs">Modelo</Label>
            <input value={modelo} onChange={(e) => setModelo(e.target.value)} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2" />
          </div>
          <div>
            <Label className="text-xs">Número de parte</Label>
            <input value={numeroParte} onChange={(e) => setNumeroParte(e.target.value)} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2" />
          </div>
          <div>
            <Label className="text-xs">Cantidad</Label>
            <input type="number" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Urgencia</Label>
          <select value={urgencia} onChange={(e) => setUrgencia(e.target.value)} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2">
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button size="sm" onClick={crear} disabled={enviando || refrescando} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
          {(enviando || refrescando) && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
          Enviar consulta
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AprobarDialog({ cotizacionId, accion }: { cotizacionId: string; accion: (url: string, body?: unknown) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [canal, setCanal] = useState('whatsapp');
  const [referencia, setReferencia] = useState('');
  const [faltantes, setFaltantes] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const toggleFaltante = (f: string) => {
    setFaltantes((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const confirmar = async () => {
    setEnviando(true);
    const ok = await accion(`/api/ventas/cotizaciones/${cotizacionId}/aprobar`, {
      canal,
      referencia: referencia || undefined,
      datos_faltantes: faltantes,
    });
    setEnviando(false);
    if (ok) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-rtb-gold hover:bg-rtb-gold/90 text-white">Aprobar (cliente aceptó)</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Evidencia de aprobación del cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Canal por el que aprobó</Label>
            <select value={canal} onChange={(e) => setCanal(e.target.value)} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2">
              {CANAL_ORIGENES.map((c) => (
                <option key={c} value={c}>
                  {CANAL_ORIGEN_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Referencia (opcional)</Label>
            <input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej. folio del correo, hora de la llamada…"
              className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <Label className="text-xs">Datos formales que faltan (opcional)</Label>
            <div className="mt-1 space-y-1.5">
              {DATOS_FALTANTES.map((f) => (
                <label key={f} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={faltantes.includes(f)} onChange={() => toggleFaltante(f)} />
                  {DATOS_FALTANTES_LABELS[f]}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" onClick={confirmar} disabled={enviando} className="bg-rtb-gold hover:bg-rtb-gold/90 text-white">
            {enviando && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Aprobar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
