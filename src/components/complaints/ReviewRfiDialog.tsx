import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, CheckCircle2, XCircle, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  useApproveComplaintRfi,
  useRejectComplaintRfi,
  useSubmitComplaintRfiForApproval,
  useUpdateComplaintRfiDraft,
  type ComplaintRfi,
  type ComplaintRfiQuestionType,
  type RaiseRfiQuestion,
} from '@/hooks/useComplaintRfis';
import { useAuth } from '@/contexts/AuthContext';
import { dispatchNotificationEvent } from '@/lib/notificationEvents';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rfi: ComplaintRfi | null;
  /** Caller holds complaint_management.approve_rfi. */
  canApprove: boolean;
  onDone?: () => void;
}

const toDateInput = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

/**
 * Supervisory review of a drafted RFI: edit the questions in place, then
 * approve (dispatch to the entity) or reject with a mandatory reason.
 * Drafters see the same editor but only the "submit for approval" action.
 */
export function ReviewRfiDialog({ open, onOpenChange, rfi, canApprove, onDone }: Props) {
  const { user } = useAuth();
  const [summary, setSummary] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [questions, setQuestions] = useState<RaiseRfiQuestion[]>([]);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');

  const update = useUpdateComplaintRfiDraft(rfi?.complaint_id);
  const approve = useApproveComplaintRfi(rfi?.complaint_id);
  const reject = useRejectComplaintRfi(rfi?.complaint_id);
  const submitForApproval = useSubmitComplaintRfiForApproval(rfi?.complaint_id);

  useEffect(() => {
    if (!rfi) return;
    setSummary(rfi.summary ?? '');
    setDueAt(toDateInput(rfi.due_at));
    setQuestions(
      rfi.items.map((i) => ({ prompt: i.prompt, question_type: i.question_type, required: i.required })),
    );
    setNotes('');
    setReason('');
  }, [rfi?.id]);

  const busy = update.isPending || approve.isPending || reject.isPending || submitForApproval.isPending;
  const state = rfi?.approval_state ?? 'draft';
  const editable = state === 'draft' || state === 'pending_approval' || state === 'rejected';

  const cleaned = useMemo(
    () => questions.map((q) => ({ ...q, prompt: q.prompt.trim() })).filter((q) => q.prompt.length > 0),
    [questions],
  );

  const dueIso = dueAt ? new Date(dueAt).toISOString() : null;

  const saveChanges = async (silent = false) => {
    if (!rfi) return false;
    if (!cleaned.length) {
      toast.error('At least one question is required');
      return false;
    }
    try {
      await update.mutateAsync({
        rfi_id: rfi.id,
        summary: summary.trim() || null,
        due_at: dueIso,
        items: cleaned,
      });
      if (!silent) toast.success('Draft updated — changes recorded in the audit trail');
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not save changes');
      return false;
    }
  };

  const doApprove = async () => {
    if (!rfi) return;
    if (!(await saveChanges(true))) return;
    try {
      const res = await approve.mutateAsync({ rfi_id: rfi.id, notes: notes.trim() || null, due_at: dueIso });
      void dispatchNotificationEvent({
        event_key: 'complaint.rfi_issued',
        entity_type: 'complaint',
        entity_id: rfi.complaint_id,
        payload: {
          complaint_id: rfi.complaint_id,
          complaint_number: rfi.complaint_number,
          licensee_id: res?.licensee_id ?? rfi.licensee_id,
          entity_id: res?.licensee_id ?? rfi.licensee_id,
          rfi_id: rfi.id,
          question_count: res?.questions ?? cleaned.length,
          due_at: res?.due_at ?? dueIso,
          deep_link: `/entity/complaint-rfis?rfi=${rfi.id}`,
        },
      });
      void dispatchNotificationEvent({
        event_key: 'complaint.rfi_approved',
        entity_type: 'complaint',
        entity_id: rfi.complaint_id,
        payload: {
          complaint_id: rfi.complaint_id,
          complaint_number: rfi.complaint_number,
          rfi_id: rfi.id,
          drafter_id: rfi.raised_by,
          approver_name: user?.fullName ?? 'a supervisor',
          entity_name: rfi.licensee_name,
          deep_link: `/complaints/${rfi.complaint_id}`,
        },
      });
      toast.success('Approved and dispatched to the entity');
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Approval failed');
    }
  };

  const doReject = async () => {
    if (!rfi) return;
    if (!reason.trim()) {
      toast.error('A reason is mandatory when returning a draft');
      return;
    }
    try {
      const res = await reject.mutateAsync({ rfi_id: rfi.id, reason: reason.trim() });
      void dispatchNotificationEvent({
        event_key: 'complaint.rfi_rejected',
        entity_type: 'complaint',
        entity_id: rfi.complaint_id,
        payload: {
          complaint_id: rfi.complaint_id,
          complaint_number: rfi.complaint_number,
          rfi_id: rfi.id,
          drafter_id: res?.drafter_id ?? rfi.raised_by,
          rejection_reason: reason.trim(),
          approver_name: user?.fullName ?? 'a supervisor',
          deep_link: `/complaints/${rfi.complaint_id}`,
        },
      });
      toast.success('Draft returned to the drafter');
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not return the draft');
    }
  };

  const doSubmitForApproval = async () => {
    if (!rfi) return;
    if (!(await saveChanges(true))) return;
    try {
      await submitForApproval.mutateAsync({ rfi_id: rfi.id, approver_id: rfi.approver_id ?? null });
      void dispatchNotificationEvent({
        event_key: 'complaint.rfi_approval_requested',
        entity_type: 'complaint',
        entity_id: rfi.complaint_id,
        payload: {
          complaint_id: rfi.complaint_id,
          complaint_number: rfi.complaint_number,
          rfi_id: rfi.id,
          approver_id: rfi.approver_id,
          drafter_id: user?.id ?? rfi.raised_by,
          drafter_name: user?.fullName ?? 'a supervision officer',
          question_count: cleaned.length,
          due_at: dueIso,
          deep_link: `/complaints/rfi-approvals?rfi=${rfi.id}`,
        },
      });
      toast.success('Submitted for approval');
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not submit for approval');
    }
  };

  const showApprovalActions = canApprove && state === 'pending_approval';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Review information request
            {rfi?.complaint_number && (
              <span className="font-mono text-xs text-muted-foreground">{rfi.complaint_number}</span>
            )}
            <Badge variant="outline" className="capitalize">{state.replace('_', ' ')}</Badge>
          </DialogTitle>
        </DialogHeader>

        {rfi && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Entity: {rfi.licensee_name || 'unlinked'} · {rfi.items.length} question(s)
              {rfi.rejection_reason ? ` · previously returned: ${rfi.rejection_reason}` : ''}
            </p>

            <div className="space-y-1">
              <Label>Covering summary</Label>
              <Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} disabled={!editable} />
            </div>
            <div className="space-y-1 max-w-xs">
              <Label>Response due date</Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} disabled={!editable} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Questions</Label>
                {editable && (
                  <Button data-rbac="complaint_management.create"
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setQuestions((qs) => [...qs, { prompt: '', question_type: 'text', required: true }])
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" />Add question
                  </Button>
                )}
              </div>
              {questions.map((q, i) => (
                <div key={i} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-mono text-muted-foreground pt-2">Q{i + 1}</span>
                    <Textarea
                      rows={2}
                      className="flex-1"
                      value={q.prompt}
                      disabled={!editable}
                      onChange={(e) =>
                        setQuestions((qs) => qs.map((x, ix) => (ix === i ? { ...x, prompt: e.target.value } : x)))
                      }
                    />
                    {editable && questions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setQuestions((qs) => qs.filter((_, ix) => ix !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-4 flex-wrap pl-6">
                    <Select
                      value={q.question_type}
                      disabled={!editable}
                      onValueChange={(v) =>
                        setQuestions((qs) =>
                          qs.map((x, ix) =>
                            ix === i ? { ...x, question_type: v as ComplaintRfiQuestionType } : x,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Written answer</SelectItem>
                        <SelectItem value="document">Document only</SelectItem>
                        <SelectItem value="both">Written answer + document</SelectItem>
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={q.required}
                        disabled={!editable}
                        onCheckedChange={(v) =>
                          setQuestions((qs) => qs.map((x, ix) => (ix === i ? { ...x, required: !!v } : x)))
                        }
                      />
                      Mandatory
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {showApprovalActions && (
              <>
                <Separator />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Approval notes (optional)</Label>
                    <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Rejection reason (required to return)</Label>
                    <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {editable && (
            <Button data-rbac="complaint_management.edit" variant="outline" onClick={() => saveChanges()} disabled={busy}>
              <Save className="h-4 w-4 mr-1" />Save changes
            </Button>
          )}
          {(state === 'draft' || state === 'rejected') && (
            <Button data-rbac="complaint_management.edit" onClick={doSubmitForApproval} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Submit for approval
            </Button>
          )}
          {showApprovalActions && (
            <>
              <Button
                data-rbac="complaint_management.approve_rfi"
                variant="outline"
                onClick={doReject}
                disabled={busy}
              >
                <XCircle className="h-4 w-4 mr-1" />Reject
              </Button>
              <Button data-rbac="complaint_management.approve_rfi" onClick={doApprove} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Approve &amp; dispatch
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ReviewRfiDialog;
