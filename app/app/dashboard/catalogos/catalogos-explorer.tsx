'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/lib/rbac/hooks';
import { puede } from '@/lib/inventario/permisos';
import { CATALOGO_META, CATALOGO_TIPOS, type CatalogoTipo } from '@/lib/inventario/catalogos';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Library, Plus } from 'lucide-react';
import type { UnidadMedida } from '@/types/inventario';
import { CatalogoTabla, type FilaCatalogo } from './catalogo-tabla';
import { CatalogoModal } from './catalogo-modal';

type Datos = Record<CatalogoTipo, FilaCatalogo[]>;

export function CatalogosExplorer({ initialData }: { initialData: Datos }) {
  const { role } = useAuth();
  const [datos, setDatos] = useState<Datos>(initialData);
  const [tab, setTab] = useState<CatalogoTipo>('familias');
  const [modal, setModal] = useState<{ tipo: CatalogoTipo; fila: FilaCatalogo | null } | null>(null);

  const cargar = useCallback(async (tipo: CatalogoTipo) => {
    // ?activo=false incluye inactivos — al revés que el select del alta de
    // producto, que sólo quiere ver activos. Una pantalla de administración
    // tiene que poder ver y reactivar los inactivos.
    const res = await fetch(`/api/catalogos/${tipo}?activo=false`);
    if (!res.ok) return; // 403/500 sin esto se vuelve una lista vacía silenciosa
    const json = await res.json();
    setDatos((d) => ({ ...d, [tipo]: json.data ?? [] }));
  }, []);

  const unidades = (datos['unidades-medida'] as unknown as UnidadMedida[]) ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <Library className="w-6 h-6" /> Catálogos de Producto
        </h1>
        <p className="text-muted-foreground mt-1">Familias, categorías, marcas y unidades de medida — RTB-INV-01</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as CatalogoTipo)} className="w-full">
        <TabsList>
          {CATALOGO_TIPOS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {CATALOGO_META[t].label}
            </TabsTrigger>
          ))}
        </TabsList>

        {CATALOGO_TIPOS.map((t) => {
          const meta = CATALOGO_META[t];
          const puedeEscribir = puede(role, meta.recurso, 'insert');
          return (
            <TabsContent key={t} value={t} className="space-y-4">
              <div className="flex justify-end">
                {puedeEscribir && (
                  <Button
                    size="sm"
                    onClick={() => setModal({ tipo: t, fila: null })}
                    className="bg-rtb-teal hover:bg-rtb-teal/90 text-white"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Nueva {meta.labelSingular}
                  </Button>
                )}
              </div>
              <CatalogoTabla
                tipo={t}
                meta={meta}
                filas={datos[t] ?? []}
                unidades={unidades}
                puedeEditar={puede(role, meta.recurso, 'update')}
                puedeEditarMargen={role === 'super_admin' || role === 'direccion'}
                onEditar={(fila) => setModal({ tipo: t, fila })}
                onToggleActivo={async (fila) => {
                  await fetch(`/api/catalogos/${t}/${fila.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ activo: !fila.activo }),
                  });
                  void cargar(t);
                }}
                onCambio={() => void cargar(t)}
              />
            </TabsContent>
          );
        })}
      </Tabs>

      {modal && (
        <CatalogoModal
          tipo={modal.tipo}
          meta={CATALOGO_META[modal.tipo]}
          fila={modal.fila}
          unidades={unidades}
          onClose={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            void cargar(modal.tipo);
          }}
        />
      )}
    </div>
  );
}
