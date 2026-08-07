import { Loader2 } from 'lucide-react';

// Indicador de que router.refresh() sigue en vuelo tras una mutación
// exitosa — el cambio en pantalla es la confirmación, esto sólo explica la
// espera. Mismo lenguaje visual que los demás spinners del proyecto.
export function Actualizando({ activo, className = '' }: { activo: boolean; className?: string }) {
  if (!activo) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
      <Loader2 className="w-3.5 h-3.5 animate-spin text-rtb-teal" /> Actualizando…
    </span>
  );
}
