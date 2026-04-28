import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/dashboard/StatCard';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Users, Shield, UserCheck, UserX, Edit, Lock, Unlock, Plus, Copy, KeyRound, RefreshCw,
} from 'lucide-react';
import { useRoles, DynamicRole } from '@/hooks/useRoles';

interface UserRecord {
  id: string;
  full_name: string;
  email: string;
  entity_name: string;
  user_type: string;
  role: string;
  status: string;
  created_at: string;
  app_role?: string;
  gender?: string;
  role_id?: string;
  dynamic_role_ids?: string[];
}

function generatePassword(length = 14): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;
  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = chars.length; i < length; i++) {
    chars.push(all[Math.floor(Math.random() * all.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const emptyForm = {
  first_name: '',
  middle_name: '',
  last_name: '',
  email: '',
  role_ids: [] as string[],
  gender: '',
};

export default function UserManagement() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [newRole, setNewRole] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [credentialsDialog, setCredentialsDialog] = useState(false);
  const [createdEmail, setCreatedEmail] = useState('');
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false);
  const [resetUserId, setResetUserId] = useState('');
  const [resetUserEmail, setResetUserEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const { data: dynamicRoles = [] } = useRoles();

  const loadUsers = async () => {
    setLoading(true);
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load users');
      setLoading(false);
      return;
    }

    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    const roleMap: Record<string, string> = {};
    (roles || []).forEach((r: any) => { roleMap[r.user_id] = r.role; });

    setUsers((profiles || []).map((p: any) => ({
      ...p,
      app_role: roleMap[p.id] || 'applicant',
    })));
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const toggleStatus = async (u: UserRecord) => {
    const next = u.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('profiles').update({ status: next }).eq('id', u.id);
    if (error) { toast.error(error.message); return; }
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: next } : x));
    toast.success(`User ${next === 'active' ? 'activated' : 'deactivated'}`);
  };

  const openRoleEdit = (u: UserRecord) => {
    setEditingUser(u);
    // Load existing roles for this user
    supabase.from('user_roles').select('role').eq('user_id', u.id).then(({ data }) => {
      const existingRoles = (data || []).map((r: any) => r.role);
      const matchedIds = dynamicRoles.filter(dr => existingRoles.includes(dr.system_role)).map(dr => dr.id);
      setSelectedRoleIds(matchedIds.length > 0 ? matchedIds : u.role_id ? [u.role_id] : []);
    });
    setEditDialog(true);
  };

  const handleRoleSave = async () => {
    if (!editingUser || selectedRoleIds.length === 0) {
      toast.error('Please select at least one role');
      return;
    }
    setSaving(true);

    const selectedDynamicRoles = dynamicRoles.filter(r => selectedRoleIds.includes(r.id));
    const primaryRole = selectedDynamicRoles[0];

    // Replace all user_roles entries
    await supabase.from('user_roles').delete().eq('user_id', editingUser.id);
    for (const role of selectedDynamicRoles) {
      await supabase.from('user_roles').insert({
        user_id: editingUser.id, role: role.system_role as any,
      });
    }

    // Update profile with primary role
    await supabase.from('profiles').update({
      role_id: primaryRole.id,
      role: primaryRole.system_role,
    } as any).eq('id', editingUser.id);

    setUsers(prev => prev.map(x => x.id === editingUser.id ? {
      ...x, app_role: primaryRole.system_role, role_id: primaryRole.id,
    } : x));
    toast.success(`${selectedDynamicRoles.length} role(s) assigned`);
    setSaving(false);
    setEditDialog(false);
  };

  const openCreate = () => {
    setForm(emptyForm);
    setGeneratedPassword(generatePassword());
    setCreateDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!form.first_name || !form.last_name || !form.email || !form.role_id) {
      toast.error('First Name, Last Name, Email, and Role are required');
      return;
    }

    const role = dynamicRoles.find(r => r.id === form.role_id);
    if (!role) { toast.error('Please select a valid role'); return; }

    const fullName = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ');
    setSaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('create-web-user', {
        body: {
          email: form.email,
          password: generatedPassword,
          full_name: fullName,
          user_type: 'primary',
          entity_name: '',
          role: role.system_role,
          role_id: form.role_id,
          gender: form.gender || null,
        },
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });

      if (res.data?.user) {
        setCreatedEmail(form.email);
        setCreateDialogOpen(false);
        setCredentialsDialog(true);
        loadUsers();
      } else {
        toast.error(res.data?.error || 'Failed to create user');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user');
    }
    setSaving(false);
  };

  const openResetPassword = (u: UserRecord) => {
    setResetUserId(u.id);
    setResetUserEmail(u.email);
    setNewPassword(generatePassword());
    setResetPasswordDialog(true);
  };

  const handleResetPassword = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('toggle-user-status', {
        body: { user_id: resetUserId, action: 'reset_password', new_password: newPassword },
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      if (res.data?.success) {
        toast.success('Temporary password sent to user email');
        setResetPasswordDialog(false);
      } else {
        toast.error(res.data?.error || 'Failed to reset password');
      }
    } catch {
      toast.error('Failed to reset password');
    }
    setSaving(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const getRoleName = (u: UserRecord) => {
    if (u.role_id) {
      const role = dynamicRoles.find(r => r.id === u.role_id);
      if (role) return role.name;
    }
    return (u.app_role || 'applicant').replace(/_/g, ' ');
  };

  const activeCount = users.filter(u => u.status === 'active').length;
  const inactiveCount = users.filter(u => u.status !== 'active').length;
  const adminCount = users.filter(u => u.app_role === 'super_admin' || u.app_role === 'admin').length;

  const columns: Column<UserRecord>[] = [
    {
      key: 'full_name', label: 'Employee', render: (r) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
            {r.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <p className="font-medium text-foreground">{r.full_name}</p>
            <p className="text-sm text-muted-foreground">{r.email}</p>
          </div>
        </div>
      )
    },
    {
      key: 'app_role' as any, label: 'Role', render: (r) => (
        <Badge variant="outline" className="capitalize">{getRoleName(r)}</Badge>
      )
    },
    {
      key: 'user_type', label: 'Type', render: (r) => (
        <Badge variant={r.user_type === 'primary' ? 'default' : 'secondary'} className="capitalize">{r.user_type}</Badge>
      )
    },
    { key: 'entity_name', label: 'Entity', render: (r) => <span className="text-sm">{r.entity_name || '—'}</span> },
    {
      key: 'created_at', label: 'Joined', render: (r) => (
        <span className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
      )
    },
    {
      key: 'status', label: 'Status', render: (r) => (
        <Badge variant={r.status === 'active' ? 'default' : 'secondary'} className="capitalize">{r.status}</Badge>
      )
    },
    {
      key: 'actions' as any, label: '', render: (r) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openRoleEdit(r)} title="Edit role">
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openResetPassword(r)} title="Reset password">
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleStatus(r)} title={r.status === 'active' ? 'Deactivate' : 'Activate'}>
            {r.status === 'active' ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </Button>
        </div>
      )
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Employee Management"
          description="Manage admin and regulator employee accounts, roles, and access."
          actions={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />Create Employee
            </Button>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Users" value={users.length} icon={<Users className="h-6 w-6" />} />
          <StatCard title="Active" value={activeCount} icon={<UserCheck className="h-6 w-6" />} variant="success" />
          <StatCard title="Inactive" value={inactiveCount} icon={<UserX className="h-6 w-6" />} variant="warning" />
          <StatCard title="Admins" value={adminCount} icon={<Shield className="h-6 w-6" />} variant="primary" />
        </div>

        <div className="animate-slide-up delay-200">
          <DataTableShell columns={columns} data={users} searchPlaceholder="Search employees..." />
        </div>
      </div>

      {/* ─── Create Employee Dialog ─── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Employee</DialogTitle>
            <DialogDescription>Add a new admin or regulator employee to the system.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Section 1: Login Information */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" /> Login Information
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>First Name <span className="text-destructive">*</span></Label>
                  <Input value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} placeholder="First name" />
                </div>
                <div className="space-y-2">
                  <Label>Middle Name</Label>
                  <Input value={form.middle_name} onChange={e => setForm(p => ({ ...p, middle_name: e.target.value }))} placeholder="Middle name" />
                </div>
                <div className="space-y-2">
                  <Label>Last Name <span className="text-destructive">*</span></Label>
                  <Input value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} placeholder="Last name" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="space-y-2">
                  <Label>Email (Username) <span className="text-destructive">*</span></Label>
                  <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="employee@company.com" />
                </div>
                <div className="space-y-2">
                  <Label>Role <span className="text-destructive">*</span></Label>
                  <Select value={form.role_id} onValueChange={v => setForm(p => ({ ...p, role_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      {dynamicRoles.map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={form.gender} onValueChange={v => setForm(p => ({ ...p, gender: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Label>Auto-Generated Password</Label>
                <div className="flex gap-2">
                  <Input value={generatedPassword} readOnly className="font-mono bg-muted" />
                  <Button variant="outline" size="icon" onClick={() => setGeneratedPassword(generatePassword())} title="Regenerate">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(generatedPassword)} title="Copy">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Password is auto-generated. Share it securely with the employee.</p>
              </div>
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create Employee'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Credentials Dialog ─── */}
      <Dialog open={credentialsDialog} onOpenChange={setCredentialsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> User Credentials
            </DialogTitle>
            <DialogDescription>Share these credentials securely with the employee.</DialogDescription>
          </DialogHeader>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Email / Username</p>
                  <p className="font-mono text-sm font-medium">{createdEmail}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => copyToClipboard(createdEmail)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Password</p>
                  <p className="font-mono text-sm font-medium">{generatedPassword}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => copyToClipboard(generatedPassword)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
          <DialogFooter>
            <Button onClick={() => setCredentialsDialog(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Roles Dialog (Multi-role) ─── */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage User Roles</DialogTitle>
            <DialogDescription>Assign one or more roles to this user.</DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4 py-2">
              <p className="text-sm"><strong>{editingUser.full_name}</strong> ({editingUser.email})</p>
              <div className="space-y-2">
                <Label>Roles</Label>
                <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto border rounded-lg p-3">
                  {dynamicRoles.map(r => {
                    const isSelected = selectedRoleIds.includes(r.id);
                    return (
                      <label key={r.id} className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm transition-colors ${isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted'}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedRoleIds(prev =>
                              prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id]
                            );
                          }}
                          className="rounded"
                        />
                        <span>{r.name}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">{selectedRoleIds.length} role(s) selected</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={handleRoleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Roles'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Reset Password Dialog ─── */}
      <Dialog open={resetPasswordDialog} onOpenChange={setResetPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Generate a new password for {resetUserEmail}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="flex gap-2">
                <Input value={newPassword} readOnly className="font-mono bg-muted" />
                <Button variant="outline" size="icon" onClick={() => setNewPassword(generatePassword())}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(newPassword)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordDialog(false)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={saving}>{saving ? 'Resetting...' : 'Reset Password'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
