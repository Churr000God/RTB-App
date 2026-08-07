'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ProductoCombobox } from '@/components/inventario/producto-combobox';
import { ConsultaEstadoBadge } from '@/components/ventas/estado-badge';
import { Paginacion } from '@/components/ui/paginacion';
import { useAccionServidor } from '@/lib/ui/use-accion-servidor';
import { CONSULTA_ESTADOS_ABIERTOS, CONSULTA_ESTADOS_RESUELTOS, CONSULTA_URGENCIA_LABELS, ROLES_RESPONDEN_CONSULTA } from '@/lib/ventas/config';
import type { ConsultaComprasRow } from '@/types/ventas';
import type { UserRole } from '@/types/database';
import { AlertCircle, Loader2 } from 'lucide-react';

type TabValue = 'abiertas' | 'resueltas';

// consultas/count/abiertas llegan como prop del Server Component
// (page.tsx) — primera página de la pestaña Abiertas. Cada pestaña pagina
// por su cuenta contra /api/ventas/consultas (estado=lista separada por
// comas, ver CONSULTA_ESTADOS_ABIERTOS/_RESUELTOS); el badge "Abiertas (N)"
// sale del `abiertas` que el propio endpoint devuelve en cada respuesta,
// no de contar el arreglo cargado — por eso sigue correcto también
// mientras la pestaña activa es Resueltas. Responder una consulta pasa por
// useAccionServidor() (router.refresh()); el useEffect de abajo
// resincroniza el estado local con las props nuevas que trae ese refresh.
export function ConsultasBandeja({
  consultas,
  count: countInicial,
  abiertas: abiertasInicial,
  pageSize,
  rol,
}: {
  consultas: ConsultaComprasRow[];
  count: number;
  abiertas: number;
  pageSize: number;
  rol: UserRole;
}) {
  const puedeResponder = (ROLES_RESPONDEN_CONSULTA as readonly string[]).includes(rol);

  const [tab, setTab] = useState<TabValue>('abiertas');
  const [data, setData] = useState(consultas);
  const [count, setCount] = useState(countInicial);
  const [abiertasCount, setAbiertasCount] = useState(abiertasInicial);
  const [page, setPage] = useState(1);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setData(consultas);
    setCount(countInicial);
    setAbiertasCount(abiertasInicial);
    setTab('abiertas');
    setPage(1);
  }, [consultas, countInicial, abiertasInicial]);

  const cargar = useCallback(async (p: number, t: TabValue) => {
    setCargando(true);
    try {
      const estados = t === 'abiertas' ? CONSULTA_ESTADOS_ABIERTOS : CONSULTA_ESTADOS_RESUELTOS;
      const params = new URLSearchParams({ estado: estados.join(','), page: String(p) });
      const res = await fetch(`/api/ventas/consultas?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setData(json.data ?? []);
        setCount(json.count ?? 0);
        setAbiertasCount(json.abiertas ?? 0);
        setPage(p);
      }
    } finally {
      setCargando(false);
    }
  }, []);

  const cambiarTab = (t: string) => {
    const next = t as TabValue;
    setTab(next);
    void cargar(1, next);
  };

  const alResponder = () => void cargar(page, tab);

  return (
    <Tabs value={tab} onValueChange={cambiarTab}>
      <TabsList>
        <TabsTrigger value="abiertas">Abiertas ({abiertasCount})</TabsTrigger>
        <TabsTrigger value="resueltas">Resueltas</TabsTrigger>
      </TabsList>
      <TabsContent value="abiertas" className="mt-4">
        <TablaConsultas
          consultas={data}
          puedeResponder={puedeResponder}
          cargando={cargando}
          page={page}
          pageSize={pageSize}
          count={count}
          onPageChange={(p) => cargar(p, 'abiertas')}
          onResponder={alResponder}
        />
      </TabsContent>
      <TabsContent value="resueltas" className="mt-4">
        <TablaConsultas
          consultas={data}
          puedeResponder={false}
          cargando={cargando}
          page={page}
          pageSize={pageSize}
          count={count}
          onPageChange={(p) => cargar(p, 'resueltas')}
          onResponder={alResponder}
        />
      </TabsContent>
    </Tabs>
  );
}

function TablaConsultas({
  consultas,
  puedeResponder,
  cargando,
  page,
  pageSize,
  count,
  onPageChange,
  onResponder,
}: {
  consultas: ConsultaComprasRow[];
  puedeResponder: boolean;
  cargando: boolean;
  page: number;
  pageSize: number;
  count: number;
  onPageChange: (p: number) => void;
  onResponder: () => void;
}) {
  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
      {cargando ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-rtb-teal animate-spin" />
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-rtb-navy text-white">
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Folio</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Descripción</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Urgencia</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Estado</th>
              {puedeResponder && <th className="w-32" />}
            </tr>
          </thead>
          <tbody>
            {consultas.map((c) => (
              <tr key={c.id} className="border-b border-border/50">
                <td className="py-2 px-3 tabular-nums text-xs">{c.folio}</td>
                <td className="py-2 px-3">
                  <div className="flex flex-col">
                    <span>{c.descripcion}</span>
                    <span className="text-xs text-muted-foreground">
                      {[c.marca_texto, c.modelo_texto, c.numero_parte].filter(Boolean).join(' · ')}
                      {c.cantidad ? ` · ${c.cantidad} ${c.unidad_texto ?? ''}` : ''}
                    </span>
                  </div>
                </td>
                <td className="py-2 px-3 text-xs text-muted-foreground">{CONSULTA_URGENCIA_LABELS[c.urgencia]}</td>
                <td className="py-2 px-3">
                  <ConsultaEstadoBadge estado={c.estado} />
                </td>
                {puedeResponder && (
                  <td className="py-2 px-3">
                    {(c.estado === 'abierta' || c.estado === 'en_proceso') && (
                      <ResponderDialog consulta={c} onResponder={onResponder} />
                    )}
                  </td>
                )}
              </tr>
            ))}
            {consultas.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  Sin consultas en esta pestaña.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Paginacion page={page} pageSize={pageSize} count={count} onPageChange={onPageChange} disabled={cargando} />
    </div>
  );
}

function ResponderDialog({ consulta, onResponder }: { consulta: ConsultaComprasRow; onResponder: () => void }) {
  const { ejecutar, ocupado, error, setError } = useAccionServidor();
  const [open, setOpen] = useState(false);
  const [productoId, setProductoId] = useState<string | null>(null);
  const [costoUnitario, setCostoUnitario] = useState('');
  const [plazoDias, setPlazoDias] = useState('');
  const [disponibilidad, setDisponibilidad] = useState('');

  const responder = async () => {
    if (!productoId || !costoUnitario) {
      setError('Elige el producto ya dado de alta y su costo.');
      return;
    }
    const res = await ejecutar(`/api/ventas/consultas/${consulta.id}/responder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        producto_id: productoId,
        costo_unitario: Number(costoUnitario),
        plazo_entrega_dias: plazoDias ? Number(plazoDias) : undefined,
        disponibilidad: disponibilidad || undefined,
      }),
    });
    if (!res.ok) return;
    setOpen(false);
    // router.refresh() (dentro de ejecutar()) releerá la página 1 de
    // Abiertas en el servidor; refresca también la vista actual (misma
    // pestaña/página) para que la fila desaparezca sin esperar ese ciclo.
    onResponder();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Responder</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Responder consulta {consulta.folio}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Da de alta el producto con tus rutas normales de Compras primero (si no existe); aquí sólo lo ligas a la
          cotización con el costo real.
        </p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Producto ya dado de alta</Label>
            <div className="mt-1">
              <ProductoCombobox value={productoId} onChange={(id) => setProductoId(id)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Costo unitario</Label>
              <input
                type="number"
                min="0"
                step="any"
                value={costoUnitario}
                onChange={(e) => setCostoUnitario(e.target.value)}
                className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <Label className="text-xs">Plazo de entrega (días)</Label>
              <input
                type="number"
                min="0"
                value={plazoDias}
                onChange={(e) => setPlazoDias(e.target.value)}
                className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Disponibilidad</Label>
            <input
              value={disponibilidad}
              onChange={(e) => setDisponibilidad(e.target.value)}
              placeholder="Ej. en stock del proveedor"
              className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button size="sm" onClick={responder} disabled={ocupado} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {ocupado && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Responder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
