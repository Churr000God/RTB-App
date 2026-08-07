'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface ResultadoAccion<T = any> {
  ok: boolean;
  data: T | null;
}

// El servidor manda: cada mutación exitosa recarga el árbol de Server
// Components (router.refresh() invalida además el Router Cache completo de
// Next, no sólo la ruta actual — así la bandeja y la ficha relacionada
// tampoco quedan viejas al volver a ellas). El estado de cliente deja de
// espejar lo que ya vive en el servidor; sólo guarda lo que el servidor no
// sabe (formularios en captura, diálogos abiertos, resultados efímeros).
//
// `ocupado` cubre tanto el POST/PATCH como el refresh posterior — es la
// ventana completa de riesgo de doble envío, no sólo la petición HTTP.
export function useAccionServidor() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [refrescando, iniciarRefresco] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const ejecutar = async (url: string, init?: RequestInit): Promise<ResultadoAccion> => {
    setError(null);
    setEnviando(true);
    let res: Response;
    try {
      res = await fetch(url, { cache: 'no-store', ...init });
    } catch {
      setEnviando(false);
      setError('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
      return { ok: false, data: null };
    }
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) {
      setError(data?.error ?? 'Ocurrió un error');
      return { ok: false, data };
    }
    iniciarRefresco(() => router.refresh());
    return { ok: true, data };
  };

  return {
    ejecutar,
    enviando,
    refrescando,
    ocupado: enviando || refrescando,
    error,
    setError,
  };
}
