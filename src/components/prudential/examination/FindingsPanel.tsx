import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, ClipboardList, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCreateRemediationAction, useExaminationFindings, useFindingMutations } from '@/hooks/useExaminations';
import { StageActions } from './ExaminationStageActions';

const SEVERITIES = ['low', 'medium', 'high', 'critical'];

const sevTone = (s: string) =>
  s === 'critical' ? 'bg-destructive/10 text-destructive border-destructive/20'
    : s === 'high' ? 'bg-warning/10 text-warning border-warning/20'
      : s === 'medium' ? 'bg-primary/10 text-primary border-primary/20'
        : 'bg-muted text-muted-foreground';

export function FindingsPanel({ examinationId, readOnly }: { examinationId: string; readOnly?: boolean }) {
  const { data: rows = [], isLoading } = useExaminationFindings(examinationId);
  const { save, remove } = useFindingMutations(examinationId);
  const createAction = useCreateRemediationAction(examinationId);
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
  };

  const closeFinding = async (r: any) => {
    const { data: auth } = await supabase.auth.getUser();
    save.mutate({ id: r.id, status: 'closed', closed_at: new Date().toISOString(), closed_by: auth?.user?.id ?? null });
  };

  const openCount = rows.filter((r: any) => r.status !== 'closed').length;
  const unlinked = rows.filter((r: any) => r.status !== 'closed' && !r.remediation_action_id).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Findings &amp; corrective action plan</CardTitle>
        <div className="flex gap-2">
          <Badge variant="outline">{openCount} open</Badge>
          {unlinked > 0 && (
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">{unlinked} without remediation</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No findings recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r: any) => (
              <div key={r.id} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{r.reference ? `${r.reference} · ` : ''}{r.title}</div>
                    <p className="text-xs text-muted-foreground">
                      {r.category || 'Uncategorised'}
                      {r.target_date ? ` · target ${new Date(r.target_date).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className={sevTone(r.severity)}>{r.severity}</Badge>
                    <Badge variant="outline" className="capitalize">{r.status.replace('_', ' ')}</Badge>
                  </div>
                </div>
                {r.criteria_breached && <p className="text-xs"><span className="text-muted-foreground">Criteria breached: </span>{r.criteria_breached}</p>}
                {r.observation && <p className="text-xs"><span className="text-muted-foreground">Observation: </span>{r.observation}</p>}
                {r.root_cause && <p className="text-xs"><span className="text-muted-foreground">Root cause: </span>{r.root_cause}</p>}
                {r.recommendation && <p className="text-xs"><span className="text-muted-foreground">Recommendation: </span>{r.recommendation}</p>}
                {r.action ? (
                  <div className="rounded-md bg-muted/40 p-2 text-xs">
                    <span className="font-medium">Remediation action: </span>{r.action.title}
                    <span className="text-muted-foreground">
                      {' '}· {r.action.status}{r.action.due_date ? ` · due ${new Date(r.action.due_date).toLocaleDateString()}` : ''}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No remediation action linked.</p>
                )}
                {!readOnly && (
                  <div className="flex flex-wrap gap-2">
                    {!r.remediation_action_id && (
                      <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline" disabled={createAction.isPending}
                        onClick={() => createAction.mutate({ finding_id: r.id, due_date: r.target_date ?? null, description: r.recommendation ?? null })}>
                        <ClipboardList className="h-3.5 w-3.5 mr-1" />Create remediation action
                      </Button>
                    )}
                    {r.status !== 'closed' && (
                      <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline" onClick={() => closeFinding(r)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Close finding
                      </Button>
                    )}
                    <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" className="ml-auto" onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && (
          <div className="rounded-md border p-3 space-y-3 bg-muted/20">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <Label>Finding title</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target date</Label>
                <Input type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Category</Label>
                <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
              </div>
              <div>
                <Label>Criteria breached</Label>
                <Input value={form.criteria_breached} onChange={e => setForm(f => ({ ...f, criteria_breached: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Observation</Label>
              <Textarea rows={2} value={form.observation} onChange={e => setForm(f => ({ ...f, observation: e.target.value }))} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Root cause</Label>
                <Textarea rows={2} value={form.root_cause} onChange={e => setForm(f => ({ ...f, root_cause: e.target.value }))} />
              </div>
              <div>
                <Label>Recommendation</Label>
                <Textarea rows={2} value={form.recommendation} onChange={e => setForm(f => ({ ...f, recommendation: e.target.value }))} />
              </div>
            </div>
            <Button data-rbac="prudential_supervision.edit" size="sm" disabled={!form.title || save.isPending} onClick={add}>
              <Plus className="h-4 w-4 mr-1" />Add finding
            </Button>
          </div>
        )}
        {!readOnly && <StageActions />}
      </CardContent>
    </Card>
  );
}
