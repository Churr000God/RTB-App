'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/rbac/hooks';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/rbac/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Lock, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export default function ProfilePage() {
  const { profile, role, user } = useAuth();
  const supabase = createSupabaseBrowserClient();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync state if profile loads late
  useState(() => {
    if (profile?.full_name && !fullName) setFullName(profile.full_name);
  });

  const handleSaveName = async () => {
    setSaving(true);
    setNameMsg(null);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', user?.id ?? '');
    if (error) {
      setNameMsg({ type: 'error', text: 'Error al actualizar nombre.' });
    } else {
      setNameMsg({ type: 'success', text: 'Nombre actualizado.' });
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    setPwMsg(null);
    // M-04 (contexto/AUDITORIA_QA_ROLES_2026-08-06.md): 6 no coincidía con
    // el mínimo real de 8 que exige la creación de usuario
    // (api/admin/users/route.ts) — se unifica en 8 en toda la app.
    if ((newPassword?.length ?? 0) < 8) {
      setPwMsg({ type: 'error', text: 'La contraseña debe tener al menos 8 caracteres.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPwMsg({ type: 'error', text: error?.message ?? 'Error al cambiar contraseña.' });
    } else {
      setPwMsg({ type: 'success', text: 'Contraseña actualizada correctamente.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
    setPwSaving(false);
  };

  const roleLabel = role ? ROLE_LABELS[role] : '';
  const roleColor = role ? ROLE_COLORS[role] ?? '' : '';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight">Mi Perfil</h1>
        <p className="text-muted-foreground mt-1">Consulta y edita tu información personal</p>
      </div>

      {/* Name section */}
      <div className="bg-white rounded-xl p-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-rtb-teal" />
          <h2 className="font-semibold text-rtb-navy">Información General</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Correo electrónico</Label>
            <Input value={user?.email ?? ''} disabled className="bg-muted/50" />
          </div>
          <div>
            <Label>Rol</Label>
            <div className="mt-1">
              <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full ${roleColor}`}>
                {roleLabel}
              </span>
            </div>
          </div>
          <div>
            <Label>Nombre completo</Label>
            <Input
              value={fullName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFullName(e.target.value)}
              placeholder="Tu nombre completo"
            />
          </div>

          {nameMsg && (
            <div className={`flex items-center gap-2 text-sm ${nameMsg.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {nameMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {nameMsg.text}
            </div>
          )}

          <Button onClick={handleSaveName} disabled={saving} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Guardar cambios
          </Button>
        </div>
      </div>

      {/* Password section */}
      <div className="bg-white rounded-xl p-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-rtb-teal" />
          <h2 className="font-semibold text-rtb-navy">Cambiar Contraseña</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Nueva contraseña</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div>
            <Label>Confirmar contraseña</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
            />
          </div>

          {pwMsg && (
            <div className={`flex items-center gap-2 text-sm ${pwMsg.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {pwMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {pwMsg.text}
            </div>
          )}

          <Button onClick={handleChangePassword} disabled={pwSaving} className="bg-rtb-navy hover:bg-rtb-navy/90 text-white">
            {pwSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
            Actualizar contraseña
          </Button>
        </div>
      </div>
    </div>
  );
}
