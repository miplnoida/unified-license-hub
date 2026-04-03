import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search, Users2, Plus } from 'lucide-react';
import { toast } from 'sonner';

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

  const filtered = users.filter(u => !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
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
            <TableHeader><TableRow><TableHead>Full Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{u.role?.replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell className="capitalize">{u.user_type}</TableCell>
                  <TableCell><Badge variant="outline" className={u.status === 'active' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200' : ''}>{u.status}</Badge></TableCell>
                </TableRow>
              ))}
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
    </Card>
  );
}
