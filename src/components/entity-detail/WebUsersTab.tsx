import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search, Users2, Plus, Eye, Pencil, Trash2, Power, KeyRound } from 'lucide-react';
import PrimaryUserCard from './PrimaryUserCard';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import RowActionsMenu, { type RowAction } from '@/components/common/RowActionsMenu';

interface WebUsersTabProps {
  entityId: string;
  entityName?: string;
}

export default function WebUsersTab({ entityId, entityName }: WebUsersTabProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState('Mr.');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [position, setPosition] = useState('');

  // View / Edit dialogs
  const [viewUser, setViewUser] = useState<any | null>(null);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadUsers = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('licensee_id', entityId).order('full_name');
    setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, [entityId]);

  const hasPrimary = users.some(u => u.user_type === 'primary');
  const userType = hasPrimary ? 'secondary' : 'primary';
  const buttonLabel = hasPrimary ? 'Create Secondary User' : 'Create Primary User';

  const resetForm = () => {
    setTitle('Mr.');
    setFirstName('');
    setLastName('');
    setEmail('');
    setUsername('');
    setPosition('');
  };

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    try {
      const fullName = `${title} ${firstName} ${lastName}`.trim();

      const { data, error } = await supabase.functions.invoke('create-web-user', {
        body: {
          email: email.trim(),
          password: crypto.randomUUID().slice(0, 12) + 'A1!',
          full_name: fullName,
          user_type: userType,
          entity_name: entityName || '',
          licensee_id: entityId,
          send_email: true,
          position: position.trim(),
          username: username.trim(),
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'Failed to create user');
      } else {
        const newUserId = data?.user?.id;
        if (newUserId) {
          await supabase.from('entity_user_access' as any).insert({
            user_id: newUserId,
            entity_id: entityId,
            access_type: userType === 'primary' ? 'primary_user' : 'secondary_contact',
            is_active: true,
          });
        }
        toast.success(`${userType === 'primary' ? 'Primary' : 'Secondary'} user created. Credentials sent to ${email.trim()}`);
        resetForm();
        setOpen(false);
        await loadUsers();
      }
    } catch (e: any) {
      toast.error(e.message || 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (u: any) => {
    setEditUser(u);
    setEditFullName(u.full_name || '');
    setEditUsername(u.username || '');
    setEditPosition(u.position || '');
    setEditStatus((u.status === 'inactive' ? 'inactive' : 'active'));
  };

  const saveEdit = async () => {
    if (!editUser) return;
    if (!editFullName.trim()) { toast.error('Full name is required'); return; }
    setSavingEdit(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-web-user', {
        body: {
          action: 'update',
          user_id: editUser.id,
          updates: {
            full_name: editFullName.trim(),
            username: editUsername.trim(),
            position: editPosition.trim(),
            status: editStatus,
          },
        },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'Failed to update user');
      } else {
        toast.success('User updated');
        setEditUser(null);
        await loadUsers();
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleStatus = async (u: any) => {
    const next = u.status === 'active' ? 'inactive' : 'active';
    const result = await Swal.fire({
      title: `${next === 'active' ? 'Activate' : 'Deactivate'} user?`,
      text: `${u.full_name || u.email} will be ${next === 'active' ? 'allowed to log in' : 'blocked from logging in'}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: `Yes, ${next === 'active' ? 'activate' : 'deactivate'}`,
    });
    if (!result.isConfirmed) return;
    const { data, error } = await supabase.functions.invoke('toggle-user-status', {
      body: { user_id: u.id, status: next },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Failed to update status');
    } else {
      toast.success(`User ${next === 'active' ? 'activated' : 'deactivated'}`);
      await loadUsers();
    }
  };

  const resetPassword = async (u: any) => {
    const result = await Swal.fire({
      title: 'Reset password?',
      text: `A new temporary password will be generated and emailed to ${u.email}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, reset',
    });
    if (!result.isConfirmed) return;
    const newPassword = crypto.randomUUID().slice(0, 12) + 'A1!';
    const { data, error } = await supabase.functions.invoke('toggle-user-status', {
      body: { user_id: u.id, action: 'reset_password', new_password: newPassword },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Failed to reset password');
    } else {
      toast.success('Password reset; temporary password sent to user');
    }
  };

  const deleteUser = async (u: any) => {
    const result = await Swal.fire({
      title: 'Delete user?',
      html: `This permanently removes <b>${u.full_name || u.email}</b> and revokes their access. This cannot be undone.`,
      icon: 'error',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete',
      confirmButtonColor: '#dc2626',
    });
    if (!result.isConfirmed) return;
    const { data, error } = await supabase.functions.invoke('manage-web-user', {
      body: { action: 'delete', user_id: u.id },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Failed to delete user');
    } else {
      toast.success('User deleted');
      await loadUsers();
    }
  };

  const filtered = users.filter(u => !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <PrimaryUserCard entityId={entityId} entityName={entityName} />
      <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg"><Users2 className="h-5 w-5 text-primary" />Web Portal Users</CardTitle>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />{buttonLabel}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground"><Users2 className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>No web users linked to this entity.</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Full Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead className="w-[60px] text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map(u => {
                const isActive = u.status === 'active';
                const actions: RowAction[] = [
                  { label: 'View', icon: Eye, onClick: () => setViewUser(u) },
                  { label: 'Edit', icon: Pencil, onClick: () => openEdit(u) },
                  { label: isActive ? 'Deactivate' : 'Activate', icon: Power, onClick: () => toggleStatus(u) },
                  { label: 'Reset Password', icon: KeyRound, onClick: () => resetPassword(u) },
                  { label: 'Delete', icon: Trash2, destructive: true, separator: true, onClick: () => deleteUser(u) },
                ];
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{u.role?.replace(/_/g, ' ')}</Badge></TableCell>
                    <TableCell className="capitalize">{u.user_type}</TableCell>
                    <TableCell><Badge variant="outline" className={isActive ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200' : 'bg-muted text-muted-foreground'}>{u.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <RowActionsMenu actions={actions} label="Manage user" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={v => { if (!submitting) { setOpen(v); if (!v) resetForm(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{buttonLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Entity Name</Label>
              <Input value={entityName || ''} disabled className="bg-muted" />
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Select value={title} onValueChange={setTitle}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>First Name <span className="text-destructive">*</span></Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Last Name <span className="text-destructive">*</span></Label>
              <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
            </div>
            <div className="space-y-1.5">
              <Label>Email Address <span className="text-destructive">*</span></Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" />
            </div>
            <div className="space-y-1.5">
              <Label>Position</Label>
              <Input value={position} onChange={e => setPosition(e.target.value)} placeholder="e.g. Compliance Officer" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {buttonLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!viewUser} onOpenChange={v => { if (!v) setViewUser(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>Read-only view of the selected web user.</DialogDescription>
          </DialogHeader>
          {viewUser && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm py-2">
              <div className="text-muted-foreground">Full Name</div>
              <div className="font-medium">{viewUser.full_name || '—'}</div>
              <div className="text-muted-foreground">Email</div>
              <div className="font-medium break-all">{viewUser.email || '—'}</div>
              <div className="text-muted-foreground">Username</div>
              <div className="font-medium">{viewUser.username || '—'}</div>
              <div className="text-muted-foreground">Position</div>
              <div className="font-medium">{viewUser.position || '—'}</div>
              <div className="text-muted-foreground">Role</div>
              <div className="font-medium capitalize">{viewUser.role?.replace(/_/g, ' ') || '—'}</div>
              <div className="text-muted-foreground">User Type</div>
              <div className="font-medium capitalize">{viewUser.user_type || '—'}</div>
              <div className="text-muted-foreground">Status</div>
              <div className="font-medium capitalize">{viewUser.status || '—'}</div>
              <div className="text-muted-foreground">Created</div>
              <div className="font-medium">{viewUser.created_at ? new Date(viewUser.created_at).toLocaleString() : '—'}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewUser(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={v => { if (!savingEdit && !v) setEditUser(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update profile details and account status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={editUser?.email || ''} disabled className="bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input value={editFullName} onChange={e => setEditFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input value={editUsername} onChange={e => setEditUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Position</Label>
              <Input value={editPosition} onChange={e => setEditPosition(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as 'active' | 'inactive')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)} disabled={savingEdit}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
    </div>
  );
}
