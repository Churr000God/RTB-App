import type { ProductoResumen } from '@/types/inventario';

interface Props {
  producto?: ProductoResumen | null;
  /** descripcion_libre de una línea "en consulta" — texto capturado a mano, sin producto de catálogo todavía. */
  descripcion?: string | null;
  /** Sólo para trazabilidad de soporte (title=), nunca se pinta como etiqueta visible. */
  productoId?: string | null;
  className?: string;
}

// Sustituye el UUID crudo de producto_id por algo útil para un humano:
// código interno + nombre, mismo formato que components/inventario/
// producto-combobox.tsx (patrón ya funcional en Ajustes de inventario).
// Nunca renderiza el UUID como texto visible — a lo sumo va en `title`.
export function ProductoEtiqueta({ producto, descripcion, productoId, className = '' }: Props) {
  if (producto) {
    return (
      <div className={`flex flex-col ${className}`}>
        <span className="text-sm">{producto.nombre}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{producto.codigo_interno}</span>
        {descripcion && descripcion !== producto.nombre && (
          <span className="text-[11px] italic text-muted-foreground">Pedido como: {descripcion}</span>
        )}
      </div>
    );
  }

  if (descripcion) {
    return (
      <div className={`flex flex-col ${className}`}>
        <span className="text-sm">{descripcion}</span>
        <span className="text-xs text-amber-700">Sin producto de catálogo</span>
      </div>
    );
  }

  return (
    <span className={`text-xs text-muted-foreground ${className}`} title={productoId ?? undefined}>
      Producto no disponible
    </span>
  );
}
