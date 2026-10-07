/**
 * AML-CLOSE-08 — hold, release or close one running supervisory deadline.
 *
 * Only offered when the server says the viewer may manage deadlines. Hold
 * reasons come from the SLA policy recorded on the obligation; the server
 * re-checks permission, scope, policy and reason, and alone decides ON_TIME
 * or LATE. Nothing is calculated here.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  useSupervisoryResponseSlaComplete,
  useSupervisoryResponseSlaHold,
  type SlaObligation,
} from '@/hooks/useAmlSlaPolicy';

export function AmlSlaObligationControls({ obligation }: { obligation: SlaObligation }) {
  const hold = useSupervisoryResponseSlaHold();
  const complete = useSupervisoryResponseSlaComplete();
  const [reason, setReason] = useState('none');
  const [note, setNote] = useState('');
  const paused = obligation.stage?.state === 'paused';
  const reasons = obligation.pause_reasons ?? [];
  const busy = hold.isPending || complete.isPending;
  const id = obligation.obligation_id;

  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message.replace(/^[a-z_]+:\s*/, '') : 'The request was refused');
  const done = (msg: string) => { setNote(''); setReason('none'); toast.success(msg); };

  return (
    <div className="space-y-2 rounded-md border p-3" data-testid={`sla-controls-${id}`}>
      <Label htmlFor={`sla-note-${id}`}>Written explanation (at least 10 characters)</Label>
      <Textarea id={`sla-note-${id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      <div className="flex flex-wrap items-end gap-2">
        {!paused && obligation.pause_permitted ? (
          <>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-72" aria-label="Hold reason">
                <SelectValue placeholder="Choose a hold reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>Choose a hold reason</SelectItem>
                {reasons.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ').toLowerCase()}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button data-rbac="aml_supervision.review" variant="outline" size="sm" disabled={busy || reason === 'none'}
              onClick={() => hold.mutate({ obligationId: id, reason, rationale: note },
                { onSuccess: () => done('Deadline put on hold'), onError: fail })}>
              Put deadline on hold
            </Button>
          </>
        ) : null}
        {paused ? (
          <Button data-rbac="aml_supervision.review" variant="outline" size="sm" disabled={busy}
            onClick={() => hold.mutate({ obligationId: id, reason: '', rationale: note, resume: true },
              { onSuccess: () => done('Deadline resumed'), onError: fail })}>
            Resume deadline
          </Button>
        ) : null}
        <Button data-rbac="aml_supervision.review" size="sm" disabled={busy}
          onClick={() => complete.mutate({ obligationId: id, reason: note },
            { onSuccess: (r) => done(`Response closed — ${r.outcome === 'ON_TIME' ? 'on time' : r.outcome === 'LATE' ? 'late' : r.outcome}`), onError: fail })}>
          Close response
        </Button>
      </div>
    </div>
  );
}

export default AmlSlaObligationControls;
