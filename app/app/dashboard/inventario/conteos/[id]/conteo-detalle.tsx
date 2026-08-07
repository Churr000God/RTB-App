'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/rbac/hooks';
import { Button } from '@/components/ui/button';
import { ConteoEstadoBadge } from '@/components/inventario/estado-badge';
import { MotivoDialog } from '@/components/inventario/motivo-dialog';
import { CONTEO_ESTADO_LABELS, CONTEO_LINEA_ESTADO_LABELS, CONTEO_TRANSICIONES, FIRMA_ROL_LABELS } from '@/lib/inventario/config';
import { ROLES_FIRMAN_SUPERVISION } from '@/lib/inventario/permisos';
import type {
  ConteoAplicarResultado,
  ConteoConciliacionFila,
  InventarioConteo,
  InventarioConteoAsignacion,
  InventarioConteoFirma,
  InventarioConteoVersion,
  InventarioExactitudFila,
  FirmaRol,
} from '@/types/inventario';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileEdit,
  Loader2,
  Lock,
  PenLine,
  Snowflake,
  Unlock,
  Users,
} from 'lucide-react';

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

interface OpcionAlcance {
  id: string;
  label: string;
}

// GET .../congelamientos (E-05/M-09): antes no había ninguna pantalla que
// mostrara ni liberara un congelamiento — un conteo terminado dejaba el
// producto/ubicación inmovilizado para siempre (016_qa_correcciones.sql
// libera automático al aplicar/cancelar; esta sección cubre el resto de
// los casos, p.ej. liberar antes de que el conteo termine).
interface Congelamiento {
  id: string;
  ubicacion_id: string | null;
  producto_id: string | null;
  liberado_at: string | null;
  motivo_liberacion: string | null;
  ubicaciones_internas: { codigo: string; nombre: string } | null;
  productos: { codigo_interno: string; nombre: string } | null;
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
  const [congelamientos, setCongelamientos] = useState<Congelamiento[]>([]);
  const [ubicaciones, setUbicaciones] = useState<OpcionAlcance[]>([]);
  const [familias, setFamilias] = useState<OpcionAlcance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ConteoAplicarResultado | null>(null);

  // M-01 (contexto/AUDITORIA_QA_ROLES_2026-08-06.md): "Asignar capturista"
  // usaba window.prompt pidiendo pegar un UUID a mano. Al reemplazarlo se
  // encontró un bug de fondo, enmascarado por E-01/E-02 (nadie llegaba
  // vivo hasta este botón): el POST mandaba `familia_id: null,
  // ubicacion_id: null` siempre — pero asg_alcance_chk (012) exige uno de
  // los dos no nulo, así que la asignación SIEMPRE habría fallado. Ahora
  // el formulario pide un alcance real (precargado desde conteo.alcance
  // cuando ya trae ubicación o familia).
  const [asignando, setAsignando] = useState(false);
  const [nuevoAsignado, setNuevoAsignado] = useState('');
  const [nuevaUbicacion, setNuevaUbicacion] = useState('');
  const [nuevaFamilia, setNuevaFamilia] = useState('');

  const puedeVerTeorico = useMemo(
    () => conteo.estado !== 'en_captura' || conteo.vista_ciega === false || ['super_admin', 'direccion'].includes(role ?? ''),
    [conteo, role]
  );
  const puedeAplicar = ['super_admin', 'direccion'].includes(role ?? '');

  const cargarCongelamientos = async () => {
    const res = await fetch(`/api/inventario/conteos/${conteo.id}/congelamientos`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setCongelamientos(data.data ?? []);
  };

  useEffect(() => {
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: u } = await supabase.rpc('usuarios_directorio');
      setUsuarios((u ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name })));

