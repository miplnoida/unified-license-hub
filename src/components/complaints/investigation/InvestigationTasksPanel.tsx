/**
 * MC-03 — Investigation work items.
 *
 * Work items record how the investigation is being carried out. They never move
 * the complaint: phase progression is driven by the domain decisions (plan
 * approval, allegation outcomes, outcome readiness). Mandatory items do block
 * outcome review — that rule is enforced server-side in
 * `complaint_investigation_readiness`.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CheckCircle2, Circle, Clock, ListChecks, Loader2, MoreHorizontal, OctagonPause, Plus } from 'lucide-react';
import { SectionState } from '@/components/complaints/DataState';
import { formatDateOnly } from '@/lib/datetime';
import {
  investigationOps,
  useInvestigationMutation,
  type InvestigationWorkspace,
} from '@/hooks/useComplaintInvestigation';

interface Props { complaintId: string; workspace: InvestigationWorkspace }

const STATUS_META: Record<string, { label: string; icon: typeof Circle; className: string }> = {
  NOT_STARTED: { label: 'Not started', icon: Circle, className: 'text-muted-foreground' },
  IN_PROGRESS: { label: 'Being worked on', icon: Clock, className: 'text-primary' },
  BLOCKED: { label: 'Blocked', icon: OctagonPause, className: 'text-destructive' },
  COMPLETED: { label: 'Done', icon: CheckCircle2, className: 'text-emerald-600' },
  CANCELLED: { label: 'No longer required', icon: Circle, className: 'text-muted-foreground' },
};

const KINDS = [
  { value: 'GENERAL', label: 'General' },
  { value: 'EVIDENCE', label: 'Evidence gathering' },
  { value: 'ANALYSIS', label: 'Analysis' },
  { value: 'CONTACT', label: 'Contact a party' },
  { value: 'REVIEW', label: 'Internal review' },
];

const meta = (s: string) => STATUS_META[String(s ?? '').toUpperCase()] ?? STATUS_META.NOT_STARTED;

export function InvestigationTasksPanel({ complaintId, workspace }: Props) {
  const { tasks, allegations, capabilities } = workspace;
  const canManage = capabilities.can_manage_tasks;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    title: '', description: '', due_date: '', task_kind: 'GENERAL',
    priority: 'NORMAL', is_mandatory: false, allegation_id: '',
  });

  const saveMut = useInvestigationMutation(complaintId, (payload: Record<string, unknown>) =>
    investigationOps.investigationTaskSave(payload),
  );

  const run = async (p: Promise<unknown>, ok: string) => {
    try { await p; toast.success(ok); } catch (e: any) { toast.error(e?.message ?? 'That could not be saved'); }
  };

  const active = tasks.filter((t) => meta(t.status).label !== 'No longer required');
  const done = active.filter((t) => String(t.status).toUpperCase() === 'COMPLETED').length;
  const mandatoryOpen = tasks.filter(
    (t) => t.is_mandatory && !['COMPLETED', 'CANCELLED'].includes(String(t.status).toUpperCase()),
  ).length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4" />Work items</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            How the investigation is being carried out. {done} of {active.length} done
            {mandatoryOpen > 0 && ` · ${mandatoryOpen} mandatory item${mandatoryOpen === 1 ? '' : 's'} still open`}.
          </p>
        </div>
        {canManage && (
          <Button size="sm" variant={adding ? 'outline' : 'default'} onClick={() => setAdding((v) => !v)}>
            <Plus className="h-3.5 w-3.5 mr-1" />{adding ? 'Cancel' : 'Add work item'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {adding && canManage && (
          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="task-title" className="text-xs">What needs to be done</Label>
              <Input id="task-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="task-desc" className="text-xs">Details</Label>
              <Textarea id="task-desc" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="task-due" className="text-xs">Due by</Label>
              <Input id="task-due" type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Type of work</Label>
              <Select value={draft.task_kind} onValueChange={(v) => setDraft({ ...draft, task_kind: v })}>
                <SelectTrigger aria-label="Type of work"><SelectValue /></SelectTrigger>
                <SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Related allegation</Label>
              <Select value={draft.allegation_id || 'none'} onValueChange={(v) => setDraft({ ...draft, allegation_id: v === 'none' ? '' : v })}>
                <SelectTrigger aria-label="Related allegation"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not allegation-specific</SelectItem>
                  {allegations.map((a) => (
                    <SelectItem key={a.id} value={a.id}>A{a.allegation_number} — {a.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-end gap-2 text-xs pb-2">
              <Checkbox checked={draft.is_mandatory} onCheckedChange={(v) => setDraft({ ...draft, is_mandatory: Boolean(v) })} />
              Must be completed before outcome review
            </label>
            <div className="sm:col-span-2">
              <Button
                data-rbac="complaint_management.investigate"
                size="sm"
                disabled={saveMut.isPending || draft.title.trim().length === 0}
                onClick={async () => {
                  await run(saveMut.mutateAsync({
                    complaint_id: complaintId,
                    title: draft.title.trim(),
                    description: draft.description.trim() || null,
                    due_date: draft.due_date || null,
                    task_kind: draft.task_kind,
                    priority: draft.priority,
                    is_mandatory: draft.is_mandatory,
                    allegation_id: draft.allegation_id || null,
                  }), 'Work item added');
                  setAdding(false);
                  setDraft({
                    title: '', description: '', due_date: '', task_kind: 'GENERAL',
                    priority: 'NORMAL', is_mandatory: false, allegation_id: '',
                  });
                }}
              >
                {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Add work item
              </Button>
            </div>
          </div>
        )}

        <SectionState
          isLoading={false}
          isError={false}
          isEmpty={tasks.length === 0}
          noun="work items"
          emptyText="No work items have been recorded for this investigation."
        >
          <ul className="space-y-2">
            {tasks.map((t) => {
              const m = meta(t.status);
              const Icon = m.icon;
              const allegation = allegations.find((a) => a.id === t.allegation_id);
              const closed = ['COMPLETED', 'CANCELLED'].includes(String(t.status).toUpperCase());
              return (
                <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className={`h-4 w-4 shrink-0 ${m.className}`} />
                      <p className={`text-sm font-medium ${closed ? 'text-muted-foreground' : ''}`}>{t.title}</p>
                      <Badge variant="outline" className="text-[10px]">{m.label}</Badge>
                      {t.is_mandatory && <Badge variant="secondary" className="text-[10px]">Mandatory</Badge>}
                      {allegation && <Badge variant="outline" className="text-[10px]">A{allegation.allegation_number}</Badge>}
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{t.description}</p>}
                    <p className="text-xs text-muted-foreground">
                      {t.due_date ? `Due ${formatDateOnly(t.due_date)}` : 'No due date'}
                      {t.task_kind ? ` · ${KINDS.find((k) => k.value === t.task_kind)?.label ?? t.task_kind}` : ''}
                    </p>
                    {t.blocked_reason && <p className="text-xs text-destructive">Blocked: {t.blocked_reason}</p>}
                    {t.completion_note && <p className="text-xs text-muted-foreground">Outcome: {t.completion_note}</p>}
                  </div>

                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Update ${t.title}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {String(t.status).toUpperCase() !== 'IN_PROGRESS' && !closed && (
                          <DropdownMenuItem data-rbac="complaint_management.edit"
                            onClick={() => run(saveMut.mutateAsync({
                              id: t.id, status: 'IN_PROGRESS', expected_row_version: t.row_version,
                            }), 'Work item updated')}
                          >
                            Mark as being worked on
                          </DropdownMenuItem>
                        )}
                        {!closed && (
                          <DropdownMenuItem data-rbac="complaint_management.edit"
                            onClick={async () => {
                              const res = await Swal.fire({
                                title: 'Mark this work item done?',
                                input: 'textarea', inputPlaceholder: 'What was the outcome? (optional)',
                                icon: 'question', showCancelButton: true, confirmButtonText: 'Mark done',
                              });
                              if (!res.isConfirmed) return;
                              await run(saveMut.mutateAsync({
                                id: t.id, status: 'COMPLETED',
                                completion_note: (res.value as string) || null,
                                expected_row_version: t.row_version,
                              }), 'Work item completed');
                            }}
                          >
                            Mark as done
                          </DropdownMenuItem>
                        )}
                        {!closed && (
                          <DropdownMenuItem data-rbac="complaint_management.edit"
                            onClick={async () => {
                              const res = await Swal.fire({
                                title: 'What is blocking this item?',
                                input: 'textarea',
                                inputValidator: (v) => (String(v ?? '').trim().length < 5 ? 'Give a short reason' : undefined),
                                showCancelButton: true, confirmButtonText: 'Mark blocked',
                              });
                              if (!res.isConfirmed) return;
                              await run(saveMut.mutateAsync({
                                id: t.id, status: 'BLOCKED', blocked_reason: String(res.value).trim(),
                                expected_row_version: t.row_version,
                              }), 'Work item marked blocked');
                            }}
                          >
                            Mark as blocked
                          </DropdownMenuItem>
                        )}
                        {!closed && (
                          <DropdownMenuItem data-rbac="complaint_management.edit"
                            onClick={() => run(saveMut.mutateAsync({
                              id: t.id, status: 'CANCELLED', expected_row_version: t.row_version,
                            }), 'Work item cancelled')}
                          >
                            No longer required
                          </DropdownMenuItem>
                        )}
                        {closed && (
                          <DropdownMenuItem data-rbac="complaint_management.edit"
                            onClick={() => run(saveMut.mutateAsync({
                              id: t.id, status: 'IN_PROGRESS', expected_row_version: t.row_version,
                            }), 'Work item reopened')}
                          >
                            Reopen
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ul>
        </SectionState>
      </CardContent>
    </Card>
  );
}

export default InvestigationTasksPanel;
