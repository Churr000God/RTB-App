'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ProductoCombobox } from '@/components/inventario/producto-combobox';
import { ProductoEtiqueta } from '@/components/inventario/producto-etiqueta';
import { CotizacionEstadoBadge } from '@/components/ventas/estado-badge';
import { MotivoDialog } from '@/components/inventario/motivo-dialog';
import { Actualizando } from '@/components/ui/actualizando';
import { useAccionServidor } from '@/lib/ui/use-accion-servidor';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { puede } from '@/lib/ventas/permisos';
import { DATOS_FALTANTES_LABELS, PEDIDO_VIA_LABELS, PRECIO_ORIGEN_LABELS } from '@/lib/ventas/config';
import { formatearMoneda, formatearPorcentaje } from '@/lib/ventas/validaciones';
import { CANAL_ORIGENES } from '@/types/entidades';
import { CANAL_ORIGEN_LABELS } from '@/lib/entidades/config';
import {
  DATOS_FALTANTES,
  PEDIDO_VIAS,
  type CotizacionEnvioRow,
  type CotizacionLineaRow,
  type DevolucionRow,
  type PedidoVia,
  type PrecioOrigenVenta,
} from '@/types/ventas';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Mail,
  Plus,
  Printer,
  Trash2,
  XCircle,
} from 'lucide-react';

interface Props {
  cotizacion: any;
  lineasIniciales: CotizacionLineaRow[];
  rol: string;
  userId: string;
  devolucion?: DevolucionRow | null;
  /** Contacto principal de la entidad, o entidades.correo_principal de
   *  respaldo — para prellenar el diálogo "Enviar por correo". */
  correoSugerido?: string | null;
  contactoNombre?: string | null;
  envios?: CotizacionEnvioRow[];
  /** id → full_name, resuelto por usuarios_directorio() en el servidor
   *  (profiles_select no deja ver la fila de otro usuario por embed). */
  nombresUsuarios?: Record<string, string>;
  /** clientes.requiere_po del cliente de esta cotización — prellena (no
   *  obliga) la vía sugerida en el diálogo de aprobación (043). */
  requierePo?: boolean;
}