      const [conc, ex, ubi, fam] = await Promise.all([
        fetch(`/api/inventario/conteos/${conteo.id}/conciliacion`).then((r) => r.json()),
        fetch(`/api/inventario/conteos/${conteo.id}/exactitud`).then((r) => r.json()),
        fetch('/api/ubicaciones').then((r) => r.json()),
        fetch('/api/catalogos/familias').then((r) => r.json()),
      ]);
      setConciliacion(conc.data ?? []);
      setExactitud(ex.data ?? []);
      setUbicaciones((ubi.data ?? []).map((x: any) => ({ id: x.id, label: `${x.codigo} — ${x.nombre}` })));
      setFamilias((fam.data ?? []).map((x: any) => ({ id: x.id, label: `${x.clave} — ${x.nombre}` })));

      // Precarga el alcance de la asignación con el alcance del propio
      // conteo cuando ya está acotado a una ubicación/familia — el caso
      // más común es que el capturista cubra exactamente ese alcance.
      const alcance = conteo.alcance as { ubicacion_id?: string; familia_id?: string };
      if (alcance?.ubicacion_id) setNuevaUbicacion(alcance.ubicacion_id);
      if (alcance?.familia_id) setNuevaFamilia(alcance.familia_id);

      void cargarCongelamientos();
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

  const congelar = () => void accion(`/api/inventario/conteos/${conteo.id}/congelar`).then(() => cargarCongelamientos());
  const transicionar = (estado: string) => void accion(`/api/inventario/conteos/${conteo.id}/estado`, { estado });
  // 025: aplicar ya no sólo copia el físico — deja armado el expediente
  // (una discrepancia abierta por diferencia) y la propuesta (un ajuste en
  // borrador con sus líneas). accion() descarta la respuesta y no muestra
  // nada al terminar, así que esto va con fetch propio (mismo patrón que
  // liberar()): sin feedback, el usuario no tiene forma de saber que hay
  // un ajuste esperándolo ni de llegar a él. 'aplicado' libera solo el
  // congelamiento (after_update_conteos_liberar, 016) — refrescar la
  // lista para que se vea de inmediato, no sólo tras el próximo mount.
  const aplicar = async () => {
    setError(null);
    setResultado(null);
    setLoading(true);
    const res = await fetch(`/api/inventario/conteos/${conteo.id}/aplicar`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo aplicar el conteo.');
      return;
    }
    setResultado(data as ConteoAplicarResultado);
    void cargarCongelamientos();
    router.refresh();
  };
  const cancelar = (motivo: string) =>
    accion(`/api/inventario/conteos/${conteo.id}/estado`, { estado: 'cancelado', motivo_cancelacion: motivo }).then((ok) => {
      void cargarCongelamientos();
      return ok;
    });

