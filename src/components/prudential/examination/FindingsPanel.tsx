import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, Plus, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCreateRemediationAction, useExaminationFindings, useFindingMutations } from '@/hooks/useExaminations';
import { useCloseActionGated } from '@/hooks/usePrudentialActionLifecycle';
import { StageActions, type StageActionsMode } from './ExaminationStageActions';


const SEVERITIES = ['low', 'medium', 'high', 'critical'];

const CLOSED_ACTION_STATUSES = ['completed', 'waived', 'cancelled'];
const isActionClosed = (s: any) => CLOSED_ACTION_STATUSES.includes(String(s));
const actionStatusLabel = (s: any) => {
  const v = String(s);
  return v === 'completed' ? 'Completed'
    : v === 'waived' ? 'Waived'
      : v === 'cancelled' ? 'Cancelled'
        : v === 'in_progress' ? 'In progress'
          : v === 'overdue' ? 'Overdue'
            : v === 'breached' ? 'Breached'
              : 'Open';
};
const actionTone = (s: any) =>
  isActionClosed(s) ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200'
    : ['overdue', 'breached'].includes(String(s)) ? 'bg-destructive/10 text-destructive border-destructive/20'
      : 'bg-warning/10 text-warning border-warning/20';


const sevTone = (s: string) =>
  s === 'critical' ? 'bg-destructive/10 text-destructive border-destructive/20'
    : s === 'high' ? 'bg-warning/10 text-warning border-warning/20'
      : s === 'medium' ? 'bg-primary/10 text-primary border-primary/20'
        : 'bg-muted text-muted-foreground';

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="text-xs space-y-0.5">{children}</div>
    </div>
  );
}

