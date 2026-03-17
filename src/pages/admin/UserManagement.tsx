import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/dashboard/StatCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Users, Shield, UserCheck, UserX, Edit, Lock, Unlock } from 'lucide-react';
import { Constants } from '@/integrations/supabase/types';

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
}

export default function UserManagement() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [newRole, setNewRole] = useState('');
  const [saving, setSaving] = useState(false);

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

    // Load roles
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
    setNewRole(u.app_role || 'applicant');
    setEditDialog(true);
  };

  const handleRoleSave = async () => {
    if (!editingUser) return;
    setSaving(true);
    // Upsert the role
    const { error } = await supabase
      .from('user_roles')
      .upsert({ user_id: editingUser.id, role: newRole as any }, { onConflict: 'user_id,role' });

    if (error) {
      // Try delete + insert
      await supabase.from('user_roles').delete().eq('user_id', editingUser.id);
      const { error: e2 } = await supabase.from('user_roles').insert({ user_id: editingUser.id, role: newRole as any });
      if (e2) { toast.error(e2.message); setSaving(false); return; }
    }

    setUsers(prev => prev.map(x => x.id === editingUser.id ? { ...x, app_role: newRole } : x));
    toast.success('Role updated');
    setSaving(false);
    setEditDialog(false);
  };

  const activeCount = users.filter(u => u.status === 'active').length;
  const inactiveCount = users.filter(u => u.status !== 'active').length;
  const adminCount = users.filter(u => u.app_role === 'super_admin' || u.app_role === 'admin').length;

  const columns: Column<UserRecord>[] = [
    {
      key: 'full_name', label: 'User', render: (r) => (
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
        <Badge variant="outline" className="capitalize">{(r.app_role || 'applicant').replace(/_/g, ' ')}</Badge>
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
        <PageHeader title="User Management" description="View, manage, and configure system user accounts and their roles." />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Users" value={users.length} icon={<Users className="h-6 w-6" />} />
          <StatCard title="Active" value={activeCount} icon={<UserCheck className="h-6 w-6" />} variant="success" />
          <StatCard title="Inactive" value={inactiveCount} icon={<UserX className="h-6 w-6" />} variant="warning" />
          <StatCard title="Admins" value={adminCount} icon={<Shield className="h-6 w-6" />} variant="primary" />
        </div>

        <div className="animate-slide-up delay-200">
          <DataTableShell columns={columns} data={users} searchPlaceholder="Search users..." />
        </div>
      </div>

      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change User Role</DialogTitle></DialogHeader>
          {editingUser && (
            <div className="space-y-4 py-2">
              <p className="text-sm"><strong>{editingUser.full_name}</strong> ({editingUser.email})</p>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Constants.public.Enums.app_role.map(r => (
                      <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={handleRoleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
