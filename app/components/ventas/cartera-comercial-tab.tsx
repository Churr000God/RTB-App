'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Actualizando } from '@/components/ui/actualizando';
import { MotivoDialog } from '@/components/inventario/motivo-dialog';
import { CarteraEstadoBadge } from '@/components/ventas/estado-badge';
import { CLIENTE_TIPO_LABELS } from '@/lib/ventas/config';
import { CLIENTE_TIPOS, type ClienteCarteraEstado, type ClienteTipo } from '@/types/ventas';
import type { UserRole } from '@/types/database';
import { AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  entidadId: string;
  requierePo: boolean;
  tipoCliente: ClienteTipo;
  rol: UserRole | null;
}

// Política comercial (029, RTB-VEN-01) + el veredicto de cartera
// (cliente_puede_operar()) — separado a propósito de entidades.estado,
// que sigue siendo sólo el bloqueo administrativo.
export function CarteraComercialTab({ entidadId, requierePo: requierePoInicial, tipoCliente: tipoInicial, rol }: Props) {
  const router = useRouter();
  const [refrescando, iniciarRefresco] = useTransition();
  // requierePo/tipoCliente son campos de formulario en edición, no un
  // espejo de lectura: tras guardar, router.refresh() trae de vuelta
  // props actualizadas y el estado local ya coincide.
  const [requierePo, setRequierePo] = useState(requierePoInicial);
  const [tipoCliente, setTipoCliente] = useState<ClienteTipo>(tipoInicial);
  const [estado, setEstado] = useState<{ puede: boolean; estado: ClienteCarteraEstado; motivo: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const puedeEditar = rol === 'super_admin' || rol === 'direccion' || rol === 'ventas';
  const puedeCongelar = rol === 'super_admin' || rol === 'direccion';

  const cargarEstado = async () => {
    const res = await fetch(`/api/ventas/clientes/${entidadId}/estado`, { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo cargar el estado de cartera.');
      return;
    }
    setEstado(data?.data ?? null);
  };

  useEffect(() => {
    void cargarEstado();
  }, [entidadId]);

  const guardarPolitica = async () => {
    setError(null);
    setEnviando(true);
    const res = await fetch(`/api/entidades/${entidadId}/politica-comercial`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ requiere_po: requierePo, tipo_cliente: tipoCliente }),
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo guardar.');
      return;
    }
    toast.success('Política comercial guardada.');
    iniciarRefresco(() => router.refresh());
  };

  const congelar = (motivo: string) =>
    fetch('/api/ventas/congelamientos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ entidad_id: entidadId, motivo }),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data?.error ?? 'No se pudo congelar.');
          return false;
        }
        void cargarEstado();
        iniciarRefresco(() => router.refresh());
        return true;
      });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl p-5 space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <h2 className="text-sm font-display font-semibold text-rtb-navy">Estado de cartera</h2>
        {estado ? (
          <>
            <CarteraEstadoBadge estado={estado.estado} />
            {estado.motivo && <p className="text-xs text-muted-foreground">{estado.motivo}</p>}
            {!estado.puede && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> Esta entidad no puede operar (cotizar/aprobar/liberar) ahora mismo.
              </p>
            )}
          </>
        ) : (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        )}
        {puedeCongelar && estado?.estado !== 'congelada' && estado?.estado !== 'bloqueada' && (
          <MotivoDialog
            trigger={
              <Button size="sm" variant="outline" className="text-destructive">
                Congelar cuenta
              </Button>
            }
            titulo="Congelar cartera de esta entidad"
            descripcion="Saldo vencido >90 días — se registra a mano hasta que exista Facturación."
            confirmLabel="Congelar"
            destructivo
            onConfirm={congelar}
          />
        )}
      </div>

      <div className="bg-white rounded-xl p-5 space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-display font-semibold text-rtb-navy">Política comercial</h2>
          <Actualizando activo={refrescando} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <Label className="text-xs">Requiere PO para facturar</Label>
          <input type="checkbox" checked={requierePo} onChange={(e) => setRequierePo(e.target.checked)} disabled={!puedeEditar} />
        </div>
        <div>
          <Label className="text-xs">Tipo de cliente</Label>
          <select
            value={tipoCliente}
            onChange={(e) => setTipoCliente(e.target.value as ClienteTipo)}
            disabled={!puedeEditar}
            className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2"
          >
            {CLIENTE_TIPOS.map((t) => (
              <option key={t} value={t}>
                {CLIENTE_TIPO_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {puedeEditar && (
          <Button size="sm" onClick={guardarPolitica} disabled={enviando} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {enviando && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Guardar
          </Button>
        )}
      </div>
    </div>
  );
}
