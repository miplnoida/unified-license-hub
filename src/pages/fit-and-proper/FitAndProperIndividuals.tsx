import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Plus, UserCheck } from 'lucide-react';

const STATUS_META: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-slate-100 text-slate-700',
  deceased: 'bg-slate-100 text-slate-700',
  removed: 'bg-red-100 text-red-800',
};

export default function FitAndProperIndividuals() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    full_name: '', national_id: '', nationality: '', date_of_birth: '',
    email: '', phone: '', address: '', notes: '',
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['fp_individuals', search],
    queryFn: async () => {
      let q = supabase.from('fp_individuals')
        .select('id, full_name, national_id, nationality, email, status, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (search.trim()) q = q.ilike('full_name', `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error('Full name required');
      const { error } = await supabase.from('fp_individuals').insert({
        full_name: form.full_name.trim(),
        national_id: form.national_id.trim() || null,
        nationality: form.nationality.trim() || null,
        date_of_birth: form.date_of_birth || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Individual added to Fit & Proper register');
      qc.invalidateQueries({ queryKey: ['fp_individuals'] });
      setOpen(false);
      setForm({ full_name: '', national_id: '', nationality: '', date_of_birth: '', email: '', phone: '', address: '', notes: '' });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Fit & Proper Register"
          description="Individuals in regulated positions (directors, key persons, senior managers) tracked through the FP lifecycle."
          actions={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Individual</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Individual</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Full name *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>National ID</Label><Input value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} /></div>
                    <div><Label>Nationality</Label><Input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} /></div>
                    <div><Label>Date of birth</Label><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
                    <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                    <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  </div>
                  <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                  <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={() => create.mutate()} disabled={create.isPending}>
                    {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        <Card>
          <CardContent className="p-4 space-y-3">
            <Input placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            {isLoading ? (
              <div className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
            ) : !rows || rows.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">No individuals registered yet.</div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>National ID</TableHead>
                  <TableHead>Nationality</TableHead><TableHead>Email</TableHead>
                  <TableHead>Status</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell className="text-xs font-mono">{r.national_id || '—'}</TableCell>
                      <TableCell className="text-xs">{r.nationality || '—'}</TableCell>
                      <TableCell className="text-xs">{r.email || '—'}</TableCell>
                      <TableCell><Badge variant="outline" className={STATUS_META[r.status] || ''}>{r.status}</Badge></TableCell>
                      <TableCell><Link to={`/fit-and-proper/individuals/${r.id}`}><Button size="sm" variant="ghost">Open</Button></Link></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
