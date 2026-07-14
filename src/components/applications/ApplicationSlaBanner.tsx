import { Clock } from 'lucide-react';
import { useWorkflowSlaInstances } from '@/hooks/useWorkflowSlaInstances';
import { useWorkflowTotalSla } from '@/hooks/useWorkflowTotalSla';
import { SlaProgressPanel } from '@/components/workflows/SlaIndicator';
import { TotalSlaBadge } from '@/components/workflows/TotalSlaBadge';

interface Props {
  applicationId: string;
  className?: string;
}

/**
 * Internal-only prominent SLA timer rendered near the workflow/status area
 * on the Application Detail page. Restores the SLA visibility that existed
 * before the Decision-Ready Summary was introduced.
 *
 * Read-only: never mutates workflow_instances or SLA values.
 */
export function ApplicationSlaBanner({ applicationId, className }: Props) {
  const { byEntityId, isLoading } = useWorkflowSlaInstances({
    entityType: 'application',
    entityIds: [applicationId],
  });
  const { byEntityId: totalByApp } = useWorkflowTotalSla({
    entityType: 'application',
    entityIds: [applicationId],
  });
  const total = totalByApp.get(applicationId);

  if (isLoading) return null;

  const entry = byEntityId.get(applicationId);

  if (!entry) {
    return (
      <div className={`space-y-2 ${className ?? ''}`}>
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          No active workflow SLA found
        </div>
        {total && total.stepCount > 0 && <TotalSlaBadge entry={total} variant="card" />}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <SlaProgressPanel input={entry.slaInput} title="Workflow SLA" />
      {total && total.stepCount > 0 && <TotalSlaBadge entry={total} variant="card" />}
    </div>
  );
}
