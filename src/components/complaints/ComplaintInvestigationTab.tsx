/**
 * Investigation (Case work → Investigation).
 *
 * Two things live here and NEITHER moves the complaint:
 *  - the investigation checklist (supporting work items), and
 *  - the investigator's internal note book.
 * The complaint lifecycle moves exclusively through the configured Complaint
 * Management Workflow action on the "Current step" tab. Editing availability is
 * derived from that same configured workflow via `deriveInvestigationMode` —
 * no step-name or status matching happens here.
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { complaintTaskCreate, complaintTaskSetStatus } from '@/lib/conductGovernedOps';

import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Swal from 'sweetalert2';
import { CheckCircle2, ChevronDown, Circle, Clock, FileText, Info, Loader2, MoreHorizontal, NotebookPen } from 'lucide-react';

import { logAction } from '@/hooks/useAuditLog';
import { SectionState } from '@/components/complaints/DataState';
import { formatDateTime } from '@/lib/datetime';
import { useComplaintCurrentStepData } from '@/components/complaints/ComplaintCurrentStepPanel';
import { deriveInvestigationMode } from '@/lib/complaintWorkflow';

interface Props { complaintId: string; complaintStatus: string; }

const TASK_STATUS_META: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: 'Not started', icon: Circle, className: 'text-muted-foreground' },
  in_progress: { label: 'Being worked on', icon: Clock, className: 'text-blue-600' },
  completed: { label: 'Done', icon: CheckCircle2, className: 'text-green-600' },
  cancelled: { label: 'No longer required', icon: Circle, className: 'text-red-600' },
};

const DIRECTION_LABEL: Record<string, string> = {
  inbound: 'Received',
  outbound: 'Sent by the regulator',
};

export default function ComplaintInvestigationTab({ complaintId, complaintStatus }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Work items
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDue, setTaskDue] = useState('');

  // Internal note
  const [noteBody, setNoteBody] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  // Shared, already-cached workflow context (tracking + actions + tasks).
  const { trackingQ, actionsQ, tasksQ } = useComplaintCurrentStepData(complaintId);

  const correspondenceQ = useQuery({
    queryKey: ['complaint_correspondence', complaintId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('complaint_correspondence')
        .select('*').eq('complaint_id', complaintId).order('created_at', { ascending: false });
      if (error) throw error;
      const authorIds = Array.from(new Set((data ?? []).map((r: any) => r.author_id).filter(Boolean)));
      const map = new Map<string, string>();
      if (authorIds.length) {
        const { data: profs, error: profErr } = await supabase.from('profiles').select('id, full_name, email').in('id', authorIds);
        if (profErr) throw profErr;
        (profs ?? []).forEach((p: any) => map.set(p.id, p.full_name || p.email));
      }
      return (data ?? []).map((r: any) => ({ ...r, author_name: r.author_id ? map.get(r.author_id) || 'Staff' : 'System' }));
    },
  });

  const tasks = (tasksQ.data ?? []) as any[];
  const notes = useMemo(
    () => (correspondenceQ.data ?? []).filter((r: any) => r.direction === 'internal_note'),
    [correspondenceQ.data],
  );
  const historical = useMemo(
    () => (correspondenceQ.data ?? []).filter((r: any) => r.direction !== 'internal_note'),
    [correspondenceQ.data],
  );

  const contextUnknown =
    trackingQ.isLoading || trackingQ.isError || actionsQ.isLoading || actionsQ.isError;

  const mode = deriveInvestigationMode({
    tracking: trackingQ.data,
    actions: actionsQ.data,
    status: complaintStatus,
    hasRecords: tasks.length > 0 || (correspondenceQ.data ?? []).length > 0,
    contextUnknown,
  });
  const canEdit = mode === 'active';

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['complaint_tasks', complaintId] });
    qc.invalidateQueries({ queryKey: ['complaint_correspondence', complaintId] });
    qc.invalidateQueries({ queryKey: ['complaint', complaintId] });
  };

  const addTask = useMutation({
    mutationFn: async () => {
      if (!taskTitle.trim()) throw new Error('Please describe the work item');
      // Governed: owner/creator attribution and audit are server-side.
      await complaintTaskCreate({
        complaintId,
        title: taskTitle.trim(),
        description: taskDesc.trim() || null,
        dueDate: taskDue || null,
      });
      await logAction('complaint.investigation_task_created', 'complaint', complaintId, { meta: { title: taskTitle.trim() } });
    },
    onSuccess: () => {
      toast.success('Work item added');
      setTaskTitle(''); setTaskDesc(''); setTaskDue('');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Work-item status only. This NEVER touches the complaint lifecycle.
  const AUDIT_LABEL: Record<string, string> = {
    in_progress: 'complaint.investigation_task_marked_in_progress',
    completed: 'complaint.investigation_task_completed',
    cancelled: 'complaint.investigation_task_cancelled',
    pending: 'complaint.investigation_task_reopened',
  };

  const setTaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // Governed: completion attribution and audit are server-side.
      await complaintTaskSetStatus(id, status);
      await logAction(AUDIT_LABEL[status] ?? 'complaint.investigation_task_updated', 'complaint', complaintId, { meta: { task_id: id, task_status: status } });
    },

    onSuccess: () => { toast.success('Work item updated — the complaint itself is unchanged'); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      if (noteBody.trim().length < 3) throw new Error('Please write the note');
      const { error } = await (supabase.from('complaint_correspondence') as any).insert({
        complaint_id: complaintId,
        direction: 'internal_note',
        subject: null,
        body: noteBody.trim(),
        author_id: user?.id ?? null,
      });
      if (error) throw error;
      await logAction('complaint.internal_investigation_note_added', 'complaint', complaintId);
    },
    onSuccess: () => {
      toast.success('Internal note added');
      setNoteBody('');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const modeNotice =
    mode === 'not_relevant'
      ? 'Investigation work is not required at the current complaint step. Any existing investigation records remain available below for reference.'
      : mode === 'read_only'
        ? 'Investigation records are read-only at the current complaint step.'
        : null;

  const doneCount = tasks.filter((t: any) => t.status === 'completed').length;
  const activeCount = tasks.filter((t: any) => t.status !== 'cancelled').length;

  return (
    <div className="space-y-4">
      {modeNotice && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">{modeNotice}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Work items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Investigation checklist</CardTitle>
            <p className="text-xs text-muted-foreground">
              These work items record investigation progress only. The complaint moves to its next stage from{' '}
              <strong>Current step</strong>.
            </p>
            {!tasksQ.isLoading && !tasksQ.isError && activeCount > 0 && (
              <p className="text-xs font-medium mt-1">{doneCount} of {activeCount} work items done</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {canEdit && (
              <div className="space-y-2 border-b pb-4">
                <Input placeholder="What needs to be done?" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} />
                <Textarea placeholder="Details (optional)" rows={2} value={taskDesc} onChange={e => setTaskDesc(e.target.value)} />
                <div className="flex gap-2">
                  <Input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} className="flex-1" />
                  <Button data-rbac="complaint_management.edit" onClick={() => addTask.mutate()} disabled={addTask.isPending}>
                    {addTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add work item'}
                  </Button>
                </div>
              </div>
            )}

            <SectionState
              isLoading={tasksQ.isLoading}
              isError={tasksQ.isError}
              isEmpty={tasks.length === 0}
              noun="investigation work items"
              onRetry={() => tasksQ.refetch()}
              emptyText="No work items recorded yet."
            >
              <ul className="space-y-3">
                {tasks.map((t: any) => {
                  const meta = TASK_STATUS_META[t.status] || TASK_STATUS_META.pending;
                  const Icon = meta.icon;
                  const overdue = t.due_date && t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.due_date) < new Date();
                  return (
                    <li key={t.id} className="flex items-start gap-3 border rounded-md p-3">
                      <Icon className={`h-4 w-4 mt-0.5 ${meta.className}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{t.title}</p>
                          <Badge variant="outline" className="text-xs">{meta.label}</Badge>
                          {overdue && <Badge variant="destructive" className="text-xs">Overdue</Badge>}
                        </div>
                        {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                        {t.due_date && <p className="text-xs text-muted-foreground mt-1">Due {new Date(t.due_date).toLocaleDateString()}</p>}
                        {canEdit && t.status !== 'completed' && t.status !== 'cancelled' && (
                          <div className="flex items-center gap-1 mt-2">
                            {t.status !== 'in_progress' && (
                              <Button data-rbac="complaint_management.edit" size="sm" variant="ghost" onClick={() => setTaskStatus.mutate({ id: t.id, status: 'in_progress' })}>Mark as being worked on</Button>
                            )}
                            <Button data-rbac="complaint_management.edit" size="sm" variant="ghost" onClick={() => setTaskStatus.mutate({ id: t.id, status: 'completed' })}>Mark work item done</Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="More options">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={async () => {
                                    const res = await Swal.fire({
                                      title: 'Mark as no longer required?',
                                      text: 'This changes only this investigation work item. The complaint itself is not affected.',
                                      icon: 'warning',
                                      showCancelButton: true,
                                      confirmButtonText: 'Yes, no longer required',
                                      cancelButtonText: 'Keep it',
                                    });
                                    if (res.isConfirmed) setTaskStatus.mutate({ id: t.id, status: 'cancelled' });
                                  }}
                                >
                                  No longer required
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                        {canEdit && (t.status === 'completed' || t.status === 'cancelled') && (
                          <div className="mt-2">
                            <Button data-rbac="complaint_management.edit" size="sm" variant="ghost" onClick={() => setTaskStatus.mutate({ id: t.id, status: 'pending' })}>Reopen work item</Button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </SectionState>
          </CardContent>
        </Card>

        {/* Internal investigation notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><NotebookPen className="h-4 w-4" /> Internal investigation notes</CardTitle>
            <p className="text-xs text-muted-foreground">
              Record internal observations, findings and investigation notes. These notes are{' '}
              <strong>not sent to the complainant or entity</strong>. External communication is handled under{' '}
              <strong>Evidence &amp; communications</strong>.
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            {canEdit && (
              <div className="space-y-2 border-b pb-4">
                <Label htmlFor="investigation-note" className="text-xs">Note</Label>
                <Textarea
                  id="investigation-note"
                  rows={3}
                  placeholder="What did you observe, check or find?"
                  value={noteBody}
                  onChange={e => setNoteBody(e.target.value)}
                />
                <Button data-rbac="complaint_management.edit" onClick={() => addNote.mutate()} disabled={addNote.isPending} className="w-full">
                  {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add note'}
                </Button>
              </div>
            )}

            <SectionState
              isLoading={correspondenceQ.isLoading}
              isError={correspondenceQ.isError}
              isEmpty={notes.length === 0}
              noun="investigation notes"
              onRetry={() => correspondenceQ.refetch()}
              emptyText="No internal notes recorded yet."
            >
              <ul className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                {notes.map((c: any) => (
                  <li key={c.id} className="border-l-2 border-muted pl-3">
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(c.created_at)} — {c.author_name}
                    </p>
                    <p className="text-sm whitespace-pre-wrap mt-1">{c.body}</p>
                  </li>
                ))}
              </ul>
            </SectionState>

            {historical.length > 0 && (
              <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    Historical correspondence recorded in the previous complaint process. New external communication is
                    managed under <strong>Evidence &amp; communications</strong>.
                  </p>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="mt-2">
                      <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
                      {historyOpen ? 'Hide historical correspondence' : `View historical correspondence (${historical.length})`}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="space-y-3 mt-3 max-h-[320px] overflow-y-auto pr-1">
                      {historical.map((c: any) => (
                        <li key={c.id} className="rounded-md border bg-muted/30 p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {DIRECTION_LABEL[c.direction] ?? String(c.direction ?? '').replace(/_/g, ' ')}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(c.created_at)} — {c.author_name}
                            </span>
                          </div>
                          {c.subject && <p className="font-medium text-xs mt-1">{c.subject}</p>}
                          <p className="text-sm whitespace-pre-wrap mt-1">{c.body}</p>
                        </li>
                      ))}
                    </ul>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
