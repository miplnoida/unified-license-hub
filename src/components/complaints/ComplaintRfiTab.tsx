import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, MessageSquarePlus, RotateCcw, CheckCircle2, XCircle, Lock, ShieldCheck, Pencil } from 'lucide-react';

import { toast } from 'sonner';
import {
  useComplaintRfis,
  useCloseComplaintRfi,
  useReturnComplaintRfiItem,
  type ComplaintRfi,
  type ComplaintRfiItem,
} from '@/hooks/useComplaintRfis';
import { useCan } from '@/hooks/useCan';
import { RaiseComplaintRfiDialog } from './RaiseComplaintRfiDialog';
import { ReviewRfiDialog } from './ReviewRfiDialog';
import { RfiAttachmentList } from './RfiAttachmentList';
import { formatDateTime, formatDateOnly } from '@/lib/datetime';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';

const statusVariant: Record<string, any> = {
  open: 'secondary',
  submitted: 'default',
  closed: 'outline',
  cancelled: 'outline',
};

const APPROVAL_VARIANT: Record<string, any> = {
  draft: 'outline',
  pending_approval: 'secondary',
  rejected: 'destructive',
  dispatched: 'default',
};

const APPROVAL_LABEL: Record<string, string> = {
  draft: 'Internal draft',
  pending_approval: 'Awaiting approval',
  rejected: 'Returned for rework',
  dispatched: 'Dispatched to entity',
};

const TYPE_LABEL: Record<string, string> = {
  text: 'Written answer',
  document: 'Document',
  both: 'Written answer + document',
};

