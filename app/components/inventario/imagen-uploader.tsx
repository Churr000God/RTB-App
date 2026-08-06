'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { IMAGEN_BYTES_MAX, IMAGEN_LADO_MAX, IMAGEN_MIMES, MINIATURA_LADO_MAX } from '@/lib/inventario/config';
import { ImagePlus, Loader2 } from 'lucide-react';

interface Props {
  productoId: string;
  onSubida: () => void;
}

type EstadoArchivo = 'procesando' | 'subiendo' | 'listo' | 'error';

interface ArchivoEnProceso {
  id: string;
  nombre: string;
  estado: EstadoArchivo;
  error?: string;
}

/**
 * Redimensiona `bitmap` a un canvas cuyo lado largo mide `ladoMax` y lo
 * codifica como JPEG. Se usa JPEG y no WebP aunque el bucket admita ambos:
 * el soporte de canvas.toBlob('image/webp') en Safari es tardío e
 * inconsistente, y no vale la pena arriesgarlo en el primer flujo real de
 * subida de archivos del sistema.
 */
function redimensionar(bitmap: ImageBitmap, ladoMax: number): Promise<Blob> {
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar el lienzo de imagen.');
  ctx.drawImage(bitmap, 0, 0, ancho, alto);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen.'))),
      'image/jpeg',
      0.82
    );
  });
}

export function ImagenUploader({ productoId, onSubida }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivos, setArchivos] = useState<ArchivoEnProceso[]>([]);

  const procesarArchivo = async (file: File) => {
    const id = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
    setArchivos((prev) => [...prev, { id, nombre: file.name, estado: 'procesando' }]);

    const marcar = (patch: Partial<ArchivoEnProceso>) =>
      setArchivos((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

    if (!IMAGEN_MIMES.includes(file.type as (typeof IMAGEN_MIMES)[number])) {
      marcar({ estado: 'error', error: 'Sólo JPG, PNG o WebP.' });
      return;
    }
    if (file.size > IMAGEN_BYTES_MAX) {
      marcar({ estado: 'error', error: `Supera ${Math.round(IMAGEN_BYTES_MAX / 1024 / 1024)} MB.` });
      return;
    }

    try {
      // imageOrientation: 'from-image' es obligatorio — sin él, las fotos
      // de móvil con EXIF Orientation salen giradas 90°: el canvas no
      // aplica EXIF por defecto. Efecto lateral favorable: el re-encode
      // por canvas elimina el EXIF (incluida la geolocalización), relevante
      // porque el bucket de destino es público.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const [principal, miniatura] = await Promise.all([
        redimensionar(bitmap, IMAGEN_LADO_MAX),
        redimensionar(bitmap, MINIATURA_LADO_MAX),
      ]);

      marcar({ estado: 'subiendo' });

      const formData = new FormData();
      formData.set('archivo', principal, `${file.name}.jpg`);
      formData.set('miniatura', miniatura, `${file.name}-mini.jpg`);
      formData.set('ancho', String(bitmap.width));
      formData.set('alto', String(bitmap.height));

      const res = await fetch(`/api/productos/${productoId}/imagenes`, { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        marcar({ estado: 'error', error: data?.error ?? 'No se pudo subir la imagen.' });
        return;
      }
      marcar({ estado: 'listo' });
      onSubida();
    } catch {
      // createImageBitmap falla fuera de Safari con HEIC/HEIF (fotos de
      // iPhone sin convertir) — es el caso más probable de este catch.
      marcar({
        estado: 'error',
        error: 'Formato no admitido (¿HEIC de iPhone? Cambia la cámara a "Más compatible" o convierte a JPG).',
      });
    }
  };

  const onSeleccion = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((f) => void procesarArchivo(f));
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={IMAGEN_MIMES.join(',')}
        multiple
        className="hidden"
        onChange={onSeleccion}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <ImagePlus className="w-4 h-4 mr-1.5" /> Subir fotos
      </Button>
      {archivos.length > 0 && (
        <ul className="text-xs space-y-1">
          {archivos.map((a) => (
            <li key={a.id} className="flex items-center gap-1.5">
              {(a.estado === 'procesando' || a.estado === 'subiendo') && (
                <Loader2 className="w-3 h-3 animate-spin text-rtb-teal" />
              )}
              <span className="text-muted-foreground truncate max-w-[200px]">{a.nombre}</span>
              {a.estado === 'listo' && <span className="text-rtb-teal">Listo</span>}
              {a.estado === 'error' && <span className="text-destructive">{a.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
