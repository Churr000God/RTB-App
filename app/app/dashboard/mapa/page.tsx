'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Map as MapIcon } from 'lucide-react';
import MapaMultiple, { type PuntoMapa } from '@/components/mapas/MapaMultiple';
import { DIRECCION_TIPO_LABELS, ENTIDAD_TIPO_LABELS } from '@/lib/entidades/config';
import type { DireccionTipo, EntidadTipo } from '@/types/entidades';

type FiltroTipo = 'todos' | EntidadTipo | 'centro_operativo';

const FILTROS: FiltroTipo[] = ['todos', 'cliente', 'proveedor', 'mixta', 'centro_operativo'];

// Paleta del proyecto (STYLE_GUIDE.md): un color por tipo de punto, nunca
// hex directo repetido a mano en otros lugares — sólo aquí, donde el mapa
// necesita distinguir a simple vista clientes de proveedores y de centros
// operativos (base para agrupar por zona cuando llegue el módulo de
// Rutas, RTB-PRO-RUT-01).
const COLOR_POR_TIPO: Record<EntidadTipo | 'centro_operativo', string> = {
  cliente: '#159895',
  proveedor: '#AD9551',
  mixta: '#1A5F7A',
  centro_operativo: '#002B5B',
};

// Leyenda de la paleta de arriba — hace visible qué significa cada color
// de pin en el mapa (pedido del dueño del proyecto: los colores ya
// existían pero sin ninguna referencia que los explicara).
const LEYENDA: { tipo: EntidadTipo | 'centro_operativo'; label: string }[] = [
  { tipo: 'cliente', label: 'Cliente' },
  { tipo: 'proveedor', label: 'Proveedor' },
  { tipo: 'mixta', label: 'Mixta' },
  { tipo: 'centro_operativo', label: 'Centro operativo' },
];

interface DireccionPunto {
  id: string;
  entidad_id: string;
  tipo: DireccionTipo;
  latitud: number;
  longitud: number;
  entidades: {
    clave: string;
    nombre_legal: string;
    nombre_comercial: string | null;
    tipo: EntidadTipo;
    siglas: string | null;
  } | null;
}

interface CentroPunto {
  id: string;
  codigo: string;
  nombre: string;
  latitud: number;
  longitud: number;
}

export default function MapaPage() {
  const router = useRouter();
  const [direcciones, setDirecciones] = useState<DireccionPunto[]>([]);
  const [centros, setCentros] = useState<CentroPunto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroTipo>('todos');

  useEffect(() => {
    fetch('/api/mapa/puntos')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? 'No se pudieron cargar los puntos del mapa');
          return;
        }
        setDirecciones(data.direcciones ?? []);
        setCentros(data.centros ?? []);
      })
      .catch(() => setError('Error de conexión'))
      .finally(() => setLoading(false));
  }, []);

  const puntos: PuntoMapa[] = useMemo(() => {
    const deDirecciones: PuntoMapa[] = direcciones
      .filter((d) => filtro === 'todos' || filtro === d.entidades?.tipo)
      .map((d) => ({
        id: `direccion-${d.id}`,
        latitud: d.latitud,
        longitud: d.longitud,
        titulo: d.entidades?.nombre_comercial || d.entidades?.nombre_legal || d.entidades?.clave || 'Entidad',
        subtitulo: d.entidades
          ? `${ENTIDAD_TIPO_LABELS[d.entidades.tipo]} · ${DIRECCION_TIPO_LABELS[d.tipo]}`
          : DIRECCION_TIPO_LABELS[d.tipo],
        color: d.entidades ? COLOR_POR_TIPO[d.entidades.tipo] : COLOR_POR_TIPO.cliente,
      }));

    const deCentros: PuntoMapa[] =
      filtro === 'todos' || filtro === 'centro_operativo'
        ? centros.map((c) => ({
            id: `centro-${c.id}`,
            latitud: c.latitud,
            longitud: c.longitud,
            titulo: c.nombre,
            subtitulo: c.codigo,
            color: COLOR_POR_TIPO.centro_operativo,
          }))
        : [];

    return [...deDirecciones, ...deCentros];
  }, [direcciones, centros, filtro]);

  const handlePuntoClick = (punto: PuntoMapa) => {
    if (punto.id.startsWith('direccion-')) {
      const d = direcciones.find((x) => `direccion-${x.id}` === punto.id);
      if (d) router.push(`/dashboard/entidades/${d.entidad_id}`);
    } else {
      const c = centros.find((x) => `centro-${x.id}` === punto.id);
      if (c) router.push(`/dashboard/ubicaciones?seleccionar=${c.id}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <MapIcon className="w-6 h-6" /> Mapa
        </h1>
        <p className="text-muted-foreground mt-1">
          Clientes, proveedores y centros operativos con ubicación geográfica capturada
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              filtro === f ? 'bg-rtb-teal text-white' : 'bg-rtb-surface text-rtb-navy-mid hover:bg-rtb-surface/70'
            }`}
          >
            {f === 'todos' ? 'Todos' : f === 'centro_operativo' ? 'Centros operativos' : ENTIDAD_TIPO_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {LEYENDA.map(({ tipo, label }) => (
          <span key={tipo} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: COLOR_POR_TIPO[tipo] }}
              aria-hidden
            />
            {label}
          </span>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div
          className="h-[32rem] rounded-xl bg-white flex items-center justify-center"
          style={{ boxShadow: 'var(--shadow-sm)' }}
        >
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="bg-white rounded-xl p-2" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <MapaMultiple puntos={puntos} onPuntoClick={handlePuntoClick} />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {puntos.length} punto{puntos.length === 1 ? '' : 's'} en el mapa.
      </p>
    </div>
  );
}