export function FindingsPanel({ examinationId, readOnly, mode = 'supporting' }: { examinationId: string; readOnly?: boolean; mode?: StageActionsMode }) {
  const { data: rows = [], isLoading } = useExaminationFindings(examinationId);
  const { save, remove } = useFindingMutations(examinationId);
  const createAction = useCreateRemediationAction(examinationId);
  const closeAction = useCloseActionGated();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '', category: '', severity: 'medium', criteria_breached: '',
    observation: '', root_cause: '', recommendation: '', target_date: '',
  });

  const add = async () => {
    const { data: auth } = await supabase.auth.getUser();
    await save.mutateAsync({
      title: form.title,
      category: form.category || null,
      severity: form.severity,
      criteria_breached: form.criteria_breached || null,
      observation: form.observation || null,
      root_cause: form.root_cause || null,
      recommendation: form.recommendation || null,
      target_date: form.target_date || null,
      status: 'open',
      created_by: auth?.user?.id ?? null,
    });
    setForm({ title: '', category: '', severity: 'medium', criteria_breached: '', observation: '', root_cause: '', recommendation: '', target_date: '' });
    setShowForm(false);
  };

  const closeFinding = async (r: any) => {
    const hasOpenAction = r.action && !['completed', 'waived', 'cancelled'].includes(String(r.action.status));
    const res = await Swal.fire({
      title: 'Close this finding?',
      text: hasOpenAction
        ? 'The linked corrective action will be completed at the same time. Add a short closure note.'
        : 'Add a short closure note for the record.',
      input: 'textarea',
      inputPlaceholder: 'Why is this finding being closed?',
      inputValidator: (v) => (!v || v.trim().length < 5 ? 'Please enter at least 5 characters' : undefined),
      showCancelButton: true,
      confirmButtonText: 'Close finding',
    });
    if (!res.isConfirmed) return;
    const note = String(res.value ?? '').trim();

    if (hasOpenAction) {
      try {
        await closeAction.mutateAsync({ action_id: r.remediation_action_id, kind: 'completed', reason: note });
      } catch {
        return; // closure gate refused — finding stays open, error already surfaced
      }
    }

    const { data: auth } = await supabase.auth.getUser();
    await save.mutateAsync({
      id: r.id, status: 'closed', closed_at: new Date().toISOString(), closed_by: auth?.user?.id ?? null,
    });
    qc.invalidateQueries({ queryKey: ['examination-findings', examinationId] });
  };


  const openCount = rows.filter((r: any) => r.status !== 'closed').length;
  const unlinked = rows.filter((r: any) => r.status !== 'closed' && !r.remediation_action_id);
  // Findings still needing a corrective action come first.
  const ordered = [...rows].sort((a: any, b: any) => {
    const aNeeds = a.status !== 'closed' && !a.remediation_action_id ? 0 : 1;
    const bNeeds = b.status !== 'closed' && !b.remediation_action_id ? 0 : 1;
    return aNeeds - bNeeds;
  });

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Findings and corrective actions</CardTitle>
          <div className="flex gap-2">
            <Badge variant="outline">{openCount} open</Badge>
            {unlinked.length > 0 && (
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                {unlinked.length} without a corrective action
              </Badge>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          What was found, why it happened, and what the entity must do about it.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {unlinked.length > 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            {unlinked.length} finding{unlinked.length === 1 ? '' : 's'} still require corrective actions before the report can be finalised.
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border p-6 text-center space-y-2">
            <p className="text-sm font-medium">No findings have been recorded yet</p>
            <p className="text-xs text-muted-foreground">
              Record each issue identified during the examination so corrective actions can be tracked.
            </p>
            {!readOnly && (
              <Button data-rbac="prudential_supervision.edit" size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" />Add finding
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {ordered.map((r: any) => (
              <div key={r.id} className="rounded-md border p-3 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{r.reference ? `${r.reference} · ` : ''}{r.title}</div>
                    <p className="text-xs text-muted-foreground">
                      {r.category || 'Uncategorised'}
                      {r.target_date ? ` · target ${new Date(r.target_date).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className={sevTone(r.severity)}>{r.severity} severity</Badge>
                    <Badge variant="outline" className="capitalize">{String(r.status).replace('_', ' ')}</Badge>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <Block title="What did we find?">
                    {r.observation ? <p>{r.observation}</p> : <p className="text-muted-foreground">Not recorded</p>}
                    {r.criteria_breached && <p className="text-muted-foreground">Criteria breached: {r.criteria_breached}</p>}
                  </Block>
                  <Block title="Why did it happen?">
                    {r.root_cause ? <p>{r.root_cause}</p> : <p className="text-muted-foreground">Root cause not recorded</p>}
                  </Block>
                  <Block title="What needs to happen?">
                    {r.recommendation ? <p>{r.recommendation}</p> : <p className="text-muted-foreground">No recommendation recorded</p>}
                    {r.target_date && <p className="text-muted-foreground">Target {new Date(r.target_date).toLocaleDateString()}</p>}
                  </Block>
                </div>

                {r.action ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2 text-xs">
                    <span><span className="font-medium">Corrective action: </span>{r.action.title}</span>
                    <Badge variant="outline" className={actionTone(r.action.status)}>{actionStatusLabel(r.action.status)}</Badge>
                    {r.action.due_date && !isActionClosed(r.action.status) && (
                      <span className="text-muted-foreground">Due {new Date(r.action.due_date).toLocaleDateString()}</span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-warning">Corrective action not yet created.</p>
                )}


                {!readOnly && (
                  <div className="flex flex-wrap gap-2">
                    {!r.remediation_action_id && (
                      <Button data-rbac="prudential_supervision.workflow_action" size="sm" disabled={createAction.isPending}
                        onClick={() => createAction.mutate({ finding_id: r.id, due_date: r.target_date ?? null, description: r.recommendation ?? null })}>
                        <ClipboardList className="h-3.5 w-3.5 mr-1" />Create corrective action
                      </Button>
                    )}
                    {r.status !== 'closed' && (
                      <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline" onClick={() => closeFinding(r)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Close finding
                      </Button>
                    )}
                    <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" className="ml-auto"
                      aria-label="Remove finding" onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {!readOnly && !showForm && (
              <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" />Add finding
              </Button>
            )}
          </div>
        )}

        {!readOnly && showForm && (
          <div className="rounded-md border p-3 space-y-3 bg-muted/20">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <Label htmlFor="f_title">Finding title</Label>
                <Input id="f_title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="f_sev">Severity</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger id="f_sev"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="f_target">Target date for correction</Label>
                <Input id="f_target" type="date" value={form.target_date}
                  onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="f_cat">Category</Label>
                <Input id="f_cat" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="f_crit">Criteria breached</Label>
                <Input id="f_crit" value={form.criteria_breached}
                  onChange={e => setForm(f => ({ ...f, criteria_breached: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="f_obs">What did we find? (observation)</Label>
              <Textarea id="f_obs" rows={2} value={form.observation}
                onChange={e => setForm(f => ({ ...f, observation: e.target.value }))} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="f_root">Why did it happen? (root cause)</Label>
                <Textarea id="f_root" rows={2} value={form.root_cause}
                  onChange={e => setForm(f => ({ ...f, root_cause: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="f_rec">What needs to happen? (recommendation)</Label>
                <Textarea id="f_rec" rows={2} value={form.recommendation}
                  onChange={e => setForm(f => ({ ...f, recommendation: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button data-rbac="prudential_supervision.edit" size="sm" disabled={!form.title || save.isPending} onClick={add}>
                <Plus className="h-4 w-4 mr-1" />Add finding
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {!readOnly && <StageActions mode={mode} />}
      </CardContent>
    </Card>
  );
}
