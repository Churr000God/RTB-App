'use client';

import { Button } from '@/components/ui/button';

// Controles "Mostrando X–Y de N / Anterior / Siguiente" — antes copiados
// literal en cada pantalla paginada del repo (entidades-explorer.tsx,
// productos-explorer.tsx, existencias-explorer.tsx, inventario/hallazgos,
// solicitudes), sin ningún componente compartido. Se extrae aquí para las
// pantallas nuevas de Ventas (§3.2 de AUDITORIA_RTB-VEN-01.md); las 5
// existentes no se tocan a propósito — están verificadas y fuera de
// alcance, converger todas a este componente queda como pendiente aparte.
export function Paginacion({
  page,
  pageSize,
  count,
  onPageChange,
  disabled,
}: {
  page: number;
  pageSize: number;
  count: number;
  onPageChange: (pagina: number) => void;
  disabled?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm text-muted-foreground">
      <span>
        {count === 0 ? 'Sin resultados' : `Mostrando ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} de ${count}`}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>
          Anterior
        </Button>
        <Button variant="outline" size="sm" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}
