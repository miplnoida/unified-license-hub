import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Loader2, PlayCircle, RotateCcw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useCloseCorrespondence, useReviewCorrespondence } from '@/hooks/useCorrespondence';

export function ReviewApprovalPanel({ threadId, status }: { threadId: string; status: string }) {
  const [notes, setNotes] = useState('');
  const review = useReviewCorrespondence(threadId);
  const close = useCloseCorrespondence(threadId);
  const busy = review.isPending || close.isPending;

  const act = async (decision: 'start_review' | 'approve' | 'reject') => {
    try {
      await review.mutateAsync({ thread_id: threadId, decision, notes: notes.trim() || undefined });
      toast.success('Review recorded');
      setNotes('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Action failed');
    }
  };

  const closeThread = async () => {
    try {
      await close.mutateAsync({ thread_id: threadId, notes: notes.trim() || undefined });
      toast.success('Correspondence closed');
      setNotes('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not close correspondence');
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Current stage: <span className="font-medium text-foreground">{status.replace('_', ' ')}</span>
      </p>
      <div>
        <Label className="text-xs">Review notes (recorded in the audit trail)</Label>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button data-rbac="correspondence_management.approve" size="sm" variant="outline" onClick={() => act('start_review')} disabled={busy}>
          <PlayCircle className="h-4 w-4 mr-1" />Start review
        </Button>
        <Button data-rbac="correspondence_management.approve" size="sm" onClick={() => act('approve')} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}Approve response
        </Button>
        <Button data-rbac="correspondence_management.approve" size="sm" variant="outline" onClick={() => act('reject')} disabled={busy}>
          <RotateCcw className="h-4 w-4 mr-1" />Send back for revision
        </Button>
        <Button data-rbac="correspondence_management.approve" size="sm" variant="destructive" className="ml-auto" onClick={closeThread} disabled={busy}>
          <XCircle className="h-4 w-4 mr-1" />Close correspondence
        </Button>
      </div>
    </div>
  );
}
