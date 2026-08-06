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
  UMBRAL_APROBACION_CREDITO,
} from '@/lib/entidades/config';
import { EntidadEstadoBadge } from '@/components/entidades/estado-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { ArrowLeft, Ban, Loader2, Lock, Pencil, ShieldAlert, Unlock } from 'lucide-react';

interface Props {
  entidad: Entidad;
  cliente: Cliente | null;
  proveedor: Proveedor | null;
  contactos: Contacto[];
  direcciones: Direccion[];
  solicitudesPendientes: SolicitudCambio[];
  avisoInicial?: string | null;
}

export function EntidadDetalle({ entidad, cliente, proveedor, contactos, direcciones, solicitudesPendientes, avisoInicial }: Props) {
  const { role } = useAuth();
  const router = useRouter();
  const [modalBloqueo, setModalBloqueo] = useState<'temporal' | 'permanente' | 'desbloquear' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(avisoInicial ?? null);

  const bloqueada = entidad.estado === 'bloqueado_temporal' || entidad.estado === 'bloqueado_permanente';
  const puedeBloquear = role === 'super_admin' || role === 'direccion';

  const solicitudCredito = solicitudesPendientes.find((s) => s.tabla === 'clientes' && s.tipo_cambio === 'limite_credito');
  const [editandoCredito, setEditandoCredito] = useState(false);
  const [nuevoLimite, setNuevoLimite] = useState('');
  const [creditoMsg, setCreditoMsg] = useState<string | null>(null);
  const [creditoError, setCreditoError] = useState<string | null>(null);
  const [enviandoCredito, setEnviandoCredito] = useState(false);

  const guardarCredito = async () => {
    setCreditoError(null);
    setEnviandoCredito(true);
    const res = await fetch(`/api/entidades/${entidad.id}/cliente`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limite_credito: Number(nuevoLimite) || 0 }),
    });
    const data = await res.json().catch(() => ({}));
    setEnviandoCredito(false);
    if (!res.ok) {
      setCreditoError(data?.error ?? 'No se pudo actualizar el límite de crédito.');
      return;
    }
    setEditandoCredito(false);
    setNuevoLimite('');
    setCreditoMsg(data.message ?? 'Límite de crédito actualizado.');
    router.refresh();
  };

  const iniciales =
    entidad.siglas ??
    entidad.nombre_legal
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
                {entidad.clave}
                {entidad.siglas && ` · ${entidad.siglas}`} · RFC: {entidad.rfc ?? '—'}
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
            <DatosGeneralesCard entidad={entidad} puedeEditar={puede(role, 'entidades', 'update')} />

            <Card titulo="Modificación controlada (P05)">
              <Dato label="Tipo de persona" valor={PERSONA_TIPO_LABELS[entidad.persona_tipo]} />
              <Dato label="Razón social" valor={entidad.nombre_legal} />
              <Dato label="RFC" valor={entidad.rfc ?? '—'} />
              <p className="text-xs text-muted-foreground pt-1">
                Estos tres campos requieren una solicitud de cambio aprobada (P05), no se editan directo.
              </p>
            </Card>

            {cliente && (
              <Card titulo="Condiciones comerciales · Cliente">
                <div className="flex items-center justify-between text-sm py-1">
                  <span className="text-muted-foreground">Límite de crédito</span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-rtb-navy font-medium">${Number(cliente.limite_credito).toLocaleString('es-MX')}</span>
                    {puede(role, 'clientes', 'update') && !editandoCredito && (
                      <button type="button" onClick={() => setEditandoCredito(true)} className="text-rtb-teal">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                </div>
                {editandoCredito && (
                  <div className="p-2 bg-rtb-surface/60 rounded-lg space-y-2">
                    <input
                      type="number"
                      min="0"
                      value={nuevoLimite}
                      onChange={(e) => setNuevoLimite(e.target.value)}
                      placeholder="Nuevo límite"
                      className="w-full text-sm border border-border rounded-lg px-2 py-1.5 tabular-nums"
                    />
                    {Number(nuevoLimite) > UMBRAL_APROBACION_CREDITO && (
                      <p className="text-[11px] text-accent">
                        Supera ${UMBRAL_APROBACION_CREDITO.toLocaleString('es-MX')} — quedará pendiente de aprobación de dirección.
                      </p>
                    )}
                    {creditoError && <p className="text-[11px] text-destructive">{creditoError}</p>}
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditandoCredito(false);
                          setCreditoError(null);
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={guardarCredito} disabled={enviandoCredito || !nuevoLimite}>
                        Guardar
                      </Button>
                    </div>
                  </div>
                )}
                {creditoMsg && <p className="text-[11px] text-rtb-teal">{creditoMsg}</p>}
                {solicitudCredito && (
                  <p className="text-[11px] text-accent">
                    Solicitud pendiente: ${Number(solicitudCredito.cambios.limite_credito ?? 0).toLocaleString('es-MX')}
                  </p>
                )}
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

// Antes esta sección era sólo lectura (<Dato .../> a secas) y el PATCH de
// /api/entidades/[id] existía sin que ninguna pantalla lo llamara — un dato
// mal capturado (correo, teléfono, siglas...) no se podía corregir desde la
// app. Editables aquí = exactamente el GRANT UPDATE de 020_entidades_siglas.sql.
function DatosGeneralesCard({ entidad, puedeEditar }: { entidad: Entidad; puedeEditar: boolean }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({
    siglas: entidad.siglas ?? '',
    nombre_comercial: entidad.nombre_comercial ?? '',
    correo_principal: entidad.correo_principal ?? '',
    telefono_principal: entidad.telefono_principal ?? '',
    sitio_web: entidad.sitio_web ?? '',
    observaciones: entidad.observaciones ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setLoading(true);
    setError(null);
    // '' → null en los seis campos: correoSchema es .email() y siglasSchema
    // exige 2-12 caracteres — un '' enviado tal cual haría fallar el PATCH
    // completo con "Correo electrónico inválido" en vez de limpiar el campo.
    const limpiar = (v: string) => (v.trim() === '' ? null : v.trim());
    const payload = {
      siglas: limpiar(form.siglas),
      nombre_comercial: limpiar(form.nombre_comercial),
      correo_principal: limpiar(form.correo_principal),
      telefono_principal: limpiar(form.telefono_principal),
      sitio_web: limpiar(form.sitio_web),
      observaciones: limpiar(form.observaciones),
    };
    const res = await fetch(`/api/entidades/${entidad.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Error al guardar');
      return;
    }
    setEditando(false);
    window.location.reload();
  };

  return (
    <div className="bg-rtb-surface/60 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-rtb-navy-mid uppercase tracking-wider">Datos generales</h3>
        {puedeEditar && !editando && (
          <button type="button" onClick={() => setEditando(true)} className="text-rtb-teal">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {error && <p className="text-xs text-destructive mb-2">{error}</p>}

      {editando ? (
        <div className="space-y-2.5">
          <CampoEdicion label="Siglas">
            <Input
              value={form.siglas}
              onChange={(e) => setForm((f) => ({ ...f, siglas: e.target.value }))}
              maxLength={12}
              style={{ textTransform: 'uppercase' }}
            />
          </CampoEdicion>
          <CampoEdicion label="Nombre comercial">
            <Input
              value={form.nombre_comercial}
              onChange={(e) => setForm((f) => ({ ...f, nombre_comercial: e.target.value }))}
            />
          </CampoEdicion>
          <CampoEdicion label="Correo">
            <Input
              type="email"
              value={form.correo_principal}
              onChange={(e) => setForm((f) => ({ ...f, correo_principal: e.target.value }))}
            />
          </CampoEdicion>
          <CampoEdicion label="Teléfono">
            <Input
              value={form.telefono_principal}
              onChange={(e) => setForm((f) => ({ ...f, telefono_principal: e.target.value }))}
            />
          </CampoEdicion>
          <CampoEdicion label="Sitio web">
            <Input value={form.sitio_web} onChange={(e) => setForm((f) => ({ ...f, sitio_web: e.target.value }))} />
          </CampoEdicion>
          <CampoEdicion label="Observaciones">
            <textarea
              value={form.observaciones}
              onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 min-h-[70px]"
            />
          </CampoEdicion>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={guardar} disabled={loading} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
              {loading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Guardar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Dato label="Siglas" valor={entidad.siglas ?? '—'} />
          <Dato label="Nombre comercial" valor={entidad.nombre_comercial ?? '—'} />
          <Dato label="Correo" valor={entidad.correo_principal ?? '—'} />
          <Dato label="Teléfono" valor={entidad.telefono_principal ?? '—'} />
          <Dato label="Sitio web" valor={entidad.sitio_web ?? '—'} />
          <Dato label="Fecha de alta" valor={new Date(entidad.created_at).toLocaleDateString('es-MX', { timeZone: 'UTC' })} />
          <div className="pt-1">
            <dt className="text-xs text-muted-foreground">Observaciones</dt>
            <dd className="text-sm text-rtb-navy">{entidad.observaciones ?? '—'}</dd>
          </div>
        </div>
      )}
    </div>
  );
}

function CampoEdicion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="mt-0.5">{children}</div>
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
  // Gap de UI (contexto/AUDITORIA_QA_ROLES_2026-08-06.md §4): POST
  // /api/proveedores/[id]/cuentas y la URL firmada de subida
  // (.../comprobante-upload-url, bucket privado 'comprobantes-bancarios')
  // ya existían — nunca hubo formulario que los llamara.
  const [creando, setCreando] = useState(false);

  const cargar = () => {
    setLoading(true);
    fetch(`/api/proveedores/${proveedorId}/cuentas`)
      .then(async (r) => {
        const json = await r.json();
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
      .catch(() => setError('Error de conexión'))
      .finally(() => setLoading(false));
  };

  useEffect(cargar, [proveedorId]);

  if (!puede(role, 'cuentas_bancarias', 'select') && role !== 'direccion') {
    return <p className="text-sm text-muted-foreground">No tienes acceso a esta información (P03).</p>;
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const puedeCrear = puede(role, 'cuentas_bancarias', 'insert');

  return (
    <div className="bg-white rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="w-3.5 h-3.5 text-accent" />
          {enmascarado ? 'CLABE enmascarada — acceso restringido (P03 §II)' : 'Acceso completo (finanzas / super_admin)'}
        </div>
        {puedeCrear && !creando && (
          <Button size="sm" onClick={() => setCreando(true)}>
            {data.some((c) => c.estado === 'activa') ? 'Reemplazar cuenta' : 'Nueva cuenta'}
          </Button>
        )}
      </div>

      {creando && (
        <CuentaBancariaForm
          proveedorId={proveedorId}
          exigeMotivo={data.some((c) => c.estado === 'activa')}
          onClose={() => setCreando(false)}
          onCreada={() => {
            setCreando(false);
            cargar();
          }}
        />
      )}

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

function CuentaBancariaForm({
  proveedorId,
  exigeMotivo,
  onClose,
  onCreada,
}: {
  proveedorId: string;
  exigeMotivo: boolean;
  onClose: () => void;
  onCreada: () => void;
}) {
  const [banco, setBanco] = useState('');
  const [clabe, setClabe] = useState('');
  const [titular, setTitular] = useState('');
  const [rfcBeneficiario, setRfcBeneficiario] = useState('');
  const [motivoCambio, setMotivoCambio] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!archivo) {
      setError('Adjunta el comprobante (PDF, JPG o PNG).');
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const resUrl = await fetch(`/api/proveedores/${proveedorId}/cuentas/comprobante-upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombreArchivo: archivo.name }),
      });
      const dataUrl = await resUrl.json().catch(() => ({}));
      if (!resUrl.ok) {
        setError(dataUrl?.error ?? 'No se pudo iniciar la subida del comprobante.');
        setEnviando(false);
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from('comprobantes-bancarios')
        .uploadToSignedUrl(dataUrl.path, dataUrl.token, archivo);
      if (uploadError) {
        setError('No se pudo subir el comprobante: ' + uploadError.message);
        setEnviando(false);
        return;
      }

      const res = await fetch(`/api/proveedores/${proveedorId}/cuentas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          banco,
          clabe,
          titular,
          rfc_beneficiario: rfcBeneficiario,
          comprobante_path: dataUrl.path,
          motivo_cambio: motivoCambio || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setEnviando(false);
      if (!res.ok) {
        setError(data?.error ?? 'No se pudo registrar la cuenta.');
        return;
      }
      onCreada();
    } catch {
      setError('Error de conexión.');
      setEnviando(false);
    }
  };

  return (
    <div className="mb-4 p-3 bg-rtb-surface/60 rounded-lg space-y-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      {exigeMotivo && (
        <p className="text-xs text-accent">
          Ya existe una cuenta activa — esta la reemplaza. Indica el motivo abajo (obligatorio).
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Banco</Label>
          <Input value={banco} onChange={(e) => setBanco(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">CLABE</Label>
          <Input value={clabe} onChange={(e) => setClabe(e.target.value)} className="tabular-nums" maxLength={18} />
        </div>
        <div>
          <Label className="text-xs">Titular (beneficiario)</Label>
          <Input value={titular} onChange={(e) => setTitular(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">RFC del beneficiario</Label>
          <Input value={rfcBeneficiario} onChange={(e) => setRfcBeneficiario(e.target.value.toUpperCase())} className="tabular-nums" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Comprobante (PDF, JPG o PNG)</Label>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="mt-1 w-full text-xs"
        />
      </div>
      {exigeMotivo && (
        <div>
          <Label className="text-xs">Motivo del reemplazo</Label>
          <Input value={motivoCambio} onChange={(e) => setMotivoCambio(e.target.value)} />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={enviar}
          disabled={enviando || !banco || !clabe || !titular || !rfcBeneficiario || !archivo || (exigeMotivo && !motivoCambio)}
        >
          {enviando && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
          Guardar
        </Button>
      </div>
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
