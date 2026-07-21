import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Edit } from 'lucide-react';

const CHECK_TYPES = [
  { value: 'sanctions', label: 'Sanctions list' },
  { value: 'pep', label: 'Politically-Exposed Person' },
  { value: 'adverse_media', label: 'Adverse media (AI-powered)' },
  { value: 'criminal_history', label: 'Criminal history' },
  { value: 'credit_history', label: 'Financial soundness' },
  { value: 'regulator_watchlist', label: 'Regulator watchlist' },
];
const SEVERITIES = ['low', 'medium', 'high'];

interface FormState {
  key: string; display_label: string; check_type: string; provider: string; description: string;
  severity_default: string; sort_order: number; is_active: boolean;
}

const EMPTY: FormState = {
  key: '', display_label: '', check_type: 'sanctions', provider: 'internal',
  description: '', severity_default: 'medium', sort_order: 100, is_active: true,
};

export default function FpScreeningConfigs() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data: configs, isLoading } = useQuery({
    queryKey: ['fp_screening_configs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_screening_configs').select('*').order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.key.trim() || !form.display_label.trim()) throw new Error('Key and label required');
      const payload = { ...form, key: form.key.trim(), display_label: form.display_label.trim(), provider: form.provider.trim() || null };
      if (editing) {
        const { error } = await supabase.from('fp_screening_configs').update(payload).eq('id', editing);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fp_screening_configs').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['fp_screening_configs'] });
      setOpen(false); setEditing(null); setForm(EMPTY);
    },
    onError: (e: any) => toast.error(e?.message || 'Save failed'),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('fp_screening_configs').update({ is_active: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fp_screening_configs'] }),
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fp_screening_configs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['fp_screening_configs'] }); },
    onError: (e: any) => toast.error(e?.message || 'Delete failed'),
  });

  const startEdit = (c: any) => {
    setEditing(c.id);
    setForm({
      key: c.key, display_label: c.display_label, check_type: c.check_type,
      provider: c.provider || 'internal', description: c.description || '',
      severity_default: c.severity_default || 'medium', sort_order: c.sort_order || 100,
      is_active: c.is_active,
    });
    setOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="FP Screening Rules"
          description="Rule packs run by the fit-and-proper screening engine. Enable the checks that apply to your regime; adverse-media uses Lovable AI."
          backHref="/admin"
          backLabel="Admin"
          actions={
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(EMPTY); } }}>
              <DialogTrigger asChild><Button data-rbac="fit_and_proper.create"><Plus className="h-4 w-4 mr-2" /> New rule</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editing ? 'Edit rule' : 'New screening rule'}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Key *</Label><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="ofac_sdn" /></div>
                    <div><Label>Display label *</Label><Input value={form.display_label} onChange={(e) => setForm({ ...form, display_label: e.target.value })} /></div>
                    <div>
                      <Label>Check type</Label>
                      <Select value={form.check_type} onValueChange={(v) => setForm({ ...form, check_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{CHECK_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Default severity</Label>
                      <Select value={form.severity_default} onValueChange={(v) => setForm({ ...form, severity_default: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Provider</Label><Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="internal / dow_jones / …" /></div>
                    <div><Label>Sort order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} /></div>
                  </div>
                  <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                  <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button data-rbac="fit_and_proper.edit" onClick={() => save.mutate()} disabled={save.isPending}>
                    {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        <Card><CardContent className="p-4">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
          ) : !configs || configs.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">No rules configured yet.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Order</TableHead><TableHead>Key</TableHead><TableHead>Label</TableHead>
                <TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Active</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {configs.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.sort_order}</TableCell>
                    <TableCell className="font-mono text-xs">{c.key}</TableCell>
                    <TableCell>{c.display_label}</TableCell>
                    <TableCell><Badge variant="outline">{c.check_type}</Badge></TableCell>
                    <TableCell>{c.severity_default}</TableCell>
                    <TableCell><Switch checked={c.is_active} onCheckedChange={(v) => toggle.mutate({ id: c.id, active: v })} /></TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(c)}><Edit className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm('Delete rule?')) remove.mutate(c.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
