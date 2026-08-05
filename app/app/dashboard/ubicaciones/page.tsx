'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/rbac/hooks';
import { puede } from '@/lib/entidades/permisos';
import { UBICACION_CLASIFICACION_LABELS, UBICACION_TIPO_LABELS } from '@/lib/entidades/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UbicacionInterna, UbicacionTipo } from '@/types/entidades';
import { UBICACION_TIPOS } from '@/types/entidades';
import {
  AlertCircle,
  Box,
  ChevronDown,
  ChevronRight,
  Layers,
  Loader2,
  MapPinned,
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

export default function UbicacionesPage() {
  const { role } = useAuth();
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

  const submit = async () => {
    if (!segmento.trim() || !nombre.trim()) {
      setError('Segmento y nombre son obligatorios');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ubicaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: parentId, segmento, nombre, tipo }),
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6" style={{ boxShadow: 'var(--shadow-lg)' }}>
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
