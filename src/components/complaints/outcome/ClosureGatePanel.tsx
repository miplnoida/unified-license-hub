/**
 * MC-04 — Closure readiness and quality review.
 *
 * Readiness and whether a quality review is required both come from the server
 * (`complaint_closure_readiness`, which carries the applicable quality-review
 * policy). Nothing is recalculated here. The officer who prepared the outcome
 * cannot review or approve their own case — the server enforces that and this
 * panel simply surfaces the refusal.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle2, Loader2, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/datetime';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { useComplaintOutcome, qaDecisionLabel } from '@/hooks/useComplaintOutcome';

interface Props {
  complaintId: string;
  complaintUpdatedAt?: string | null;
  onOpenOutcome?: () => void;
  onOpenRedress?: () => void;
}

type DialogMode = 'submit_qa' | 'qa_pass' | 'qa_return' | 'close' | 'letter' | null;

export function ClosureGatePanel({ complaintId, complaintUpdatedAt, onOpenOutcome, onOpenRedress }: Props) {
  const { closureReadinessQ, closureReviewsQ, submitForQa, recordQa, closeComplaint, issueOutcomeLetter } =
    useComplaintOutcome(complaintId);
  const [mode, setMode] = useState<DialogMode>(null);
  const [rationale, setRationale] = useState('');
  const [findings, setFindings] = useState('');

  const r = closureReadinessQ.data;
  const qa = r?.qa;
  const reviews = closureReviewsQ.data ?? [];

  const onError = (e: any) => {
    const m = String(e?.message ?? '');
    if (m.includes('separation_of_duties')) toast.error('You cannot review or approve a case you worked on. A different officer must complete this step.');
    else if (m.includes('closure_blocked')) toast.error('Closure is blocked — see the outstanding items listed above.');
    else if (m.includes('qa_not_required')) toast.error('A quality review is not required for this complaint.');
    else if (m.includes('outcome_not_recorded')) toast.error('The final outcome must be completed first.');
    else if (m.includes('letter_body_required')) toast.error('Write the letter to the consumer before issuing it.');
    else if (m.includes('rationale_required')) toast.error('A written reason is required.');
    else if (m.includes('complaint_stale')) toast.error('This complaint changed elsewhere. Reload before continuing.');
    else toast.error(m || 'Action failed');
  };

  const confirm = () => {
    const done = (msg: string) => { toast.success(msg); setMode(null); setRationale(''); setFindings(''); };
    if (mode === 'submit_qa') submitForQa.mutate({ note: rationale }, { onError, onSuccess: () => done('Sent for quality review') });
    if (mode === 'qa_pass') recordQa.mutate({ decision: 'qa_approved', findings, rationale }, { onError, onSuccess: () => done('Quality review passed') });
    if (mode === 'qa_return') recordQa.mutate({ decision: 'qa_returned', findings, rationale }, { onError, onSuccess: () => done('Returned for correction') });
    if (mode === 'letter') issueOutcomeLetter.mutate({ subject: findings || undefined, body: rationale }, { onError, onSuccess: () => done('Outcome letter issued to the consumer') });
    if (mode === 'close') closeComplaint.mutate({ rationale, expectedUpdatedAt: complaintUpdatedAt ?? null }, { onError, onSuccess: () => done('Complaint closed') });
  };


  if (closureReadinessQ.isLoading) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Checking closure readiness…</CardContent></Card>;
  }
  if (closureReadinessQ.isError) {
    return <QueryErrorState title="Failed to check closure readiness" error={closureReadinessQ.error} onRetry={() => closureReadinessQ.refetch()} />;
  }

  const closed = r?.readiness === 'CLOSED';
  const ready = r?.readiness === 'READY_FOR_CLOSURE';
  const blockers = r?.blockers ?? [];
  const checklist = (qa?.checklist ?? []) as Array<any>;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- readiness */}
      <Card className={ready || closed ? 'border-emerald-600/40' : undefined}>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base">Can this complaint be closed?</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Checked centrally against the case record. Closure is only possible once everything below is settled.
            </p>
          </div>
          <Badge variant={closed ? 'secondary' : ready ? 'default' : 'outline'}>
            {closed ? 'Closed' : ready ? 'Ready to close' : 'Not ready'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {closed ? (
            <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />This complaint is closed. The outcome and closure record remain available below.
            </p>
          ) : ready ? (
            <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />Every closure requirement is satisfied.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {blockers.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><span>{b}</span>
                </li>
              ))}
              {blockers.length === 0 && <li className="text-muted-foreground">No details available.</li>}
            </ul>
          )}

          {!closed && (
            <div className="flex flex-wrap gap-2 pt-1">
              {onOpenOutcome && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onOpenOutcome}>Go to outcome</Button>}
              {onOpenRedress && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onOpenRedress}>Go to redress</Button>}
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setMode('letter')}>Issue outcome letter</Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => closureReadinessQ.refetch()}>Re-check</Button>
            </div>
          )}

        </CardContent>
      </Card>

      {/* -------------------------------------------------- quality review */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base">Quality review</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Whether a quality review is required is decided by policy, based on the risk of the case.
            </p>
          </div>
          <Badge variant={qa?.qa_required ? (qa?.qa_passed ? 'secondary' : 'default') : 'outline'}>
            {qa?.qa_required ? (qa?.qa_passed ? 'Review passed' : 'Review required') : 'Not required'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {qa?.qa_required ? (
            <>
              <dl className="grid gap-2 sm:grid-cols-2 text-xs">
                <div><dt className="text-muted-foreground">Policy applied</dt><dd>{qa.policy_label || '—'}</dd></div>
                <div><dt className="text-muted-foreground">Reviewer</dt><dd>{qa.reviewer_role ? String(qa.reviewer_role).replace(/_/g, ' ') : 'Supervisory officer'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-muted-foreground">Why a review is required</dt><dd>{qa.policy_basis || '—'}</dd></div>
                <div><dt className="text-muted-foreground">Last decision</dt><dd>{qa.latest_decision ? qaDecisionLabel(qa.latest_decision) : 'Not yet reviewed'}</dd></div>
                <div><dt className="text-muted-foreground">Decided</dt><dd>{qa.latest_decided_at ? formatDateTime(qa.latest_decided_at) : '—'}</dd></div>
              </dl>

              {checklist.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Review checklist</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                    {checklist.map((c, i) => <li key={i}>{typeof c === 'string' ? c : c?.label || c?.item || 'Checklist item'}</li>)}
                  </ul>
                </div>
              )}

              {!closed && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => { setRationale(''); setMode('submit_qa'); }}>
                    <ClipboardCheck className="mr-1 h-3.5 w-3.5" />Send for quality review
                  </Button>
                  <Button size="sm" onClick={() => { setRationale(''); setFindings(''); setMode('qa_pass'); }}>
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" />Pass review
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setRationale(''); setFindings(''); setMode('qa_return'); }}>
                    Return for correction
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              No quality review is required for this complaint under the current policy. Closure can proceed once the outstanding items are settled.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ close */}
      {!closed && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Close the complaint</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Closing records the closure decision and moves the case to its final step. Where a quality review is required, the
              officer who prepared the outcome cannot approve the closure.
            </p>
            <Button size="sm" disabled={!ready} onClick={() => { setRationale(''); setMode('close'); }}>
              Approve and close
            </Button>
            {!ready && <p className="text-xs text-muted-foreground">Closure becomes available once the checks above are clear.</p>}
          </CardContent>
        </Card>
      )}

      {/* -------------------------------------------------- decision history */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Review and closure decisions</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {closureReviewsQ.isError ? (
            <QueryErrorState compact message="Failed to load decisions" onRetry={() => closureReviewsQ.refetch()} />
          ) : reviews.length === 0 ? (
            <p className="text-muted-foreground">No review or closure decision has been recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {reviews.map((v) => (
                <li key={v.id} className="space-y-1 py-2 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{qaDecisionLabel(v.decision)}</span>
                    <span className="text-xs text-muted-foreground">{v.decided_at ? formatDateTime(v.decided_at) : '—'}</span>
                  </div>
                  {v.qa_findings && <p className="whitespace-pre-wrap text-xs"><span className="text-muted-foreground">Findings: </span>{v.qa_findings}</p>}
                  {v.rationale && <p className="whitespace-pre-wrap text-xs"><span className="text-muted-foreground">Reasons: </span>{v.rationale}</p>}
                  {v.qa_policy_basis && <p className="text-xs text-muted-foreground">Policy basis: {v.qa_policy_basis}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === 'submit_qa' ? 'Send for quality review'
                : mode === 'qa_pass' ? 'Pass the quality review'
                : mode === 'qa_return' ? 'Return for correction'
                : 'Approve and close the complaint'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(mode === 'qa_pass' || mode === 'qa_return') && (
              <div>
                <Label>Review findings</Label>
                <Textarea rows={3} value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="What the review examined and observed." />
              </div>
            )}
            <div>
              <Label>{mode === 'submit_qa' ? 'Note for the reviewer' : 'Reasons for this decision'}</Label>
              <Textarea rows={4} value={rationale} onChange={(e) => setRationale(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>Cancel</Button>
            <Button onClick={confirm} disabled={submitForQa.isPending || recordQa.isPending || closeComplaint.isPending}>
              {(submitForQa.isPending || recordQa.isPending || closeComplaint.isPending) && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ClosureGatePanel;
