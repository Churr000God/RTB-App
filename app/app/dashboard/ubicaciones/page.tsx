'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/rbac/hooks';
import { puede } from '@/lib/entidades/permisos';
import { UBICACION_CLASIFICACION_LABELS, UBICACION_TIPO_LABELS } from '@/lib/entidades/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MapaPunto from '@/components/mapas/MapaPunto';
import { CampoCoordenada } from '@/components/mapas/CampoCoordenada';
import { PropuestaDireccion } from '@/components/mapas/PropuestaDireccion';
import type { DireccionGeocodificada } from '@/lib/mapas/schemas';
import type { UbicacionInterna, UbicacionTipo } from '@/types/entidades';
import { UBICACION_TIPOS } from '@/types/entidades';
import {
  AlertCircle,
  Box,
  ChevronDown,
  ChevronRight,
  Layers,
  Loader2,
  MapPin,
  MapPinned,
  Pencil,
  Plus,
  Warehouse,
} from 'lucide-react';

interface Nodo extends UbicacionInterna {
  hijos: Nodo[];
}

const ICONOS: Record<UbicacionTipo, React.ComponentType<{ className?: string }>> = {
  centro_operativo: Warehouse,
  zona: Box,
  pasillo: Layers,
  rack: Layers,
  posicion: MapPinned,
};

function construirArbol(planas: UbicacionInterna[]): Nodo[] {
  const mapa = new Map<string, Nodo>(planas.map((u) => [u.id, { ...u, hijos: [] }]));
  const raices: Nodo[] = [];
  for (const nodo of mapa.values()) {
    if (nodo.parent_id && mapa.has(nodo.parent_id)) {
      mapa.get(nodo.parent_id)!.hijos.push(nodo);
    } else {
      raices.push(nodo);
    }
  }
  return raices;
}

// useSearchParams() exige un límite <Suspense> alrededor (si no, Next lo
// rechaza en `next build`: "should be wrapped in a suspense boundary") —
// de ahí el wrapper de abajo; el contenido real vive en UbicacionesPageInner.
export default function UbicacionesPage() {
  return (
    <Suspense fallback={null}>
      <UbicacionesPageInner />
    </Suspense>
  );
}

