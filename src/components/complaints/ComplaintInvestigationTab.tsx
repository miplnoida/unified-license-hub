import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Swal from 'sweetalert2';
import { CheckCircle2, Circle, Clock, MessageSquare, Send, StickyNote, Loader2, FileText, MoreHorizontal } from 'lucide-react';

import { logAction } from '@/hooks/useAuditLog';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { formatDateTime } from '@/lib/datetime';

interface Props { complaintId: string; complaintStatus: string; }

const TASK_STATUS_META: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: 'Not started', icon: Circle, className: 'text-muted-foreground' },
  in_progress: { label: 'Being worked on', icon: Clock, className: 'text-blue-600' },
  completed: { label: 'Done', icon: CheckCircle2, className: 'text-green-600' },
  cancelled: { label: 'No longer required', icon: Circle, className: 'text-red-600' },
};


export default function ComplaintInvestigationTab({ complaintId, complaintStatus }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Tasks
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDue, setTaskDue] = useState('');

  // Correspondence
  const [corrDirection] = useState<'outbound' | 'inbound' | 'internal_note'>('internal_note');
  const [corrSubject, setCorrSubject] = useState('');
  const [corrBody, setCorrBody] = useState('');

  const tasksQ = useQuery({
    queryKey: ['complaint_tasks', complaintId],
    queryFn: async () => {
      const { data, error } = await supabase.from('complaint_investigation_tasks')
        .select('*').eq('complaint_id', complaintId).order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const tasks = tasksQ.data;
  const tasksLoading = tasksQ.isLoading;

  const correspondenceQ = useQuery({
    queryKey: ['complaint_correspondence', complaintId],
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
  const correspondence = correspondenceQ.data;
  const corrLoading = correspondenceQ.isLoading;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['complaint_tasks', complaintId] });
    qc.invalidateQueries({ queryKey: ['complaint_correspondence', complaintId] });
    qc.invalidateQueries({ queryKey: ['complaint', complaintId] });
  };

  const addTask = useMutation({
    mutationFn: async () => {
      if (!taskTitle.trim()) throw new Error('Title required');
      const { error } = await (supabase.from('complaint_investigation_tasks') as any).insert({
        complaint_id: complaintId,
        title: taskTitle.trim(),
        description: taskDesc.trim() || null,
        due_date: taskDue || null,
        owner_id: user?.id ?? null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      await logAction('complaint.task_created', 'complaint', complaintId, { meta: { title: taskTitle.trim() } });
    },
    onSuccess: () => {
      toast.success('Task added');
      setTaskTitle(''); setTaskDesc(''); setTaskDue('');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Task-level status only. This NEVER touches the complaint lifecycle — the
  // complaint moves exclusively through the configured workflow action on the
  // "Current step" tab.
  const AUDIT_LABEL: Record<string, string> = {
    in_progress: 'complaint.investigation_task_marked_in_progress',
    completed: 'complaint.investigation_task_completed',
    cancelled: 'complaint.investigation_task_cancelled',
    pending: 'complaint.investigation_task_reopened',
  };

  const setTaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status };
      if (status === 'completed') { patch.completed_at = new Date().toISOString(); patch.completed_by = user?.id; }
      if (status === 'pending' || status === 'in_progress') { patch.completed_at = null; patch.completed_by = null; }
      const { error } = await supabase.from('complaint_investigation_tasks').update(patch).eq('id', id);
      if (error) throw error;
      await logAction(AUDIT_LABEL[status] ?? 'complaint.investigation_task_updated', 'complaint', complaintId, { meta: { task_id: id, task_status: status } });
    },
    onSuccess: () => { toast.success('Task updated — the complaint itself is unchanged'); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });


  const addCorrespondence = useMutation({
    mutationFn: async () => {
      if (corrBody.trim().length < 3) throw new Error('Message body required');
      const { error } = await (supabase.from('complaint_correspondence') as any).insert({
        complaint_id: complaintId,
        direction: corrDirection,
        subject: corrSubject.trim() || null,
        body: corrBody.trim(),
        author_id: user?.id ?? null,
      });
      if (error) throw error;
      await logAction(`complaint.${corrDirection}`, 'complaint', complaintId);
    },
    onSuccess: () => {
      toast.success('Recorded');
      setCorrSubject(''); setCorrBody('');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const readOnly = complaintStatus === 'closed';

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Investigation checklist</CardTitle>
          <p className="text-xs text-muted-foreground">
            Internal work items that help you complete the investigation. Ticking these off records progress only —
            the complaint itself moves forward through the action on the <strong>Current step</strong> tab.
          </p>
          {!tasksQ.isLoading && !tasksQ.isError && (tasks?.length ?? 0) > 0 && (
            <p className="text-xs font-medium mt-1">
              {(tasks ?? []).filter((t: any) => t.status === 'completed').length} of{' '}
              {(tasks ?? []).filter((t: any) => t.status !== 'cancelled').length} work items done
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!readOnly && (
            <div className="space-y-2 border-b pb-4">
              <Input placeholder="What needs to be done?" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} />
              <Textarea placeholder="Details (optional)" rows={2} value={taskDesc} onChange={e => setTaskDesc(e.target.value)} />
              <div className="flex gap-2">
                <Input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} className="flex-1" />
                <Button onClick={() => addTask.mutate()} disabled={addTask.isPending}>
                  {addTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add work item'}
                </Button>
              </div>
            </div>
          )}
          {tasksLoading ? (
            <div className="py-6 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
          ) : tasksQ.isError ? (
            <QueryErrorState message="Failed to load tasks" onRetry={() => tasksQ.refetch()} />
          ) : !tasks?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">No work items yet.</p>
          ) : (
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
                      {!readOnly && t.status !== 'completed' && t.status !== 'cancelled' && (
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
                                    title: 'Remove this work item?',
                                    text: 'It will be marked as no longer required. The complaint is not affected.',
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
                      {!readOnly && (t.status === 'completed' || t.status === 'cancelled') && (
                        <div className="mt-2">
                          <Button data-rbac="complaint_management.edit" size="sm" variant="ghost" onClick={() => setTaskStatus.mutate({ id: t.id, status: 'pending' })}>Reopen work item</Button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>


      {/* Correspondence */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Investigation notes / legacy correspondence</CardTitle>
          <p className="text-xs text-muted-foreground">
            Internal investigation notes and historical correspondence records. External communication with the
            complainant or entity is handled under <strong>Evidence &amp; communications</strong>.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {!readOnly && (
            <div className="space-y-2 border-b pb-4">
              <div className="flex gap-2">
                <Badge variant="secondary" className="h-10 px-3 flex items-center gap-1 shrink-0">
                  <StickyNote className="h-3 w-3" />Internal note
                </Badge>
                <Input placeholder="Subject (optional)" value={corrSubject} onChange={e => setCorrSubject(e.target.value)} className="flex-1" />
              </div>
              <Textarea rows={3} placeholder="Message body…" value={corrBody} onChange={e => setCorrBody(e.target.value)} />
              <Button onClick={() => addCorrespondence.mutate()} disabled={addCorrespondence.isPending} className="w-full">
                {addCorrespondence.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-2" />Record</>}
              </Button>
            </div>
          )}
          {corrLoading ? (
            <div className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
          ) : correspondenceQ.isError ? (
            <QueryErrorState message="Failed to load correspondence" onRetry={() => correspondenceQ.refetch()} />
          ) : !correspondence?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">No investigation notes recorded yet.</p>
          ) : (
            <ul className="space-y-3 max-h-[500px] overflow-y-auto">
              {correspondence.map((c: any) => (
                <li key={c.id} className="border rounded-md p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={c.direction === 'internal_note' ? 'secondary' : 'outline'} className="text-xs capitalize">
                      {c.direction === 'internal_note' ? <><StickyNote className="h-3 w-3 mr-1" />Internal Note</> : c.direction}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{c.author_name} · {formatDateTime(c.created_at)}</span>
                  </div>
                  {c.subject && <p className="font-medium text-xs">{c.subject}</p>}
                  <p className="text-sm whitespace-pre-wrap mt-1">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
