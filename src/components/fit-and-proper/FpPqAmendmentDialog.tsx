import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Undo2 } from 'lucide-react';

interface Props {
  assessmentId: string;
  /** Query keys to refresh once the amendment has been recorded. */
  invalidateKeys?: unknown[][];
}

/**
 * Phase 3B — supervisor request for a PQ amendment.
 * Calls `fp_request_pq_amendment`, which keeps the previously submitted
 * response and its pinned form version intact.
 */
export function FpPqAmendmentDialog({ assessmentId, invalidateKeys = [] }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const request = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('fp_request_pq_amendment', {
        _assessment_id: assessmentId,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Amendment requested — the declarant can now revise the questionnaire.');
      setOpen(false);
      setReason('');
      invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key as string[] }));
    },
    onError: (e: unknown) => toast.error((e as Error)?.message || 'Could not request amendment'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-rbac="fit_and_proper.edit" size="sm" variant="ghost" className="h-7 text-xs">
          <Undo2 className="h-3 w-3 mr-1" />
          Amend
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request questionnaire amendment</DialogTitle>
          <DialogDescription>
            The submitted answers and the form version used are retained; the declarant is asked to
            provide a revised response.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="pq-amend-reason">Reason (required, min 10 characters)</Label>
          <Textarea
            id="pq-amend-reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain what must be corrected or clarified…"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            data-rbac="fit_and_proper.edit"
            disabled={request.isPending || reason.trim().length < 10}
            onClick={() => request.mutate()}
          >
            {request.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Request amendment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FpPqAmendmentDialog;