  const liberar = async (congelamientoId: string, motivo: string) => {
    const res = await fetch(`/api/inventario/conteos/${conteo.id}/congelamientos/${congelamientoId}/liberar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo_liberacion: motivo }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      void cargarCongelamientos();
      return true;
    }
    setError(data?.error ?? 'No se pudo liberar el congelamiento.');
    return false;
  };

  const asignar = async () => {
    if (!nuevoAsignado) {
      setError('Elige a quién asignar.');
      return;
    }
    if (!nuevaUbicacion && !nuevaFamilia) {
      setError('Indica una ubicación o una familia para la asignación.');
      return;
    }
    setError(null);
    const res = await fetch(`/api/inventario/conteos/${conteo.id}/asignaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asignado_a: nuevoAsignado,
        ubicacion_id: nuevaUbicacion || null,
        familia_id: nuevaUbicacion ? null : nuevaFamilia || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setAsignaciones((a) => [...a, data.data]);
      setAsignando(false);
      setNuevoAsignado('');
    } else {
      setError(data?.error ?? 'Error al asignar');
    }
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

  // 'congelado' y 'aplicado' tienen botón dedicado (Congelar / Aplicar al
  // inventario), cada uno con su propia ruta que hace más que un UPDATE
  // genérico — ofrecerlos también aquí (M-06, E-03/E-04,
  // contexto/AUDITORIA_QA_ROLES_2026-08-06.md) daba dos caminos para lo
  // mismo, y el de /estado nunca aplicó nada al inventario (además de
  // dejar que almacen lo activara, ya que /estado no distinguía roles por
  // estado destino).
  const transicionesDisponibles = CONTEO_TRANSICIONES[conteo.estado] ?? [];
  const siguientes = transicionesDisponibles.filter((s) => s !== 'cancelado' && s !== 'congelado' && s !== 'aplicado');
  const puedeCancelar = transicionesDisponibles.includes('cancelado');

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
          {siguientes.map((s) => (
            <Button key={s} onClick={() => transicionar(s)} disabled={loading} variant="outline">
              Pasar a {CONTEO_ESTADO_LABELS[s]}
            </Button>
          ))}
          {conteo.estado === 'en_captura' && (
            <Button asChild className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
              <Link href={`/dashboard/inventario/conteos/${conteo.id}/captura`}>Ir a captura</Link>
            </Button>
          )}
          {conteo.estado === 'cerrado' && puedeAplicar && (
            <Button onClick={() => void aplicar()} disabled={loading} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
              <CheckCircle2 className="w-4 h-4 mr-2" /> Aplicar al inventario
            </Button>
          )}
          {puedeCancelar && (
            <MotivoDialog
              trigger={
                <Button disabled={loading} variant="outline" className="text-destructive">
                  Cancelar
                </Button>
              }
              titulo="Cancelar conteo"
              descripcion="Explica por qué se cancela este conteo — queda en el acta."
              placeholder="Motivo de cancelación…"
              minLength={5}
              confirmLabel="Cancelar conteo"
              destructivo
              onConfirm={cancelar}
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

      {resultado && (
        <div className="bg-white rounded-xl p-5 border-l-4 border-l-rtb-teal space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-rtb-teal shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-display font-semibold text-rtb-navy">
                Conteo {resultado.conteoFolio ?? conteo.folio} aplicado
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Se registró la medición física y quedó armado el expediente de las diferencias.
              </p>
            </div>
          </div>

          <ul className="text-sm space-y-1.5 pl-7">
            <li className="flex items-baseline gap-2">
              <span className="tabular-nums font-semibold text-rtb-navy">{resultado.existenciasActualizadas}</span>
              <span className="text-muted-foreground">
                {resultado.existenciasActualizadas === 1 ? 'existencia actualizada' : 'existencias actualizadas'} con la cantidad física medida
              </span>
            </li>
            <li className="flex items-baseline gap-2">
              <span className="tabular-nums font-semibold text-rtb-navy">{resultado.discrepanciasGeneradas}</span>
              <span className="text-muted-foreground">
                {resultado.discrepanciasGeneradas === 1 ? 'discrepancia abierta' : 'discrepancias abiertas'} — cada una espera causa presunta y banda
              </span>
            </li>
            {resultado.discrepanciasReubicacion > 0 && (
              <li className="flex items-baseline gap-2">
                <span className="tabular-nums font-semibold text-accent">{resultado.discrepanciasReubicacion}</span>
                <span className="text-muted-foreground">
                  de ubicación incorrecta (Paso 0 · Reubicación): no entran al ajuste, hay que emparejarlas
                </span>
              </li>
            )}
            {resultado.ajusteFolio ? (
              <li className="flex items-baseline gap-2">
                <span className="tabular-nums font-semibold text-rtb-navy">{resultado.lineasAjuste}</span>
                <span className="text-muted-foreground">
                  {resultado.lineasAjuste === 1 ? 'línea' : 'líneas'} en el ajuste borrador{' '}
                  <span className="tabular-nums font-medium text-rtb-navy">{resultado.ajusteFolio}</span>
                </span>
              </li>
            ) : (
              <li className="text-muted-foreground">Sin diferencias que ajustar — no se creó ningún ajuste.</li>
            )}
          </ul>

          <div className="flex items-start gap-2 p-3 bg-rtb-surface rounded-lg text-xs text-rtb-navy/80">
            <AlertCircle className="w-4 h-4 shrink-0 text-accent mt-0.5" />
            <p>
              <strong className="font-semibold">El inventario teórico todavía no cambió.</strong>{' '}
              {resultado.ajusteFolio ? (
                <>
                  Se corrige cuando el ajuste {resultado.ajusteFolio} se envíe a autorización, lo autorice{' '}
                  <em>otra persona</em> y se aplique — ese es el único camino que genera movimientos de kardex.
                  Antes de enviarlo, clasifica la causa de cada discrepancia: una diferencia sin causa
                  identificada no se ajusta, se declara como hallazgo (CIE-DIS-01).
                </>
              ) : (
                <>El físico medido coincide con el teórico en todas las líneas aplicadas.</>
              )}
            </p>
          </div>

          {resultado.ajusteId && (
            <Button asChild className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
              <Link href={`/dashboard/inventario/ajustes/${resultado.ajusteId}`}>
                <FileEdit className="w-4 h-4 mr-2" /> Abrir ajuste {resultado.ajusteFolio}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          )}
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
            {(conteo.estado === 'congelado' || conteo.estado === 'en_captura') && !asignando && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setAsignando(true)}>
                Asignar capturista
              </Button>
            )}
            {asignando && (
              <div className="p-2 bg-rtb-surface/60 rounded-lg space-y-2">
                <select
                  value={nuevoAsignado}
                  onChange={(e) => setNuevoAsignado(e.target.value)}
                  className="w-full text-xs border border-border rounded-lg px-2 py-1.5"
                >
                  <option value="">Selecciona un usuario…</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
                <select
                  value={nuevaUbicacion}
                  onChange={(e) => {
                    setNuevaUbicacion(e.target.value);
                    if (e.target.value) setNuevaFamilia('');
                  }}
                  className="w-full text-xs border border-border rounded-lg px-2 py-1.5"
                >
                  <option value="">Sin ubicación específica</option>
                  {ubicaciones.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
                {!nuevaUbicacion && (
                  <select
                    value={nuevaFamilia}
                    onChange={(e) => setNuevaFamilia(e.target.value)}
                    className="w-full text-xs border border-border rounded-lg px-2 py-1.5"
                  >
                    <option value="">Sin familia específica</option>
                    {familias.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAsignando(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={asignar} disabled={!nuevoAsignado}>
                    Asignar
                  </Button>
                </div>
              </div>
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

          {congelamientos.length > 0 && (
            <div className="bg-white rounded-xl p-5 space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <h3 className="text-sm font-display font-semibold text-rtb-navy flex items-center gap-1.5">
                <Snowflake className="w-4 h-4 text-rtb-teal" /> Congelamiento
              </h3>
              <ul className="space-y-2 text-xs">
                {congelamientos.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                    <span>
                      {c.productos ? `${c.productos.codigo_interno} — ${c.productos.nombre}` : c.ubicaciones_internas ? `${c.ubicaciones_internas.codigo} — ${c.ubicaciones_internas.nombre}` : 'Alcance general'}
                      {c.liberado_at && <span className="block text-muted-foreground">Liberado: {c.motivo_liberacion}</span>}
                    </span>
                    {!c.liberado_at && (
                      <MotivoDialog
                        trigger={
                          <Button size="sm" variant="outline" className="shrink-0">
                            <Unlock className="w-3.5 h-3.5 mr-1" /> Liberar
                          </Button>
                        }
                        titulo="Liberar congelamiento"
                        descripcion="El producto/ubicación vuelve a poder moverse en el kardex. Explica por qué se libera antes de que el conteo termine."
                        placeholder="Motivo de liberación…"
                        confirmLabel="Liberar"
                        onConfirm={(motivo) => liberar(c.id, motivo)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
