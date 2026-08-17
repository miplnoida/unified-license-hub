import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { useDataRequestMutations, useDataRequests } from '@/hooks/useExaminations';
import { StageActions, type StageActionsMode } from './ExaminationStageActions';
import { dataRequestStatusLabel } from '@/lib/examinationWorkflow';

type FilterKey = 'attention' | 'overdue' | 'draft' | 'issued' | 'received' | 'all';

const isOverdue = (r: any) => r.status === 'issued' && r.due_date && new Date(r.due_date) < new Date();

const tone = (r: any) => {
  if (r.status === 'received') return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
  if (isOverdue(r)) return 'bg-destructive/10 text-destructive border-destructive/20';
  if (r.status === 'issued') return 'bg-primary/10 text-primary border-primary/20';
  return 'bg-muted text-muted-foreground';
};

export function DataRequestsPanel({ examinationId, readOnly, mode = 'supporting' }: { examinationId: string; readOnly?: boolean; mode?: StageActionsMode }) {
  const { data: rows = [], isLoading } = useDataRequests(examinationId);
  const { save, remove } = useDataRequestMutations(examinationId);
  const [form, setForm] = useState({ title: '', description: '', data_format: '', due_date: '' });
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('attention');
  const [responseFor, setResponseFor] = useState<string | null>(null);
  const [response, setResponse] = useState<Record<string, string>>({});

  const add = async () => {
    await save.mutateAsync({
      item_no: rows.length + 1,
      title: form.title,
      description: form.description || null,
      data_format: form.data_format || null,
      due_date: form.due_date || null,
      status: 'draft',
    });
    setForm({ title: '', description: '', data_format: '', due_date: '' });
    setShowForm(false);
  };

  const issue = (r: any) => save.mutate({ id: r.id, status: 'issued', issued_at: new Date().toISOString() });
  const markReceived = (r: any) => {
    save.mutate({
      id: r.id,
      status: 'received',
      received_at: new Date().toISOString(),
      entity_response: response[r.id] ?? r.entity_response ?? null,
    });
    setResponseFor(null);
  };

  const counts = {
    total: rows.length,
    received: rows.filter((r: any) => r.status === 'received').length,
    awaiting: rows.filter((r: any) => r.status === 'issued' && !isOverdue(r)).length,
    overdue: rows.filter(isOverdue).length,
    draft: rows.filter((r: any) => r.status === 'draft').length,
  };

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: 'attention', label: 'Needs attention', count: counts.draft + counts.overdue },
    { key: 'overdue', label: 'Overdue', count: counts.overdue },
    { key: 'draft', label: 'Not yet sent', count: counts.draft },
    { key: 'issued', label: 'Awaiting response', count: counts.awaiting },
    { key: 'received', label: 'Received', count: counts.received },
    { key: 'all', label: 'All', count: counts.total },
  ];

  const visible = rows.filter((r: any) => {
    switch (filter) {
      case 'attention': return r.status === 'draft' || isOverdue(r);
      case 'overdue': return isOverdue(r);
      case 'draft': return r.status === 'draft';
      case 'issued': return r.status === 'issued';
      case 'received': return r.status === 'received';
      default: return true;
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Information requested from the entity</CardTitle>
        <p className="text-xs text-muted-foreground">
          The records and data the entity must provide before and during fieldwork.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border p-6 text-center space-y-2">
            <p className="text-sm font-medium">No data requests yet</p>
            <p className="text-xs text-muted-foreground">
              Create the information requests that must be sent to the entity before fieldwork.
            </p>
            {!readOnly && (
              <Button data-rbac="prudential_supervision.edit" size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" />Add request
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-5 text-center">
              {[
                { label: 'Requests', value: counts.total },
                { label: 'Received', value: counts.received },
                { label: 'Awaiting response', value: counts.awaiting },
                { label: 'Overdue', value: counts.overdue },
                { label: 'Not yet sent', value: counts.draft },
              ].map(m => (
                <div key={m.label} className="rounded-md border p-2">
                  <p className="text-lg font-semibold">{m.value}</p>
                  <p className="text-[11px] text-muted-foreground">{m.label}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter requests">
              {filters.map(f => (
                <Button key={f.key} size="sm" variant={filter === f.key ? 'default' : 'outline'}
                  onClick={() => setFilter(f.key)}>
                  {f.label} ({f.count})
                </Button>
              ))}
            </div>

            {visible.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nothing in this view.</p>
            ) : (
              <div className="space-y-2">
                {visible.map((r: any) => (
                  <div key={r.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {r.item_no ? `${r.item_no}. ` : ''}{r.title}
                        </p>
                        {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                        <p className="text-xs text-muted-foreground">
                          {r.data_format ? `Format: ${r.data_format} · ` : ''}
                          {r.due_date ? `Due ${new Date(r.due_date).toLocaleDateString()}` : 'No due date'}
                        </p>
                      </div>
                      <Badge variant="outline" className={tone(r)}>{dataRequestStatusLabel(r)}</Badge>
                    </div>

                    {r.entity_response && (
                      <p className="text-xs"><span className="text-muted-foreground">Entity response: </span>{r.entity_response}</p>
                    )}

                    {!readOnly && (
                      <>
                        {responseFor === r.id && (
                          <div>
                            <Label className="text-xs" htmlFor={`resp-${r.id}`}>What did the entity provide? (optional)</Label>
                            <Textarea id={`resp-${r.id}`} rows={2} value={response[r.id] ?? r.entity_response ?? ''}
                              onChange={e => setResponse(s => ({ ...s, [r.id]: e.target.value }))} />
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {r.status === 'draft' && (
                            <Button data-rbac="prudential_supervision.workflow_action" size="sm" onClick={() => issue(r)}>
                              <Send className="h-3.5 w-3.5 mr-1" />Send request
                            </Button>
                          )}
                          {r.status !== 'received' && (
                            responseFor === r.id ? (
                              <Button data-rbac="prudential_supervision.edit" size="sm" onClick={() => markReceived(r)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Confirm received
                              </Button>
                            ) : (
                              <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline"
                                onClick={() => setResponseFor(r.id)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Mark as received
                              </Button>
                            )
                          )}
                          <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" className="ml-auto"
                            aria-label="Remove request" onClick={() => remove.mutate(r.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!readOnly && !showForm && (
              <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" />Add request
              </Button>
            )}
          </>
        )}

        {!readOnly && showForm && (
          <div className="rounded-md border p-3 space-y-3 bg-muted/20">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <Label htmlFor="dr_title">What are you asking for?</Label>
                <Input id="dr_title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Loan portfolio listing as at year end" />
              </div>
              <div>
                <Label htmlFor="dr_due">Response due by</Label>
                <Input id="dr_due" type="date" value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <Label htmlFor="dr_desc">Further detail (optional)</Label>
                <Textarea id="dr_desc" rows={2} value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="dr_format">Preferred format</Label>
                <Input id="dr_format" placeholder="Excel, PDF, extract…" value={form.data_format}
                  onChange={e => setForm(f => ({ ...f, data_format: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button data-rbac="prudential_supervision.edit" size="sm" disabled={!form.title || save.isPending} onClick={add}>
                <Plus className="h-4 w-4 mr-1" />Add request
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
