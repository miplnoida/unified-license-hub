/**
 * MC-04 — Post-closure reconsideration.
 *
 * A reconsideration is a separate lifecycle attached to a closed complaint. The
 * original outcome and closure record are never rewritten: where a review leads
 * to the complaint being reopened, a fresh outcome cycle begins and the earlier
 * record stays visible as history.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Gavel, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/datetime';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { useInternalUsers } from '@/hooks/useInternalUsers';
import {
  useComplaintOutcome,
  reconsiderationStatusLabel,
  reconsiderationDecisionLabel,
  outcomeLabel,
  type ReconsiderationRow,
} from '@/hooks/useComplaintOutcome';

interface Props {
  complaintId: string;
  complaintStatus?: string | null;
}

const REQUESTER_OPTIONS = [
  { value: 'CONSUMER', label: 'The consumer' },
  { value: 'REPRESENTATIVE', label: 'A representative of the consumer' },
  { value: 'RESPONDENT', label: 'The firm complained about' },
  { value: 'OTHER', label: 'Another party' },
];

export function ReconsiderationPanel({ complaintId, complaintStatus }: Props) {
  const { reconsiderationsQ, outcomeQ, requestReconsideration, decideAdmissibility, assignReviewer, decideReconsideration } =
    useComplaintOutcome(complaintId);

  const officersQ = useInternalUsers(undefined, { activeOnly: true });
  const rows = reconsiderationsQ.data ?? [];
  const isClosed = complaintStatus === 'closed' || complaintStatus === 'resolved';
  const originalOutcome = outcomeQ.data?.outcome ?? null;

  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState({ requester_type: 'CONSUMER', requester_name: '', requester_contact: '', grounds: '' });

  const [action, setAction] = useState<null | { row: ReconsiderationRow; mode: 'admissibility' | 'reviewer' | 'decision' }>(null);
  const [rationale, setRationale] = useState('');
  const [choice, setChoice] = useState('');
  const [reviewerId, setReviewerId] = useState('');

  const onError = (e: any) => {
    const m = String(e?.message ?? '');
    if (m.includes('complaint_not_closed')) toast.error('A reconsideration can only be requested after the complaint is closed.');
    else if (m.includes('requester_required')) toast.error('Record who is asking for the review.');
    else if (m.includes('grounds_required')) toast.error('Record the grounds for the request.');
    else if (m.includes('rationale_required')) toast.error('A written reason is required.');
    else if (m.includes('admissibility_already_decided')) toast.error('Admissibility has already been decided.');
    else if (m.includes('not_admissible_yet')) toast.error('The request must be accepted before a reviewer is assigned.');
    else if (m.includes('reviewer_not_assigned')) toast.error('An independent reviewer must be assigned first.');
    else if (m.includes('separation_of_duties')) toast.error('The reviewer must be independent of the original case officer.');
    else toast.error(m || 'Action failed');
  };

  const submitNew = () => {
    requestReconsideration.mutate(draft as any, {
      onError,
      onSuccess: () => {
        toast.success('Reconsideration request recorded');
        setNewOpen(false);
        setDraft({ requester_type: 'CONSUMER', requester_name: '', requester_contact: '', grounds: '' });
      },
    });
  };

  const confirmAction = () => {
    if (!action) return;
    const done = (msg: string) => { toast.success(msg); setAction(null); setRationale(''); setChoice(''); setReviewerId(''); };
    if (action.mode === 'admissibility') {
      decideAdmissibility.mutate({ id: action.row.id, decision: choice as any, rationale }, { onError, onSuccess: () => done('Admissibility decision recorded') });
    }
    if (action.mode === 'reviewer') {
      assignReviewer.mutate({ id: action.row.id, reviewerId }, { onError, onSuccess: () => done('Independent reviewer assigned') });
    }
    if (action.mode === 'decision') {
      decideReconsideration.mutate({ id: action.row.id, decision: choice as any, rationale }, { onError, onSuccess: () => done('Review decision recorded') });
    }
  };

  if (reconsiderationsQ.isLoading) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading review history…</CardContent></Card>;
  }
  if (reconsiderationsQ.isError) {
    return <QueryErrorState title="Failed to load review history" error={reconsiderationsQ.error} onRetry={() => reconsiderationsQ.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base">Requests to reconsider the outcome</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Handled separately from the original complaint. The original outcome and closure record stay unchanged.
            </p>
          </div>
          <Button size="sm" disabled={!isClosed} onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />Record a request
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!isClosed && (
            <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              A reconsideration can only be recorded once the complaint has been closed.
            </p>
          )}

          {originalOutcome?.status === 'SUPERSEDED' && (
            <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              This complaint was reopened following a review. The earlier outcome is preserved under the outcome section's history.
            </p>
          )}

          {rows.length === 0 ? (
            <p className="text-muted-foreground">No request to reconsider this complaint has been received.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((v) => (
                <li key={v.id} className="space-y-2 py-3 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{v.reference || 'Review request'}</span>
                    <Badge variant={v.decision ? 'secondary' : 'outline'} className="ml-auto">{reconsiderationStatusLabel(v.status)}</Badge>
                  </div>
                  <dl className="grid gap-2 text-xs sm:grid-cols-3">
                    <div><dt className="text-muted-foreground">Requested by</dt><dd>{v.requester_name}</dd></div>
                    <div><dt className="text-muted-foreground">Capacity</dt><dd>{REQUESTER_OPTIONS.find((o) => o.value === v.requester_type)?.label ?? v.requester_type}</dd></div>
                    <div><dt className="text-muted-foreground">Received</dt><dd>{formatDateTime(v.received_at)}</dd></div>
                  </dl>
                  <div><p className="text-xs text-muted-foreground">Grounds</p><p className="whitespace-pre-wrap">{v.grounds}</p></div>
                  {v.admissibility_decision && (
                    <div className="rounded-md border p-2 text-xs">
                      <p className="font-medium">{v.admissibility_decision === 'ADMISSIBLE' ? 'Accepted for review' : 'Not admissible'}</p>
                      <p className="whitespace-pre-wrap text-muted-foreground">{v.admissibility_rationale}</p>
                      {v.admissibility_at && <p className="text-muted-foreground">{formatDateTime(v.admissibility_at)}</p>}
                    </div>
                  )}
                  {v.reviewer_assigned_at && (
                    <p className="text-xs text-muted-foreground">Independent reviewer assigned {formatDateTime(v.reviewer_assigned_at)}</p>
                  )}
                  {v.decision && (
                    <div className="rounded-md border p-2 text-xs">
                      <p className="font-medium">{reconsiderationDecisionLabel(v.decision)}</p>
                      <p className="whitespace-pre-wrap text-muted-foreground">{v.decision_rationale}</p>
                      {v.decided_at && <p className="text-muted-foreground">{formatDateTime(v.decided_at)}</p>}
                    </div>
                  )}

                  {!v.decision && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {!v.admissibility_decision && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                          onClick={() => { setRationale(''); setChoice('ADMISSIBLE'); setAction({ row: v, mode: 'admissibility' }); }}>
                          Decide admissibility
                        </Button>
                      )}
                      {v.admissibility_decision === 'ADMISSIBLE' && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                          onClick={() => { setReviewerId(''); setAction({ row: v, mode: 'reviewer' }); }}>
                          <UserCheck className="mr-1 h-3 w-3" />{v.reviewer_id ? 'Change reviewer' : 'Assign independent reviewer'}
                        </Button>
                      )}
                      {v.status === 'UNDER_REVIEW' && (
                        <Button size="sm" className="h-7 px-2 text-xs"
                          onClick={() => { setRationale(''); setChoice('UPHELD'); setAction({ row: v, mode: 'decision' }); }}>
                          <Gavel className="mr-1 h-3 w-3" />Record review decision
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {originalOutcome && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Outcome under review</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Original outcome: </span>{outcomeLabel(originalOutcome.overall_outcome)}</p>
            {originalOutcome.submitted_at && <p className="text-xs text-muted-foreground">Recorded {formatDateTime(originalOutcome.submitted_at)}</p>}
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{originalOutcome.outcome_rationale}</p>
          </CardContent>
        </Card>
      )}

      {/* -------------------------------------------------------- new request */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Record a request to reconsider</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Requested by</Label>
              <Input value={draft.requester_name} onChange={(e) => setDraft({ ...draft, requester_name: e.target.value })} placeholder="Name of the requester" />
            </div>
            <div>
              <Label>Capacity</Label>
              <Select value={draft.requester_type} onValueChange={(v) => setDraft({ ...draft, requester_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{REQUESTER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Contact details</Label>
              <Input value={draft.requester_contact} onChange={(e) => setDraft({ ...draft, requester_contact: e.target.value })} placeholder="Optional" />
            </div>
            <div className="sm:col-span-2">
              <Label>Grounds for the request</Label>
              <Textarea rows={4} value={draft.grounds} onChange={(e) => setDraft({ ...draft, grounds: e.target.value })}
                placeholder="Why the requester believes the outcome should be reconsidered." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={submitNew} disabled={requestReconsideration.isPending}>
              {requestReconsideration.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Record request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------ actions */}
      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.mode === 'admissibility' ? 'Decide admissibility'
                : action?.mode === 'reviewer' ? 'Assign an independent reviewer'
                : 'Record the review decision'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {action?.mode === 'admissibility' && (
              <div>
                <Label>Decision</Label>
                <Select value={choice} onValueChange={setChoice}>
                  <SelectTrigger><SelectValue placeholder="Select a decision" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMISSIBLE">Accept for review</SelectItem>
                    <SelectItem value="NOT_ADMISSIBLE">Not admissible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {action?.mode === 'reviewer' && (
              <div>
                <Label>Independent reviewer</Label>
                <Select value={reviewerId || 'none'} onValueChange={(v) => setReviewerId(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select an officer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not selected</SelectItem>
                    {(officersQ.data ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name || u.email || 'Officer'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">The reviewer must not be the original case officer.</p>
              </div>
            )}
            {action?.mode === 'decision' && (
              <div>
                <Label>Decision</Label>
                <Select value={choice} onValueChange={setChoice}>
                  <SelectTrigger><SelectValue placeholder="Select a decision" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UPHELD">Uphold the original outcome</SelectItem>
                    <SelectItem value="VARIED">Vary the original outcome</SelectItem>
                    <SelectItem value="REOPENED">Reopen the complaint</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reopening starts a fresh outcome cycle. The original outcome and closure record are preserved as history.
                </p>
              </div>
            )}
            {action?.mode !== 'reviewer' && (
              <div>
                <Label>Reasons for this decision</Label>
                <Textarea rows={4} value={rationale} onChange={(e) => setRationale(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button onClick={confirmAction}
              disabled={decideAdmissibility.isPending || assignReviewer.isPending || decideReconsideration.isPending || (action?.mode === 'reviewer' && !reviewerId)}>
              {(decideAdmissibility.isPending || assignReviewer.isPending || decideReconsideration.isPending) && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ReconsiderationPanel;
