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
import { useState } from 'react';
import { toast } from 'sonner';

interface WebUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdDate: string;
}

const initialUsers: WebUser[] = [
  { id: '1', name: 'Sarah Johnson', email: 'sarah.johnson@lfsc.gov', role: 'Super Admin', status: 'active', createdDate: '2023-03-15' },
  { id: '2', name: 'Michael Chen', email: 'michael.chen@lfsc.gov', role: 'Admin', status: 'active', createdDate: '2023-06-20' },
  { id: '3', name: 'Emily Davis', email: 'emily.davis@lfsc.gov', role: 'Manager', status: 'active', createdDate: '2023-08-10' },
  { id: '4', name: 'Robert Wilson', email: 'robert.wilson@lfsc.gov', role: 'User', status: 'inactive', createdDate: '2024-01-05' },
  { id: '5', name: 'Lisa Anderson', email: 'lisa.anderson@example.com', role: 'User', status: 'active', createdDate: '2024-02-18' },
];

const emptyUser = { id: '', name: '', email: '', role: 'User', status: 'active', createdDate: '' };

export default function ManageWebUsers() {
  const [users, setUsers] = useState(initialUsers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<WebUser | null>(null);
  const [form, setForm] = useState(emptyUser);

  const openAdd = () => { setEditingUser(null); setForm({ ...emptyUser, id: crypto.randomUUID(), createdDate: new Date().toISOString().split('T')[0] }); setDialogOpen(true); };
  const openEdit = (u: WebUser) => { setEditingUser(u); setForm(u); setDialogOpen(true); };
  const toggleStatus = (u: WebUser) => {
    const next = u.status === 'active' ? 'inactive' : 'active';
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: next } : x));
    toast.success(`User ${next === 'active' ? 'activated' : 'deactivated'}`);
  };

  const handleSave = () => {
    if (!form.name || !form.email) { toast.error('Name and Email are required'); return; }
    if (editingUser) {
      setUsers(prev => prev.map(x => x.id === form.id ? form : x));
      toast.success('User updated');
    } else {
      setUsers(prev => [...prev, form]);
      toast.success('User added');
    }
    setDialogOpen(false);
  };

  const columns: Column<WebUser>[] = [
    {
      key: 'name', label: 'Name', render: (r) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">{r.name.split(' ').map(n => n[0]).join('')}</div>
          <div>
            <p className="font-medium text-foreground">{r.name}</p>
            <p className="text-sm text-muted-foreground">{r.email}</p>
          </div>
        </div>
      )
    },
    { key: 'role', label: 'Role', render: (r) => <Badge variant="outline">{r.role}</Badge> },
    { key: 'createdDate', label: 'Created Date' },
    {
      key: 'status', label: 'Status', render: (r) => {
        const v = r.status === 'active' ? 'approved' : 'draft';
        return <Badge variant={v as any} className="capitalize">{r.status}</Badge>;
      }
    },
    {
      key: 'actions', label: '', render: (r) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleStatus(r)}>
            {r.status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
          </Button>
        </div>
      )
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Manage Web Users" description="Create, manage, and monitor system user accounts." actions={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add User</Button>} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Users" value={users.length} icon={<Users className="h-6 w-6" />} />
          <StatCard title="Active" value={users.filter(u => u.status === 'active').length} icon={<UserCheck className="h-6 w-6" />} variant="success" />
          <StatCard title="Inactive" value={users.filter(u => u.status === 'inactive').length} icon={<UserX className="h-6 w-6" />} variant="warning" />
        </div>
        <div className="animate-slide-up delay-200">
          <DataTableShell columns={columns} data={users} searchPlaceholder="Search users..." />
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingUser ? 'Edit User' : 'Add User'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Super Admin">Super Admin</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                  <SelectItem value="Manager">Manager</SelectItem>
                  <SelectItem value="User">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingUser ? 'Update' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
