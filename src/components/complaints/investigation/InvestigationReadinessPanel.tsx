/**
 * MC-03 — Outcome readiness.
 *
 * Readiness is computed by `complaint_investigation_readiness` and nothing here
 * re-derives it. When every blocker clears, the domain-event bridge moves the
 * complaint from Investigation casework to Outcome review — there is no button
 * that forces the phase.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { CaseWorkSection } from '@/lib/complaintWorkflow';
import type { InvestigationWorkspace } from '@/hooks/useComplaintInvestigation';

interface Props {
  workspace: InvestigationWorkspace;
  onOpenSection?: (section: CaseWorkSection) => void;
}

export function InvestigationReadinessPanel({ workspace, onOpenSection }: Props) {
  const r = workspace.readiness;
  const ready = r.readiness === 'READY_FOR_OUTCOME_REVIEW';
  const blockers = r.blockers ?? [];

  return (
    <Card className={ready ? 'border-emerald-600/40' : undefined}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base">Ready for outcome review?</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            The complaint moves to outcome review by itself once everything below is settled.
          </p>
        </div>
        <Badge variant={ready ? 'secondary' : 'outline'}>{ready ? 'Ready' : 'Not yet ready'}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {ready ? (
          <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            The investigation record is complete. Outcome review can proceed.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {blockers.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        <dl className="grid gap-2 pt-1 sm:grid-cols-2 text-xs text-muted-foreground">
          <div className="flex justify-between rounded-md border p-2">
            <dt>Allegations in scope</dt><dd className="font-mono">{r.allegations_in_scope ?? 0}</dd>
          </div>
          <div className="flex justify-between rounded-md border p-2">
            <dt>Awaiting assessment</dt><dd className="font-mono">{r.allegations_awaiting_assessment ?? 0}</dd>
          </div>
          <div className="flex justify-between rounded-md border p-2">
            <dt>Open information requests</dt><dd className="font-mono">{r.open_information_requests ?? 0}</dd>
          </div>
          <div className="flex justify-between rounded-md border p-2">
            <dt>Open representation windows</dt><dd className="font-mono">{r.open_representation_windows ?? 0}</dd>
          </div>
          <div className="flex justify-between rounded-md border p-2 sm:col-span-2">
            <dt>Incomplete mandatory work items</dt><dd className="font-mono">{r.incomplete_mandatory_tasks ?? 0}</dd>
          </div>
        </dl>

        {onOpenSection && (
          <div className="flex flex-wrap gap-2 pt-1">
            {(r.open_information_requests ?? 0) > 0 && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onOpenSection('rfis')}>
                Open information requests<ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            )}
            {ready && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onOpenSection('closure')}>
                Go to closure &amp; QA<ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default InvestigationReadinessPanel;
