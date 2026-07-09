import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, User, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { logFpAction } from '@/lib/fpAudit';

// ── Badge helpers ────────────────────────────────────────────────────────────

const SEVERITY_CLASS: Record<string, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700',
};

const STATUS_CLASS: Record<string, string> = {
  UNASSIGNED: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-green-100 text-green-800',
};

const OUTCOME_CLASS: Record<string, string> = {
  CLEARED: 'bg-green-100 text-green-800',
  CONFIRMED_ADVERSE: 'bg-red-100 text-red-800',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function ManualTaskDetail() {
  const { id: taskId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();

  // Local state for editable fields
  const [dueDate, setDueDate] = useState<string>('');
  const [dueDateInitialised, setDueDateInitialised] = useState(false);
  const [notes, setNotes] = useState<string>('');
  const [notesInitialised, setNotesInitialised] = useState(false);

  // Completion form state
  const [selectedOutcome, setSelectedOutcome] = useState<string>('');
  const [completionNotes, setCompletionNotes] = useState<string>('');

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Task query ──────────────────────────────────────────────────────────────

  const { data: task, isLoading: taskLoading } = useQuery({
    queryKey: ['fp_manual_task', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_manual_screening_tasks')
        .select(
          '*, fp_individuals(id, full_name, national_id), fp_findings(id, title, severity, check_type, summary, confidence_score, source, citations, evidence_urls, resolution_status), fp_assessments(id, assessment_type, status)',
        )
        .eq('id', taskId!)
        .maybeSingle();
      if (error) throw error;

      // Initialise editable fields once
      if (data) {
        if (!dueDateInitialised) {
          setDueDate(data.due_date ?? '');
          setDueDateInitialised(true);
        }
        if (!notesInitialised) {
          setNotes(data.notes ?? '');
          setNotesInitialised(true);
        }
      }
      return data as any;
    },
  });

  // ── Evidence query ──────────────────────────────────────────────────────────

  const { data: evidence, isLoading: evidenceLoading } = useQuery({
    queryKey: ['fp_task_evidence', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_task_evidence')
        .select('*')
        .eq('task_id', taskId!)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Assign to me mutation ───────────────────────────────────────────────────

  const assignToMe = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('fp_manual_screening_tasks')
        .update({ assigned_to: user.id, status: 'IN_PROGRESS' })
        .eq('id', taskId!);
      if (error) throw error;
      await logFpAction('fp.manual_task.assigned', 'fp_manual_screening_task', taskId, {
        after: { assigned_to: user.id, status: 'IN_PROGRESS' },
        context: { individualId: task?.individual_id },
      });
    },
    onSuccess: () => {
      toast.success('Task assigned to you');
      qc.invalidateQueries({ queryKey: ['fp_manual_task', taskId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to assign task'),
  });

  // ── Save due date mutation ──────────────────────────────────────────────────

  const saveDueDate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('fp_manual_screening_tasks')
        .update({ due_date: dueDate || null })
        .eq('id', taskId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Due date saved');
      qc.invalidateQueries({ queryKey: ['fp_manual_task', taskId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save due date'),
  });

  // ── Save notes mutation ─────────────────────────────────────────────────────

  const saveNotes = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('fp_manual_screening_tasks')
        .update({ notes })
        .eq('id', taskId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Notes saved');
      qc.invalidateQueries({ queryKey: ['fp_manual_task', taskId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save notes'),
  });

  // ── Upload evidence mutation ────────────────────────────────────────────────

  const uploadEvidence = useMutation({
    mutationFn: async (file: File) => {
      if (!user?.id) throw new Error('Not authenticated');
      const path = `fp/tasks/${taskId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('secure-documents')
        .upload(path, file);
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase
        .from('fp_task_evidence')
        .insert({
          task_id: taskId,
          file_path: path,
          file_name: file.name,
          uploaded_by: user.id,
        });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      toast.success('Evidence uploaded');
      qc.invalidateQueries({ queryKey: ['fp_task_evidence', taskId] });
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (e: any) => toast.error(e?.message || 'Upload failed'),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadEvidence.mutate(file);
  }

  // ── Download evidence ───────────────────────────────────────────────────────

  async function handleDownload(filePath: string) {
    const { data, error } = await supabase.storage
      .from('secure-documents')
      .createSignedUrl(filePath, 300);
    if (error || !data?.signedUrl) {
      toast.error('Could not generate download link');
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  // ── Complete task mutation ──────────────────────────────────────────────────

  const completeTask = useMutation({
    mutationFn: async () => {
      if (!selectedOutcome) throw new Error('Please select an outcome');
      if (!user?.id) throw new Error('Not authenticated');
      const now = new Date().toISOString();

      // Update the task
      const { error: taskError } = await supabase
        .from('fp_manual_screening_tasks')
        .update({
          status: 'COMPLETED',
          outcome: selectedOutcome,
          completed_at: now,
          completed_by: user.id,
          notes: completionNotes || task?.notes || null,
        })
        .eq('id', taskId!);
      if (taskError) throw taskError;

      // Update the linked finding based on outcome
      if (task?.finding_id) {
        const isAdverse = selectedOutcome === 'CONFIRMED_ADVERSE';
        const findingPatch = isAdverse
          ? {
              resolution_status: 'true_positive',
              resolved_at: now,
              resolved_by: user.id,
              resolution_reason:
                'Manual screening task completed — confirmed adverse',
            }
          : {
              resolution_status: 'false_positive',
              is_false_positive: true,
              resolved_at: now,
              resolved_by: user.id,
              resolution_reason:
                'Manual screening task completed — cleared',
            };

        const { error: findingError } = await supabase
          .from('fp_findings')
          .update(findingPatch)
          .eq('id', task.finding_id);
        if (findingError) throw findingError;
      }

      // Audit log
      await logFpAction(
        'fp.manual_task.completed',
        'fp_manual_screening_task',
        taskId,
        {
          after: { outcome: selectedOutcome, status: 'COMPLETED' },
          context: {
            findingId: task?.finding_id,
            individualId: task?.individual_id,
          },
        },
      );
    },
    onSuccess: () => {
      toast.success('Task completed');
      qc.invalidateQueries({ queryKey: ['fp_manual_task', taskId] });
      qc.invalidateQueries({ queryKey: ['fp_manual_screening_tasks'] });
      setSelectedOutcome('');
      setCompletionNotes('');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to complete task'),
  });

  // ── Loading / not-found states ──────────────────────────────────────────────

  if (taskLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading task…
        </div>
      </DashboardLayout>
    );
  }

  if (!task) {
    return (
      <DashboardLayout>
        <div className="py-20 text-center text-muted-foreground">Task not found.</div>
      </DashboardLayout>
    );
  }

  const finding = task.fp_findings ?? {};
  const individual = task.fp_individuals ?? {};
  const assessment = task.fp_assessments ?? {};
  const isCompleted = task.status === 'COMPLETED';

  const citations: string[] = Array.isArray(finding.citations) ? finding.citations : [];
  const evidenceUrls: string[] = Array.isArray(finding.evidence_urls) ? finding.evidence_urls : [];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Manual Screening Task"
          description={individual.full_name ? `Individual: ${individual.full_name}` : undefined}
          backHref="/fit-and-proper/screening-queue"
          backLabel="Queue"
          actions={
            <Badge
              variant="outline"
              className={STATUS_CLASS[task.status] ?? 'bg-slate-100 text-slate-700'}
            >
              {task.status}
            </Badge>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left column (finding + task status) ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Finding details card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Finding Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Title + severity */}
                <div className="flex flex-wrap items-start gap-3">
                  <h3 className="text-sm font-semibold flex-1">{finding.title ?? '—'}</h3>
                  {finding.severity && (
                    <Badge
                      variant="outline"
                      className={SEVERITY_CLASS[finding.severity] ?? 'bg-slate-100 text-slate-700'}
                    >
                      {finding.severity}
                    </Badge>
                  )}
                </div>

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Check type:</span>{' '}
                    <span className="font-medium">{finding.check_type ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Confidence:</span>{' '}
                    <span className="font-medium">
                      {finding.confidence_score != null
                        ? `${Math.round(Number(finding.confidence_score))}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Source:</span>{' '}
                    <span className="font-medium">{finding.source ?? '—'}</span>
                  </div>
                  {finding.resolution_status && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Resolution:</span>{' '}
                      <span className="font-medium">{finding.resolution_status}</span>
                    </div>
                  )}
                </div>

                {/* Summary */}
                {finding.summary && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Summary</p>
                    <p className="text-sm leading-relaxed">{finding.summary}</p>
                  </div>
                )}

                {/* Citations */}
                {citations.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">
                      Citations
                    </p>
                    <ul className="space-y-1">
                      {citations.map((c: string, i: number) => (
                        <li key={i} className="text-sm">
                          {c.startsWith('http') ? (
                            <a
                              href={c}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline break-all"
                            >
                              {c}
                            </a>
                          ) : (
                            <span>{c}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Evidence URLs from finding */}
                {evidenceUrls.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">
                      Evidence URLs
                    </p>
                    <ul className="space-y-1">
                      {evidenceUrls.map((url: string, i: number) => (
                        <li key={i}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline break-all"
                          >
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Evidence section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evidence Files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Upload button */}
                <div>
                  <label className="cursor-pointer">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={uploadEvidence.isPending}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      disabled={uploadEvidence.isPending}
                    >
                      <span>
                        {uploadEvidence.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Upload Evidence
                      </span>
                    </Button>
                  </label>
                </div>

                {/* Evidence list */}
                {evidenceLoading ? (
                  <div className="text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> Loading files…
                  </div>
                ) : !evidence || evidence.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No evidence files uploaded yet.</p>
                ) : (
                  <ul className="divide-y">
                    {evidence.map((ev: any) => (
                      <li key={ev.id} className="flex items-center justify-between py-2 gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{ev.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {ev.uploaded_at
                              ? new Date(ev.uploaded_at).toLocaleString()
                              : ''}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(ev.file_path)}
                        >
                          Download
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Complete task section */}
            {!isCompleted && (
              <Card className="border-amber-200">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Complete Task
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Outcome *</Label>
                    <Select value={selectedOutcome} onValueChange={setSelectedOutcome}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select outcome…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLEARED">Cleared</SelectItem>
                        <SelectItem value="CONFIRMED_ADVERSE">Confirmed Adverse</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Completion notes</Label>
                    <Textarea
                      value={completionNotes}
                      onChange={(e) => setCompletionNotes(e.target.value)}
                      rows={3}
                      placeholder="Any additional observations or justification…"
                    />
                  </div>

                  {selectedOutcome === 'CONFIRMED_ADVERSE' && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-md p-3">
                      This will mark the finding as a <strong>true positive</strong> and resolve it accordingly.
                    </p>
                  )}
                  {selectedOutcome === 'CLEARED' && (
                    <p className="text-sm text-green-700 bg-green-50 rounded-md p-3">
                      This will mark the finding as a <strong>false positive</strong> and clear the individual.
                    </p>
                  )}

                  <Button
                    onClick={() => completeTask.mutate()}
                    disabled={completeTask.isPending || !selectedOutcome}
                    className="w-full sm:w-auto"
                  >
                    {completeTask.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Complete Task
                  </Button>
                </CardContent>
              </Card>
            )}

            {isCompleted && task.outcome && (
              <Card className="border-green-200 bg-green-50/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Task completed</p>
                    <p className="text-sm text-muted-foreground">
                      Outcome:{' '}
                      <Badge
                        variant="outline"
                        className={OUTCOME_CLASS[task.outcome] ?? 'bg-slate-100 text-slate-700'}
                      >
                        {task.outcome === 'CONFIRMED_ADVERSE' ? 'Confirmed Adverse' : 'Cleared'}
                      </Badge>
                    </p>
                    {task.completed_at && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(task.completed_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Right column (task status card) ── */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Task Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Current status */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Badge
                    variant="outline"
                    className={STATUS_CLASS[task.status] ?? 'bg-slate-100 text-slate-700'}
                  >
                    {task.status}
                  </Badge>
                </div>

                {/* Assign to me */}
                {task.status === 'UNASSIGNED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => assignToMe.mutate()}
                    disabled={assignToMe.isPending}
                  >
                    {assignToMe.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    <User className="h-4 w-4 mr-2" />
                    Assign to Me
                  </Button>
                )}

                {/* Assigned to */}
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                    Assigned To
                  </p>
                  <p className="text-sm font-mono">
                    {task.assigned_to ? task.assigned_to : (
                      <span className="font-sans text-muted-foreground">Unassigned</span>
                    )}
                  </p>
                </div>

                {/* Individual */}
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                    Individual
                  </p>
                  <p className="text-sm">{individual.full_name ?? '—'}</p>
                  {individual.national_id && (
                    <p className="text-xs text-muted-foreground font-mono">{individual.national_id}</p>
                  )}
                </div>

                {/* Assessment */}
                {assessment.id && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                      Assessment
                    </p>
                    <p className="text-sm">{assessment.assessment_type ?? assessment.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{assessment.status}</p>
                  </div>
                )}

                {/* Due date */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Due Date
                  </Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    disabled={isCompleted}
                  />
                  {!isCompleted && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => saveDueDate.mutate()}
                      disabled={saveDueDate.isPending}
                    >
                      {saveDueDate.isPending && (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      )}
                      Save due date
                    </Button>
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Notes
                  </Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    disabled={isCompleted}
                    placeholder="Internal reviewer notes…"
                  />
                  {!isCompleted && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => saveNotes.mutate()}
                      disabled={saveNotes.isPending}
                    >
                      {saveNotes.isPending && (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      )}
                      Save notes
                    </Button>
                  )}
                </div>

                {/* Completion info */}
                {isCompleted && task.completed_at && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                      Completed At
                    </p>
                    <p className="text-sm">{new Date(task.completed_at).toLocaleString()}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
