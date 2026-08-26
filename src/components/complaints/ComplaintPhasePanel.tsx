/**
 * Canonical phase panel for the Market Conduct complaint workflow.
 *
 * This REPLACES the retired step-action controller. There are no "advance"
 * buttons here by design: the canonical workflow ("Market Conduct — Consumer
 * Complaint") is driven by domain events, so the complaint moves when the
 * business decision is recorded in the owning workspace — jurisdiction
 * decision, triage confirmation, plan approval, outcome readiness. The panel
 * explains the phase, what blocks it, and routes the officer to the one place
 * where the decision is actually made.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight, Clock, Loader2, ShieldCheck } from 'lucide-react';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { PHASE_SECTION, useComplaintWorkflowState } from '@/hooks/useComplaintWorkflowState';
import type { CaseWorkSection } from '@/lib/complaintWorkflow';

interface Props {
  complaintId: string;
  onOpenSection: (section: CaseWorkSection) => void;
}

const SLA_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  on_track: 'secondary',
  due_soon: 'default',
  breached: 'destructive',
  paused: 'outline',
};

export function ComplaintPhasePanel({ complaintId, onOpenSection }: Props) {
  const stateQ = useComplaintWorkflowState(complaintId);

  if (stateQ.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Working out the current phase…
        </CardContent>
      </Card>
    );
  }

  if (stateQ.isError) {
    return (
      <QueryErrorState
        title="We couldn’t load the current phase"
        message="The Market Conduct phase for this complaint could not be read. Please try again."
        onRetry={() => stateQ.refetch()}
      />
    );
  }

  const s = stateQ.data;

  if (!s?.has_instance) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Market Conduct phase</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            This complaint is not yet on the Market Conduct complaint workflow. It joins the workflow as soon as the
            first business decision is recorded — start with the jurisdiction assessment.
          </p>
          <Button size="sm" variant="outline" onClick={() => onOpenSection('jurisdiction')}>
            Open jurisdiction assessment<ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  const blockers = s.blockers ?? [];
  const section = s.phase_key ? PHASE_SECTION[s.phase_key] : undefined;

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base">Market Conduct phase</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            The phase changes automatically when the business decision for it is recorded. There is no separate
            “advance” action — the decision itself moves the case.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {s.sla_status && (
            <Badge variant={SLA_VARIANT[s.sla_status] ?? 'outline'} className="capitalize">
              {String(s.sla_status).replace(/_/g, ' ')}
            </Badge>
          )}
          {s.is_terminal && <Badge variant="outline">Concluded</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Current phase</p>
            <p className="text-sm font-medium mt-1">{s.phase ?? '—'}</p>
            {s.phase_description && <p className="text-xs text-muted-foreground mt-1">{s.phase_description}</p>}
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">With whom</p>
            <p className="text-sm font-medium mt-1 capitalize">
              {(s.with_whom ?? '').replace(/_/g, ' ') || 'Market Conduct team'}
            </p>
            {s.phase_updated_at && (
              <p className="text-xs text-muted-foreground mt-1">Since {formatDateTime(s.phase_updated_at)}</p>
            )}
          </div>
        </div>

        {s.next_action && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm font-medium">{s.next_action}</p>
            {section && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 px-2 text-xs"
                onClick={() => onOpenSection(section as CaseWorkSection)}
              >
                Go there<ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        )}

        {blockers.length > 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3 space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
              <AlertTriangle className="h-4 w-4" />What is holding this phase
            </p>
            <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
              {blockers.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
        )}

        {blockers.length === 0 && !s.is_terminal && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Nothing is blocking this phase.
          </p>
        )}

        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {s.what_happens_next && <span>Next phase: <strong className="text-foreground">{s.what_happens_next}</strong></span>}
          {s.operational_target && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />Operational target {formatDateOnly(s.operational_target)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ComplaintPhasePanel;
