/**
 * MCS-CMP-006 — closure assessment.
 *
 * Every closure decision is appended to `complaint_closure_reviews`
 * (append-only), so a prior closure decision can never be silently
 * overwritten and closed-case history stays reconstructable. The single
 * "Close complaint" action records the assessment and then performs the
 * configured closing workflow action, so the complaint status actually moves.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { closureDecisionLabel, type WorkflowAction } from '@/lib/complaintWorkflow';
import { formatDateTime } from '@/lib/datetime';

const OUTCOMES = ['upheld', 'partially_upheld', 'not_upheld', 'withdrawn', 'referred', 'no_jurisdiction'];

/** Turn the backend's validation reasons into plain sentences for staff. */
function friendlyRecordError(e: unknown): string {
  const raw =
    (e as any)?.message ??
    (typeof e === 'string' ? e : '') ??
    '';
  const msg = String(raw).toLowerCase();
  if (msg.includes('resolution summary')) return 'Add a resolution before closing the complaint.';
  if (msg.includes('rationale')) return 'The rationale must be at least 10 characters.';
  if (msg.includes('outcome category')) return 'Choose an outcome before closing the complaint.';
  if (msg.includes('evidence completeness')) return 'Tick “Evidence is complete” before closing the complaint.';
  if (msg.includes('stale_state')) return 'Someone else acted on this complaint. Please reload and try again.';
  if (msg.includes('role_not_permitted')) return 'Your role isn’t allowed to close this complaint.';
  if (msg.includes('action_not_allowed_at_step')) return 'Closing isn’t available at the current workflow step.';
  if (msg.includes('not authorised') || msg.includes('42501')) {
    return 'You do not have permission to close this complaint.';
  }
  return raw ? `Could not close the complaint: ${raw}` : 'Could not close the complaint. Please try again.';
}

/**
 * Pick the configured workflow action that closes the case. Nothing is
 * hardcoded to a specific complaint workflow: we look at the mutation kind and
 * fall back to the action's target step.
 */
function resolveClosingAction(
  actions: WorkflowAction[],
  terminalStepKeys: string[] = [],
): WorkflowAction | null {
  const list = actions ?? [];
  const terminal = new Set(terminalStepKeys);
  const byTerminalTarget = list.filter(
    (a: any) => a.target_step_key && terminal.has(a.target_step_key),
  );
  return (
    list.find((a: any) => a.mutation_kind === 'close_complaint') ||
    list.find((a: any) => a.mutation_kind === 'resolve_complaint') ||
    list.find((a: any) => a.target_step_key === 'closed') ||
    list.find((a: any) => a.target_step_key === 'resolved') ||
    // Configured terminal step (from the workflow tracking steps), so a
    // renamed closing step still resolves without hardcoded keys.
    byTerminalTarget[0] ||
    null
  );
}

interface ReviewLike {
  decision: string;
}

function hasQaApproved(reviews: ReviewLike[] | undefined | null): boolean {
  return (reviews ?? []).some((r) => r.decision === 'qa_approved');
}


