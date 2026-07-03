import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Plus, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';
import { logFpAction } from '@/lib/fpAudit';

const CATEGORIES = [
  { value: 'training', label: 'Training / certification' },
  { value: 'reporting', label: 'Periodic reporting' },
  { value: 'restriction', label: 'Role restriction' },
  { value: 'monitoring', label: 'Enhanced monitoring' },
  { value: 'disclosure', label: 'Ongoing disclosure' },
  { value: 'other', label: 'Other' },
];
const EVIDENCE_TYPES = ['certificate', 'attestation', 'report', 'document', 'external_verification', 'none'];

const STATUS_META: Record<string, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-blue-100 text-blue-800' },
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-800' },
  satisfied: { label: 'Satisfied', className: 'bg-green-100 text-green-800' },
  waived: { label: 'Waived', className: 'bg-slate-100 text-slate-700' },
};

interface Props { individualId: string }

const EMPTY = { category: 'reporting', description: '', due_date: '', monitoring_owner: '', evidence_type: 'document' };

export function FpConditionsPanel({ individualId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [satisfyFor, setSatisfyFor] = useState<string | null>(null);
  const [satNote, setSatNote] = useState('');
  const [pending, setPending] = useState<null | {
    ruleKey: string;
    title: string;
    original: unknown;
    overridden: unknown;
    apply: () => Promise<void>;
    metadata: Record<string, unknown>;
  }>(null);

  const { data: currentDet } = useQuery({
    queryKey: ['fp_current_det', individualId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_determinations')
        .select('id, outcome, determined_at')
        .eq('individual_id', individualId).eq('is_current', true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: conditions } = useQuery({
    queryKey: ['fp_conditions', individualId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_conditions')
        .select('id, determination_id, category, description, due_date, monitoring_owner, evidence_type, status, satisfied_at, satisfaction_note, created_at')
        .eq('individual_id', individualId).order('created_at', { ascending: false });
      if (error) throw error;
      const today = new Date().toISOString().slice(0, 10);
      return (data ?? []).map((c: any) => {
        let derived = c.status;
        if (derived === 'open' && c.due_date && c.due_date < today) derived = 'overdue';
        return { ...c, derived_status: derived };
      });
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!currentDet) throw new Error('No current determination to attach conditions to');
      if (!form.description.trim()) throw new Error('Description required');
      const { error } = await supabase.from('fp_conditions').insert({
        individual_id: individualId,
        determination_id: currentDet.id,
        category: form.category,
        description: form.description.trim(),
        due_date: form.due_date || null,
        monitoring_owner: form.monitoring_owner.trim() || null,
        evidence_type: form.evidence_type,
        status: 'open',
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Condition added');
      qc.invalidateQueries({ queryKey: ['fp_conditions', individualId] });
      setOpen(false); setForm(EMPTY);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const satisfy = useMutation({
    mutationFn: async ({ id, waive }: { id: string; waive?: boolean }) => {
      const { error } = await supabase.from('fp_conditions').update({
        status: waive ? 'waived' : 'satisfied',
        satisfied_at: new Date().toISOString(),
        satisfied_by: user?.id,
        satisfaction_note: satNote || null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Condition updated');
      setSatisfyFor(null); setSatNote('');
      qc.invalidateQueries({ queryKey: ['fp_conditions', individualId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const reopen = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fp_conditions').update({
        status: 'open', satisfied_at: null, satisfied_by: null, satisfaction_note: null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Reopened');
      qc.invalidateQueries({ queryKey: ['fp_conditions', individualId] });
    },
  });

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center justify-between">
          <span>Conditions</span>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!currentDet}><Plus className="h-4 w-4 mr-2" /> Add condition</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add condition</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Description *</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Due date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
                  <div>
                    <Label>Evidence type</Label>
                    <Select value={form.evidence_type} onValueChange={(v) => setForm({ ...form, evidence_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{EVIDENCE_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Monitoring owner</Label><Input value={form.monitoring_owner} onChange={(e) => setForm({ ...form, monitoring_owner: e.target.value })} placeholder="Team / person responsible" /></div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => add.mutate()} disabled={add.isPending}>
                  {add.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!currentDet && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">Conditions attach to the current determination. Finalize a determination first.</p>}
          {(conditions ?? []).length === 0 && <p className="text-sm text-muted-foreground">No conditions recorded.</p>}
          {(conditions ?? []).map((c: any) => {
            const meta = STATUS_META[c.derived_status] || STATUS_META.open;
            const isOpen = c.status === 'open';
            return (
              <div key={c.id} className={`border rounded p-3 ${!isOpen ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={meta.className}>
                        {c.derived_status === 'overdue' && <AlertTriangle className="h-3 w-3 mr-1" />}
                        {c.derived_status === 'satisfied' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {c.derived_status === 'open' && <Clock className="h-3 w-3 mr-1" />}
                        {meta.label}
                      </Badge>
                      <Badge variant="outline">{c.category}</Badge>
                      {c.evidence_type && c.evidence_type !== 'none' && <span className="text-xs text-muted-foreground">Evidence: {c.evidence_type.replace(/_/g, ' ')}</span>}
                    </div>
                    <div className="text-sm mt-1">{c.description}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {c.due_date ? `Due ${new Date(c.due_date).toLocaleDateString()}` : 'No deadline'}
                      {c.monitoring_owner ? ` · Owner: ${c.monitoring_owner}` : ''}
                    </div>
                    {c.satisfaction_note && <div className="text-xs italic mt-1">Note: {c.satisfaction_note}</div>}
                  </div>
                  <div className="flex gap-1">
                    {isOpen && <Button size="sm" variant="ghost" onClick={() => { setSatisfyFor(c.id); setSatNote(''); }}><CheckCircle2 className="h-4 w-4 mr-1" /> Mark satisfied</Button>}
                    {!isOpen && <Button size="sm" variant="ghost" onClick={() => reopen.mutate(c.id)}>Reopen</Button>}
                  </div>
                </div>
                {satisfyFor === c.id && (
                  <div className="mt-2 space-y-2">
                    <Textarea rows={2} placeholder="Evidence / note" value={satNote} onChange={(e) => setSatNote(e.target.value)} />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setSatisfyFor(null)}>Cancel</Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        setPending({
                          ruleKey: 'fit_and_proper.condition.waiver',
                          title: 'Waive condition',
                          original: { status: c.status, evidence_type: c.evidence_type },
                          overridden: { status: 'waived', note: satNote || null },
                          metadata: {
                            source: 'phase1_override_framework',
                            screen: 'FpConditionsPanel',
                            condition_id: c.id,
                            individual_id: individualId,
                            previous_status: c.status,
                            new_status: 'waived',
                          },
                          apply: async () => { await satisfy.mutateAsync({ id: c.id, waive: true }); },
                        });
                      }} disabled={satisfy.isPending}>Waive</Button>
                      <Button size="sm" onClick={() => {
                        const needsEvidence = c.evidence_type && c.evidence_type !== 'none';
                        if (needsEvidence && satNote.trim().length < 5) {
                          setPending({
                            ruleKey: 'fit_and_proper.condition.evidence_bypass',
                            title: 'Close condition without evidence',
                            original: { status: c.status, evidence_type: c.evidence_type, note: c.satisfaction_note },
                            overridden: { status: 'satisfied', note: satNote || null },
                            metadata: {
                              source: 'phase1_override_framework',
                              screen: 'FpConditionsPanel',
                              condition_id: c.id,
                              individual_id: individualId,
                              previous_status: c.status,
                              new_status: 'satisfied',
                              required_evidence_type: c.evidence_type,
                            },
                            apply: async () => { await satisfy.mutateAsync({ id: c.id }); },
                          });
                        } else {
                          satisfy.mutate({ id: c.id });
                        }
                      }} disabled={satisfy.isPending}>Confirm satisfied</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {pending && (
        <OverrideReasonDialog
          open={!!pending}
          onOpenChange={(o) => { if (!o) setPending(null); }}
          module="fit_and_proper"
          entityType="fp_condition"
          entityId={String(pending.metadata.condition_id ?? individualId)}
          ruleKey={pending.ruleKey}
          title={pending.title}
          originalValue={pending.original}
          overriddenValue={pending.overridden}
          metadata={pending.metadata}
          onOverridden={async () => { await pending.apply(); setPending(null); }}
        />
      )}
    </div>
  );
}
