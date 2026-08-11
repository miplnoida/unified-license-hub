/**
 * MCS-CMP-006 — closure and QA review.
 *
 * Every closure/QA decision is appended to `complaint_closure_reviews`
 * (append-only), so a prior closure decision can never be silently
 * overwritten and closed-case history stays reconstructable.
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
import { closureDecisionLabel } from '@/lib/complaintWorkflow';
import { formatDateTime } from '@/lib/datetime';

const OUTCOMES = ['upheld', 'partially_upheld', 'not_upheld', 'withdrawn', 'referred', 'no_jurisdiction'];

/** Turn the backend's validation reasons into plain sentences for staff. */
function friendlyRecordError(e: unknown): string {
  const raw =
    (e as any)?.message ??
    (typeof e === 'string' ? e : '') ??
    '';
  const msg = String(raw).toLowerCase();
  if (msg.includes('resolution summary')) return 'Add a resolution before recording a closure decision.';
  if (msg.includes('rationale')) return 'The rationale must be at least 10 characters.';
  if (msg.includes('outcome category')) return 'Choose an outcome before recording a closure decision.';
  if (msg.includes('evidence completeness')) return 'Tick “Evidence is complete” before recording a closure decision.';
  if (msg.includes('return reason')) return 'Give a return reason of at least 10 characters.';
  if (msg.includes('not authorised') || msg.includes('42501')) {
    return 'You do not have permission to record a closure decision.';
  }
  return raw ? `Could not record decision: ${raw}` : 'Could not record decision. Please try again.';
}


export function ClosureQaPanel({
  complaintId,
  readOnly = false,
  currentStepLabel = null,
  availableActionLabels = [],
  onGoToCurrentStep,
}: {
  complaintId: string;
  readOnly?: boolean;
  /** Configured label of the step the complaint sits on right now. */
  currentStepLabel?: string | null;
  /** Configured labels of the workflow actions this user may perform now. */
  availableActionLabels?: string[];
  onGoToCurrentStep?: () => void;
}) {
  const qc = useQueryClient();
  const [resolution, setResolution] = useState('');
  const [rationale, setRationale] = useState('');
  const [outcome, setOutcome] = useState('');
  const [commRef, setCommRef] = useState('');
  const [evidenceComplete, setEvidenceComplete] = useState(false);
  const [qaRequired, setQaRequired] = useState(false);
  const [qaNote, setQaNote] = useState('');


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

  const record = useMutation({
    mutationFn: async (args: { decision: string; note?: string }) => {
      const { data, error } = await supabase.rpc('complaint_record_closure_review', {
        _complaint_id: complaintId,
        _decision: args.decision,
        _resolution_summary: resolution || null,
        _rationale: args.note ?? rationale ?? null,
        _outcome_category: outcome || null,
        _final_communication_ref: commRef || null,
        _evidence_complete: evidenceComplete,
        _qa_required: qaRequired,
        _reviewer_id: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint_closure_reviews', complaintId] });
      toast.success('Decision recorded');
    },
    onError: (e) => toast.error(friendlyRecordError(e)),
  });

  const latest = reviews?.[0] as any | undefined;
  const latestLabel = closureDecisionLabel(latest?.decision);
  /** Once QA has approved (or a closure assessment is recorded), QA is done. */
  const qaLocked = (reviews ?? []).some(
    (r: any) => r.decision === 'qa_approved' || r.decision === 'closed',
  );

  /** Client-side mirror of the server's closure requirements. */
  const missing: string[] = [];
  if (!resolution.trim()) missing.push('Add a resolution describing how the complaint was handled.');
  if (rationale.trim().length < 10) missing.push('Write a rationale of at least 10 characters.');
  if (!outcome) missing.push('Choose an outcome.');
  if (!evidenceComplete) missing.push('Confirm that evidence is complete.');


  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
        This section records the <strong>closure assessment and QA decision</strong> only. It does not close the
        complaint. The complaint moves to <strong>Closed</strong> when the configured workflow action is performed on the{' '}
        <strong>Current step</strong> tab.
      </div>

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

      {!readOnly && (
      <Card>
        <CardHeader><CardTitle className="text-base">Closure assessment</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="cq-res">Resolution</Label>
              <Textarea id="cq-res" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="cq-rat">Rationale (min 10 characters)</Label>
              <Textarea id="cq-rat" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
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
            <div className="flex items-center gap-2">
              <Checkbox id="cq-qa" checked={qaRequired} onCheckedChange={(v) => setQaRequired(v === true)} />
              <Label htmlFor="cq-qa" className="font-normal">QA review required before closure</Label>
            </div>
          </div>
          {missing.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
              <p className="font-medium">What's still needed before you can record a closure decision</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button data-rbac="complaint_management.edit" disabled={record.isPending || missing.length > 0}
              onClick={() => record.mutate({ decision: 'closure_proposed' })}>
              {record.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Propose closure (recommendation)
            </Button>
            <Button variant="outline" data-rbac="complaint_management.edit"
              disabled={record.isPending || missing.length > 0}
              onClick={() => record.mutate({ decision: 'closed' })}>
              Record closure assessment
            </Button>
          </div>

        </CardContent>
      </Card>
      )}

      {!readOnly && (
      <Card>
        <CardHeader><CardTitle className="text-base">QA review</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {qaLocked ? (
            <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm">
              <p className="font-medium">Quality review completed</p>
              <p className="text-muted-foreground">
                {latestLabel.label}
                {latest?.decided_at ? ` on ${formatDateTime(latest.decided_at)}` : ''} — no further quality review
                action is needed. The complaint is closed from the <strong>Current step</strong> tab.
              </p>
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="cq-qanote">QA note / return reason (at least 10 characters when returning)</Label>
                <Textarea id="cq-qanote" rows={2} value={qaNote} onChange={(e) => setQaNote(e.target.value)} />
                {qaNote.trim().length > 0 && qaNote.trim().length < 10 && (
                  <p className="mt-1 text-xs text-destructive">
                    Add at least 10 characters to return this case to the officer.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" data-rbac="complaint_management.edit" disabled={record.isPending}
                  onClick={() => record.mutate({ decision: 'qa_approved', note: qaNote || 'QA approved' })}>
                  {record.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}QA approve
                </Button>
                <Button variant="outline" data-rbac="complaint_management.edit"
                  disabled={record.isPending || qaNote.trim().length < 10}
                  onClick={() => record.mutate({ decision: 'qa_returned', note: qaNote })}>
                  Return to officer
                </Button>
              </div>
            </>
          )}
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
                Evidence complete: {r.evidence_complete ? 'yes' : 'no'} · QA required: {r.qa_required ? 'yes' : 'no'}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
