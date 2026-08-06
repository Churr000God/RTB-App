'use client';

import { Pencil } from 'lucide-react';
import type { CampoCatalogo, CatalogoMeta, CatalogoTipo } from '@/lib/inventario/catalogos';
import { UNIDAD_TIPO_LABELS } from '@/lib/inventario/config';
import type { UnidadMedida } from '@/types/inventario';

// Fila mínima común a los 4 catálogos (unidades_medida, producto_familias,
// producto_categorias, producto_marcas) — todas comparten id/clave/nombre/
// activo; el resto de campos varía y se resuelve por CampoCatalogo.tipo.
interface FilaCatalogo {
  id: string;
  clave: string;
  nombre: string;
  activo: boolean;
  [key: string]: unknown;
}

interface Props {
  tipo: CatalogoTipo;
  meta: CatalogoMeta;
  filas: FilaCatalogo[];
  unidades: UnidadMedida[];
  puedeEditar: boolean;
  onEditar: (fila: FilaCatalogo) => void;
  onToggleActivo: (fila: FilaCatalogo) => void;
}

function valorCampo(campo: CampoCatalogo, fila: FilaCatalogo, unidades: UnidadMedida[]): string {
  const v = fila[campo.name];
  if (campo.tipo === 'select_unidad') {
    const u = unidades.find((x) => x.id === v);
    return u ? `${u.clave} — ${u.nombre}` : '—';
  }
  if (campo.tipo === 'select_unidad_tipo') {
    return v ? UNIDAD_TIPO_LABELS[v as keyof typeof UNIDAD_TIPO_LABELS] ?? String(v) : '—';
  }
  if (campo.tipo === 'checkbox') return v ? 'Sí' : 'No';
  if (v == null || v === '') return '—';
  return String(v);
}

export function CatalogoTabla({ tipo, meta, filas, unidades, puedeEditar, onEditar, onToggleActivo }: Props) {
  const columnasExtra = meta.campos.filter((c) => c.enTabla);

  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <table className="w-full">
        <thead>
          <tr className="bg-rtb-navy text-white">
            <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Clave</th>
            <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Nombre</th>
            {columnasExtra.map((c) => (
              <th key={c.name} className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">
                {c.label}
              </th>
            ))}
            <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider">Estado</th>
            {puedeEditar && <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider">Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={fila.id} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-rtb-surface/40' : ''}`}>
              <td className="py-3 px-4 text-xs tabular-nums font-medium text-rtb-navy">{fila.clave}</td>
              <td className="py-3 px-4 text-sm">{fila.nombre}</td>
              {columnasExtra.map((c) => (
                <td key={c.name} className="py-3 px-4 text-xs tabular-nums">
                  {valorCampo(c, fila, unidades)}
                </td>
              ))}
              <td className="py-3 px-4">
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    fila.activo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {fila.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              {puedeEditar && (
                <td className="py-3 px-4 text-right">
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => onEditar(fila)}
                      className="text-xs text-rtb-teal hover:underline inline-flex items-center gap-1"
                    >
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                    <button
                      onClick={() => onToggleActivo(fila)}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      {fila.activo ? 'Desactivar' : 'Reactivar'}
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
          {filas.length === 0 && (
            <tr>
              <td
                colSpan={3 + columnasExtra.length + (puedeEditar ? 1 : 0)}
                className="py-10 text-center text-muted-foreground text-sm"
              >
                Sin registros todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export type { FilaCatalogo };