export function ComplaintRfiTab({
  complaintId,
  complaintNumber,
  licenseeId,
  licenseeName,
}: {
  complaintId: string;
  complaintNumber: string;
  licenseeId: string | null;
  licenseeName?: string | null;
}) {
  const rfiQuery = useComplaintRfis(complaintId);
  const { data: rfis = [], isLoading, isError, refetch } = rfiQuery;
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [reviewRfi, setReviewRfi] = useState<ComplaintRfi | null>(null);
  const canApprove = useCan('complaint_management', 'approve_rfi');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const closeRfi = useCloseComplaintRfi(complaintId);
  const returnItem = useReturnComplaintRfiItem(complaintId);

  const doClose = async (rfi: ComplaintRfi, cancel = false) => {
    try {
      await closeRfi.mutateAsync({ rfi_id: rfi.id, notes: notes[rfi.id]?.trim() || undefined, cancel });
      toast.success(cancel ? 'Request cancelled' : 'Request closed');
      setNotes((n) => ({ ...n, [rfi.id]: '' }));
    } catch (e: any) {
      toast.error(e?.message ?? 'Action failed');
    }
  };

  const doReturn = async (item: ComplaintRfiItem) => {
    const reason = reasons[item.id]?.trim();
    if (!reason) {
      toast.error('Give a reason for the clarification request');
      return;
    }
    try {
      await returnItem.mutateAsync({ item_id: item.id, reason });
      toast.success('Question returned to the entity for clarification');
      setReasons((r) => ({ ...r, [item.id]: '' }));
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not return the question');
    }
  };

  if (isError) {
    return (
      <QueryErrorState
        title="We couldn’t load information requests"
        message="Information requests could not be loaded. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading information requests…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Information requests issued to {licenseeName || 'the regulated entity'}. Draft answers stay private to the
          entity until they submit.
        </p>
        <Button data-rbac="complaint_management.edit" size="sm" onClick={() => setRaiseOpen(true)}>
          <MessageSquarePlus className="h-4 w-4 mr-1" />Raise information request
        </Button>
      </div>

      {rfis.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No information requests have been raised on this complaint yet.
        </CardContent></Card>
      )}

      {rfis.map((rfi) => {
        const answered = rfi.items.filter((i) => i.response_status === 'responded').length;
        return (
          <Card key={rfi.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base">Request raised {formatDateTime(rfi.raised_at)}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {rfi.items.length} question(s) · {answered} answered
                    {rfi.due_at ? ` · due ${formatDateOnly(rfi.due_at)}` : ''}
                    {rfi.submitted_at ? ` · submitted ${formatDateTime(rfi.submitted_at)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={APPROVAL_VARIANT[rfi.approval_state] ?? 'outline'}>
                    {APPROVAL_LABEL[rfi.approval_state] ?? rfi.approval_state}
                  </Badge>
                  {rfi.approval_state === 'dispatched' && (
                    <Badge variant={statusVariant[rfi.status] ?? 'outline'} className="capitalize">{rfi.status}</Badge>
                  )}
                  {rfi.approval_state !== 'dispatched' && (
                    <Button
                      data-rbac="complaint_management.edit"
                      size="sm"
                      variant="outline"
                      onClick={() => setReviewRfi(rfi)}
                    >
                      {canApprove && rfi.approval_state === 'pending_approval' ? (
                        <><ShieldCheck className="h-4 w-4 mr-1" />Review &amp; approve</>
                      ) : (
                        <><Pencil className="h-4 w-4 mr-1" />Open draft</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
              {rfi.summary && <p className="text-sm mt-2">{rfi.summary}</p>}
              {rfi.approval_state === 'rejected' && rfi.rejection_reason && (
                <p className="text-xs text-destructive mt-2">Returned by the approver: {rfi.rejection_reason}</p>
              )}
              {rfi.approval_state === 'pending_approval' && (
                <p className="text-xs text-muted-foreground mt-2">
                  Not yet visible to the entity — awaiting supervisory approval.
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {rfi.items.map((item) => {
                const submitted = item.responses.filter((r) => !r.is_draft);
                return (
                  <div key={item.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <p className="text-sm font-medium">
                        <span className="font-mono text-xs text-muted-foreground mr-2">Q{item.ordinal}</span>
                        {item.prompt}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[item.question_type]}</Badge>
                        {item.required && <Badge variant="secondary" className="text-[10px]">Mandatory</Badge>}
                        <Badge variant="outline" className="text-[10px] capitalize">{item.response_status}</Badge>
                      </div>
                    </div>

                    {item.returned_reason && (
                      <p className="text-xs text-muted-foreground">Returned for clarification: {item.returned_reason}</p>
                    )}

                    {submitted.length === 0 ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Lock className="h-3 w-3" />No submitted response yet.
                      </p>
                    ) : (
                      submitted.map((r) => (
                        <div key={r.id} className="rounded-md bg-muted/50 p-2 space-y-2">
                          {r.response_text && <p className="text-sm whitespace-pre-wrap">{r.response_text}</p>}
                          <RfiAttachmentList fileIds={r.file_upload_ids ?? []} />
                          <p className="text-[11px] text-muted-foreground">
                            Submitted {formatDateTime(r.submitted_at)}
                          </p>
                        </div>
                      ))
                    )}

                    {rfi.approval_state === 'dispatched' && rfi.status !== 'closed' && rfi.status !== 'cancelled' && submitted.length > 0 && (
                      <div className="flex items-end gap-2 flex-wrap">
                        <div className="flex-1 min-w-[220px]">
                          <Label className="text-xs">Request clarification</Label>
                          <Textarea
                            rows={2}
                            value={reasons[item.id] ?? ''}
                            onChange={(e) => setReasons((s) => ({ ...s, [item.id]: e.target.value }))}
                            placeholder="Why this answer is insufficient"
                          />
                        </div>
                        <Button
                          data-rbac="complaint_management.edit"
                          variant="outline"
                          size="sm"
                          onClick={() => doReturn(item)}
                          disabled={returnItem.isPending}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />Return question
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {rfi.approval_state === 'dispatched' && rfi.status !== 'closed' && rfi.status !== 'cancelled' && (
                <>
                  <Separator />
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[220px]">
                      <Label className="text-xs">Closure notes</Label>
                      <Textarea
                        rows={2}
                        value={notes[rfi.id] ?? ''}
                        onChange={(e) => setNotes((n) => ({ ...n, [rfi.id]: e.target.value }))}
                        placeholder="Optional notes recorded in the audit trail"
                      />
                    </div>
                    <Button data-rbac="complaint_management.edit" size="sm" onClick={() => doClose(rfi)} disabled={closeRfi.isPending}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />Close request
                    </Button>
                    <Button
                      data-rbac="complaint_management.edit"
                      size="sm"
                      variant="outline"
                      onClick={() => doClose(rfi, true)}
                      disabled={closeRfi.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-1" />Cancel request
                    </Button>
                  </div>
                </>
              )}

              {rfi.closure_notes && <p className="text-xs text-muted-foreground">Closure notes: {rfi.closure_notes}</p>}
            </CardContent>
          </Card>
        );
      })}

      <RaiseComplaintRfiDialog
        open={raiseOpen}
        onOpenChange={setRaiseOpen}
        complaintId={complaintId}
        complaintNumber={complaintNumber}
        licenseeId={licenseeId}
        onRaised={() => refetch()}
      />

      <ReviewRfiDialog
        open={!!reviewRfi}
        onOpenChange={(o) => !o && setReviewRfi(null)}
        rfi={reviewRfi}
        canApprove={canApprove}
        onDone={() => refetch()}
      />
    </div>
  );
}

export default ComplaintRfiTab;