export function ClosureQaPanel({
  complaintId,
  readOnly = false,
  currentStepLabel = null,
  availableActionLabels = [],
  availableActions = [],
  terminalStepKeys = [],
  actionsLoading = false,
  actionsError = false,
  onRetryActions,
  status = null,
  onGoToCurrentStep,
}: {
  complaintId: string;
  readOnly?: boolean;
  /** Configured label of the step the complaint sits on right now. */
  currentStepLabel?: string | null;
  /** Configured labels of the workflow actions this user may perform now. */
  availableActionLabels?: string[];
  /** Full configured actions available now, used to resolve the closing action. */
  availableActions?: WorkflowAction[];
  /** Step keys the configured workflow marks as terminal. */
  terminalStepKeys?: string[];
  actionsLoading?: boolean;
  actionsError?: boolean;
  onRetryActions?: () => void;
  status?: string | null;
  onGoToCurrentStep?: () => void;
}) {
  const qc = useQueryClient();
  const [resolution, setResolution] = useState('');
  const [rationale, setRationale] = useState('');
  const [outcome, setOutcome] = useState('');
  const [commRef, setCommRef] = useState('');
  const [evidenceComplete, setEvidenceComplete] = useState(false);

  const closureQ = useQuery({
    queryKey: ['complaint_closure_reviews', complaintId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_closure_reviews')
        .select('*')
        .eq('complaint_id', complaintId)
        .order('decided_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const reviews = closureQ.data;
  const isLoading = closureQ.isLoading;

  // Canonical, domain-driven closure gate. Market Conduct complaints are closed
  // through `complaint_close`, not through a configured step action, so the
  // server's readiness verdict is what decides whether closing is possible.
  const readinessQ = useQuery({
    queryKey: ['mc04_closure_readiness', complaintId],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('complaint_closure_readiness', {
        _complaint_id: complaintId,
      });
      if (error) throw error;
      const d = (data ?? {}) as any;
      return {
        readiness: (d?.readiness ?? 'NOT_READY') as string,
        blockers: (d?.blockers ?? []) as string[],
      };
    },
  });
  const readiness = readinessQ.data;

  const closingAction = resolveClosingAction(availableActions, terminalStepKeys);
  const alreadyClosed = status === 'closed' || status === 'resolved' || status === 'withdrawn';

  const closeMut = useMutation({
    mutationFn: async () => {
      if (!closingAction) {
        // Domain closure: records the closure review, closes the complaint and
        // syncs the phase server-side in one governed call.
        const { data: c, error: cErr } = await supabase
          .from('complaints')
          .select('updated_at')
          .eq('id', complaintId)
          .maybeSingle();
        if (cErr) throw cErr;

        const { error } = await (supabase as any).rpc('complaint_close', {
          _complaint_id: complaintId,
          _payload: {
            resolution_summary: resolution || null,
            rationale: rationale || null,
            final_communication_ref: commRef || null,
          },
          _expected_updated_at: (c as any)?.updated_at ?? null,
        });
        if (error) throw error;
        return;
      }

      // 1) record the closure assessment (append-only history)
      const { error: recErr } = await supabase.rpc('complaint_record_closure_review', {
        _complaint_id: complaintId,
        _decision: 'closed',
        _resolution_summary: resolution || null,
        _rationale: rationale || null,
        _outcome_category: outcome || null,
        _final_communication_ref: commRef || null,
        _evidence_complete: evidenceComplete,
        _qa_required: false,
        _reviewer_id: null,
      });
      if (recErr) throw recErr;

      // 2) perform the configured closing workflow action
      const { data: tracking, error: trackErr } = await (supabase as any).rpc('get_complaint_tracking', {
        _complaint_id: complaintId,
      });
      if (trackErr) throw trackErr;

      const payload: Record<string, any> = { comments: rationale };
      for (const f of ((closingAction as any).required_fields || []) as Array<{ key: string }>) {
        payload[f.key] =
          f.key === 'resolution' || f.key === 'findings'
            ? resolution || rationale
            : f.key === 'closure_reason'
              ? rationale
              : rationale;
      }

      const { error: actErr } = await (supabase as any).rpc('execute_complaint_workflow_action', {
        _complaint_id: complaintId,
        _action_key: (closingAction as any).action_key,
        _payload: payload,
        _expected_updated_at: (tracking || {})?.instance_updated_at ?? null,
      });
      if (actErr) throw actErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint_closure_reviews', complaintId] });
      qc.invalidateQueries({ queryKey: ['mc04_closure_readiness', complaintId] });
      qc.invalidateQueries({ queryKey: ['mc04_closure_reviews', complaintId] });
      qc.invalidateQueries({ queryKey: ['complaint', complaintId] });
      qc.invalidateQueries({ queryKey: ['complaint_actions', complaintId] });
      qc.invalidateQueries({ queryKey: ['complaint_tracking', complaintId] });
      qc.invalidateQueries({ queryKey: ['complaint_workflow_state', complaintId] });
      toast.success('Complaint closed');
    },
    onError: (e) => toast.error(friendlyRecordError(e)),
  });


  const latest = reviews?.[0] as any | undefined;
  const latestLabel = closureDecisionLabel(latest?.decision);

  /** Client-side mirror of the server's closure requirements. */
  const missing: string[] = [];
  if (resolution.trim().length < 10) missing.push('Write a resolution of at least 10 characters.');
  if (rationale.trim().length < 10) missing.push('Write a rationale of at least 10 characters.');
  if (!outcome) missing.push('Choose an outcome.');
  if (!evidenceComplete) missing.push('Confirm that evidence is complete.');

  return (
    <div className="space-y-4">
      {readOnly && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm space-y-2">
          {currentStepLabel && (
            <p>
              This complaint is at step <strong>{currentStepLabel}</strong>.
            </p>
          )}
          <p className="text-muted-foreground">
            The closure assessment opens once the case reaches the investigation / closure stage of the
            configured workflow. Recorded decisions below stay visible.
          </p>
          <p>
            {availableActionLabels.length > 0 ? (
              <>
                Next action available to you:{' '}
                <strong>{availableActionLabels.join(', ')}</strong> — on the <strong>Current step</strong> tab.
              </>
            ) : (
              <span className="text-muted-foreground">No workflow action is available to you at this step.</span>
            )}
          </p>
          {onGoToCurrentStep && (
            <Button size="sm" variant="outline" onClick={onGoToCurrentStep}>
              Go to Current step
            </Button>
          )}
        </div>
      )}

      {!readOnly && alreadyClosed && (
        <Card>
          <CardHeader><CardTitle className="text-base">Complaint closed</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="text-muted-foreground">
              This complaint is closed. No further closure assessment is needed.
            </p>
            {latest && (
              <p>
                Recorded outcome: <strong>{latest.outcome_category || '—'}</strong> ·{' '}
                {formatDateTime(latest.decided_at)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!readOnly && !alreadyClosed && (
      <Card>
        <CardHeader><CardTitle className="text-base">Closure assessment</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="cq-res">Resolution (min 10 characters)</Label>
              <Textarea id="cq-res" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">{resolution.trim().length}/10 characters</p>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="cq-rat">Rationale (min 10 characters)</Label>
              <Textarea id="cq-rat" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">{rationale.trim().length}/10 characters</p>
            </div>
            <div>
              <Label>Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue placeholder="Select outcome" /></SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => <SelectItem key={o} value={o}>{o.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cq-comm">Final communication reference</Label>
              <Input id="cq-comm" value={commRef} onChange={(e) => setCommRef(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="cq-ev" checked={evidenceComplete}
                onCheckedChange={(v) => setEvidenceComplete(v === true)} />
              <Label htmlFor="cq-ev" className="font-normal">Evidence is complete</Label>
            </div>
          </div>
          {missing.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
              <p className="font-medium">What's still needed before you can close this complaint</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          )}
          {actionsError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm flex flex-wrap items-center gap-2">
              <span>We couldn’t check the available workflow actions.</span>
              {onRetryActions && (
                <Button size="sm" variant="outline" onClick={onRetryActions}>Retry</Button>
              )}
            </div>
          )}
          {hasQaApproved(reviews) && closingAction && (
            <p className="text-sm text-muted-foreground">
              QA approved — the closure assessment passed quality review. Complete the fields
              below and click <strong>Close complaint</strong> to finalise the case here.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button data-rbac="complaint_management.edit"
              disabled={closeMut.isPending || actionsLoading || missing.length > 0 || !closingAction}
              onClick={() => closeMut.mutate()}>
              {(closeMut.isPending || actionsLoading) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {actionsLoading ? 'Checking workflow…' : 'Close complaint'}
            </Button>
            {!actionsLoading && !actionsError && !closingAction && (
              <span className="text-xs text-muted-foreground">
                {hasQaApproved(reviews) ? (
                  <>
                    QA approved — the closure assessment passed quality review. The case is waiting
                    for the remaining workflow/domain requirement before it can be finalised. Check
                    the <strong>Current step</strong> tab for what is still needed.
                  </>
                ) : availableActionLabels.length > 0 ? (
                  <>
                    No closing action is configured for you at this step. Available to you:{' '}
                    <strong>{availableActionLabels.join(', ')}</strong> — use the{' '}
                    <strong>Current step</strong> tab.
                  </>
                ) : (
                  <>No workflow action is available to you right now — use the <strong>Current step</strong> tab.</>
                )}
              </span>
            )}
            {!closingAction && onGoToCurrentStep && !actionsLoading && (
              <Button size="sm" variant="outline" onClick={onGoToCurrentStep}>
                {hasQaApproved(reviews) ? 'Review Current step' : 'Go to Current step'}
              </Button>
            )}
          </div>
          {latest && (
            <p className="text-xs text-muted-foreground">
              Latest decision: <strong>{latestLabel.label}</strong>
              {latestLabel.meaning ? ` — ${latestLabel.meaning}` : ''} · {formatDateTime(latest.decided_at)}
            </p>
          )}
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Closure history</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {closureQ.isError ? (
            <QueryErrorState
              title="We couldn’t load the closure history"
              message="Closure history could not be loaded. Please try again."
              onRetry={() => closureQ.refetch()}
              compact
            />
          ) : isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading closure history…
            </p>
          ) : !reviews?.length ? (
            <p className="text-sm text-muted-foreground">No closure decisions have been recorded yet.</p>
          ) : reviews.map((r: any) => (
            <div key={r.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Badge variant="outline">{closureDecisionLabel(r.decision).label}</Badge>
                  {closureDecisionLabel(r.decision).meaning && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      — {closureDecisionLabel(r.decision).meaning}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{formatDateTime(r.decided_at)}</span>
              </div>
              {r.outcome_category && <div className="mt-1">Outcome: {r.outcome_category}</div>}
              {r.resolution_summary && <div className="mt-1">{r.resolution_summary}</div>}
              {r.rationale && <div className="mt-1 text-muted-foreground">{r.rationale}</div>}
              {r.final_communication_ref && (
                <div className="mt-1 text-xs">Final communication: {r.final_communication_ref}</div>
              )}
              <div className="mt-1 text-xs text-muted-foreground">
                Evidence complete: {r.evidence_complete ? 'yes' : 'no'}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
