'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/rbac/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AjusteEstadoBadge } from '@/components/inventario/estado-badge';
import { AJUSTE_TIPO_LABELS } from '@/lib/inventario/config';
import { ROLES_AUTORIZAN_AJUSTES } from '@/lib/inventario/permisos';
import { ArrowLeft, AlertCircle, FileEdit, Loader2, Plus, Send, ShieldCheck, Zap } from 'lucide-react';
import type { InventarioAjuste, InventarioAjusteLinea } from '@/types/inventario';

type Linea = InventarioAjusteLinea & { productos: { codigo_interno: string; nombre: string } | null };

export default function AjusteDetallePage({ params }: { params: { id: string } }) {
  const { role, user } = useAuth();
  const [ajuste, setAjuste] = useState<InventarioAjuste | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [productoId, setProductoId] = useState('');
  const [ubicacionId, setUbicacionId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costoUnitario, setCostoUnitario] = useState('');
  const [soportePath, setSoportePath] = useState('');
  const [comentario, setComentario] = useState('');
  const [motivoRechazo, setMotivoRechazo] = useState('');

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/inventario/ajustes/${params.id}`);
    const data = await res.json();
    if (res.ok) {
      setAjuste(data.ajuste);
      setLineas(data.lineas ?? []);
      setSoportePath(data.ajuste.soporte_path ?? '');
    }
  }, [params.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const accion = async (url: string, method = 'POST', body?: unknown) => {
    setError(null);
    setLoading(true);
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Ocurrió un error');
      return false;
    }
    void cargar();
    return true;
  };

  const guardarSoporte = () => void accion(`/api/inventario/ajustes/${params.id}`, 'PATCH', { soporte_path: soportePath || undefined });
  const agregarLinea = async () => {
    const ok = await accion(`/api/inventario/ajustes/${params.id}/lineas`, 'POST', {
      producto_id: productoId,
      ubicacion_id: ubicacionId || undefined,
      cantidad_ajuste: Number(cantidad),
      costo_unitario: costoUnitario ? Number(costoUnitario) : undefined,
    });
    if (ok) {
      setProductoId('');
      setUbicacionId('');
      setCantidad('');
      setCostoUnitario('');
    }
  };
  const enviar = () => void accion(`/api/inventario/ajustes/${params.id}/enviar`);
  const autorizar = () => void accion(`/api/inventario/ajustes/${params.id}/resolver`, 'POST', { decision: 'autorizar', comentario_autorizacion: comentario || undefined });
  const rechazar = () => {
    if (!motivoRechazo.trim()) {
      setError('El motivo de rechazo es obligatorio');
      return;
    }
    void accion(`/api/inventario/ajustes/${params.id}/resolver`, 'POST', { decision: 'rechazar', motivo_rechazo: motivoRechazo });
  };
  const aplicar = () => void accion(`/api/inventario/ajustes/${params.id}/aplicar`);

  if (!ajuste) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 text-rtb-teal animate-spin" />
      </div>
    );
  }

  const esSolicitante = ajuste.solicitante_id === user?.id;
  const puedeAutorizar = ROLES_AUTORIZAN_AJUSTES.includes(role ?? ('' as any)) && !esSolicitante;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/inventario/ajustes">
          <ArrowLeft className="w-4 h-4 mr-1" /> Ajustes
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <FileEdit className="w-6 h-6" /> {ajuste.folio}
        </h1>
        <p className="text-muted-foreground mt-1 flex items-center gap-2">
          <AjusteEstadoBadge estado={ajuste.estado} />
          <span className="text-sm">{AJUSTE_TIPO_LABELS[ajuste.tipo]}</span>
        </p>
        <p className="text-sm text-rtb-navy mt-2">{ajuste.motivo}</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {esSolicitante && ajuste.estado === 'borrador' && (
        <div className="bg-white rounded-xl p-5 space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <h2 className="text-sm font-display font-semibold text-rtb-navy">Soporte documental</h2>
          <Input value={soportePath} onChange={(e) => setSoportePath(e.target.value)} placeholder="Ruta del archivo en el bucket soportes-inventario" />
          <Button size="sm" variant="outline" onClick={guardarSoporte}>
            Guardar ruta de soporte
          </Button>
        </div>
      )}

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <h2 className="text-sm font-display font-semibold text-rtb-navy px-4 pt-4">Líneas</h2>
        <table className="w-full mt-3">
          <thead>
            <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
              <th className="py-2 px-4">Producto</th>
              <th className="py-2 px-4 text-right">Cantidad</th>
              <th className="py-2 px-4 text-right">Costo unitario</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.id} className="border-t border-border/50">
                <td className="py-2 px-4 text-sm">{l.productos?.nombre ?? l.producto_id}</td>
                <td className={`py-2 px-4 text-right tabular-nums text-sm ${Number(l.cantidad_ajuste) < 0 ? 'text-destructive' : 'text-primary'}`}>
                  {Number(l.cantidad_ajuste) > 0 ? '+' : ''}
                  {l.cantidad_ajuste}
                </td>
                <td className="py-2 px-4 text-right tabular-nums text-sm">{l.costo_unitario ?? '—'}</td>
              </tr>
            ))}
            {lineas.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-muted-foreground text-sm">
                  Sin líneas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {esSolicitante && ajuste.estado === 'borrador' && (
          <div className="flex flex-wrap gap-2 items-end p-4 border-t border-border">
            <div>
              <Label className="text-xs">Producto ID</Label>
              <Input value={productoId} onChange={(e) => setProductoId(e.target.value)} className="w-56" />
            </div>
            <div>
              <Label className="text-xs">Ubicación ID (opcional)</Label>
              <Input value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)} className="w-56" />
            </div>
            <div>
              <Label className="text-xs">Cantidad (signada)</Label>
              <Input type="number" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="w-32 tabular-nums" />
            </div>
            <div>
              <Label className="text-xs">Costo unitario</Label>
              <Input type="number" step="any" value={costoUnitario} onChange={(e) => setCostoUnitario(e.target.value)} className="w-32 tabular-nums" />
            </div>
            <Button size="sm" onClick={agregarLinea} disabled={loading || !productoId || !cantidad} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
              <Plus className="w-3.5 h-3.5 mr-1" /> Agregar línea
            </Button>
          </div>
        )}
      </div>

      {esSolicitante && ajuste.estado === 'borrador' && (
        <Button onClick={enviar} disabled={loading || lineas.length === 0} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
          <Send className="w-4 h-4 mr-2" /> Enviar a autorización
        </Button>
      )}

      {puedeAutorizar && ajuste.estado === 'pendiente_autorizacion' && (
        <div className="bg-white rounded-xl p-5 space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <h2 className="text-sm font-display font-semibold text-rtb-navy flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-rtb-teal" /> Autorización
          </h2>
          <p className="text-xs text-muted-foreground">No puedes autorizar tu propia solicitud — se aplica automáticamente.</p>
          <Input placeholder="Comentario (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={autorizar} disabled={loading} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
              Autorizar
            </Button>
          </div>
          <Input placeholder="Motivo de rechazo" value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} />
          <Button onClick={rechazar} disabled={loading} variant="outline" className="text-destructive">
            Rechazar
          </Button>
        </div>
      )}

      {ajuste.estado === 'autorizado' && (
        <Button onClick={aplicar} disabled={loading} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
          <Zap className="w-4 h-4 mr-2" /> Aplicar al kardex
        </Button>
      )}
    </div>
  );
}