// El servidor manda: cotizacion/lineas llegan como props del Server
// Component (page.tsx) y ya no se espejan en useState — cada mutación
// exitosa pasa por useAccionServidor(), que hace router.refresh() y deja
// que Next vuelva a pedir esas props. Ver contexto/AUDITORIA_RTB-VEN-01.md
// §7.3 (causa raíz: un useState(prop) sólo lee su valor inicial).
export function CotizacionDetalle({
  cotizacion,
  lineasIniciales: lineas,
  rol,
  userId,
  devolucion,
  correoSugerido,
  contactoNombre,
  envios = [],
  nombresUsuarios = {},
  requierePo = false,
}: Props) {
  const router = useRouter();
  const { ejecutar, ocupado, refrescando, error, setError } = useAccionServidor();

  const esBorrador = cotizacion.estado === 'borrador';
  const esEnviada = cotizacion.estado === 'enviada';
  // gerente_comercial faltaba aquí (bug preexistente): la RLS y las
  // funciones SQL ya lo autorizan desde 037, pero la UI le ocultaba todos
  // los botones de administración.
  const puedeAdministrar =
    rol === 'super_admin' ||
    rol === 'direccion' ||
    rol === 'gerente_comercial' ||
    (rol === 'ventas' && cotizacion.vendedor_id === userId);
  // 'enviada' edita igual que 'borrador' (decisión confirmada) —
  // ventas_cotizacion_linea_before_write() (040) ya lo permite en SQL.
  const puedeEditar = (esBorrador || esEnviada) && puedeAdministrar && puede(rol, 'cotizacion_lineas', 'update');
  const puedeEliminar = esBorrador && puedeAdministrar && puede(rol, 'cotizaciones', 'delete');
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

  // Cancelar no siempre cancela: si el pedido ya mostró entrega,
  // ventas_cotizacion_cancelar() (040) abre una devolución en su lugar y lo
  // dice en `resultado` — el aviso tiene que ser distinto en cada caso, así
  // que aquí se lee la respuesta completa en vez del booleano de accion().
  const cancelarCotizacion = async (motivo: string) => {
    const res = await ejecutar(`/api/ventas/cotizaciones/${cotizacion.id}/cancelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
    });
    if (!res.ok) return false;
    if (res.data?.resultado === 'en_devolucion') {
      toast.warning(`Ya había material entregado — se abrió la devolución ${res.data.devolucion_folio}.`);
    } else {
      toast.success('Cotización cancelada.');
    }
    return true;
  };

  const eliminarCotizacion = async () => {
    const res = await ejecutar(`/api/ventas/cotizaciones/${cotizacion.id}/eliminar`, { method: 'POST' });
    if (!res.ok) return;
    toast.success(`Cotización ${res.data?.folio ?? cotizacion.folio} eliminada.`);
    router.push('/dashboard/ventas/cotizaciones');
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
          {/* Disponible en CUALQUIER estado — la plantilla dibuja un sello
              (BORRADOR/CANCELADA/…) cuando aplica. Ancla real, no fetch+blob:
              así el propio visor de PDF del navegador da "imprimir" y
              "descargar" gratis. */}
          {lineasActivas.length > 0 ? (
            <Button variant="outline" asChild>
              <a href={`/api/ventas/cotizaciones/${cotizacion.id}/pdf`} target="_blank" rel="noopener noreferrer">
                <Printer className="w-4 h-4 mr-1" /> Ver / Imprimir PDF
              </a>
            </Button>
          ) : (
            <Button variant="outline" disabled title="Agrega al menos una línea">
              <Printer className="w-4 h-4 mr-1" /> Ver / Imprimir PDF
            </Button>
          )}
          {puedeAdministrar && (
            <EnviarCorreoDialog
              cotizacionId={cotizacion.id}
              folio={cotizacion.folio}
              correoSugerido={correoSugerido ?? null}
              deshabilitado={lineasActivas.length === 0}
            />
          )}
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
          {cotizacion.estado === 'enviada' && puedeAdministrar && (
            <AprobarDialog cotizacionId={cotizacion.id} ejecutar={ejecutar} ocupado={ocupado} requierePo={requierePo} />
          )}
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
          {/* Sólo desde 'aprobada' (antes borrador/enviada) — un borrador
              se elimina, una enviada se rechaza. Si el pedido ya tiene
              entrega, la función abre una devolución en vez de cancelar. */}
          {cotizacion.estado === 'aprobada' && puedeAdministrar && (
            <MotivoDialog
              trigger={
                <Button variant="outline" className="text-destructive" disabled={ocupado}>
                  Cancelar
                </Button>
              }
              titulo="Cancelar cotización"
              descripcion="Se cancelará el pedido, la nota de remisión (si existe) y se liberarán las reservas de inventario. Si el pedido ya registró alguna entrega, no se cancelará: se abrirá una devolución."
              confirmLabel="Cancelar cotización"
              destructivo
              onConfirm={cancelarCotizacion}
            />
          )}
          {puedeEliminar && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive" disabled={ocupado}>
                  Eliminar cotización
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar {cotizacion.folio}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminarán también sus {lineasActivas.length} línea{lineasActivas.length === 1 ? '' : 's'} y se
                    cancelará cualquier consulta a Compras abierta ligada a ella. Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={eliminarCotizacion} className="bg-destructive hover:bg-destructive/90">
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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

      {cotizacion.estado === 'en_devolucion' && devolucion && (
        <div className="p-3 bg-accent/10 rounded-lg text-sm space-y-1">
          <p>
            <span className="font-semibold">Devolución {devolucion.folio}</span> — {devolucion.motivo}
          </p>
          {devolucion.valor_entregado != null && (
            <p className="text-muted-foreground">Valor entregado: {formatearMoneda(devolucion.valor_entregado)}</p>
          )}
          {puedeAdministrar && (
            <Link href="/dashboard/ventas/devoluciones" className="text-rtb-teal hover:underline">
              Ver la devolución
            </Link>
          )}
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
              <LineaRow key={l.id} linea={l} puedeEditar={puedeEditar} esBorrador={esBorrador} />
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

      {envios.length > 0 && <EnviosHistorial envios={envios} nombresUsuarios={nombresUsuarios} />}
    </div>
  );
}

function EnviosHistorial({ envios, nombresUsuarios }: { envios: CotizacionEnvioRow[]; nombresUsuarios: Record<string, string> }) {
  const formateador = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div className="bg-white rounded-xl p-5 space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h2 className="text-sm font-display font-semibold text-rtb-navy">Envíos por correo</h2>
      <ul className="space-y-2">
        {envios.map((e) => (
          <li key={e.id} className="flex items-start gap-2 text-sm">
            {e.resultado === 'exitoso' ? (
              <CheckCircle2 className="w-4 h-4 text-rtb-teal shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            )}
            <div>
              <span>
                {e.para}
                {e.cc.length > 0 && <span className="text-muted-foreground"> (cc: {e.cc.join(', ')})</span>}
              </span>
              <span className="block text-xs text-muted-foreground">
                {formateador.format(new Date(e.enviado_at))}
                {e.enviado_por && ` · ${nombresUsuarios[e.enviado_por] ?? '—'}`}
              </span>
              {e.resultado === 'fallido' && e.error_detalle && (
                <span className="block text-xs text-destructive mt-0.5">{e.error_detalle}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EnviarCorreoDialog({
  cotizacionId,
  folio,
  correoSugerido,
  deshabilitado,
}: {
  cotizacionId: string;
  folio: string;
  correoSugerido: string | null;
  deshabilitado: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { ejecutar, ocupado, error, setError } = useAccionServidor();
  // Estado local sólo del formulario en captura — el patrón ya establecido
  // (ver comentario de CotizacionDetalle arriba): lo que el servidor no
  // sabe, no lo que ya vive ahí.
  const [para, setPara] = useState(correoSugerido ?? '');
  const [cc, setCc] = useState('');
  const [asunto, setAsunto] = useState(`Cotización ${folio} — RTB Refacciones`);
  const [mensaje, setMensaje] = useState('');

  const enviar = async () => {
    if (!para.trim()) {
      setError('Captura el correo del destinatario.');
      return;
    }
    const ccLista = cc
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await ejecutar(`/api/ventas/cotizaciones/${cotizacionId}/correo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ para: para.trim(), cc: ccLista, asunto: asunto.trim(), mensaje: mensaje.trim() || undefined }),
    });
    if (!res.ok) return;
    toast.success(`Cotización enviada a ${para.trim()}.`);
    setOpen(false);
    setMensaje('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={deshabilitado} title={deshabilitado ? 'Agrega al menos una línea' : ''}>
          <Mail className="w-4 h-4 mr-1" /> Enviar por correo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar cotización por correo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Para</Label>
            <Input
              type="email"
              value={para}
              onChange={(e) => setPara(e.target.value)}
              placeholder="cliente@empresa.com"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">CC (opcional, separados por coma)</Label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Asunto</Label>
            <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Mensaje (opcional)</Label>
            <Textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows={3}
              placeholder="Un párrafo adicional antes del cuerpo estándar del correo…"
              className="mt-1"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={enviar} disabled={ocupado} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {ocupado && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LineaRow({
  linea,
  puedeEditar,
  esBorrador,
}: {
  linea: CotizacionLineaRow;
  puedeEditar: boolean;
  esBorrador: boolean;
}) {
  const { ejecutar, ocupado, error } = useAccionServidor();

  const patch = (body: Record<string, unknown>) =>
    ejecutar(`/api/ventas/cotizaciones/${linea.cotizacion_id}/lineas/${linea.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  // Borrador: DELETE real, nunca se mostró al cliente. Enviada: sigue
  // siendo activo:false — el documento que el cliente ya vio conserva su
  // rastro (decisión confirmada, 039).
  const quitar = () =>
    esBorrador
      ? ejecutar(`/api/ventas/cotizaciones/${linea.cotizacion_id}/lineas/${linea.id}`, { method: 'DELETE' })
      : patch({ activo: false });

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
            <button
              onClick={quitar}
              disabled={ocupado}
              title={esBorrador ? 'Borrar línea' : 'Quitar del documento enviado'}
              className="text-destructive"
            >
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
          <button
            onClick={quitar}
            disabled={ocupado}
            title={esBorrador ? 'Borrar línea' : 'Quitar del documento enviado'}
            className="text-destructive"
          >
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

// 'via' bifurca el resto del ciclo dentro de ventas_cotizacion_aprobar()
// (043): 'nota_remision' (comportamiento de siempre) u 'orden_compra' —
// la PO nace en la misma transacción, con sus partidas copiadas 1:1 de las
// líneas del pedido. Prellenado (no forzado) a 'orden_compra' cuando
// clientes.requiere_po es true. El checkbox 'po_pendiente' de
// datos_faltantes se deshabilita en esa vía: ya no aplica, la PO se está
// registrando en este mismo paso.
function AprobarDialog({
  cotizacionId,
  ejecutar,
  ocupado,
  requierePo,
}: {
  cotizacionId: string;
  ejecutar: (url: string, init?: RequestInit) => Promise<{ ok: boolean; data: any }>;
  ocupado: boolean;
  requierePo: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [canal, setCanal] = useState('whatsapp');
  const [referencia, setReferencia] = useState('');
  const [faltantes, setFaltantes] = useState<string[]>([]);
  const [via, setVia] = useState<PedidoVia>(requierePo ? 'orden_compra' : 'nota_remision');
  const [numeroPo, setNumeroPo] = useState('');
  const [fechaPo, setFechaPo] = useState('');
  const [canalEntrega, setCanalEntrega] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFaltante = (f: string) => {
    setFaltantes((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const confirmar = async () => {
    if (via === 'orden_compra' && !numeroPo.trim()) {
      setError('Captura el número de PO del cliente.');
      return;
    }
    setError(null);

    // Mismo flujo de 3 pasos que el resto del módulo (inventario/ajustes/
    // [id]/page.tsx): subir el archivo al bucket ANTES de aprobar, para no
    // dejar la cotización aprobada con un adjunto a medias.
    let evidenciaPath: string | undefined;
    if (archivo) {
      setSubiendo(true);
      const resUrl = await fetch('/api/ventas/evidencias/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombreArchivo: archivo.name }),
      });
      const dataUrl = await resUrl.json().catch(() => ({}));
      if (!resUrl.ok) {
        setSubiendo(false);
        setError(dataUrl?.error ?? 'No se pudo subir el archivo.');
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from('evidencias-ventas')
        .uploadToSignedUrl(dataUrl.path, dataUrl.token, archivo);
      setSubiendo(false);
      if (uploadError) {
        setError('No se pudo subir el archivo: ' + uploadError.message);
        return;
      }
      evidenciaPath = dataUrl.path;
    }

    const res = await ejecutar(`/api/ventas/cotizaciones/${cotizacionId}/aprobar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        canal,
        referencia: referencia || undefined,
        datos_faltantes: via === 'orden_compra' ? faltantes.filter((f) => f !== 'po_pendiente') : faltantes,
        evidencia_path: evidenciaPath,
        via,
        numero_po: via === 'orden_compra' ? numeroPo.trim() : undefined,
        fecha_po: via === 'orden_compra' ? fechaPo || undefined : undefined,
        canal_entrega: via === 'orden_compra' ? canalEntrega || undefined : undefined,
      }),
    });
    if (!res.ok) return;
    setOpen(false);
    if (res.data?.via === 'orden_compra' && res.data?.po_folio) {
      toast.success(`Cotización aprobada — se creó la PO ${res.data.po_folio}.`);
    } else {
      toast.success('Cotización aprobada.');
    }
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
            <Label className="text-xs">¿Cómo se aprueba?</Label>
            <ToggleGroup
              type="single"
              value={via}
              onValueChange={(v) => v && setVia(v as PedidoVia)}
              className="mt-1 justify-start"
            >
              {PEDIDO_VIAS.map((v) => (
                <ToggleGroupItem key={v} value={v} className="text-xs">
                  {PEDIDO_VIA_LABELS[v]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {requierePo && via === 'nota_remision' && (
              <p className="mt-1 text-[11px] text-amber-700">Este cliente normalmente exige PO — confirma que de verdad va sin ella.</p>
            )}
          </div>

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

          {via === 'orden_compra' && (
            <div className="p-3 bg-rtb-surface/60 rounded-lg space-y-3">
              <p className="text-xs font-semibold text-rtb-navy">Datos de la orden de compra</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Número de PO *</Label>
                  <input
                    value={numeroPo}
                    onChange={(e) => setNumeroPo(e.target.value)}
                    className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <Label className="text-xs">Fecha de la PO (opcional)</Label>
                  <input
                    type="date"
                    value={fechaPo}
                    onChange={(e) => setFechaPo(e.target.value)}
                    className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Canal de entrega de la PO (opcional)</Label>
                <select
                  value={canalEntrega}
                  onChange={(e) => setCanalEntrega(e.target.value)}
                  className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
                >
                  <option value="">Igual que el canal de aprobación</option>
                  {CANAL_ORIGENES.map((c) => (
                    <option key={c} value={c}>
                      {CANAL_ORIGEN_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Archivo de la PO (opcional — también se puede subir después)</Label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                  className="mt-1 text-xs"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Las partidas se copiarán tal cual de esta cotización — no se vuelven a capturar.</p>
            </div>
          )}

          <div>
            <Label className="text-xs">Datos formales que faltan (opcional)</Label>
            <div className="mt-1 space-y-1.5">
              {DATOS_FALTANTES.map((f) => (
                <label
                  key={f}
                  className={`flex items-center gap-2 text-xs ${f === 'po_pendiente' && via === 'orden_compra' ? 'opacity-40' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={faltantes.includes(f)}
                    disabled={f === 'po_pendiente' && via === 'orden_compra'}
                    onChange={() => toggleFaltante(f)}
                  />
                  {DATOS_FALTANTES_LABELS[f]}
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button size="sm" onClick={confirmar} disabled={ocupado || subiendo} className="bg-rtb-gold hover:bg-rtb-gold/90 text-white">
            {(ocupado || subiendo) && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Aprobar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
