import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Plus, Users } from 'lucide-react';

const STATUS_META: Record<string, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  pending_clearance: { label: 'Pending Clearance', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  cleared: { label: 'Cleared', className: 'bg-green-100 text-green-800 border-green-200' },
  closed: { label: 'Closed', className: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const SUBJECT_TYPES = [
  { value: 'application', label: 'Application' },
  { value: 'license', label: 'License' },
  { value: 'entity', label: 'Entity' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'prudential_return', label: 'Prudential Return' },
  { value: 'prudential_finding', label: 'Prudential Finding' },
  { value: 'fp_assessment', label: 'Fit & Proper Assessment' },
  { value: 'enforcement_action', label: 'Enforcement Action' },
  { value: 'other', label: 'Other' },
];

export default function CoordinationList() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    subject_type: 'application' as string,
    subject_id: '',
    primary_regulator_id: 'none' as string,
  });

  const { data: regulators } = useQuery({
    queryKey: ['regulators_all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('regulators')
        .select('id, code, name').eq('status', 'active').order('code');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: cases, isLoading } = useQuery({
    queryKey: ['coordination_cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coordination_cases')
        .select('id, title, subject_type, subject_id, status, created_at, updated_at, owner_user_id, primary_regulator_id, owner_regulator_id')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      if (!form.title.trim()) throw new Error('Title required');
      const { data, error } = await supabase
        .from('coordination_cases')
        .insert({
          title: form.title.trim(),
          description: form.description.trim() || null,
          subject_type: form.subject_type,
          subject_id: form.subject_id.trim() || null,
          owner_user_id: user.id,
          primary_regulator_id: form.primary_regulator_id === 'none' ? null : form.primary_regulator_id,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success('Coordination case created');
      qc.invalidateQueries({ queryKey: ['coordination_cases'] });
      setCreating(false);
      setForm({ title: '', description: '', subject_type: 'application', subject_id: '', primary_regulator_id: 'none' });
      window.location.href = `/coordination/${id}`;
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Twin Peaks Coordination"
          description="Cross-regulator coordination workspaces — shared threads, participant clearance, and interdependency flags."
          actions={
            <Dialog open={creating} onOpenChange={setCreating}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" /> New Case</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Coordination Case</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Title *</Label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Joint review of ABC Bank cross-sector application" />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Subject Type</Label>
                      <Select value={form.subject_type} onValueChange={(v) => setForm({ ...form, subject_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SUBJECT_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Subject ID (optional)</Label>
                      <Input value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })} placeholder="UUID" />
                    </div>
                  </div>
                  <div>
                    <Label>Primary Regulator (Twin Peaks lead)</Label>
                    <Select value={form.primary_regulator_id} onValueChange={(v) => setForm({ ...form, primary_regulator_id: v })}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {(regulators ?? []).map((r: any) => (
                          <SelectItem key={r.id} value={r.id}>{r.code} · {r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
                  <Button onClick={() => create.mutate()} disabled={create.isPending}>
                    {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
            ) : !cases || cases.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No coordination cases yet. Create one to invite regulators.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((c: any) => {
                    const meta = STATUS_META[c.status] || STATUS_META.open;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.title}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.subject_type}{c.subject_id ? ` · ${String(c.subject_id).slice(0, 8)}…` : ''}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{new Date(c.updated_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <Link to={`/coordination/${c.id}`}>
                            <Button variant="ghost" size="sm">Open</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
