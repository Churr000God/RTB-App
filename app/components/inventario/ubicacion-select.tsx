'use client';

import { useEffect, useState } from 'react';

interface UbicacionOpcion {
  id: string;
  codigo: string;
  nombre: string;
}

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  permiteVacio?: boolean;
}

// M-03 (contexto/AUDITORIA_QA_ROLES_2026-08-06.md): "Ubicación ID" era el
// mismo problema que "Producto ID" — texto libre sin dónde copiar el UUID.
// A diferencia de productos (miles de filas, necesita búsqueda), el árbol
// de ubicaciones es chico — un <select> nativo ordenado por código basta
// (mismo patrón que ya usan conteos/nuevo/page.tsx y productos/nuevo/page.tsx
// para otros catálogos). El código (QA-Z01-R03…) ya codifica la jerarquía
// por prefijo, así que la sangría visual se deriva de contar guiones.
export function UbicacionSelect({ value, onChange, permiteVacio = true }: Props) {
  const [opciones, setOpciones] = useState<UbicacionOpcion[]>([]);

  useEffect(() => {
    fetch('/api/ubicaciones')
      .then((r) => r.json())
      .then((data) => {
        const filas = (data.data ?? []) as UbicacionOpcion[];
        setOpciones([...filas].sort((a, b) => a.codigo.localeCompare(b.codigo)));
      });
  }, []);

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-56 text-sm border border-border rounded-lg px-3 py-2"
    >
      {permiteVacio && <option value="">Sin ubicación</option>}
      {opciones.map((u) => {
        const nivel = (u.codigo.match(/-/g) ?? []).length;
        return (
          <option key={u.id} value={u.id}>
            {'  '.repeat(nivel)}
            {u.codigo} — {u.nombre}
          </option>
        );
      })}
    </select>
  );
}
