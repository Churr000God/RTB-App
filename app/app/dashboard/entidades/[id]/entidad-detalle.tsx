'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/rbac/hooks';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { puede } from '@/lib/entidades/permisos';
import {
  CONDICION_PAGO_LABELS,
  ENTIDAD_TIPO_LABELS,
  PERSONA_TIPO_LABELS,
} from '@/lib/entidades/config';
import { EntidadEstadoBadge } from '@/components/entidades/estado-badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  AuditLogEntry,
  Cliente,
  Contacto,
  Direccion,
  Entidad,
  Proveedor,
  ProveedorCuentaBancaria,
  ProveedorCuentaResumen,
  SolicitudCambio,
} from '@/types/entidades';
import { ArrowLeft, Ban, Lock, ShieldAlert, Unlock } from 'lucide-react';

interface Props {
  entidad: Entidad;
  cliente: Cliente | null;
  proveedor: Proveedor | null;
  contactos: Contacto[];
  direcciones: Direccion[];
  solicitudesPendientes: SolicitudCambio[];
}

export function EntidadDetalle({ entidad, cliente, proveedor, contactos, direcciones, solicitudesPendientes }: Props) {
  const { role } = useAuth();
  const router = useRouter();
  const [modalBloqueo, setModalBloqueo] = useState<'temporal' | 'permanente' | 'desbloquear' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const bloqueada = entidad.estado === 'bloqueado_temporal' || entidad.estado === 'bloqueado_permanente';
  const puedeBloquear = role === 'super_admin' || role === 'direccion';

  const iniciales = entidad.nombre_legal
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const resolverBloqueo = async () => {
    if (!motivo.trim()) {
      setError('El motivo es obligatorio');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const ruta =
        modalBloqueo === 'desbloquear'
          ? `/api/entidades/${entidad.id}/desbloquear`
          : `/api/entidades/${entidad.id}/bloquear`;
      const body = modalBloqueo === 'desbloquear' ? { motivo } : { tipo: modalBloqueo, motivo };

      const res = await fetch(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'No se pudo completar la operación');
        setEnviando(false);
        return;
      }
      setModalBloqueo(null);
      setMotivo('');
      setMensaje(data.message ?? 'Operación completada.');
      router.refresh();
    } catch {
      setError('Error de conexión');
    }
    setEnviando(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/entidades">
          <ArrowLeft className="w-4 h-4 mr-1" /> Entidades
        </Link>
      </Button>

      {mensaje && (
        <div className="flex items-center gap-2 p-3 bg-rtb-surface text-rtb-navy rounded-lg text-sm">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{mensaje}</span>
        </div>
      )}

      <div className="bg-white rounded-xl p-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-rtb-navy text-white flex items-center justify-center font-display font-semibold text-lg shrink-0">
              {iniciales}
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight">{entidad.nombre_legal}</h1>
              <p className="text-sm text-muted-foreground tabular-nums">
                {entidad.clave} · RFC: {entidad.rfc ?? '—'}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rtb-surface text-rtb-navy-mid">
                  {ENTIDAD_TIPO_LABELS[entidad.tipo]}
                </span>
                <EntidadEstadoBadge estado={entidad.estado} pendiente={solicitudesPendientes.length > 0} />
              </div>
            </div>
          </div>

          {puedeBloquear && (
            <div className="flex gap-2">
              {!bloqueada ? (
                <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" onClick={() => setModalBloqueo('temporal')}>
                  <Ban className="w-4 h-4 mr-2" /> Bloquear
                </Button>
              ) : entidad.estado === 'bloqueado_temporal' ? (
                <Button variant="outline" onClick={() => setModalBloqueo('desbloquear')}>
                  <Unlock className="w-4 h-4 mr-2" /> Desbloquear
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Bloqueo permanente
                </span>
              )}
            </div>
          )}
        </div>

        {entidad.bloqueo_motivo && (
          <div className="mt-4 p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-sm text-destructive">
            <strong>Motivo del bloqueo:</strong> {entidad.bloqueo_motivo}
          </div>
        )}
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="contactos">Contactos y direcciones</TabsTrigger>
          {proveedor && <TabsTrigger value="cuentas">Cuenta bancaria</TabsTrigger>}
          <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card titulo="Datos generales">
              <Dato label="Tipo de persona" valor={PERSONA_TIPO_LABELS[entidad.persona_tipo]} />
              <Dato label="Nombre comercial" valor={entidad.nombre_comercial ?? '—'} />
              <Dato label="Correo" valor={entidad.correo_principal ?? '—'} />
              <Dato label="Teléfono" valor={entidad.telefono_principal ?? '—'} />
              <Dato label="Fecha de alta" valor={new Date(entidad.created_at).toLocaleDateString('es-MX', { timeZone: 'UTC' })} />
            </Card>

            {cliente && (
              <Card titulo="Condiciones comerciales · Cliente">
                <Dato label="Límite de crédito" valor={`$${Number(cliente.limite_credito).toLocaleString('es-MX')}`} />
                <Dato label="Días de crédito" valor={String(cliente.dias_credito)} />
                <Dato label="Descuento base" valor={`${cliente.descuento_maximo}%`} />
                <Dato label="Lista de precios" valor={cliente.lista_precio ?? '—'} />
              </Card>
            )}

            {proveedor && (
              <Card titulo="Condiciones comerciales · Proveedor">
                <Dato label="Categoría" valor={proveedor.categoria ?? '—'} />
                <Dato label="Plazo de pago" valor={`${proveedor.plazo_pago} días`} />
                <Dato label="Condición de pago" valor={CONDICION_PAGO_LABELS[proveedor.condicion_pago]} />
                <Dato label="Moneda" valor={proveedor.moneda_default} />
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="contactos" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card titulo="Contactos">
              {contactos.length === 0 && <p className="text-sm text-muted-foreground">Sin contactos registrados.</p>}
              {contactos.map((c) => (
                <div key={c.id} className="text-sm py-2 border-b border-border/50 last:border-0">
                  <p className="font-medium text-rtb-navy">
                    {c.nombre} {c.es_principal && <span className="text-[10px] text-rtb-teal ml-1">PRINCIPAL</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.cargo ?? '—'} · {c.telefono ?? '—'} · {c.correo ?? '—'}
                  </p>
                </div>
              ))}
            </Card>
            <Card titulo="Direcciones">
              {direcciones.length === 0 && <p className="text-sm text-muted-foreground">Sin direcciones registradas.</p>}
              {direcciones.map((d) => (
                <div key={d.id} className="text-sm py-2 border-b border-border/50 last:border-0">
                  <p className="font-medium text-rtb-navy capitalize">
                    {d.tipo} {d.es_principal && <span className="text-[10px] text-rtb-teal ml-1">PRINCIPAL</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.calle} {d.numero_exterior ?? ''}, {d.colonia ?? ''}, {d.ciudad}, {d.entidad_federativa} — {d.codigo_postal}
                  </p>
                </div>
              ))}
            </Card>
          </div>
        </TabsContent>

        {proveedor && (
          <TabsContent value="cuentas" className="mt-4">
            <CuentasBancarias proveedorId={proveedor.id} />
          </TabsContent>
        )}

        <TabsContent value="auditoria" className="mt-4">
          <Auditoria tabla="entidades" registroId={entidad.id} />
        </TabsContent>
      </Tabs>

      {modalBloqueo && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <h2 className="text-lg font-display font-semibold text-rtb-navy mb-1">
              {modalBloqueo === 'desbloquear'
                ? 'Desbloquear entidad'
                : modalBloqueo === 'permanente'
                  ? 'Bloqueo permanente'
                  : 'Bloqueo temporal'}
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              {modalBloqueo === 'desbloquear'
                ? role === 'direccion'
                  ? 'Quedará pendiente de aprobación de super_admin.'
                  : 'Se aplicará de inmediato.'
                : role === 'direccion' && modalBloqueo === 'temporal'
                  ? 'Quedará pendiente de aprobación de super_admin.'
                  : 'Se aplicará de inmediato.'}
            </p>
            {error && <p className="text-sm text-destructive mb-3">{error}</p>}
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo (obligatorio)"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 min-h-[90px]"
            />
            {role === 'super_admin' && modalBloqueo === 'temporal' && (
              <button
                type="button"
                onClick={() => setModalBloqueo('permanente')}
                className="text-xs text-destructive mt-2 underline"
              >
                Convertir a bloqueo permanente
              </button>
            )}
            <div className="flex justify-end gap-3 mt-5">
              <Button variant="outline" onClick={() => setModalBloqueo(null)}>
                Cancelar
              </Button>
              <Button onClick={resolverBloqueo} disabled={enviando} className="bg-destructive hover:bg-destructive/90 text-white">
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-rtb-surface/60 rounded-xl p-4">
      <h3 className="text-xs font-semibold text-rtb-navy-mid uppercase tracking-wider mb-3">{titulo}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-rtb-navy font-medium text-right">{valor}</span>
    </div>
  );
}

function CuentasBancarias({ proveedorId }: { proveedorId: string }) {
  const { role } = useAuth();
  const [data, setData] = useState<(ProveedorCuentaBancaria | ProveedorCuentaResumen)[]>([]);
  const [enmascarado, setEnmascarado] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/proveedores/${proveedorId}/cuentas`)
      .then(async (r) => {
        const json = await r.json();
        if (cancelado) return;
        // No dar por buena una respuesta con error sólo porque .json() no
        // lanzó — un fallo silencioso ya pasó una vez en este módulo
        // (audit_log sin GRANT SELECT, ver contexto/AUDITORIA_RTB-ENT-01.md).
        if (!r.ok) {
          setError(json?.error ?? 'No se pudieron cargar las cuentas bancarias');
          return;
        }
        setData(json.data ?? []);
        setEnmascarado(json.enmascarado ?? true);
      })
      .catch(() => !cancelado && setError('Error de conexión'))
      .finally(() => !cancelado && setLoading(false));
    return () => {
      cancelado = true;
    };
  }, [proveedorId]);

  if (!puede(role, 'cuentas_bancarias', 'select') && role !== 'direccion') {
    return <p className="text-sm text-muted-foreground">No tienes acceso a esta información (P03).</p>;
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="bg-white rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
        <Lock className="w-3.5 h-3.5 text-accent" />
        {enmascarado ? 'CLABE enmascarada — acceso restringido (P03 §II)' : 'Acceso completo (finanzas / super_admin)'}
      </div>
      {data.length === 0 && <p className="text-sm text-muted-foreground">Sin cuentas bancarias registradas.</p>}
      {data.map((c) => (
        <div key={c.id} className="text-sm py-2 border-b border-border/50 last:border-0 flex items-center justify-between">
          <div>
            <p className="font-medium text-rtb-navy">{c.banco}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {'clabe' in c ? `****${c.clabe.slice(-4)}` : c.clabe_enmascarada}
            </p>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rtb-surface text-rtb-navy-mid">
            {c.estado}
          </span>
        </div>
      ))}
    </div>
  );
}

function Auditoria({ tabla, registroId }: { tabla: string; registroId: string }) {
  const { role } = useAuth();
  const [entradas, setEntradas] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== 'super_admin' && role !== 'direccion') {
      setLoading(false);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    // El query builder de supabase-js es PromiseLike, no Promise (sin
    // .finally) — se envuelve en Promise.resolve() para poder usarlo.
    Promise.resolve(
      supabase
        .from('audit_log')
        .select('*')
        .eq('tabla', tabla)
        .eq('registro_id', registroId)
        .order('created_at', { ascending: false })
        .limit(50)
    )
      .then(({ data }) => setEntradas((data as AuditLogEntry[]) ?? []))
      .finally(() => setLoading(false));
  }, [tabla, registroId, role]);

  if (role !== 'super_admin' && role !== 'direccion') {
    return <p className="text-sm text-muted-foreground">Sólo dirección y super_admin consultan el historial.</p>;
  }
  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <table className="w-full">
        <thead>
          <tr className="bg-rtb-navy text-white">
            <th className="text-left py-2 px-4 text-xs font-semibold uppercase">Fecha</th>
            <th className="text-left py-2 px-4 text-xs font-semibold uppercase">Acción</th>
            <th className="text-left py-2 px-4 text-xs font-semibold uppercase">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {entradas.map((e) => (
            <tr key={e.id} className="border-b border-border/50">
              <td className="py-2 px-4 text-xs tabular-nums text-muted-foreground">
                {new Date(e.created_at).toLocaleString('es-MX', { timeZone: 'UTC' })}
              </td>
              <td className="py-2 px-4 text-xs">{e.accion}</td>
              <td className="py-2 px-4 text-xs text-muted-foreground">{e.motivo ?? '—'}</td>
            </tr>
          ))}
          {entradas.length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                Sin movimientos registrados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
