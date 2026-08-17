/**
 * Overview "command centre" summary for a complaint.
 * Presentation only — reads data already loaded by the detail page plus the
 * workflow tracking / action RPCs.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { complaintStatusLabel, complaintStatusVariant, complaintPriorityLabel } from '@/lib/complaintStatus';
import { slaBucketFromRow, slaStatusLabel, slaStatusVariant } from '@/lib/complaintsSla';
import { formatDateTime } from '@/lib/datetime';
import { useComplaintCurrentStepData } from '@/components/complaints/ComplaintCurrentStepPanel';
import { UnavailableStatus } from '@/components/complaints/DataState';
import {
  isClosurePhaseRelevant,
  summariseClosure,
  summariseRfis,
  summariseTasks,
  yourTaskLine,
} from '@/lib/complaintWorkflow';

interface Props {
  complaint: any;
  complaintTypeName?: string | null;
  complainantName?: string | null;
  licenseeName?: string | null;
  onOpenCurrentStep: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm truncate">{value ?? '—'}</div>
    </div>
  );
}

export function ComplaintOverviewSummary({
  complaint,
  complaintTypeName,
  complainantName,
  licenseeName,
  onOpenCurrentStep,
}: Props) {
  const { trackingQ, actionsQ, tasksQ, closureQ, rfisQ } = useComplaintCurrentStepData(complaint.id);
  const tracking = trackingQ.data ?? null;
  const actions = actionsQ.data ?? [];
  const tasks = summariseTasks(tasksQ.data as any);
  const rfi = summariseRfis(rfisQ.data as any);
  const closure = summariseClosure(closureQ.data as any);
  const closurePhase = isClosurePhaseRelevant(actions, complaint.status, closure);
  const task = yourTaskLine(actions);
  const sla = slaBucketFromRow(complaint);

  /** Never present a failed/pending query as a business conclusion. */
  const guarded = (
    q: { isLoading: boolean; isError: boolean; refetch: () => unknown },
    thing: string,
    render: () => React.ReactNode,
  ): React.ReactNode => {
    if (q.isError) return <UnavailableStatus label={`${thing} status unavailable`} onRetry={() => q.refetch()} />;
    if (q.isLoading) return <span className="text-muted-foreground">Checking…</span>;
    return render();
  };


  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Case summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Complaint number" value={<span className="font-mono">{complaint.complaint_number}</span>} />
          <Row label="Complainant" value={complainantName || complaint.email || '—'} />
          <Row label="Regulated entity" value={licenseeName || 'Not linked'} />
          <Row label="Complaint type" value={complaintTypeName || '—'} />
          <Row
            label="Case status"
            value={<Badge variant={complaintStatusVariant(complaint.status)}>{complaintStatusLabel(complaint.status)}</Badge>}
          />
          <Row
            label="Current workflow step"
            value={guarded(trackingQ, 'Workflow', () => tracking?.current_step_label || 'Not started')}
          />
          <Row label="Severity" value={<span className="capitalize">{complaint.severity || '—'}</span>} />
          <Row label="Priority" value={<span>{complaintPriorityLabel(complaint.priority)}</span>} />
          <Row label="SLA" value={<Badge variant={slaStatusVariant(sla)} className="capitalize">{slaStatusLabel(sla)}</Badge>} />
          <Row
            label="Assigned to"
            value={guarded(trackingQ, 'Workflow', () => tracking?.assigned_user_name || tracking?.assigned_role || 'Unassigned')}
          />
          <Row
            label="Vulnerability"
            value={(complaint as any).is_vulnerable_customer ? 'Vulnerable customer' : ((complaint as any).vulnerability_review_state ?? '—')}
          />
          <Row
            label="Open investigation tasks"
            value={guarded(tasksQ, 'Investigation task', () =>
              tasks.total === 0 ? 'None created' : `${tasks.open} open · ${tasks.label}`)}
          />
          <Row
            label="Information requests"
            value={guarded(rfisQ, 'Information request', () =>
              rfi.state === 'none' ? 'None raised' : `${rfi.label}${rfi.openCount > 1 ? ` (${rfi.openCount} open)` : ''}`)}
          />
          <Row
            label="Closure & QA"
            value={guarded(closureQ, 'Closure', () => (closurePhase ? closure.label : 'Not applicable yet'))}
          />
          <Row label="Received" value={formatDateTime(complaint.created_at)} />
          <Row label="Last updated" value={formatDateTime(complaint.updated_at)} />
        </div>

        <div className="rounded-md border border-primary/40 bg-primary/5 p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {actionsQ.isError
                ? 'Outstanding actions could not be loaded'
                : task ?? 'Nothing is waiting on you right now'}
            </p>
            <p className="text-xs text-muted-foreground">
              {trackingQ.isError
                ? 'Workflow status unavailable'
                : tracking?.current_step_label
                  ? `Current step: ${tracking.current_step_label}`
                  : 'The workflow has not started yet.'}
            </p>
          </div>
          <Button size="sm" onClick={onOpenCurrentStep}>
            Go to current step<ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ComplaintOverviewSummary;
