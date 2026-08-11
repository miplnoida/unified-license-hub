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

const OUTCOMES = ['upheld', 'partially_upheld', 'not_upheld', 'withdrawn', 'referred', 'no_jurisdiction'];

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
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not record decision'),
  });

  const latest = reviews?.[0] as any | undefined;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
        This section records the <strong>closure assessment and QA decision</strong> only. It does not close the
        complaint. The complaint moves to <strong>Closed</strong> when the configured workflow action is performed on the{' '}
        <strong>Current step</strong> tab.
      </div>

      {readOnly && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          Closure &amp; QA becomes available later in the workflow. The history below stays visible.
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
          <div className="flex flex-wrap gap-2">
            <Button data-rbac="complaint_management.edit" disabled={record.isPending}
              onClick={() => record.mutate({ decision: 'closure_proposed' })}>
              {record.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Propose closure (recommendation)
            </Button>
            <Button variant="outline" data-rbac="complaint_management.edit" disabled={record.isPending}
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
          <div>
            <Label htmlFor="cq-qanote">QA note / return reason (min 10 characters when returning)</Label>
            <Textarea id="cq-qanote" rows={2} value={qaNote} onChange={(e) => setQaNote(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" data-rbac="complaint_management.edit"
              onClick={() => record.mutate({ decision: 'qa_approved', note: qaNote || 'QA approved' })}>
              QA approve
            </Button>
            <Button variant="outline" data-rbac="complaint_management.edit"
              onClick={() => record.mutate({ decision: 'qa_returned', note: qaNote })}>
              Return to officer
            </Button>
          </div>
          {latest && (
            <p className="text-xs text-muted-foreground">
              Latest decision: <Badge variant="outline">{latest.decision}</Badge>{' '}
              {new Date(latest.decided_at).toLocaleString()}
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
              <div className="flex items-center justify-between">
                <Badge variant="outline">{r.decision}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(r.decided_at).toLocaleString()}</span>
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
