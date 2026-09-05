/**
 * Information requested from the entity during an examination.
 *
 * Requests carry their own reference, the person or function they were made to,
 * a priority and — where relevant — the scoped risk area they support. Issuing
 * a request and recording its response are governed operations, and what the
 * entity produced is linked from the central document register rather than
 * described only in free text.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import {
  useDataRequestMutations, useDataRequests, useExamination, useExaminationScopeDimensions,
} from '@/hooks/useExaminations';
import { StageActions, type StageActionsMode } from './ExaminationStageActions';
import { RecordDocumentLinks } from '@/components/supervision/RecordDocumentLinks';
import { engagementPhrasing } from '@/lib/supervisoryEngagement';
import { useExaminationEngagement } from '@/hooks/useExaminationEngagement';

type FilterKey = 'attention' | 'overdue' | 'draft' | 'issued' | 'received' | 'all';

const PRIORITIES = [
  { value: 'HIGH', label: 'High' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'LOW', label: 'Low' },
];

const isOutstanding = (r: any) => r.status !== 'received';
const isOverdue = (r: any) =>
  ['issued', 'partially_received'].includes(r.status) && r.due_date && new Date(r.due_date) < new Date();

const statusLabel = (r: any) =>
  r.status === 'received' ? 'Received'
    : r.status === 'partially_received' ? 'Partially received'
      : isOverdue(r) ? 'Overdue'
        : r.status === 'issued' ? 'Awaiting response'
          : 'Not yet sent';

const tone = (r: any) => {
  if (r.status === 'received') return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
  if (isOverdue(r)) return 'bg-destructive/10 text-destructive border-destructive/20';
  if (r.status === 'partially_received') return 'bg-warning/10 text-warning border-warning/20';
  if (r.status === 'issued') return 'bg-primary/10 text-primary border-primary/20';
  return 'bg-muted text-muted-foreground';
};

const EMPTY_FORM = {
  title: '', description: '', data_format: '', due_date: '',
  requested_from: '', priority: 'NORMAL', assessment_dimension_id: 'none',
};

export function DataRequestsPanel({
  examinationId, readOnly, mode = 'supporting',
}: { examinationId: string; readOnly?: boolean; mode?: StageActionsMode }) {
  const { data: rows = [], isLoading } = useDataRequests(examinationId);
  const engagement = useExaminationEngagement(examinationId);
  const { data: exam } = useExamination(examinationId);
  const { data: scopeDimensions = [] } = useExaminationScopeDimensions(examinationId);
  const { save, issue, receive, remove } = useDataRequestMutations(examinationId);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('attention');
  const [responseFor, setResponseFor] = useState<string | null>(null);
  const [response, setResponse] = useState<Record<string, string>>({});
  const [outstanding, setOutstanding] = useState<Record<string, string>>({});

  const set = (k: keyof typeof EMPTY_FORM) => (e: any) =>
    setForm(f => ({ ...f, [k]: typeof e === 'string' ? e : e.target.value }));

  const add = async () => {
    await save.mutateAsync({
      title: form.title,
      description: form.description || null,
      data_format: form.data_format || null,
      due_date: form.due_date || null,
      requested_from: form.requested_from || null,
      priority: form.priority,
      assessment_dimension_id: form.assessment_dimension_id === 'none' ? null : form.assessment_dimension_id,
    });
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
  };

  const record = (r: any, fully: boolean) => {
    receive.mutate({
      id: r.id,
      entity_response: response[r.id] ?? r.entity_response ?? null,
      outstanding_items: outstanding[r.id] ?? r.outstanding_items ?? null,
      fully_received: fully,
    });
    setResponseFor(null);
  };

  const counts = {
    total: rows.length,
    received: rows.filter((r: any) => r.status === 'received').length,
    awaiting: rows.filter((r: any) => ['issued', 'partially_received'].includes(r.status) && !isOverdue(r)).length,
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
      case 'issued': return ['issued', 'partially_received'].includes(r.status);
      case 'received': return r.status === 'received';
      default: return true;
    }
  });

  const dimensionLabel = (id?: string | null) => {
    const d = scopeDimensions.find(s => s.assessment_dimension_id === id);
    return d ? d.dimension_code.replace(/_/g, ' ') : null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Information requested from the entity</CardTitle>
        <p className="text-xs text-muted-foreground">
          {engagementPhrasing('The records and data the entity must provide before and during fieldwork.', engagement)}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border p-6 text-center space-y-2">
            <p className="text-sm font-medium">No information requests yet</p>
            <p className="text-xs text-muted-foreground">
              {engagementPhrasing('Create the information requests that must be sent to the entity before fieldwork.', engagement)}
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
                          {r.reference ? `${r.reference} · ` : r.item_no ? `${r.item_no}. ` : ''}{r.title}
                        </p>
                        {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                        <p className="text-xs text-muted-foreground">
                          {r.requested_from ? `Requested from ${r.requested_from} · ` : ''}
                          {r.priority && r.priority !== 'NORMAL' ? `${PRIORITIES.find(p => p.value === r.priority)?.label ?? r.priority} priority · ` : ''}
                          {r.data_format ? `Format: ${r.data_format} · ` : ''}
                          {r.due_date ? `Due ${new Date(r.due_date).toLocaleDateString()}` : 'No due date'}
                          {dimensionLabel(r.assessment_dimension_id) ? ` · Supports ${dimensionLabel(r.assessment_dimension_id)}` : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className={tone(r)}>{statusLabel(r)}</Badge>
                    </div>

                    {r.entity_response && (
                      <p className="text-xs"><span className="text-muted-foreground">Entity response: </span>{r.entity_response}</p>
                    )}
                    {r.outstanding_items && (
                      <p className="text-xs"><span className="text-muted-foreground">Still outstanding: </span>{r.outstanding_items}</p>
                    )}

                    {r.status !== 'draft' && (
                      <RecordDocumentLinks
                        targetType="examination_data_request"
                        targetId={r.id}
                        targetReference={r.reference}
                        entityId={(exam as any)?.entity_id}
                        disabled={readOnly}
                        label="Documents provided"
                      />
                    )}

                    {!readOnly && (
                      <>
                        {responseFor === r.id && (
                          <div className="space-y-2">
                            <div>
                              <Label className="text-xs" htmlFor={`resp-${r.id}`}>What did the entity provide?</Label>
                              <Textarea id={`resp-${r.id}`} rows={2} value={response[r.id] ?? r.entity_response ?? ''}
                                onChange={e => setResponse(s => ({ ...s, [r.id]: e.target.value }))} />
                            </div>
                            <div>
                              <Label className="text-xs" htmlFor={`out-${r.id}`}>Still outstanding (if partial)</Label>
                              <Textarea id={`out-${r.id}`} rows={2} value={outstanding[r.id] ?? r.outstanding_items ?? ''}
                                onChange={e => setOutstanding(s => ({ ...s, [r.id]: e.target.value }))} />
                            </div>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {r.status === 'draft' && (
                            <Button data-rbac="prudential_supervision.workflow_action" size="sm"
                              disabled={issue.isPending} onClick={() => issue.mutate({ id: r.id })}>
                              <Send className="h-3.5 w-3.5 mr-1" />Send request
                            </Button>
                          )}
                          {isOutstanding(r) && r.status !== 'draft' && (
                            responseFor === r.id ? (
                              <>
                                <Button data-rbac="prudential_supervision.edit" size="sm"
                                  disabled={receive.isPending} onClick={() => record(r, true)}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Fully received
                                </Button>
                                <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline"
                                  disabled={receive.isPending} onClick={() => record(r, false)}>
                                  Partially received
                                </Button>
                              </>
                            ) : (
                              <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline"
                                onClick={() => setResponseFor(r.id)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Record response
                              </Button>
                            )
                          )}
                          {r.status === 'draft' && (
                            <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" className="ml-auto"
                              aria-label="Remove request" onClick={() => remove.mutate(r.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
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
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="dr_title">What is being requested</Label>
                <Input id="dr_title" value={form.title} onChange={set('title')}
                  placeholder="List of high-risk customer relationships onboarded in 2025" />
              </div>
              <div>
                <Label htmlFor="dr_from">Requested from</Label>
                <Input id="dr_from" value={form.requested_from} onChange={set('requested_from')}
                  placeholder="Compliance Officer" />
              </div>
              <div>
                <Label htmlFor="dr_priority">Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger id="dr_priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dr_format">Format required</Label>
                <Input id="dr_format" value={form.data_format} onChange={set('data_format')} placeholder="Excel" />
              </div>
              <div>
                <Label htmlFor="dr_due">Response due</Label>
                <Input id="dr_due" type="date" value={form.due_date} onChange={set('due_date')} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="dr_dim">Risk area supported (optional)</Label>
                <Select value={form.assessment_dimension_id}
                  onValueChange={v => setForm(f => ({ ...f, assessment_dimension_id: v }))}>
                  <SelectTrigger id="dr_dim"><SelectValue placeholder="Not linked to a scoped risk area" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked to a scoped risk area</SelectItem>
                    {scopeDimensions.map(d => (
                      <SelectItem key={d.assessment_dimension_id} value={d.assessment_dimension_id}>
                        {d.dimension_code.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="dr_desc">Detail (optional)</Label>
              <Textarea id="dr_desc" rows={2} value={form.description} onChange={set('description')} />
            </div>
            <div className="flex gap-2">
              <Button data-rbac="prudential_supervision.edit" size="sm"
                disabled={!form.title || save.isPending} onClick={add}>
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
