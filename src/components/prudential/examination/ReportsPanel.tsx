import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, FileText, Loader2, Plus, Send, UserCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useExaminationReports, useReportMutations } from '@/hooks/useExaminations';

export function ReportsPanel({ examinationId, readOnly }: { examinationId: string; readOnly?: boolean }) {
  const { data: rows = [], isLoading } = useExaminationReports(examinationId);
  const { save } = useReportMutations(examinationId);
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
      <CardHeader><CardTitle className="text-base">Reports &amp; management response</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports prepared yet.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r: any) => (
              <div key={r.id} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-sm font-medium">{r.title || `${r.report_type} report`}</div>
                      <p className="text-xs text-muted-foreground capitalize">
                        {r.report_type} · v{r.version}
                        {r.response_due_date ? ` · response due ${new Date(r.response_due_date).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">{r.status.replace('_', ' ')}</Badge>
                </div>
                {r.executive_summary && <p className="text-xs whitespace-pre-wrap">{r.executive_summary}</p>}
                <div>
                  <Label className="text-xs">Management response</Label>
                  {readOnly ? (
                    <p className="text-xs">{r.management_response || '—'}</p>
                  ) : (
                    <Textarea rows={2} value={responses[r.id] ?? r.management_response ?? ''}
                      onChange={e => setResponses(s => ({ ...s, [r.id]: e.target.value }))} />
                  )}
                </div>
                {!readOnly && (
                  <div className="flex flex-wrap gap-2">
                    {r.status === 'draft' && (
                      <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline" onClick={() => act(r, 'review')}>
                        <UserCheck className="h-3.5 w-3.5 mr-1" />Send for review
                      </Button>
                    )}
                    {r.status === 'in_review' && (
                      <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline" onClick={() => act(r, 'approve')}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve
                      </Button>
                    )}
                    {r.status === 'approved' && (
                      <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline" onClick={() => act(r, 'issue')}>
                        <Send className="h-3.5 w-3.5 mr-1" />Issue to entity
                      </Button>
                    )}
                    <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" onClick={() => recordResponse(r)}>
                      Save response
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && (
          <div className="rounded-md border p-3 space-y-3 bg-muted/20">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Report type</Label>
                <Select value={form.report_type} onValueChange={v => setForm(f => ({ ...f, report_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft report</SelectItem>
                    <SelectItem value="final">Final report</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Title</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <Label>Response due date</Label>
                <Input type="date" value={form.response_due_date}
                  onChange={e => setForm(f => ({ ...f, response_due_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Executive summary</Label>
              <Textarea rows={3} value={form.executive_summary}
                onChange={e => setForm(f => ({ ...f, executive_summary: e.target.value }))} />
            </div>
            <div>
              <Label>Report content</Label>
              <Textarea rows={4} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
            </div>
            <Button data-rbac="prudential_supervision.edit" size="sm" disabled={save.isPending} onClick={add}>
              <Plus className="h-4 w-4 mr-1" />Prepare report
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
