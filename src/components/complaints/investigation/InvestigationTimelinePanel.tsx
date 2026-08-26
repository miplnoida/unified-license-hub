/**
 * MC-03 — Investigation activity timeline.
 *
 * Read-only over `complaint_investigation_timeline`. Business-readable events
 * only: the server decides what is worth showing; the UI never derives events.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History } from 'lucide-react';
import { SectionState } from '@/components/complaints/DataState';
import { formatDateTime } from '@/lib/datetime';
import { useInvestigationTimeline } from '@/hooks/useComplaintInvestigation';

interface Props {
  complaintId: string;
}

const SOURCE_LABEL: Record<string, string> = {
  plan: 'Investigation plan',
  allegation: 'Allegation',
  evidence: 'Evidence',
  representation: 'Representation',
  task: 'Work item',
  rfi: 'Information request',
  note: 'Internal note',
  workflow: 'Phase',
  complaint: 'Complaint',
};

export function InvestigationTimelinePanel({ complaintId }: Props) {
  const timelineQ = useInvestigationTimeline(complaintId);
  const events = timelineQ.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />Activity
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          What has happened on this investigation, most recent first.
        </p>
      </CardHeader>
      <CardContent>
        <SectionState
          isLoading={timelineQ.isLoading}
          isError={timelineQ.isError}
          isEmpty={events.length === 0}
          noun="activity"
          onRetry={() => timelineQ.refetch()}
          emptyText="No investigation activity has been recorded yet."
        >
          <ol className="space-y-2">
            {events.map((e, i) => (
              <li key={`${e.at}-${i}`} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {SOURCE_LABEL[String(e.source)] ?? String(e.source ?? '').replace(/_/g, ' ')}
                  </Badge>
                  <p className="text-sm font-medium">{e.label}</p>
                </div>
                {e.detail && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{e.detail}</p>}
                <p className="text-xs text-muted-foreground mt-1">{formatDateTime(e.at)}</p>
              </li>
            ))}
          </ol>
        </SectionState>
      </CardContent>
    </Card>
  );
}

export default InvestigationTimelinePanel;
