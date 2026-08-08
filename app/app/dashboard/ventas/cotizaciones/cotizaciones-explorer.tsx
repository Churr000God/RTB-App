'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { FileText, LayoutGrid, List, Loader2, Plus } from 'lucide-react';
import { CotizacionesFiltrosBar, type FiltrosUI } from './cotizaciones-filtros';
import { CotizacionesTablero } from './cotizaciones-tablero';
import { CotizacionesTabla } from './cotizaciones-tabla';
import type { CotizacionListadoRow, CotizacionTableroColumna, VentasCotizacionEstado } from '@/types/ventas';

type Vista = 'tablero' | 'tabla';
const VISTA_STORAGE_KEY = 'rtb.cotizaciones.vista';

const FILTROS_INICIALES = (estadoInicial?: string): FiltrosUI => ({
  q: '',
  estados: estadoInicial ? [estadoInicial as VentasCotizacionEstado] : [],
  fechaCampo: 'creacion',
  desde: null,
  hasta: null,
  soloMias: false,
  vendedorId: null,
  canal: null,
  vigenciaFiltro: null,
  enConsulta: false,
  orden: 'reciente',
});

interface Props {
  initialData: CotizacionListadoRow[];
  initialCount: number;
  initialColumnas: CotizacionTableroColumna[];
  pageSize: number;
  vendedores: { id: string; full_name: string }[];
  puedeCrear: boolean;
  estadoInicial?: string;
}