function UbicacionesPageInner() {
  const { role } = useAuth();
  // ?seleccionar=<id> — cierra el circuito del mapa global
  // (/dashboard/mapa): clic en el pin de un centro operativo trae aquí y
  // lo abre directo, en vez de dejarlo en la lista sin seleccionar nada.
  const searchParams = useSearchParams();
  const [ubicaciones, setUbicaciones] = useState<UbicacionInterna[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [modalAlta, setModalAlta] = useState<{ parentId: string | null } | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/ubicaciones');
    const json = await res.json();
    if (res.ok) setUbicaciones(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    const id = searchParams.get('seleccionar');
    if (id) setSeleccionadoId(id);
  }, [searchParams]);

  const arbol = useMemo(() => construirArbol(ubicaciones), [ubicaciones]);
  const seleccionado = ubicaciones.find((u) => u.id === seleccionadoId) ?? null;
  const rutaSeleccionado = useMemo(() => {
    if (!seleccionado) return [];
    const ruta: UbicacionInterna[] = [];
    let actual: UbicacionInterna | undefined = seleccionado;
    while (actual) {
      ruta.unshift(actual);
      actual = ubicaciones.find((u) => u.id === actual!.parent_id);
    }
    return ruta;
  }, [seleccionado, ubicaciones]);

  const toggle = (id: string) =>
    setExpandidos((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const puedeCrear = puede(role, 'ubicaciones', 'insert');

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <MapPinned className="w-6 h-6" /> Ubicaciones Internas
          </h1>
          <p className="text-muted-foreground mt-1">Estructura jerárquica de centros operativos, zonas, racks y posiciones</p>
        </div>
        {puedeCrear && (
          <Button onClick={() => setModalAlta({ parentId: null })} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            <Plus className="w-4 h-4 mr-2" /> Nueva ubicación
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white rounded-xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <h2 className="text-sm font-display font-semibold text-rtb-navy mb-3">Árbol de ubicaciones</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-rtb-teal animate-spin" />
            </div>
          ) : arbol.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Sin ubicaciones registradas todavía.</p>
          ) : (
            <div className="space-y-0.5">
              {arbol.map((n) => (
                <NodoArbol
                  key={n.id}
                  nodo={n}
                  nivelVisual={0}
                  expandidos={expandidos}
                  toggle={toggle}
                  seleccionadoId={seleccionadoId}
                  onSelect={setSeleccionadoId}
                />
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 bg-white rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
          {!seleccionado ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Selecciona una ubicación del árbol.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-display font-semibold text-rtb-navy">
                    {seleccionado.codigo} — {seleccionado.nombre}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {rutaSeleccionado.map((r) => r.segmento).join(' › ')}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    seleccionado.activo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {seleccionado.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <AtributoCard label="Código" valor={seleccionado.codigo} />
                <AtributoCard label="Tipo" valor={UBICACION_TIPO_LABELS[seleccionado.tipo]} />
                <AtributoCard label="Clasificación" valor={UBICACION_CLASIFICACION_LABELS[seleccionado.clasificacion]} />
                <AtributoCard
                  label="Capacidad"
                  valor={seleccionado.capacidad_posiciones ? `${seleccionado.capacidad_posiciones} posiciones` : '—'}
                />
              </div>

              {seleccionado.descripcion && (
                <p className="text-sm text-muted-foreground">{seleccionado.descripcion}</p>
              )}

              {seleccionado.tipo === 'centro_operativo' && (
                <UbicacionGeoPanel
                  key={seleccionado.id}
                  ubicacion={seleccionado}
                  puedeEditar={puede(role, 'ubicaciones', 'update')}
                  onGuardado={cargar}
                />
              )}

              <div className="border border-dashed border-border rounded-lg p-3 text-xs text-muted-foreground text-center">
                Últimos movimientos — conexión con módulo de Almacén (pendiente)
              </div>

              {puedeCrear && (
                <button
                  onClick={() => setModalAlta({ parentId: seleccionado.id })}
                  className="w-full border border-dashed border-rtb-teal text-rtb-teal rounded-lg py-2.5 text-sm font-medium hover:bg-rtb-surface transition-colors"
                >
                  + Agregar sub-ubicación
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {modalAlta && (
        <ModalNuevaUbicacion
          parentId={modalAlta.parentId}
          padre={ubicaciones.find((u) => u.id === modalAlta.parentId) ?? null}
          onClose={() => setModalAlta(null)}
          onCreada={async (id) => {
            setModalAlta(null);
            await cargar();
            setSeleccionadoId(id);
          }}
        />
      )}
    </div>
  );
}

function NodoArbol({
  nodo,
  nivelVisual,
  expandidos,
  toggle,
  seleccionadoId,
  onSelect,
}: {
  nodo: Nodo;
  nivelVisual: number;
  expandidos: Set<string>;
  toggle: (id: string) => void;
  seleccionadoId: string | null;
  onSelect: (id: string) => void;
}) {
  const Icono = ICONOS[nodo.tipo];
  const expandido = expandidos.has(nodo.id);
  const tieneHijos = nodo.hijos.length > 0;

  return (
    <div>
      <div
        onClick={() => onSelect(nodo.id)}
        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer text-sm transition-colors ${
          seleccionadoId === nodo.id ? 'bg-rtb-teal text-white' : 'hover:bg-muted/50 text-rtb-navy'
        }`}
        style={{ paddingLeft: `${nivelVisual * 16 + 8}px` }}
      >
        {tieneHijos ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggle(nodo.id);
            }}
            className="shrink-0"
          >
            {expandido ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}
        <Icono className={`w-4 h-4 shrink-0 ${seleccionadoId === nodo.id ? 'text-white' : 'text-rtb-teal'}`} />
        <span className="truncate">{nodo.nombre}</span>
        {!nodo.activo && <span className="text-[9px] opacity-70 ml-1">(inactivo)</span>}
      </div>
      {expandido &&
        nodo.hijos.map((h) => (
          <NodoArbol
            key={h.id}
            nodo={h}
            nivelVisual={nivelVisual + 1}
            expandidos={expandidos}
            toggle={toggle}
            seleccionadoId={seleccionadoId}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

function AtributoCard({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="bg-rtb-surface/60 rounded-lg p-3">
      <p className="text-[10px] font-semibold text-rtb-navy-mid uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium text-rtb-navy mt-0.5">{valor}</p>
    </div>
  );
}

// Dirección + coordenada de un centro operativo (024_ubicaciones_geo.sql):
// sólo se renderiza cuando seleccionado.tipo === 'centro_operativo', en
// espejo del CHECK ubicaciones_geo_solo_centro_chk. `key={ubicacion.id}` en
// el llamador remonta el componente al cambiar de nodo seleccionado, así
// que el estado local no necesita reiniciarse a mano.
function UbicacionGeoPanel({
  ubicacion,
  puedeEditar,
  onGuardado,
}: {
  ubicacion: UbicacionInterna;
  puedeEditar: boolean;
  onGuardado: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({
    calle: ubicacion.calle ?? '',
    numero_exterior: ubicacion.numero_exterior ?? '',
    numero_interior: ubicacion.numero_interior ?? '',
    colonia: ubicacion.colonia ?? '',
    ciudad: ubicacion.ciudad ?? '',
    entidad_federativa: ubicacion.entidad_federativa ?? 'Jalisco',
    pais: ubicacion.pais ?? 'México',
    codigo_postal: ubicacion.codigo_postal ?? '',
    referencia: ubicacion.referencia ?? '',
    latitud: ubicacion.latitud != null ? String(ubicacion.latitud) : '',
    longitud: ubicacion.longitud != null ? String(ubicacion.longitud) : '',
  });
  const [propuesta, setPropuesta] = useState<DireccionGeocodificada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const usarDireccionPropuesta = (d: DireccionGeocodificada) => {
    setForm((f) => ({
      ...f,
      calle: d.calle ?? f.calle,
      colonia: d.colonia ?? f.colonia,
      ciudad: d.ciudad ?? f.ciudad,
      entidad_federativa: d.entidad_federativa ?? f.entidad_federativa,
      codigo_postal: d.codigo_postal ?? f.codigo_postal,
    }));
    setPropuesta(null);
  };

  const guardar = async () => {
    setError(null);
    setLoading(true);
    // '' -> null explícito (no undefined): así se puede borrar una
    // dirección mal capturada, no sólo agregarla — mismo patrón que
    // DatosGeneralesCard en entidad-detalle.tsx.
    const limpiar = (v: string) => (v.trim() === '' ? null : v.trim());
    const payload = {
      // 'tipo' sólo viaja para que el superRefine de zod valide "sólo
      // centro_operativo tiene dirección"; la ruta lo descarta antes del
      // UPDATE (el GRANT no lo cubre y el trigger lo congela).
      tipo: ubicacion.tipo,
      calle: limpiar(form.calle),
      numero_exterior: limpiar(form.numero_exterior),
      numero_interior: limpiar(form.numero_interior),
      colonia: limpiar(form.colonia),
      ciudad: limpiar(form.ciudad),
      entidad_federativa: limpiar(form.entidad_federativa),
      pais: limpiar(form.pais),
      codigo_postal: limpiar(form.codigo_postal),
      referencia: limpiar(form.referencia),
      latitud: form.latitud.trim() === '' ? null : Number(form.latitud),
      longitud: form.longitud.trim() === '' ? null : Number(form.longitud),
    };
    const res = await fetch(`/api/ubicaciones/${ubicacion.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo guardar la dirección.');
      return;
    }
    setEditando(false);
    onGuardado();
  };

  const tieneDireccion = ubicacion.calle || ubicacion.latitud != null;

  return (
    <div className="border border-border/60 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-rtb-navy-mid uppercase tracking-wider">Dirección y mapa</p>
        {puedeEditar && !editando && (
          <button type="button" onClick={() => setEditando(true)} className="text-rtb-teal">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {editando ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CampoGeo label="Calle" span2>
              <Input value={form.calle} onChange={(e) => setForm((f) => ({ ...f, calle: e.target.value }))} />
            </CampoGeo>
            <CampoGeo label="Número exterior">
              <Input
                value={form.numero_exterior}
                onChange={(e) => setForm((f) => ({ ...f, numero_exterior: e.target.value }))}
              />
            </CampoGeo>
            <CampoGeo label="Número interior">
              <Input
                value={form.numero_interior}
                onChange={(e) => setForm((f) => ({ ...f, numero_interior: e.target.value }))}
              />
            </CampoGeo>
            <CampoGeo label="Colonia">
              <Input value={form.colonia} onChange={(e) => setForm((f) => ({ ...f, colonia: e.target.value }))} />
            </CampoGeo>
            <CampoGeo label="Código postal">
              <Input
                value={form.codigo_postal}
                onChange={(e) => setForm((f) => ({ ...f, codigo_postal: e.target.value }))}
                className="tabular-nums"
              />
            </CampoGeo>
            <CampoGeo label="Ciudad">
              <Input value={form.ciudad} onChange={(e) => setForm((f) => ({ ...f, ciudad: e.target.value }))} />
            </CampoGeo>
            <CampoGeo label="Estado">
              <Input
                value={form.entidad_federativa}
                onChange={(e) => setForm((f) => ({ ...f, entidad_federativa: e.target.value }))}
              />
            </CampoGeo>
            <CampoGeo label="Referencia" span2>
              <Input
                value={form.referencia}
                onChange={(e) => setForm((f) => ({ ...f, referencia: e.target.value }))}
                placeholder="Portón azul, frente a la gasolinera"
              />
            </CampoGeo>
          </div>

          <CampoCoordenada
            latitud={form.latitud}
            longitud={form.longitud}
            onLatitudChange={(v) => setForm((f) => ({ ...f, latitud: v }))}
            onLongitudChange={(v) => setForm((f) => ({ ...f, longitud: v }))}
            onGeocodificado={setPropuesta}
          />
          <PropuestaDireccion direccion={propuesta} onUsar={usarDireccionPropuesta} onDescartar={() => setPropuesta(null)} />
          <MapaPunto
            latitud={form.latitud ? Number(form.latitud) : null}
            longitud={form.longitud ? Number(form.longitud) : null}
            editable
            onCoordenadaChange={(lat, lng) =>
              setForm((f) => ({ ...f, latitud: lat.toFixed(7), longitud: lng.toFixed(7) }))
            }
          />

          <div className="flex gap-2">
            <Button size="sm" onClick={guardar} disabled={loading} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
              {loading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Guardar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : !tieneDireccion ? (
        <p className="text-sm text-muted-foreground">Sin dirección capturada.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-rtb-navy">
            {ubicacion.calle} {ubicacion.numero_exterior ?? ''}
            {ubicacion.numero_interior ? ` int. ${ubicacion.numero_interior}` : ''}
            {ubicacion.colonia ? `, ${ubicacion.colonia}` : ''}
            {ubicacion.ciudad ? `, ${ubicacion.ciudad}` : ''}
            {ubicacion.entidad_federativa ? `, ${ubicacion.entidad_federativa}` : ''}
            {ubicacion.codigo_postal ? ` — ${ubicacion.codigo_postal}` : ''}
          </p>
          {ubicacion.referencia && <p className="text-xs text-muted-foreground italic">{ubicacion.referencia}</p>}
          {ubicacion.latitud != null && ubicacion.longitud != null && (
            <>
              <p className="text-[11px] text-rtb-teal tabular-nums flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {ubicacion.latitud.toFixed(5)}, {ubicacion.longitud.toFixed(5)}
              </p>
              <MapaPunto latitud={ubicacion.latitud} longitud={ubicacion.longitud} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CampoGeo({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={span2 ? 'sm:col-span-2' : ''}>
      <Label className="text-xs font-semibold text-rtb-navy-mid">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ModalNuevaUbicacion({
  parentId,
  padre,
  onClose,
  onCreada,
}: {
  parentId: string | null;
  padre: UbicacionInterna | null;
  onClose: () => void;
  onCreada: (id: string) => void;
}) {
  const [segmento, setSegmento] = useState('');
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<UbicacionTipo>(padre ? 'zona' : 'centro_operativo');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Dirección + coordenada: opcional al alta (se puede capturar después
  // desde UbicacionGeoPanel), sólo visible/enviada cuando tipo es
  // centro_operativo — espejo de ubicaciones_geo_solo_centro_chk.
  const [geo, setGeo] = useState({
    calle: '',
    numero_exterior: '',
    colonia: '',
    ciudad: '',
    entidad_federativa: 'Jalisco',
    codigo_postal: '',
    referencia: '',
    latitud: '',
    longitud: '',
  });
  const [propuesta, setPropuesta] = useState<DireccionGeocodificada | null>(null);
  const esCentroOperativo = tipo === 'centro_operativo';

  const usarDireccionPropuesta = (d: DireccionGeocodificada) => {
    setGeo((g) => ({
      ...g,
      calle: d.calle ?? g.calle,
      colonia: d.colonia ?? g.colonia,
      ciudad: d.ciudad ?? g.ciudad,
      entidad_federativa: d.entidad_federativa ?? g.entidad_federativa,
      codigo_postal: d.codigo_postal ?? g.codigo_postal,
    }));
    setPropuesta(null);
  };

  const submit = async () => {
    if (!segmento.trim() || !nombre.trim()) {
      setError('Segmento y nombre son obligatorios');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { parent_id: parentId, segmento, nombre, tipo };
      if (esCentroOperativo && geo.calle) {
        payload.calle = geo.calle;
        payload.numero_exterior = geo.numero_exterior || undefined;
        payload.colonia = geo.colonia || undefined;
        payload.ciudad = geo.ciudad;
        payload.entidad_federativa = geo.entidad_federativa;
        payload.codigo_postal = geo.codigo_postal;
        payload.referencia = geo.referencia || undefined;
        payload.latitud = geo.latitud ? Number(geo.latitud) : undefined;
        payload.longitud = geo.longitud ? Number(geo.longitud) : undefined;
      }
      const res = await fetch('/api/ubicaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'No se pudo crear la ubicación');
        setLoading(false);
        return;
      }
      onCreada(data.data.id);
    } catch {
      setError('Error de conexión');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div
        className={`bg-white rounded-xl w-full p-6 my-8 ${esCentroOperativo ? 'max-w-2xl' : 'max-w-md'}`}
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <h2 className="text-lg font-display font-semibold text-rtb-navy mb-1">Nueva ubicación</h2>
        {padre && <p className="text-xs text-muted-foreground mb-4">Debajo de {padre.codigo} — {padre.nombre}</p>}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="space-y-4">
          <div>
            <Label>Segmento (fragmento del código)</Label>
            <Input value={segmento} onChange={(e) => setSegmento(e.target.value.toUpperCase())} placeholder="Z01, R01, N2…" />
          </div>
          <div>
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as UbicacionTipo)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 mt-1"
            >
              {UBICACION_TIPOS.map((t) => (
                <option key={t} value={t}>
                  {UBICACION_TIPO_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          {esCentroOperativo && (
            <div className="pt-2 border-t border-border/60 space-y-3">
              <p className="text-xs font-semibold text-rtb-navy-mid">
                Dirección y coordenada (opcional — se puede capturar después)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Calle</Label>
                  <Input value={geo.calle} onChange={(e) => setGeo((g) => ({ ...g, calle: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Número</Label>
                  <Input
                    value={geo.numero_exterior}
                    onChange={(e) => setGeo((g) => ({ ...g, numero_exterior: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Colonia</Label>
                  <Input value={geo.colonia} onChange={(e) => setGeo((g) => ({ ...g, colonia: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Código postal</Label>
                  <Input
                    value={geo.codigo_postal}
                    onChange={(e) => setGeo((g) => ({ ...g, codigo_postal: e.target.value }))}
                    className="tabular-nums"
                  />
                </div>
                <div>
                  <Label className="text-xs">Ciudad</Label>
                  <Input value={geo.ciudad} onChange={(e) => setGeo((g) => ({ ...g, ciudad: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Estado</Label>
                  <Input
                    value={geo.entidad_federativa}
                    onChange={(e) => setGeo((g) => ({ ...g, entidad_federativa: e.target.value }))}
                  />
                </div>
              </div>
              <CampoCoordenada
                latitud={geo.latitud}
                longitud={geo.longitud}
                onLatitudChange={(v) => setGeo((g) => ({ ...g, latitud: v }))}
                onLongitudChange={(v) => setGeo((g) => ({ ...g, longitud: v }))}
                onGeocodificado={setPropuesta}
              />
              <PropuestaDireccion direccion={propuesta} onUsar={usarDireccionPropuesta} onDescartar={() => setPropuesta(null)} />
              <MapaPunto
                latitud={geo.latitud ? Number(geo.latitud) : null}
                longitud={geo.longitud ? Number(geo.longitud) : null}
                editable
                onCoordenadaChange={(lat, lng) =>
                  setGeo((g) => ({ ...g, latitud: lat.toFixed(7), longitud: lng.toFixed(7) }))
                }
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={loading} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Crear
          </Button>
        </div>
      </div>
    </div>
  );
}
