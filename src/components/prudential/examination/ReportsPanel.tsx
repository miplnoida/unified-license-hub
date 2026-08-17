import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, CheckCircle2, FileText, Loader2, Plus, Send, UserCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useExaminationReports, useReportMutations } from '@/hooks/useExaminations';
import { StageActions, type StageActionsMode } from './ExaminationStageActions';
import { REPORT_STEPS, reportStatusLabel, reportStepIndex } from '@/lib/examinationWorkflow';

function ReportStepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Report progress">
      {REPORT_STEPS.map((s, i) => {
        const done = current > i;
        const active = current === i;
        return (
          <li key={s.key}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
              active ? 'border-primary bg-primary/10 text-primary'
                : done ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700'
                  : 'border-border bg-muted text-muted-foreground'
            }`}>
            {done && <Check className="h-3 w-3" />}{s.label}
          </li>
        );
      })}
    </ol>
  );
}

export function ReportsPanel({ examinationId, readOnly, mode = 'supporting' }: { examinationId: string; readOnly?: boolean; mode?: StageActionsMode }) {
  const { data: rows = [], isLoading } = useExaminationReports(examinationId);
  const { save } = useReportMutations(examinationId);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ report_type: 'draft', title: '', executive_summary: '', content: '', response_due_date: '' });
  const [responses, setResponses] = useState<Record<string, string>>({});

  const add = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const sameType = rows.filter((r: any) => r.report_type === form.report_type).length;
    await save.mutateAsync({
      report_type: form.report_type,
      version: sameType + 1,
      title: form.title || null,
      executive_summary: form.executive_summary || null,
      content: form.content || null,
      response_due_date: form.response_due_date || null,
      status: 'draft',
      prepared_by: auth?.user?.id ?? null,
      prepared_at: new Date().toISOString(),
    });
    setForm({ report_type: 'draft', title: '', executive_summary: '', content: '', response_due_date: '' });
    setShowForm(false);
  };

  const act = async (r: any, action: 'review' | 'approve' | 'issue') => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? null;
    if (action === 'review') {
      save.mutate({ id: r.id, status: 'in_review', reviewed_by: uid, reviewed_at: new Date().toISOString() });
    } else if (action === 'approve') {
      save.mutate({ id: r.id, status: 'approved', approved_by: uid, approved_at: new Date().toISOString() });
    } else {
      save.mutate({ id: r.id, status: 'issued', issued_at: new Date().toISOString() });
    }
  };

  const recordResponse = async (r: any) => {
    const { data: auth } = await supabase.auth.getUser();
    save.mutate({
      id: r.id,
      management_response: responses[r.id] ?? r.management_response ?? null,
      management_response_at: new Date().toISOString(),
      management_response_by: auth?.user?.id ?? null,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Examination reports</CardTitle>
        <p className="text-xs text-muted-foreground">
          Prepare the report, have it reviewed and approved, issue it to the entity, then record their response.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border p-6 text-center space-y-2">
            <p className="text-sm font-medium">No report has been prepared yet</p>
            <p className="text-xs text-muted-foreground">
              Prepare the draft report so it can be reviewed, approved and issued to the entity.
            </p>
            {!readOnly && (
              <Button data-rbac="prudential_supervision.edit" size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" />Prepare report
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r: any) => {
              const step = reportStepIndex(r);
              const awaitingResponse = r.status === 'issued' && !r.management_response;
              return (
                <div key={r.id} className="rounded-md border p-3 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <div className="text-sm font-medium">
                          {r.title || (r.report_type === 'final' ? 'Final report' : 'Draft report')}
                        </div>
                        <p className="text-xs text-muted-foreground capitalize">
                          {r.report_type} report · version {r.version}
                          {r.response_due_date ? ` · response due ${new Date(r.response_due_date).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{reportStatusLabel(r)}</Badge>
                  </div>

                  <ReportStepper current={step} />

                  {r.executive_summary && <p className="text-xs whitespace-pre-wrap">{r.executive_summary}</p>}

                  {(r.management_response || awaitingResponse) && (
                    <div>
                      <Label className="text-xs" htmlFor={`mr-${r.id}`}>Management response</Label>
                      {readOnly ? (
                        <p className="text-xs">{r.management_response || '—'}</p>
                      ) : (
                        <Textarea id={`mr-${r.id}`} rows={2} value={responses[r.id] ?? r.management_response ?? ''}
                          onChange={e => setResponses(s => ({ ...s, [r.id]: e.target.value }))} />
                      )}
                    </div>
                  )}

                  {!readOnly && (
                    <div className="flex flex-wrap gap-2">
                      {r.status === 'draft' && (
                        <Button data-rbac="prudential_supervision.workflow_action" size="sm" onClick={() => act(r, 'review')}>
                          <UserCheck className="h-3.5 w-3.5 mr-1" />Send for review
                        </Button>
                      )}
                      {r.status === 'in_review' && (
                        <Button data-rbac="prudential_supervision.workflow_action" size="sm" onClick={() => act(r, 'approve')}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve report
                        </Button>
                      )}
                      {r.status === 'approved' && (
                        <Button data-rbac="prudential_supervision.workflow_action" size="sm" onClick={() => act(r, 'issue')}>
                          <Send className="h-3.5 w-3.5 mr-1" />Issue to entity
                        </Button>
                      )}
                      {(awaitingResponse || r.management_response) && (
                        <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => recordResponse(r)}>
                          Save management response
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!readOnly && !showForm && (
              <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" />Prepare another report
              </Button>
            )}
          </div>
        )}

        {!readOnly && showForm && (
          <div className="rounded-md border p-3 space-y-3 bg-muted/20">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label htmlFor="rp_type">Report type</Label>
                <Select value={form.report_type} onValueChange={v => setForm(f => ({ ...f, report_type: v }))}>
                  <SelectTrigger id="rp_type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft report</SelectItem>
                    <SelectItem value="final">Final report</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rp_title">Title</Label>
                <Input id="rp_title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="rp_due">Entity response due by</Label>
                <Input id="rp_due" type="date" value={form.response_due_date}
                  onChange={e => setForm(f => ({ ...f, response_due_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="rp_sum">Executive summary</Label>
              <Textarea id="rp_sum" rows={3} value={form.executive_summary}
                onChange={e => setForm(f => ({ ...f, executive_summary: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="rp_content">Report content</Label>
              <Textarea id="rp_content" rows={4} value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <Button data-rbac="prudential_supervision.edit" size="sm" disabled={save.isPending} onClick={add}>
                <Plus className="h-4 w-4 mr-1" />Prepare report
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
