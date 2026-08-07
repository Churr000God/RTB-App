'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MotivoDialog } from '@/components/inventario/motivo-dialog';
import { VENTAS_AUTORIZACION_ESTADO_LABELS, VENTAS_AUTORIZACION_TIPO_LABELS } from '@/lib/ventas/config';
import { ROLES_AUTORIZAN } from '@/lib/ventas/permisos';
import type { UserRole } from '@/types/database';
import { Loader2 } from 'lucide-react';

export function AutorizacionesBandeja({
  autorizaciones: iniciales,
  rol,
  userId,
}: {
  autorizaciones: any[];
  rol: UserRole;
  userId: string;
}) {
  const [autorizaciones, setAutorizaciones] = useState(iniciales);
  const puedeResolver = (ROLES_AUTORIZAN as readonly string[]).includes(rol);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = async () => {
    const res = await fetch('/api/ventas/autorizaciones');
    const data = await res.json().catch(() => ({}));
    setAutorizaciones(data.data ?? []);
  };

  const aprobar = async (id: string) => {
    setError(null);
    setAprobandoId(id);
    const res = await fetch(`/api/ventas/autorizaciones/${id}/resolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'aprobar' }),
    });
    const data = await res.json().catch(() => ({}));
    setAprobandoId(null);
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo aprobar.');
      return;
    }
    await recargar();
  };

  const rechazar = (id: string) => async (comentario: string) => {
    const res = await fetch(`/api/ventas/autorizaciones/${id}/resolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'rechazar', comentario_resolucion: comentario }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo rechazar.');
      return false;
    }
    await recargar();
    return true;
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-rtb-navy text-white">
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Tipo</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Documento</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Motivo</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider">Estado</th>
              {puedeResolver && <th className="w-48" />}
            </tr>
          </thead>
          <tbody>
            {autorizaciones.map((a) => (
              <tr key={a.id} className="border-b border-border/50">
                <td className="py-2 px-3">{VENTAS_AUTORIZACION_TIPO_LABELS[a.tipo as keyof typeof VENTAS_AUTORIZACION_TIPO_LABELS]}</td>
                <td className="py-2 px-3 text-xs text-muted-foreground">
                  {a.documento_tipo} · {a.documento_id}
                </td>
                <td className="py-2 px-3 text-xs text-muted-foreground truncate max-w-xs">{a.motivo}</td>
                <td className="py-2 px-3 text-xs">{VENTAS_AUTORIZACION_ESTADO_LABELS[a.estado as keyof typeof VENTAS_AUTORIZACION_ESTADO_LABELS]}</td>
                {puedeResolver && (
                  <td className="py-2 px-3">
                    {a.estado === 'pendiente' && a.solicitante_id !== userId && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => aprobar(a.id)} disabled={aprobandoId === a.id}>
                          {aprobandoId === a.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                          Aprobar
                        </Button>
                        <MotivoDialog
                          trigger={
                            <Button size="sm" variant="outline" className="text-destructive">
                              Rechazar
                            </Button>
                          }
                          titulo="Rechazar autorización"
                          confirmLabel="Rechazar"
                          destructivo
                          onConfirm={rechazar(a.id)}
                        />
                      </div>
                    )}
                    {a.estado === 'pendiente' && a.solicitante_id === userId && (
                      <span className="text-xs text-muted-foreground">No puedes resolver tu propia solicitud</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {autorizaciones.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                  Sin autorizaciones registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
