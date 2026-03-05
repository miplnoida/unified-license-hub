import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/dashboard/StatCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, UserCheck, UserX, Users, Shield } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface WebUser {
  id: string;
  full_name: string;
  email: string;
  user_type: string;
  entity_name: string;
  role: string;
  status: string;
  created_at: string;
}

const emptyForm = {
  full_name: '',
  email: '',
  password: '',
  user_type: 'secondary' as string,
  entity_name: '',
  role: 'post_licensee',
};

export default function ManageWebUsers() {
  const [users, setUsers] = useState<WebUser[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const fetchUsers = async () => {
    setFetching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('list-web-users', {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      if (res.data?.profiles) {
        setUsers(res.data.profiles);
      }
    } catch (err: any) {
      toast.error('Failed to load users');
    }
    setFetching(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const openAdd = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const toggleStatus = async (u: WebUser) => {
    const next = u.status === 'active' ? 'inactive' : 'active';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('toggle-user-status', {
        body: { user_id: u.id, status: next },
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      if (res.data?.success) {
        setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: next } : x));
        toast.success(`User ${next === 'active' ? 'activated' : 'deactivated'}`);
      } else {
        toast.error(res.data?.error || 'Failed to update status');
      }
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleSave = async () => {
    if (!form.full_name || !form.email || !form.password) {
      toast.error('Name, Email, and Password are required');
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('create-web-user', {
        body: {
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          user_type: form.user_type,
          entity_name: form.entity_name,
          role: form.role,
        },
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });

      if (res.data?.user) {
        toast.success('User created successfully');
        setDialogOpen(false);
        fetchUsers();
      } else {
        toast.error(res.data?.error || 'Failed to create user');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user');
    }
    setLoading(false);
  };

  const columns: Column<WebUser>[] = [
    {
      key: 'full_name', label: 'Name', render: (r) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
            {r.full_name.split(' ').map(n => n[0]).join('')}
          </div>
          <div>
            <p className="font-medium text-foreground">{r.full_name}</p>
            <p className="text-sm text-muted-foreground">{r.email}</p>
          </div>
        </div>
      )
    },
    {
      key: 'user_type', label: 'User Type', render: (r) => (
        <Badge variant={r.user_type === 'primary' ? 'default' : 'outline'} className="capitalize">
          {r.user_type}
        </Badge>
      )
    },
    {
      key: 'entity_name', label: 'Entity', render: (r) => (
        <span className="text-sm">{r.entity_name || '—'}</span>
      )
    },
    {
      key: 'created_at', label: 'Created Date', render: (r) => (
        <span className="text-sm">{new Date(r.created_at).toLocaleDateString()}</span>
      )
    },
    {
      key: 'status', label: 'Status', render: (r) => {
        const v = r.status === 'active' ? 'approved' : 'draft';
        return <Badge variant={v as any} className="capitalize">{r.status}</Badge>;
      }
    },
    {
      key: 'actions' as any, label: '', render: (r) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleStatus(r)}>
            {r.status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
          </Button>
        </div>
      )
    },
  ];

  const activeCount = users.filter(u => u.status === 'active').length;
  const inactiveCount = users.filter(u => u.status !== 'active').length;
  const primaryCount = users.filter(u => u.user_type === 'primary').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Manage Web Users" description="Create and manage Primary and Secondary web users for Post Licensee entities." actions={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add User</Button>} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Users" value={users.length} icon={<Users className="h-6 w-6" />} />
          <StatCard title="Primary Users" value={primaryCount} icon={<Shield className="h-6 w-6" />} variant="primary" />
          <StatCard title="Active" value={activeCount} icon={<UserCheck className="h-6 w-6" />} variant="success" />
          <StatCard title="Inactive" value={inactiveCount} icon={<UserX className="h-6 w-6" />} variant="warning" />
        </div>
        <div className="animate-slide-up delay-200">
          <DataTableShell columns={columns} data={users} searchPlaceholder="Search users..." />
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Web User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Full Name</Label><Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div><Label>Password</Label><Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Min 6 characters" /></div>
            <div>
              <Label>User Type</Label>
              <Select value={form.user_type} onValueChange={v => setForm(p => ({ ...p, user_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary User</SelectItem>
                  <SelectItem value="secondary">Secondary User</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Entity Name (Post Licensee)</Label><Input value={form.entity_name} onChange={e => setForm(p => ({ ...p, entity_name: e.target.value }))} placeholder="e.g. XYZ Insurance Corp." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>{loading ? 'Creating...' : 'Create User'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
