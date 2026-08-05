'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/rbac/hooks';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/rbac/config';
import { type UserRole, type Profile } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Users,
  Plus,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  Edit,
  UserPlus,
  X,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface UserWithEmail extends Profile {
  email: string;
}

type ModalMode = 'create' | 'edit' | null;

export default function AdminUsersPage() {
  const { user, role } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserWithEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [listError, setListError] = useState<string | null>(null);

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editUser, setEditUser] = useState<UserWithEmail | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'ventas' as UserRole,
    is_active: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Redirect if not super_admin
  useEffect(() => {
    if (role && role !== 'super_admin') {
      router.replace('/dashboard');
    }
  }, [role, router]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data ?? []);
      }
    } catch {
      console.error('Error fetching users');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (role === 'super_admin') {
      fetchUsers();
    }
  }, [role, fetchUsers]);

  const filtered = (users ?? []).filter((u: UserWithEmail) => {
    const matchSearch =
      (u?.full_name ?? '').toLowerCase().includes((search ?? '').toLowerCase()) ||
      (u?.email ?? '').toLowerCase().includes((search ?? '').toLowerCase());
    const matchRole = filterRole === 'all' || u?.role === filterRole;
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && u?.is_active) ||
      (filterStatus === 'inactive' && !u?.is_active);
    return matchSearch && matchRole && matchStatus;
  });

  const openCreate = () => {
    setFormData({ email: '', password: '', full_name: '', role: 'ventas', is_active: true });
    setFormError(null);
    setModalMode('create');
    setEditUser(null);
  };

  const openEdit = (u: UserWithEmail) => {
    setFormData({
      email: u?.email ?? '',
      password: '',
      full_name: u?.full_name ?? '',
      role: u?.role ?? 'ventas',
      is_active: u?.is_active ?? true,
    });
    setFormError(null);
    setModalMode('edit');
    setEditUser(u);
  };

  const handleSubmit = async () => {
    setFormError(null);
    setFormLoading(true);

    try {
      if (modalMode === 'create') {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data?.error ?? 'Error al crear usuario');
          setFormLoading(false);
          return;
        }
      } else if (modalMode === 'edit' && editUser) {
        const res = await fetch(`/api/admin/users/${editUser?.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: formData.full_name,
            role: formData.role,
            is_active: formData.is_active,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data?.error ?? 'Error al actualizar');
          setFormLoading(false);
          return;
        }
      }

      setModalMode(null);
      await fetchUsers();
    } catch {
      setFormError('Error de conexión');
    }
    setFormLoading(false);
  };

  const toggleActive = async (u: UserWithEmail) => {
    setListError(null);
    try {
      const res = await fetch(`/api/admin/users/${u?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !u?.is_active }),
      });
      const data = await res.json();
      if (!res.ok) {
        setListError(data?.error ?? 'Error al actualizar el estado');
        return;
      }
    } catch {
      setListError('Error de conexión');
      return;
    }
    await fetchUsers();
  };

  if (role !== 'super_admin') return null;

  return (
    <TooltipProvider>
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-rtb-navy tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6" /> Gestión de Usuarios
          </h1>
          <p className="text-muted-foreground mt-1">
            {(users?.length ?? 0)} usuario{(users?.length ?? 0) !== 1 ? 's' : ''} registrado{(users?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={openCreate} className="bg-rtb-teal hover:bg-rtb-teal/90 text-white">
          <UserPlus className="w-4 h-4 mr-2" /> Nuevo Usuario
        </Button>
      </div>

      {listError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{listError}</span>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 flex flex-wrap items-center gap-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o correo..."
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={filterRole}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterRole(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-white"
          >
            <option value="all">Todos los roles</option>
            {Object.entries(ROLE_LABELS).map(([key, label]: [string, string]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterStatus(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-white"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
      </div>

      {/* Users list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-rtb-teal animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usuario</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rol</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Creado</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(filtered ?? []).map((u: UserWithEmail) => (
                <tr key={u?.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4">
                    <p className="text-sm font-medium text-rtb-navy">{u?.full_name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{u?.email ?? ''}</p>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[u?.role as UserRole] ?? ''}`}>
                      {ROLE_LABELS[u?.role as UserRole] ?? u?.role}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {u?.is_active ? (
                      <span className="flex items-center gap-1 text-xs text-green-700"><CheckCircle className="w-3.5 h-3.5" /> Activo</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-600"><XCircle className="w-3.5 h-3.5" /> Inactivo</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground tabular-nums">
                    {u?.created_at ? new Date(u.created_at).toLocaleDateString('es-MX', { timeZone: 'UTC' }) : '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(u)} className="text-muted-foreground hover:text-rtb-navy">
                            <Edit className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Editar usuario</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleActive(u)}
                              disabled={u?.id === user?.id}
                              className={u?.is_active ? 'text-muted-foreground hover:text-red-600' : 'text-muted-foreground hover:text-green-600'}
                            >
                              {u?.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {u?.id === user?.id
                            ? 'No puedes desactivar tu propia cuenta'
                            : u?.is_active
                              ? 'Desactivar usuario'
                              : 'Reactivar usuario'}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
              {(filtered?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                    No se encontraron usuarios
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-display font-semibold text-rtb-navy">
                {modalMode === 'create' ? 'Nuevo Usuario' : 'Editar Usuario'}
              </h2>
              <button onClick={() => setModalMode(null)} className="text-muted-foreground hover:text-rtb-navy">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Label>Nombre completo</Label>
                <Input
                  value={formData.full_name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Nombre completo"
                />
              </div>

              {modalMode === 'create' && (
                <>
                  <div>
                    <Label>Correo electrónico</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="usuario@rtb.com"
                    />
                  </div>
                  <div>
                    <Label>Contraseña temporal</Label>
                    <Input
                      type="password"
                      value={formData.password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                </>
              )}

              <div>
                <Label>Rol</Label>
                <select
                  value={formData.role}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white mt-1"
                >
                  {Object.entries(ROLE_LABELS).map(([key, label]: [string, string]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {modalMode === 'edit' && (
                <div className="flex items-center gap-3">
                  <Label>Estado</Label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.is_active ? 'bg-rtb-teal' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                  <span className="text-sm text-muted-foreground">
                    {formData.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setModalMode(null)}>Cancelar</Button>
              <Button
                onClick={handleSubmit}
                disabled={formLoading}
                className="bg-rtb-teal hover:bg-rtb-teal/90 text-white"
              >
                {formLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {modalMode === 'create' ? 'Crear Usuario' : 'Guardar Cambios'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}
