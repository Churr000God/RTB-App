'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/rbac/hooks';
import { Button } from '@/components/ui/button';
import { ConteoEstadoBadge } from '@/components/inventario/estado-badge';
import { CONTEO_LINEA_ESTADO_LABELS, CONTEO_TRANSICIONES, FIRMA_ROL_LABELS } from '@/lib/inventario/config';
import { ROLES_FIRMAN_SUPERVISION } from '@/lib/inventario/permisos';
import type {
  ConteoConciliacionFila,
  InventarioConteo,
  InventarioConteoAsignacion,
  InventarioConteoFirma,
  InventarioConteoVersion,
  InventarioExactitudFila,
  FirmaRol,
} from '@/types/inventario';
import { AlertCircle, ArrowLeft, ClipboardCheck, Loader2, Lock, PenLine, Snowflake, Users } from 'lucide-react';

interface Props {
  conteo: InventarioConteo;
  asignacionesIniciales: InventarioConteoAsignacion[];
  firmasIniciales: InventarioConteoFirma[];
  versionesIniciales: InventarioConteoVersion[];
}

interface Usuario {
  id: string;
  full_name: string;
}

export function ConteoDetalle({ conteo, asignacionesIniciales, firmasIniciales, versionesIniciales }: Props) {
  const router = useRouter();
  const { role } = useAuth();

  const [asignaciones, setAsignaciones] = useState(asignacionesIniciales);
  const [firmas, setFirmas] = useState(firmasIniciales);
  const [versiones] = useState(versionesIniciales);
  const [conciliacion, setConciliacion] = useState<ConteoConciliacionFila[]>([]);
  const [exactitud, setExactitud] = useState<InventarioExactitudFila[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeVerTeorico = useMemo(
    () => conteo.estado !== 'en_captura' || conteo.vista_ciega === false || ['super_admin', 'direccion'].includes(role ?? ''),
    [conteo, role]
  );

  useEffect(() => {
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: u } = await supabase.rpc('usuarios_directorio');
      setUsuarios((u ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name })));

      const [conc, ex] = await Promise.all([
        fetch(`/api/inventario/conteos/${conteo.id}/conciliacion`).then((r) => r.json()),
        fetch(`/api/inventario/conteos/${conteo.id}/exactitud`).then((r) => r.json()),
      ]);
      setConciliacion(conc.data ?? []);
      setExactitud(ex.data ?? []);
    })();
  }, [conteo.id]);

  const accion = async (url: string, body?: unknown) => {
    setError(null);
    setLoading(true);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Ocurrió un error');
      return false;
    }
    router.refresh();
    return true;
  };

  const congelar = () => void accion(`/api/inventario/conteos/${conteo.id}/congelar`);
  const transicionar = (estado: string) => void accion(`/api/inventario/conteos/${conteo.id}/estado`, { estado });
  const cancelar = () => {
    const motivo = window.prompt('Motivo de cancelación:');
    if (motivo) void accion(`/api/inventario/conteos/${conteo.id}/estado`, { estado: 'cancelado', motivo_cancelacion: motivo });
  };

  const asignar = async () => {
    const asignado_a = window.prompt(
      `Asigna a (pega el id de usuario):\n${usuarios.map((u) => `${u.full_name}: ${u.id}`).join('\n')}`
    );
    if (!asignado_a) return;
    const res = await fetch(`/api/inventario/conteos/${conteo.id}/asignaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asignado_a, familia_id: null, ubicacion_id: null }),
    });
    const data = await res.json();
    if (res.ok) setAsignaciones((a) => [...a, data.data]);
    else setError(data?.error ?? 'Error al asignar');
  };

  const firmar = async (rol_firma: FirmaRol) => {
    const res = await fetch(`/api/inventario/conteos/${conteo.id}/firmas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rol_firma }),
    });
    const data = await res.json();
    if (res.ok) setFirmas((f) => [...f, data.data]);
    else setError(data?.error ?? 'Error al firmar');
  };

  const siguientes = CONTEO_TRANSICIONES[conteo.estado] ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/inventario/conteos">
          <ArrowLeft className="w-4 h-4 mr-1" /> Conteos
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6" /> {conteo.nombre}
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span className="tabular-nums text-xs">{conteo.folio}</span>
            <ConteoEstadoBadge estado={conteo.estado} />
            <span className="text-xs tabular-nums">v{Number(conteo.version).toFixed(1)}</span>
          </p>
          <p className="text-sm text-muted-foreground mt-1">{conteo.alcance_descripcion}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {conteo.estado === 'planificado' && (
            <Button onClick={congelar} disabled={loading} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
              <Snowflake className="w-4 h-4 mr-2" /> Congelar
            </Button>
          )}
          {siguientes
            .filter((s) => s !== 'cancelado')
            .map((s) => (
              <Button key={s} onClick={() => transicionar(s)} disabled={loading} variant="outline">
                Pasar a {s}
              </Button>
            ))}
          {conteo.estado === 'en_captura' && (
            <Button asChild className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
              <Link href={`/dashboard/inventario/conteos/${conteo.id}/captura`}>Ir a captura</Link>
            </Button>
          )}
          {siguientes.includes('cancelado') && (
            <Button onClick={cancelar} disabled={loading} variant="outline" className="text-destructive">
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {exactitud.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {exactitud.map((f) => (
            <div key={f.base} className="bg-white rounded-xl p-4 border-l-4 border-l-rtb-teal" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider capitalize">{f.base}</p>
              <p className={`text-2xl font-display font-bold mt-1 tabular-nums ${f.cumple === false ? 'text-destructive' : 'text-rtb-navy'}`}>
                {f.exactitud != null ? `${f.exactitud}%` : '—'}
              </p>
              {f.cumple != null && <p className="text-xs mt-1 text-muted-foreground">Umbral 95% — {f.cumple ? 'cumple' : 'no cumple'}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center justify-between px-4 pt-4">
              <h2 className="text-sm font-display font-semibold text-rtb-navy">Conciliación</h2>
              {!puedeVerTeorico && (
                <span className="text-xs text-accent flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Vista ciega activa durante la captura
                </span>
              )}
            </div>
            <table className="w-full mt-3">
              <thead>
                <tr className="bg-rtb-navy text-white">
                  <th className="text-left py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Producto</th>
                  <th className="text-left py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
                  <th className="text-right py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Teórica</th>
                  <th className="text-right py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Física</th>
                  <th className="text-right py-2.5 px-4 text-xs font-semibold uppercase tracking-wider">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {conciliacion.map((f, i) => (
                  <tr key={f.detalle_id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
                    <td className="py-2.5 px-4 text-sm">
                      <p className="font-medium text-rtb-navy">{f.nombre}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{f.codigo_interno}</p>
                    </td>
                    <td className="py-2.5 px-4 text-xs">{CONTEO_LINEA_ESTADO_LABELS[f.estado_conteo]}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-sm">{Number(f.cantidad_teorica).toLocaleString('es-MX')}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-sm">
                      {f.cantidad_fisica != null ? Number(f.cantidad_fisica).toLocaleString('es-MX') : '—'}
                    </td>
                    <td className={`py-2.5 px-4 text-right tabular-nums text-sm font-medium ${f.diferencia && f.diferencia !== 0 ? 'text-destructive' : ''}`}>
                      {f.diferencia != null ? f.diferencia : '—'}
                    </td>
                  </tr>
                ))}
                {conciliacion.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                      {puedeVerTeorico ? 'Sin líneas todavía — congela el conteo primero.' : 'La conciliación se muestra tras cerrar la captura, o a supervisión.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl p-5 space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h2 className="text-sm font-display font-semibold text-rtb-navy">Acta versionada</h2>
            {versiones.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin versiones publicadas todavía.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {versiones.map((v) => (
                  <li key={v.id} className="border-b border-border/50 pb-2">
                    <p className="font-medium text-rtb-navy">
                      V{Number(v.version).toFixed(1)} — {new Date(v.corte_at).toLocaleDateString('es-MX', { timeZone: 'UTC' })}
                    </p>
                    <p className="text-muted-foreground">{v.que_corrigio}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="bg-white rounded-xl p-5 space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="text-sm font-display font-semibold text-rtb-navy flex items-center gap-1.5">
              <Users className="w-4 h-4 text-rtb-teal" /> Asignaciones
            </h3>
            <ul className="space-y-1.5 text-sm">
              {asignaciones.map((a) => (
                <li key={a.id} className="flex justify-between text-xs">
                  <span>{usuarios.find((u) => u.id === a.asignado_a)?.full_name ?? a.asignado_a}</span>
                  <span className="text-muted-foreground">{a.finalizado_at ? 'Finalizada' : a.iniciado_at ? 'En curso' : 'Pendiente'}</span>
                </li>
              ))}
              {asignaciones.length === 0 && <li className="text-xs text-muted-foreground">Sin asignaciones.</li>}
            </ul>
            {(conteo.estado === 'congelado' || conteo.estado === 'en_captura') && (
              <Button variant="outline" size="sm" className="w-full" onClick={asignar}>
                Asignar capturista
              </Button>
            )}
          </div>

          <div className="bg-white rounded-xl p-5 space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="text-sm font-display font-semibold text-rtb-navy flex items-center gap-1.5">
              <PenLine className="w-4 h-4 text-rtb-teal" /> Firmas (RTB-CIE-01)
            </h3>
            <ul className="space-y-1.5 text-sm">
              {firmas.map((f) => (
                <li key={f.id} className="flex justify-between text-xs">
                  <span>{FIRMA_ROL_LABELS[f.rol_firma]}</span>
                  <span className="text-muted-foreground tabular-nums">{new Date(f.firmado_at).toLocaleDateString('es-MX', { timeZone: 'UTC' })}</span>
                </li>
              ))}
              {firmas.length === 0 && <li className="text-xs text-muted-foreground">Sin firmas todavía. Se exigen supervisor y gerente_operaciones antes de cerrar.</li>}
            </ul>
            {conteo.estado === 'en_conciliacion' && (
              <div className="flex flex-col gap-1.5">
                {ROLES_FIRMAN_SUPERVISION.includes(role ?? ('' as any)) && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => firmar('supervisor')}>
                      Firmar como supervisor
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => firmar('gerente_operaciones')}>
                      Firmar como gerente de operaciones
                    </Button>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={() => firmar('contador')}>
                  Firmar como contador
                </Button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
