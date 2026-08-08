'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { FileSignature, LayoutGrid, List, Loader2 } from 'lucide-react';
import { OrdenesCompraFiltrosBar, type FiltrosUI } from './ordenes-compra-filtros';
import { OrdenesCompraTablero } from './ordenes-compra-tablero';
import { OrdenesCompraTabla } from './ordenes-compra-tabla';
import type { OrdenCompraListadoRow, PoEstado, PoTableroColumna } from '@/types/ventas';

type Vista = 'tablero' | 'tabla';
const VISTA_STORAGE_KEY = 'rtb.ordenes-compra.vista';

const FILTROS_INICIALES = (estadoInicial?: string): FiltrosUI => ({
  q: '',
  estados: estadoInicial ? (estadoInicial.split(',') as PoEstado[]) : [],
  fechaCampo: 'creacion',
  desde: null,
  hasta: null,
  orden: 'reciente',
});

interface Props {
  initialData: OrdenCompraListadoRow[];
  initialCount: number;
  initialColumnas: PoTableroColumna[];
  pageSize: number;
  estadoInicial?: string;
}

// Calcado de CotizacionesExplorer (038) — mismo patrón de vista persistida
// en localStorage, debounce sólo en el texto de búsqueda, y descarte de
// respuestas obsoletas por petición concurrente. Sin `puedeCrear`: la PO ya
// no se da de alta a mano desde 043.
export function OrdenesCompraExplorer({ initialData, initialCount, initialColumnas, pageSize, estadoInicial }: Props) {
  // 'tablero' fijo en el render inicial (servidor y cliente coinciden);
  // localStorage se lee en un useEffect, nunca en el inicializador de
  // useState — mismo criterio que CotizacionesExplorer/productos-explorer.
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

  const construirParams = useCallback((f: FiltrosUI, p: number, v: Vista) => {
    const params = new URLSearchParams();
    if (f.q.trim()) params.set('q', f.q.trim());
    if (f.estados.length) params.set('estado', f.estados.join(','));
    if (f.desde) params.set('desde', f.desde);
    if (f.hasta) params.set('hasta', f.hasta);
    if (f.desde || f.hasta) params.set('fecha_campo', f.fechaCampo);
    params.set('orden', f.orden);
    if (v === 'tablero') params.set('vista', 'tablero');
    else params.set('page', String(p));
    return params;
  }, []);

  const buscar = useCallback(
    async (f: FiltrosUI, p: number, v: Vista) => {
      const idPeticion = ++peticionRef.current;
      setLoading(true);
      try {
        const params = construirParams(f, p, v);
        const res = await fetch(`/api/ventas/ordenes-compra?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (idPeticion !== peticionRef.current) return;

        if (!res.ok) {
          toast.error(json.error ?? 'No se pudo cargar el listado de órdenes de compra.');
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
    const siguiente = { ...filtros, estados: [estado as PoEstado] };
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
            <FileSignature className="w-6 h-6" /> Órdenes de Compra del cliente
          </h1>
          <p className="text-muted-foreground mt-1">Nace al aprobar una cotización como Vía B — con sus partidas ya copiadas del pedido.</p>
          {estadoInicial && filtros.estados.join(',') === estadoInicial && (
            <Link
              href="/dashboard/ventas/ordenes-compra"
              className="text-xs text-rtb-teal hover:underline"
              onClick={() => aplicarFiltros({ estados: [] })}
            >
              Filtrando por estado «{estadoInicial}» — ver todas
            </Link>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center justify-between px-4 pt-4">
          <span className="text-sm text-muted-foreground">
            {vista === 'tabla' ? `${count} orden${count === 1 ? '' : 'es'} de compra` : `${columnas.reduce((n, c) => n + c.count, 0)} órdenes de compra`}
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

        <OrdenesCompraFiltrosBar filtros={filtros} onChange={onFiltrosChange} />

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
              <OrdenesCompraTablero columnas={columnas} onVerTodas={onVerTodasDeColumna} />
            )}
          </div>
        ) : (
          <OrdenesCompraTabla data={data} count={count} page={page} pageSize={pageSize} loading={loading} onPageChange={onPageChange} />
        )}
      </div>
    </div>
  );
}
