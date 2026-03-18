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
import { Plus, UserCheck, UserX, Users, Shield } from 'lucide-react';
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
  licensee_id?: string;
}

interface Licensee {
  id: string;
  name: string;
  status: string;
}

const emptyForm = {
  full_name: '',
  email: '',
  password: '',
  user_type: 'secondary' as string,
  licensee_id: '',
};

export default function ManageWebUsers() {
  const [users, setUsers] = useState<WebUser[]>([]);
  const [licensees, setLicensees] = useState<Licensee[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const fetchData = async () => {
    setFetching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const [usersRes, { data: licData }] = await Promise.all([
        supabase.functions.invoke('list-web-users', {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
        }),
        supabase.from('licensees' as any).select('id, name, status').eq('status', 'active'),
      ]);
      if (usersRes.data?.profiles) {
        // Filter to only show licensee web users (not pre-licensees or old applicants)
        const webUsers = usersRes.data.profiles.filter(
          (p: any) => p.role === 'licensee_primary' || p.role === 'licensee_secondary' || p.user_type === 'primary' || p.user_type === 'secondary'
        );
        setUsers(webUsers);
      }
      setLicensees((licData as any) || []);
    } catch {
      toast.error('Failed to load data');
    }
    setFetching(false);
  };

  useEffect(() => { fetchData(); }, []);

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
    if (!form.licensee_id) {
      toast.error('Please select a licensee entity');
      return;
    }

    const role = form.user_type === 'primary' ? 'licensee_primary' : 'licensee_secondary';
    const licensee = licensees.find(l => l.id === form.licensee_id);

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('create-web-user', {
        body: {
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          user_type: form.user_type,
          entity_name: licensee?.name || '',
          role,
          licensee_id: form.licensee_id,
        },
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });

      if (res.data?.user) {
        toast.success('Web user created successfully');
        setDialogOpen(false);
        fetchData();
      } else {
        toast.error(res.data?.error || 'Failed to create user');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user');
    }
    setLoading(false);
  };

  const getLicenseeName = (licenseeId?: string) => {
    if (!licenseeId) return '—';
    return licensees.find(l => l.id === licenseeId)?.name || '—';
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
      key: 'user_type', label: 'User Type', render: (r) => {
        const isPrimary = r.role === 'licensee_primary' || r.user_type === 'primary';
        return (
          <Badge variant={isPrimary ? 'default' : 'outline'} className="capitalize">
            {isPrimary ? 'Primary' : 'Secondary'}
          </Badge>
        );
      }
    },
    {
      key: 'entity_name', label: 'Licensee Entity', render: (r) => (
        <span className="text-sm">{r.entity_name || getLicenseeName(r.licensee_id) || '—'}</span>
      )
    },
    {
      key: 'role', label: 'Role', render: (r) => {
        const label = r.role === 'licensee_primary' ? 'Primary User' : r.role === 'licensee_secondary' ? 'Secondary User' : r.role;
        return <span className="text-sm capitalize">{label}</span>;
      }
    },
    {
      key: 'created_at', label: 'Created', render: (r) => (
        <span className="text-sm">{new Date(r.created_at).toLocaleDateString()}</span>
      )
    },
    {
      key: 'status', label: 'Status', render: (r) => (
        <Badge variant={r.status === 'active' ? 'default' : 'secondary'} className="capitalize">{r.status}</Badge>
      )
    },
    {
      key: 'actions' as any, label: '', render: (r) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleStatus(r)}>
          {r.status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
        </Button>
      )
    },
  ];

  const primaryCount = users.filter(u => u.role === 'licensee_primary' || u.user_type === 'primary').length;
  const activeCount = users.filter(u => u.status === 'active').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Licensee Web Users"
          description="Create and manage Primary and Secondary web users for licensee entities. Users are linked to a specific licensee."
          actions={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Web User</Button>}
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Users" value={users.length} icon={<Users className="h-6 w-6" />} />
          <StatCard title="Primary Users" value={primaryCount} icon={<Shield className="h-6 w-6" />} variant="primary" />
          <StatCard title="Active" value={activeCount} icon={<UserCheck className="h-6 w-6" />} variant="success" />
          <StatCard title="Inactive" value={users.length - activeCount} icon={<UserX className="h-6 w-6" />} variant="warning" />
        </div>

        <div className="animate-slide-up delay-200">
          <DataTableShell columns={columns} data={users} searchPlaceholder="Search web users..." />
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Licensee Web User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Licensee Entity *</Label>
              <Select value={form.licensee_id} onValueChange={v => setForm(p => ({ ...p, licensee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select licensee entity" /></SelectTrigger>
                <SelectContent>
                  {licensees.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {licensees.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">No active licensees found. Create one first.</p>
              )}
            </div>
            <div><Label>Full Name *</Label><Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} /></div>
            <div><Label>Email *</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div><Label>Password *</Label><Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Min 6 characters" /></div>
            <div>
              <Label>User Type *</Label>
              <Select value={form.user_type} onValueChange={v => setForm(p => ({ ...p, user_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary User (full access, can submit)</SelectItem>
                  <SelectItem value="secondary">Secondary User (data entry only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
