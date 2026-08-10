'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/rbac/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  AlertCircle,
  Building2,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import {
  CANAL_ORIGEN_LABELS,
  CONDICION_PAGO_LABELS,
  ENTIDAD_TIPO_LABELS,
  PERSONA_TIPO_LABELS,
  UMBRAL_APROBACION_CREDITO,
} from '@/lib/entidades/config';
import { ejecutaDirecto } from '@/lib/entidades/permisos';
import { AvisoLimiteCredito } from '@/components/entidades/aviso-credito';
import { CANAL_ORIGENES, CONDICION_PAGOS, ENTIDAD_TIPOS, PERSONA_TIPOS } from '@/types/entidades';
import type { CanalOrigen, CondicionPago, EntidadTipo, PersonaTipo } from '@/types/entidades';
import MapaPunto from '@/components/mapas/MapaPunto';
import { CampoCoordenada } from '@/components/mapas/CampoCoordenada';
import { PropuestaDireccion } from '@/components/mapas/PropuestaDireccion';
import type { DireccionGeocodificada } from '@/lib/mapas/schemas';

const initialForm = {
  tipo: 'cliente' as EntidadTipo,
  persona_tipo: 'moral' as PersonaTipo,
  nombre_legal: '',
  nombre_comercial: '',
  siglas: '',
  rfc: '',
  curp: '',
  correo_principal: '',
  telefono_principal: '',
  // comerciales cliente
  limite_credito: '0',
  dias_credito: '0',
  descuento_base: '0',
  canal_origen: '' as CanalOrigen | '',
  // comerciales proveedor
  categoria: '',
  plazo_pago: '0',
  condicion_pago: 'contado' as CondicionPago,
  // contacto principal
  contacto_nombre: '',
  contacto_cargo: '',
  contacto_telefono: '',
  contacto_correo: '',
  // dirección fiscal
  calle: '',
  numero_exterior: '',
  colonia: '',
  ciudad: '',
  // E-10/M-07 (contexto/AUDITORIA_QA_ROLES_2026-08-06.md): antes era ''
  // con placeholder "Jalisco" — parecía prellenado sin estarlo, y el envío
  // fallaba con "El estado es obligatorio" en cuanto se tocaba cualquier
  // otro campo de la dirección. La mayoría de las direcciones de RTB están
  // en Jalisco, así que ahora es un valor real de partida, editable.
  entidad_federativa: 'Jalisco',
  codigo_postal: '',
  referencia: '',
  latitud: '',
  longitud: '',
};

