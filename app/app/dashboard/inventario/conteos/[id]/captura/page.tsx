'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CONTEO_LINEA_ESTADO_LABELS } from '@/lib/inventario/config';
import type { ConteoLineaEstado } from '@/types/inventario';
import { ArrowLeft, CheckCircle2, EyeOff, Loader2, PackageSearch } from 'lucide-react';

interface LineaCaptura {
  id: string;
  producto_id: string;
  ubicacion_id: string | null;
  estado_conteo: ConteoLineaEstado;
  cantidad_fisica: number | null;
  unidad_captura_id: string | null;
  contado_por: string | null;
  productos: { codigo_interno: string; nombre: string; sku: string | null } | null;
  // deliberadamente SIN cantidad_teorica/diferencia: esta pantalla es la
  // vista ciega real, no puede mostrar lo que ni siquiera recibe — el
  // GRANT SELECT de inventario_conteo_detalles ya las omite (012).
}

// Vista ciega real de captura: "no muestra cantidad teórica ni diferencia"
// (Acta de Conteo Físico CIE-CON-01 §II). No es una regla de este
// componente — es un privilegio de columna de Postgres; aunque este
// archivo intentara mostrar el teórico, el fetch nunca lo trae para un
// capturista.
export default function CapturaPage({ params }: { params: { id: string } }) {
  const [lineas, setLineas] = useState<LineaCaptura[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState<Record<string, string>>({});

  const cargar = async () => {
    setLoading(true);
    const res = await fetch(`/api/inventario/conteos/${params.id}/detalles?estado_conteo=no_visitada`);
    const data = await res.json();
    setLineas(data.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void cargar();
  }, [params.id]);

  const capturar = async (linea: LineaCaptura, estado: ConteoLineaEstado) => {
    const cantidad = pendientes[linea.id];
    setGuardando(linea.id);
    const res = await fetch(`/api/inventario/conteos/${params.id}/detalles/${linea.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estado_conteo: estado,
        cantidad_capturada: estado === 'no_localizada' ? 0 : cantidad ? Number(cantidad) : undefined,
        unidad_captura_id: linea.unidad_captura_id,
      }),
    });
    setGuardando(null);
    if (res.ok) {
      setLineas((ls) => ls.filter((l) => l.id !== linea.id));
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/dashboard/inventario/conteos/${params.id}`}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Detalle del conteo
        </Link>
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
          <PackageSearch className="w-6 h-6" /> Captura de conteo
        </h1>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-accent/10 text-accent">
          <EyeOff className="w-3.5 h-3.5" /> Vista ciega
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Captura lo que ves en el anaquel. El sistema no te muestra la cantidad esperada — así evitamos que el
        conteo confirme lo que el sistema ya cree, en vez de medir lo que realmente hay.
      </p>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-rtb-teal animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {lineas.map((l) => (
            <div key={l.id} className="bg-white rounded-xl p-4 space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div>
                <p className="text-sm font-medium text-rtb-navy">{l.productos?.nombre}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {l.productos?.codigo_interno} {l.productos?.sku ? `· SKU ${l.productos.sku}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Cantidad contada"
                  value={pendientes[l.id] ?? ''}
                  onChange={(e) => setPendientes((p) => ({ ...p, [l.id]: e.target.value }))}
                  className="w-40 text-sm border border-border rounded-lg px-3 py-2 tabular-nums"
                />
                <Button
                  size="sm"
                  disabled={guardando === l.id || !pendientes[l.id]}
                  onClick={() => capturar(l, 'contada')}
                  className="bg-rtb-teal hover:bg-rtb-teal/90 text-white"
                >
                  {guardando === l.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                  Confirmar
                </Button>
                <Button size="sm" variant="outline" disabled={guardando === l.id} onClick={() => capturar(l, 'no_localizada')}>
                  No localizada
                </Button>
                <Button size="sm" variant="outline" disabled={guardando === l.id} onClick={() => capturar(l, 'bloqueada')}>
                  Bloqueada
                </Button>
              </div>
            </div>
          ))}
          {lineas.length === 0 && (
            <div className="bg-white rounded-xl p-10 text-center text-muted-foreground text-sm" style={{ boxShadow: 'var(--shadow-sm)' }}>
              {CONTEO_LINEA_ESTADO_LABELS.no_visitada}: no quedan líneas pendientes en tu asignación.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
