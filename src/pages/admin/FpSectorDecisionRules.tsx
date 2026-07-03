import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus, Pencil, Trash2, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/audit';

const ROLE_TYPES = ['director', 'senior_manager', 'key_person', 'controller', 'other'];

interface Rule {
  id: string;
  sector_id: string;
  sub_sector_id: string | null;
  role_type: string | null;
  name: string;
  criteria: {
    min_score?: number;
    mandatory_checks?: string[];
    disqualifiers?: string[];
    warnings?: string[];
  };
  rationale_template_id: string | null;
  is_active: boolean;
  version: number;
  updated_at: string;
}

function csv(v: string): string[] {
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export default function FpSectorDecisionRules() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Rule | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    sector_id: '',
    sub_sector_id: 'none',
    role_type: 'all',
    name: '',
    min_score: '',
    mandatory_checks: '',
    disqualifiers: '',
    warnings: '',
    rationale_template_id: 'none',
    is_active: true,
  });

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors-all'],
    queryFn: async () => (await supabase.from('sectors').select('id, name').order('name')).data ?? [],
  });
  const { data: subSectors = [] } = useQuery({
    queryKey: ['sub-sectors-all', form.sector_id],
    enabled: !!form.sector_id,
    queryFn: async () =>
      (await supabase.from('sub_sectors').select('id, name, sector_id').eq('sector_id', form.sector_id).order('name')).data ?? [],
  });
  const { data: templates = [] } = useQuery({
    queryKey: ['decision-rationale-templates'],
    queryFn: async () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((await (supabase.from('decision_rationale_templates') as any).select('id, name').order('name')).data ?? []) as { id: string; name: string }[],
  });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['fp-sector-rules'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('fp_sector_decision_rules') as any)
        .select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });

  const sectorMap = useMemo(() => new Map(sectors.map((s: any) => [s.id, s.name])), [sectors]);

  const resetForm = () => {
    setForm({
      sector_id: '', sub_sector_id: 'none', role_type: 'all', name: '',
      min_score: '', mandatory_checks: '', disqualifiers: '', warnings: '',
      rationale_template_id: 'none', is_active: true,
    });
    setEditing(null);
  };

  const openNew = () => { resetForm(); setOpen(true); };
  const openEdit = (r: Rule) => {
    setEditing(r);
    setForm({
      sector_id: r.sector_id,
      sub_sector_id: r.sub_sector_id ?? 'none',
      role_type: r.role_type ?? 'all',
      name: r.name,
      min_score: r.criteria?.min_score?.toString() ?? '',
      mandatory_checks: (r.criteria?.mandatory_checks ?? []).join(', '),
      disqualifiers: (r.criteria?.disqualifiers ?? []).join(', '),
      warnings: (r.criteria?.warnings ?? []).join(', '),
      rationale_template_id: r.rationale_template_id ?? 'none',
      is_active: r.is_active,
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.sector_id || !form.name.trim()) throw new Error('Sector and name are required');
      const criteria: Rule['criteria'] = {};
      if (form.min_score) criteria.min_score = Number(form.min_score);
      if (form.mandatory_checks) criteria.mandatory_checks = csv(form.mandatory_checks);
      if (form.disqualifiers) criteria.disqualifiers = csv(form.disqualifiers);
      if (form.warnings) criteria.warnings = csv(form.warnings);
      const payload = {
        sector_id: form.sector_id,
        sub_sector_id: form.sub_sector_id === 'none' ? null : form.sub_sector_id,
        role_type: form.role_type === 'all' ? null : form.role_type,
        name: form.name.trim(),
        criteria,
        rationale_template_id: form.rationale_template_id === 'none' ? null : form.rationale_template_id,
        is_active: form.is_active,
      };
      if (editing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('fp_sector_decision_rules') as any)
          .update({ ...payload, version: (editing.version ?? 1) + 1 }).eq('id', editing.id);
        if (error) throw error;
        await logAudit({ action: 'fp_sector_rule_updated', entityType: 'fp_sector_decision_rule', entityId: editing.id, newValue: payload });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from('fp_sector_decision_rules') as any).insert(payload).select('id').single();
        if (error) throw error;
        await logAudit({ action: 'fp_sector_rule_created', entityType: 'fp_sector_decision_rule', entityId: data.id, newValue: payload });
      }
    },
    onSuccess: () => {
      toast.success('Rule saved');
      setOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ['fp-sector-rules'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (r: Rule) => {
      if (!confirm(`Delete rule "${r.name}"?`)) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('fp_sector_decision_rules') as any).delete().eq('id', r.id);
      if (error) throw error;
      await logAudit({ action: 'fp_sector_rule_deleted', entityType: 'fp_sector_decision_rule', entityId: r.id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fp-sector-rules'] });
      toast.success('Rule deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DashboardLayout>
      <PageHeader
        title="F&P Sector Decision Rules"
        description="Sector-specific Fit & Proper criteria and rationale templates. Rules cascade from most-specific (sub-sector + role) to least."
        actions={<Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New rule</Button>}
      />

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4" /> Active rules</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Sub-sector</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Min score</TableHead>
                  <TableHead>Mandatory</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{sectorMap.get(r.sector_id) ?? '—'}</TableCell>
                    <TableCell className="text-xs">{r.sub_sector_id ?? '—'}</TableCell>
                    <TableCell><Badge variant="outline">{r.role_type ?? 'all'}</Badge></TableCell>
                    <TableCell className="text-xs">{r.criteria?.min_score ?? '—'}</TableCell>
                    <TableCell className="text-xs">{(r.criteria?.mandatory_checks ?? []).join(', ') || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'active' : 'inactive'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove.mutate(r)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rules.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No sector-specific rules yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit rule' : 'New sector rule'}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Rule name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. DTI directors — enhanced checks" />
            </div>
            <div>
              <Label>Sector</Label>
              <Select value={form.sector_id} onValueChange={(v) => setForm((f) => ({ ...f, sector_id: v, sub_sector_id: 'none' }))}>
                <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                <SelectContent>
                  {sectors.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sub-sector</Label>
              <Select value={form.sub_sector_id} onValueChange={(v) => setForm((f) => ({ ...f, sub_sector_id: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any sub-sector</SelectItem>
                  {subSectors.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role type</Label>
              <Select value={form.role_type} onValueChange={(v) => setForm((f) => ({ ...f, role_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {ROLE_TYPES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Min score (0-100)</Label>
              <Input type="number" min={0} max={100} value={form.min_score} onChange={(e) => setForm((f) => ({ ...f, min_score: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <Label>Mandatory checks (comma-separated keys)</Label>
              <Textarea rows={2} value={form.mandatory_checks} onChange={(e) => setForm((f) => ({ ...f, mandatory_checks: e.target.value }))} placeholder="sanctions, pep, criminal_history" />
            </div>
            <div className="md:col-span-2">
              <Label>Disqualifiers (mark candidate as unfit if any present)</Label>
              <Textarea rows={2} value={form.disqualifiers} onChange={(e) => setForm((f) => ({ ...f, disqualifiers: e.target.value }))} placeholder="active_criminal_case, sanctioned_person" />
            </div>
            <div className="md:col-span-2">
              <Label>Warnings (surface but don't block)</Label>
              <Textarea rows={2} value={form.warnings} onChange={(e) => setForm((f) => ({ ...f, warnings: e.target.value }))} placeholder="adverse_media, credit_history" />
            </div>
            <div className="md:col-span-2">
              <Label>Rationale template</Label>
              <Select value={form.rationale_template_id} onValueChange={(v) => setForm((f) => ({ ...f, rationale_template_id: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template</SelectItem>
                  {templates.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
