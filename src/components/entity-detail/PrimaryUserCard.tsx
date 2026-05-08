import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Crown, Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';

interface Props {
  entityId: string;
  entityName?: string;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
  user_type?: string | null;
  licensee_id?: string | null;
}

export default function PrimaryUserCard({ entityId, entityName }: Props) {
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<ProfileLite | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [candidates, setCandidates] = useState<ProfileLite[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from('entity_user_access' as any)
      .select('user_id')
      .eq('entity_id', entityId)
      .eq('access_type', 'primary_user')
      .eq('is_active', true)
      .limit(1);
    const uid = (rows as any[])?.[0]?.user_id;
    if (uid) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, full_name, email, user_type, licensee_id')
        .eq('id', uid)
        .maybeSingle();
      setCurrent(prof as any);
    } else {
      setCurrent(null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [entityId]);

  const openDialog = async () => {
    setSelectedUserId('');
    setSearch('');
    // Pull users already linked to this licensee as quick candidates.
    const { data: linked } = await supabase
      .from('profiles')
      .select('id, full_name, email, user_type, licensee_id')
      .eq('licensee_id', entityId)
      .order('full_name');
    setCandidates((linked as any) || []);
    setOpen(true);
  };

  const runSearch = async () => {
    const q = search.trim();
    if (!q) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, user_type, licensee_id')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(25);
    setCandidates((data as any) || []);
  };

  const handleAssign = async () => {
    if (!selectedUserId) {
      toast.error('Select a user first');
      return;
    }
    if (current?.id === selectedUserId) {
      toast.error('This user is already the active Primary User for this entity.');
      return;
    }
    if (current) {
      const res = await Swal.fire({
        title: 'Replace Primary User?',
        text: 'This entity already has an active Primary User. Assigning a new Primary User will deactivate the existing one.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, replace',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#1E3A8A',
      });
      if (!res.isConfirmed) return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('assign_primary_user' as any, {
        _entity_id: entityId,
        _user_id: selectedUserId,
      });
      const result: any = data;
      if (error || result?.error) {
        toast.error(result?.error || error?.message || 'Failed to assign Primary User');
      } else {
        toast.success('Primary User assigned');
        setOpen(false);
        await load();
      }
    } catch (e: any) {
      toast.error(e.message || 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-lg">
          <span className="flex items-center gap-2"><Crown className="h-5 w-5 text-primary" />Active Primary User</span>
          <Button size="sm" variant="outline" onClick={openDialog}>
            <RefreshCw className="h-4 w-4 mr-1" />{current ? 'Change' : 'Assign'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : current ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">{current.full_name || '—'}</p>
              <p className="text-sm text-muted-foreground">{current.email}</p>
            </div>
            <Badge variant="default">Primary User</Badge>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active Primary User assigned to this entity.</p>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Each entity can have only one active Primary User at a time. PPOC and Employee mappings are managed separately.
        </p>
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { if (!submitting) setOpen(v); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Primary User</DialogTitle>
            <DialogDescription>
              Select a user to be the active Primary User for <strong>{entityName || 'this entity'}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-2">
              <Input
                placeholder="Search by name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
              />
              <Button type="button" variant="outline" onClick={runSearch}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger>
                <SelectContent>
                  {candidates.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No users found. Search above.</div>
                  )}
                  {candidates.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {(c.full_name || '—')} — {c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleAssign} disabled={submitting || !selectedUserId}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Assign as Primary User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