export function CotizacionesExplorer({
  initialData,
  initialCount,
  initialColumnas,
  pageSize,
  vendedores,
  puedeCrear,
  estadoInicial,
}: Props) {
  const router = useRouter();

  // 'tablero' fijo en el render inicial (servidor y cliente coinciden) —
  // localStorage se lee en un useEffect, nunca en el inicializador de
  // useState: hacerlo ahí produce un mismatch de hidratación (el HTML del
  // servidor no conoce el localStorage del navegador). Mismo patrón que
  // productos-explorer.tsx.
  const [vista, setVista] = useState<Vista>('tablero');
  useEffect(() => {
    const guardada = window.localStorage.getItem(VISTA_STORAGE_KEY);
    if (guardada === 'tablero' || guardada === 'tabla') setVista(guardada);
  }, []);
  const cambiarVista = (v: Vista) => {
    setVista(v);
    window.localStorage.setItem(VISTA_STORAGE_KEY, v);
  };

  const [filtros, setFiltros] = useState<FiltrosUI>(() => FILTROS_INICIALES(estadoInicial));
  const [page, setPage] = useState(1);
  const [data, setData] = useState(initialData);
  const [count, setCount] = useState(initialCount);
  const [columnas, setColumnas] = useState(initialColumnas);
  const [loading, setLoading] = useState(false);

  const peticionRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const construirParams = useCallback(
    (f: FiltrosUI, p: number, v: Vista) => {
      const params = new URLSearchParams();
      if (f.q.trim()) params.set('q', f.q.trim());
      if (f.estados.length) params.set('estado', f.estados.join(','));
      if (f.desde) params.set('desde', f.desde);
      if (f.hasta) params.set('hasta', f.hasta);
      if (f.desde || f.hasta) params.set('fecha_campo', f.fechaCampo);
      if (f.soloMias) params.set('solo_mias', '1');
      else if (f.vendedorId) params.set('vendedor_id', f.vendedorId);
      if (f.canal) params.set('canal', f.canal);
      if (f.vigenciaFiltro) params.set('vigencia', f.vigenciaFiltro);
      if (f.enConsulta) params.set('en_consulta', '1');
      params.set('orden', f.orden);
      if (v === 'tablero') params.set('vista', 'tablero');
      else params.set('page', String(p));
      return params;
    },
    []
  );

  const buscar = useCallback(
    async (f: FiltrosUI, p: number, v: Vista) => {
      const idPeticion = ++peticionRef.current;
      setLoading(true);
      try {
        const params = construirParams(f, p, v);
        const res = await fetch(`/api/ventas/cotizaciones?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (idPeticion !== peticionRef.current) return; // respuesta obsoleta, descartar

        if (!res.ok) {
          toast.error(json.error ?? 'No se pudo cargar el listado de cotizaciones.');
          return;
        }
        if (v === 'tablero') {
          setColumnas(json.columnas ?? []);
        } else {
          setData(json.data ?? []);
          setCount(json.count ?? 0);
        }
      } catch {
        if (idPeticion === peticionRef.current) toast.error('No se pudo conectar con el servidor.');
      } finally {
        if (idPeticion === peticionRef.current) setLoading(false);
      }
    },
    [construirParams]
  );

  // Debounce 300ms sólo para el cambio de texto de búsqueda — el resto de
  // filtros dispara de inmediato (son selects/checkboxes, no tecleo).
  const filtrosRef = useRef(filtros);
  filtrosRef.current = filtros;
  const aplicarFiltros = useCallback(
    (parcial: Partial<FiltrosUI>, opts: { debounce?: boolean } = {}) => {
      const siguiente = { ...filtrosRef.current, ...parcial };
      setFiltros(siguiente);
      setPage(1);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (opts.debounce) {
        debounceRef.current = setTimeout(() => void buscar(siguiente, 1, vista), 300);
      } else {
        void buscar(siguiente, 1, vista);
      }
    },
    [buscar, vista]
  );

  const onFiltrosChange = (parcial: Partial<FiltrosUI>) => aplicarFiltros(parcial, { debounce: 'q' in parcial });

  const onVistaChange = (v: Vista) => {
    cambiarVista(v);
    void buscar(filtros, page, v);
  };

  const onPageChange = (nueva: number) => {
    setPage(nueva);
    void buscar(filtros, nueva, vista);
  };

  const onVerTodasDeColumna = (estado: string) => {
    const siguiente = { ...filtros, estados: [estado as VentasCotizacionEstado] };
    setFiltros(siguiente);
    setPage(1);
    cambiarVista('tabla');
    void buscar(siguiente, 1, 'tabla');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6" /> Cotizaciones
          </h1>
          <p className="text-muted-foreground mt-1">RTB-PRO-VEN-01 §II · el precio elegido se fotografía y nunca cambia</p>
          {estadoInicial && filtros.estados.length === 1 && filtros.estados[0] === estadoInicial && (
            <Link
              href="/dashboard/ventas/cotizaciones"
              className="text-xs text-rtb-teal hover:underline"
              onClick={() => aplicarFiltros({ estados: [] })}
            >
              Filtrando por estado «{estadoInicial}» — ver todas
            </Link>
          )}
        </div>
        {puedeCrear && (
          <Link
            href="/dashboard/ventas/cotizaciones/nueva"
            className="inline-flex items-center rounded-lg bg-rtb-teal hover:bg-rtb-teal/90 text-white text-sm font-medium px-4 py-2"
          >
            <Plus className="w-4 h-4 mr-2" /> Nueva cotización
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center justify-between px-4 pt-4">
          <span className="text-sm text-muted-foreground">
            {vista === 'tabla' ? `${count} cotización${count === 1 ? '' : 'es'}` : `${columnas.reduce((n, c) => n + c.count, 0)} cotizaciones`}
          </span>
          <ToggleGroup type="single" value={vista} onValueChange={(v) => v && onVistaChange(v as Vista)} className="border border-border rounded-lg p-0.5">
            <ToggleGroupItem value="tablero" aria-label="Vista de tablero" size="sm">
              <LayoutGrid className="w-4 h-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="tabla" aria-label="Vista de tabla" size="sm">
              <List className="w-4 h-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <CotizacionesFiltrosBar filtros={filtros} onChange={onFiltrosChange} vendedores={vendedores} />

        {loading && vista === 'tabla' && data.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-rtb-teal animate-spin" />
          </div>
        ) : vista === 'tablero' ? (
          <div className="p-4">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-rtb-teal animate-spin" />
              </div>
            ) : (
              <CotizacionesTablero columnas={columnas} onVerTodas={onVerTodasDeColumna} />
            )}
          </div>
        ) : (
          <CotizacionesTabla
            data={data}
            count={count}
            page={page}
            pageSize={pageSize}
            loading={loading}
            vendedores={vendedores}
            onPageChange={onPageChange}
          />
        )}
      </div>
    </div>
  );
}
