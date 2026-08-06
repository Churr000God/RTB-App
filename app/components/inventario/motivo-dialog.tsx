'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface Props {
  trigger: React.ReactNode;
  titulo: string;
  descripcion?: string;
  placeholder?: string;
  minLength?: number;
  confirmLabel?: string;
  destructivo?: boolean;
  onConfirm: (motivo: string) => Promise<boolean>;
}

// Reemplaza los window.prompt() de motivo (cancelar conteo, liberar
// congelamiento, rechazar ajuste/solicitud — M-01/M-02,
// contexto/AUDITORIA_QA_ROLES_2026-08-06.md): un prompt del navegador no
// se puede estilizar, no valida longitud antes de enviar, y en algunos
// navegadores móviles ni siquiera es confiable. Este componente es el
// único punto de captura de "motivo" del módulo — un cambio de estilo
// aquí se ve en los 3+ lugares que lo usan.
export function MotivoDialog({
  trigger,
  titulo,
  descripcion,
  placeholder = 'Describe el motivo…',
  minLength = 3,
  confirmLabel = 'Confirmar',
  destructivo = false,
  onConfirm,
}: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmar = async () => {
    if (motivo.trim().length < minLength) {
      setError(`El motivo debe tener al menos ${minLength} caracteres.`);
      return;
    }
    setError(null);
    setEnviando(true);
    const ok = await onConfirm(motivo.trim());
    setEnviando(false);
    if (ok) {
      setOpen(false);
      setMotivo('');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setMotivo('');
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descripcion && <DialogDescription>{descripcion}</DialogDescription>}
        </DialogHeader>
        <Textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={placeholder}
          rows={3}
          autoFocus
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={confirmar}
            disabled={enviando}
            className={destructivo ? 'bg-destructive hover:bg-destructive/90 text-white' : 'bg-rtb-teal hover:bg-rtb-teal/90 text-white'}
          >
            {enviando && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
