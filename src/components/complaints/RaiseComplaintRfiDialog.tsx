import { useMemo, useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  useRaiseComplaintRfi,
  useComplaintRfiSettings,
  useSubmitComplaintRfiForApproval,
  type ComplaintRfiQuestionType,
  type RaiseRfiQuestion,
} from '@/hooks/useComplaintRfis';
import { useEmployeeApprovers } from '@/hooks/useEmployeeApprovers';
import { useAuth } from '@/contexts/AuthContext';
import { dispatchNotificationEvent } from '@/lib/notificationEvents';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  complaintId: string;
  complaintNumber: string;
  licenseeId: string | null;
  onRaised?: () => void;
}

const emptyQuestion = (): RaiseRfiQuestion => ({ prompt: '', question_type: 'text', required: true });

export function RaiseComplaintRfiDialog({
  open,
  onOpenChange,
  complaintId,
  complaintNumber,
  licenseeId,
  onRaised,
}: Props) {
  const [summary, setSummary] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [approverId, setApproverId] = useState<string>('none');
  const [questions, setQuestions] = useState<RaiseRfiQuestion[]>([emptyQuestion()]);
  const raise = useRaiseComplaintRfi(complaintId);
  const submitForApproval = useSubmitComplaintRfiForApproval(complaintId);
  const { data: settings } = useComplaintRfiSettings();
  const { data: approvers = [] } = useEmployeeApprovers();
  const { user } = useAuth();

  const approvalRequired = settings?.approval_required ?? true;
  const busy = raise.isPending || submitForApproval.isPending;

  const update = (idx: number, patch: Partial<RaiseRfiQuestion>) =>
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));

  const cleanedQuestions = useMemo(
    () =>
      questions
        .map((q) => ({ ...q, prompt: q.prompt.trim() }))
        .filter((q) => q.prompt.length > 0),
    [questions],
  );

  const reset = () => {
    setSummary('');
    setDueAt('');
    setApproverId('none');
    setQuestions([emptyQuestion()]);
  };

  /** mode: 'draft' keeps it internal, 'approval' submits it to the approver, 'dispatch' issues it directly. */
  const submit = async (mode: 'draft' | 'approval' | 'dispatch') => {
    if (!cleanedQuestions.length) {
      toast.error('Add at least one question');
      return;
    }
    const due = dueAt ? new Date(dueAt).toISOString() : null;
    const nominee = approverId !== 'none' ? approverId : null;

    try {
      const rfiId = await raise.mutateAsync({
        summary: summary.trim() || undefined,
        due_at: due,
        items: cleanedQuestions,
        as_draft: mode !== 'dispatch',
        approver_id: nominee,
      });

      if (mode === 'approval') {
        await submitForApproval.mutateAsync({ rfi_id: rfiId, approver_id: nominee });
        void dispatchNotificationEvent({
          event_key: 'complaint.rfi_approval_requested',
          entity_type: 'complaint',
          entity_id: complaintId,
          payload: {
            complaint_id: complaintId,
            complaint_number: complaintNumber,
            rfi_id: rfiId,
            approver_id: nominee,
            drafter_id: user?.id ?? null,
            drafter_name: user?.fullName ?? 'a supervision officer',
            question_count: cleanedQuestions.length,
            due_at: due,
            deep_link: `/complaints/rfi-approvals?rfi=${rfiId}`,
          },
        });
        toast.success('Draft submitted for approval');
      } else if (mode === 'dispatch') {
        void dispatchNotificationEvent({
          event_key: 'complaint.rfi_issued',
          entity_type: 'complaint',
          entity_id: complaintId,
          payload: {
            complaint_id: complaintId,
            complaint_number: complaintNumber,
            licensee_id: licenseeId,
            entity_id: licenseeId,
            rfi_id: rfiId,
            question_count: cleanedQuestions.length,
            due_at: due,
            deep_link: `/entity/complaint-rfis?rfi=${rfiId}`,
          },
        });
        toast.success('Information request issued to the entity');
      } else {
        toast.success('Draft saved — submit it for approval when ready');
      }

      reset();
      onOpenChange(false);
      onRaised?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not save the information request');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raise information request — {complaintNumber}</DialogTitle>
        </DialogHeader>

        {!licenseeId && (
          <p className="text-sm text-destructive">
            This complaint is not linked to a regulated entity. Link an entity before raising a request.
          </p>
        )}

        {approvalRequired && (
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Supervisory approval is required before this request reaches the entity. It stays internal until an
              approver dispatches it.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Covering summary (optional)</Label>
            <Textarea
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Context for the entity, e.g. which aspects of the complaint the request relates to"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Response due date</Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
            {approvalRequired && (
              <div className="space-y-1">
                <Label>Nominated approver (optional)</Label>
                <Select value={approverId} onValueChange={setApproverId}>
                  <SelectTrigger><SelectValue placeholder="Shared supervisor queue" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Shared supervisor queue</SelectItem>
                    {approvers.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.full_name || a.email}
                        {a.department ? ` — ${a.department}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Questions</Label>
              <Button data-rbac="complaint_management.create" type="button" variant="outline" size="sm" onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}>
                <Plus className="h-4 w-4 mr-1" />Add question
              </Button>
            </div>
            {questions.map((q, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-mono text-muted-foreground pt-2">Q{i + 1}</span>
                  <Textarea
                    rows={2}
                    className="flex-1"
                    value={q.prompt}
                    onChange={(e) => update(i, { prompt: e.target.value })}
                    placeholder="What information is being requested?"
                  />
                  {questions.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setQuestions((qs) => qs.filter((_, x) => x !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-4 flex-wrap pl-6">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Response type</Label>
                    <Select
                      value={q.question_type}
                      onValueChange={(v) => update(i, { question_type: v as ComplaintRfiQuestionType })}
                    >
                      <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Written answer</SelectItem>
                        <SelectItem value="document">Document only</SelectItem>
                        <SelectItem value="both">Written answer + document</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={q.required} onCheckedChange={(v) => update(i, { required: !!v })} />
                    Mandatory
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {approvalRequired ? (
            <>
              <Button data-rbac="complaint_management.edit" variant="outline" onClick={() => submit('draft')} disabled={busy || !licenseeId}>
                Save draft
              </Button>
              <Button data-rbac="complaint_management.submit" onClick={() => submit('approval')} disabled={busy || !licenseeId}>
                {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Submit for approval
              </Button>
            </>
          ) : (
            <GuardedButton module="complaint_management" action="edit" data-rbac="complaint_management.edit" onClick={() => submit('dispatch')} disabled={busy || !licenseeId}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Issue request
            </GuardedButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