export default function NuevaEntidadPage() {
  const router = useRouter();
  const { role } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [propuestaDireccion, setPropuestaDireccion] = useState<DireccionGeocodificada | null>(null);

  const set = (campo: keyof typeof initialForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  // Clic o arrastre del pin en el mapa -> actualiza los campos de texto.
  const handleCoordenadaMapa = (lat: number, lng: number) => {
    setForm((f) => ({ ...f, latitud: lat.toFixed(7), longitud: lng.toFixed(7) }));
  };

  // "Usar esta dirección": única vía de sobrescritura — decisión confirmada
  // "proponer y que el usuario confirme", nunca en automático.
  const usarDireccionPropuesta = (direccion: DireccionGeocodificada) => {
    setForm((f) => ({
      ...f,
      calle: direccion.calle ?? f.calle,
      numero_exterior: direccion.numero_exterior ?? f.numero_exterior,
      colonia: direccion.colonia ?? f.colonia,
      ciudad: direccion.ciudad ?? f.ciudad,
      entidad_federativa: direccion.entidad_federativa ?? f.entidad_federativa,
      codigo_postal: direccion.codigo_postal ?? f.codigo_postal,
    }));
    setPropuestaDireccion(null);
  };

  const esCliente = form.tipo === 'cliente' || form.tipo === 'mixta';
  const esProveedor = form.tipo === 'proveedor' || form.tipo === 'mixta';

  const limiteCredito = Number(form.limite_credito) || 0;
  const requiereAprobacion =
    esCliente && limiteCredito > UMBRAL_APROBACION_CREDITO && !ejecutaDirecto('limite_credito', role);

  const tiposDisponibles = useMemo(() => {
    if (role === 'ventas') return ENTIDAD_TIPOS.filter((t) => t !== 'proveedor');
    if (role === 'compras') return ENTIDAD_TIPOS.filter((t) => t !== 'cliente');
    return ENTIDAD_TIPOS;
  }, [role]);

  // E-06 (contexto/AUDITORIA_QA_ROLES_2026-08-06.md): el estado inicial
  // (arriba) siempre arranca en 'cliente' sin conocer el rol todavía
  // (useAuth() resuelve async). Para 'compras', que no puede dar de alta
  // clientes, el <select> ya filtra esa opción y el navegador cae a la
  // primera disponible ("Proveedor") — pero form.tipo seguía en 'cliente'
  // hasta el primer onChange, así que encabezado/resumen/sección
  // comercial mostraban "Cliente" mientras el select mostraba
  // "Proveedor", y el envío sin tocar el selector fallaba 403. En cuanto
  // el rol resuelve, si el tipo actual ya no está entre las opciones del
  // rol, se corrige al primero disponible — sin tocar nada más del form.
  useEffect(() => {
    if (tiposDisponibles.length > 0 && !tiposDisponibles.includes(form.tipo)) {
      setForm((f) => ({ ...f, tipo: tiposDisponibles[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiposDisponibles]);

  const progreso = useMemo(() => {
    const campos = [form.nombre_legal, form.rfc, form.contacto_nombre, form.calle, form.codigo_postal, form.ciudad];
    const llenos = campos.filter((c) => c.trim().length > 0).length;
    return Math.round((llenos / campos.length) * 100);
  }, [form]);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        tipo: form.tipo,
        persona_tipo: form.persona_tipo,
        nombre_legal: form.nombre_legal,
        nombre_comercial: form.nombre_comercial || undefined,
        siglas: form.siglas || undefined,
        rfc: form.rfc || undefined,
        curp: form.persona_tipo === 'fisica' ? form.curp || undefined : undefined,
        correo_principal: form.correo_principal || undefined,
        telefono_principal: form.telefono_principal || undefined,
      };

      if (esCliente) {
        payload.cliente = {
          limite_credito: Number(form.limite_credito) || 0,
          dias_credito: Number(form.dias_credito) || 0,
          descuento_base: Number(form.descuento_base) || 0,
          canal_origen: form.canal_origen || undefined,
        };
      }
      if (esProveedor) {
        payload.proveedor = {
          categoria: form.categoria || undefined,
          plazo_pago: Number(form.plazo_pago) || 0,
          condicion_pago: form.condicion_pago,
        };
      }
      if (form.contacto_nombre) {
        payload.contacto_principal = {
          nombre: form.contacto_nombre,
          cargo: form.contacto_cargo || undefined,
          telefono: form.contacto_telefono || undefined,
          correo: form.contacto_correo || undefined,
        };
      }
      if (form.calle) {
        payload.direccion_fiscal = {
          calle: form.calle,
          numero_exterior: form.numero_exterior || undefined,
          colonia: form.colonia || undefined,
          ciudad: form.ciudad,
          entidad_federativa: form.entidad_federativa,
          codigo_postal: form.codigo_postal,
          referencia: form.referencia || undefined,
          latitud: form.latitud ? Number(form.latitud) : undefined,
          longitud: form.longitud ? Number(form.longitud) : undefined,
        };
      }

      const res = await fetch('/api/entidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Error al crear la entidad');
        setLoading(false);
        return;
      }

      // E-07: el aviso de aprobación ahora corresponde con lo que
      // realmente pasó — el servidor creó el cliente con crédito 0 y dejó
      // el valor pedido pendiente en solicitudes_cambio (visible en el
      // detalle de la entidad).
      if (data.creditoPendiente) {
        router.push(`/dashboard/entidades/${data.id}?creditoPendiente=${data.creditoPendiente}`);
        return;
      }
      router.push(`/dashboard/entidades/${data.id}`);
    } catch {
      setError('Error de conexión');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/entidades">
            <ArrowLeft className="w-4 h-4 mr-1" /> Entidades
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <Building2 className="w-6 h-6" /> Nueva Entidad
        </h1>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rtb-surface text-rtb-navy-mid">
          {ENTIDAD_TIPO_LABELS[form.tipo]}
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Seccion titulo="Datos generales">
            <Campo label="Tipo de entidad">
              <select value={form.tipo} onChange={set('tipo')} className="fld w-full text-sm border border-border rounded-lg px-3 py-2">
                {tiposDisponibles.map((t) => (
                  <option key={t} value={t}>
                    {ENTIDAD_TIPO_LABELS[t]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Tipo de persona">
              <select value={form.persona_tipo} onChange={set('persona_tipo')} className="w-full text-sm border border-border rounded-lg px-3 py-2">
                {PERSONA_TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {PERSONA_TIPO_LABELS[t]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Razón social" span2 requerido>
              <Input value={form.nombre_legal} onChange={set('nombre_legal')} placeholder="Refacciones Ejemplo, S.A. de C.V." />
            </Campo>
            <Campo label="Nombre comercial">
              <Input value={form.nombre_comercial} onChange={set('nombre_comercial')} placeholder="Opcional" />
            </Campo>
            <Campo label="Siglas">
              <Input
                value={form.siglas}
                onChange={set('siglas')}
                placeholder="RTB"
                maxLength={12}
                style={{ textTransform: 'uppercase' }}
              />
            </Campo>
            <Campo label="RFC">
              <Input value={form.rfc} onChange={set('rfc')} placeholder="XAXX010101000" className="tabular-nums" />
            </Campo>
            {form.persona_tipo === 'fisica' && (
              <Campo label="CURP">
                <Input value={form.curp} onChange={set('curp')} className="tabular-nums" />
              </Campo>
            )}
            <Campo label="Correo principal">
              <Input type="email" value={form.correo_principal} onChange={set('correo_principal')} />
            </Campo>
            <Campo label="Teléfono principal">
              <Input value={form.telefono_principal} onChange={set('telefono_principal')} />
            </Campo>
          </Seccion>

          {esCliente && (
            <Seccion titulo="Datos comerciales (cliente)">
              <Campo label="Límite de crédito">
                <Input type="number" min="0" value={form.limite_credito} onChange={set('limite_credito')} className="tabular-nums" />
                <div className="mt-1">
                  <AvisoLimiteCredito role={role} limite={limiteCredito} />
                </div>
              </Campo>
              <Campo label="Días de crédito">
                <Input type="number" min="0" value={form.dias_credito} onChange={set('dias_credito')} className="tabular-nums" />
              </Campo>
              <Campo label="Descuento base %">
                <Input type="number" min="0" max="100" value={form.descuento_base} onChange={set('descuento_base')} className="tabular-nums" />
              </Campo>
              <Campo label="Canal de origen">
                <select value={form.canal_origen} onChange={set('canal_origen')} className="w-full text-sm border border-border rounded-lg px-3 py-2">
                  <option value="">Sin especificar</option>
                  {CANAL_ORIGENES.map((c) => (
                    <option key={c} value={c}>
                      {CANAL_ORIGEN_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Campo>
            </Seccion>
          )}

          {esProveedor && (
            <Seccion titulo="Datos comerciales (proveedor)">
              <Campo label="Categoría">
                <Input value={form.categoria} onChange={set('categoria')} />
              </Campo>
              <Campo label="Plazo de pago (días)">
                <Input type="number" min="0" value={form.plazo_pago} onChange={set('plazo_pago')} className="tabular-nums" />
              </Campo>
              <Campo label="Condición de pago" span2>
                <select value={form.condicion_pago} onChange={set('condicion_pago')} className="w-full text-sm border border-border rounded-lg px-3 py-2">
                  {CONDICION_PAGOS.map((c) => (
                    <option key={c} value={c}>
                      {CONDICION_PAGO_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Campo>
            </Seccion>
          )}

          <Seccion titulo="Contacto principal">
            <Campo label="Nombre" span2>
              <Input value={form.contacto_nombre} onChange={set('contacto_nombre')} />
            </Campo>
            <Campo label="Puesto">
              <Input value={form.contacto_cargo} onChange={set('contacto_cargo')} />
            </Campo>
            <Campo label="Teléfono">
              <Input value={form.contacto_telefono} onChange={set('contacto_telefono')} />
            </Campo>
            <Campo label="Correo" span2>
              <Input type="email" value={form.contacto_correo} onChange={set('contacto_correo')} />
            </Campo>
          </Seccion>

          <Seccion titulo="Dirección fiscal">
            <Campo label="Calle" span2>
              <Input value={form.calle} onChange={set('calle')} />
            </Campo>
            <Campo label="Número">
              <Input value={form.numero_exterior} onChange={set('numero_exterior')} />
            </Campo>
            <Campo label="Colonia">
              <Input value={form.colonia} onChange={set('colonia')} />
            </Campo>
            <Campo label="Código postal">
              <Input value={form.codigo_postal} onChange={set('codigo_postal')} className="tabular-nums" />
            </Campo>
            <Campo label="Ciudad">
              <Input value={form.ciudad} onChange={set('ciudad')} />
            </Campo>
            <Campo label="Estado" span2>
              <Input value={form.entidad_federativa} onChange={set('entidad_federativa')} placeholder="Jalisco" />
            </Campo>
            <Campo label="Referencia" span2>
              <Input
                value={form.referencia}
                onChange={set('referencia')}
                placeholder="Portón azul, frente a la gasolinera"
              />
            </Campo>

            <div className="sm:col-span-2 pt-2 border-t border-border/60 space-y-3">
              <p className="text-xs font-semibold text-rtb-navy-mid">Ubicación en el mapa</p>
              <CampoCoordenada
                latitud={form.latitud}
                longitud={form.longitud}
                onLatitudChange={(v) => setForm((f) => ({ ...f, latitud: v }))}
                onLongitudChange={(v) => setForm((f) => ({ ...f, longitud: v }))}
                onGeocodificado={setPropuestaDireccion}
              />
              <PropuestaDireccion
                direccion={propuestaDireccion}
                onUsar={usarDireccionPropuesta}
                onDescartar={() => setPropuestaDireccion(null)}
              />
              <MapaPunto
                latitud={form.latitud ? Number(form.latitud) : null}
                longitud={form.longitud ? Number(form.longitud) : null}
                editable
                onCoordenadaChange={handleCoordenadaMapa}
              />
            </div>
          </Seccion>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 self-start">
          <div className="bg-white rounded-xl p-5 space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="text-sm font-display font-semibold text-rtb-navy">Resumen del registro</h3>
            <dl className="space-y-1.5 text-xs">
              <Resumen label="Razón social" valor={form.nombre_legal || '—'} />
              <Resumen label="RFC" valor={form.rfc || '—'} />
              <Resumen label="Tipo" valor={ENTIDAD_TIPO_LABELS[form.tipo]} />
              {esCliente && <Resumen label="Límite de crédito" valor={`$${limiteCredito.toLocaleString('es-MX')}`} />}
              <Resumen label="Contacto" valor={form.contacto_nombre || '—'} />
            </dl>
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Progreso de llenado</span>
                <span className="tabular-nums">{progreso}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-rtb-teal transition-all" style={{ width: `${progreso}%` }} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="text-sm font-display font-semibold text-rtb-navy flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-rtb-teal" /> Alta y aprobación
            </h3>
            <p className="text-xs text-muted-foreground">
              La entidad queda <span className="font-medium text-rtb-navy">activa de inmediato</span>.
              {requiereAprobacion
                ? ' El cliente nace con crédito $0 — el límite pedido queda pendiente de aprobación de dirección.'
                : ' Los cambios sensibles (RFC, razón social, crédito sobre el umbral) sí quedan pendientes de aprobación.'}
            </p>
          </div>

          <Button onClick={handleSubmit} disabled={loading || !form.nombre_legal} className="w-full bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Crear entidad
          </Button>
        </aside>
      </div>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h2 className="text-sm font-display font-semibold text-rtb-navy mb-4">{titulo}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Campo({
  label,
  children,
  span2,
  requerido,
}: {
  label: string;
  children: React.ReactNode;
  span2?: boolean;
  requerido?: boolean;
}) {
  return (
    <div className={span2 ? 'sm:col-span-2' : ''}>
      <Label className="text-xs font-semibold text-rtb-navy-mid">
        {label}
        {requerido && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Resumen({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-rtb-navy font-medium text-right truncate max-w-[60%]">{valor}</dd>
    </div>
  );
}
