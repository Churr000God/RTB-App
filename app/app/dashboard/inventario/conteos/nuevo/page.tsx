'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, AlertCircle, CheckCircle2, ClipboardCheck, Loader2 } from 'lucide-react';
import { CONTEO_TIPO_LABELS } from '@/lib/inventario/config';
import { CONTEO_TIPOS } from '@/types/inventario';
import type { ConteoTipo } from '@/types/inventario';

interface Usuario {
  id: string;
  full_name: string;
}
interface Ubicacion {
  id: string;
  codigo: string;
  nombre: string;
}
interface Familia {
  id: string;
  clave: string;
  nombre: string;
}

export default function NuevoConteoPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    tipo: 'general' as ConteoTipo,
    nombre: '',
    alcance_descripcion: '',
    ubicacion_id: '',
    incluye_descendientes: true,
    familia_id: '',
    responsable_id: '',
    supervisor_id: '',
    fecha_programada: '',
    vista_ciega: true,
  });
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      // usuarios_directorio() (002_entidades_core.sql), no /api/admin/users:
      // esa ruta es exclusiva de super_admin y profiles_select sólo deja ver
      // la fila propia para el resto de roles — sin el RPC, ningún otro rol
      // podría siquiera listar a quién asignar como responsable/supervisor.
      const supabase = createSupabaseBrowserClient();
      const [{ data: u }, ub, f] = await Promise.all([
        supabase.rpc('usuarios_directorio'),
        fetch('/api/ubicaciones').then((r) => r.json()),
        fetch('/api/catalogos/familias').then((r) => r.json()),
      ]);
      setUsuarios((u ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name })));
      setUbicaciones(ub.data ?? []);
      setFamilias(f.data ?? []);
    })();
  }, []);

  const set = (campo: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    const alcance: Record<string, unknown> = {};
    if (form.tipo === 'por_ubicacion' && form.ubicacion_id) {
      alcance.ubicacion_id = form.ubicacion_id;
      alcance.incluye_descendientes = form.incluye_descendientes;
    }
    if (form.tipo === 'por_familia' && form.familia_id) {
      alcance.familia_id = form.familia_id;
    }

    const res = await fetch('/api/inventario/conteos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: form.tipo,
        nombre: form.nombre,
        alcance,
        alcance_descripcion: form.alcance_descripcion,
        responsable_id: form.responsable_id,
        supervisor_id: form.supervisor_id || undefined,
        fecha_programada: form.fecha_programada || undefined,
        vista_ciega: form.vista_ciega,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Error al crear el conteo');
      return;
    }
    router.push(`/dashboard/inventario/conteos/${data.id}`);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/inventario/conteos">
          <ArrowLeft className="w-4 h-4 mr-1" /> Conteos
        </Link>
      </Button>

      <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
        <ClipboardCheck className="w-6 h-6" /> Nuevo Conteo Físico
      </h1>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-semibold text-rtb-navy-mid">Tipo de conteo</Label>
            <select value={form.tipo} onChange={set('tipo')} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2">
              {CONTEO_TIPOS.filter((t) => t !== 'reconteo').map((t) => (
                <option key={t} value={t}>
                  {CONTEO_TIPO_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-rtb-navy-mid">Nombre</Label>
            <Input value={form.nombre} onChange={set('nombre')} className="mt-1" placeholder="Conteo general agosto 2026" />
          </div>

          {form.tipo === 'por_ubicacion' && (
            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-rtb-navy-mid">Ubicación</Label>
              <select value={form.ubicacion_id} onChange={set('ubicacion_id')} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2">
                <option value="">Selecciona una ubicación</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo} — {u.nombre}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs mt-2">
                <input
                  type="checkbox"
                  checked={form.incluye_descendientes}
                  onChange={(e) => setForm((f) => ({ ...f, incluye_descendientes: e.target.checked }))}
                />
                Incluir ubicaciones descendientes
              </label>
            </div>
          )}

          {form.tipo === 'por_familia' && (
            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-rtb-navy-mid">Familia</Label>
              <select value={form.familia_id} onChange={set('familia_id')} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2">
                <option value="">Selecciona una familia</option>
                {familias.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.clave} — {f.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="sm:col-span-2">
            <Label className="text-xs font-semibold text-rtb-navy-mid">Alcance (para el acta)</Label>
            <Input
              value={form.alcance_descripcion}
              onChange={set('alcance_descripcion')}
              className="mt-1"
              placeholder="Todo el catálogo con existencia registrada"
            />
          </div>

          <div>
            <Label className="text-xs font-semibold text-rtb-navy-mid">Responsable</Label>
            <select value={form.responsable_id} onChange={set('responsable_id')} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2">
              <option value="">Selecciona un responsable</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-rtb-navy-mid">Supervisor (opcional)</Label>
            <select value={form.supervisor_id} onChange={set('supervisor_id')} className="mt-1 w-full text-sm border border-border rounded-lg px-3 py-2">
              <option value="">Sin asignar</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-rtb-navy-mid">Fecha programada</Label>
            <Input type="date" value={form.fecha_programada} onChange={set('fecha_programada')} className="mt-1 tabular-nums" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.vista_ciega} onChange={(e) => setForm((f) => ({ ...f, vista_ciega: e.target.checked }))} />
              Vista ciega durante la captura
            </label>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          El conteo nace en estado <span className="font-medium">planificado</span>. Desde su detalle podrás
          congelarlo (genera las líneas y bloquea el kardex del alcance), asignar capturistas y avanzar la máquina
          de estados.
        </p>

        <Button
          onClick={handleSubmit}
          disabled={loading || !form.nombre || !form.alcance_descripcion || !form.responsable_id}
          className="w-full bg-rtb-teal hover:bg-rtb-teal/90 text-white"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Crear conteo
        </Button>
      </div>
    </div>
  );
}
