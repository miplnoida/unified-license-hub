/**
 * MC-07.5 — Human decision trail.
 *
 * Shows every supervisory decision recorded against an advisory: what changed,
 * who recorded it, when, the rationale given, and the approved wording where the
 * advisory was modified. The original AI suggestion is never overwritten.
 */
import { Badge } from '@/components/ui/badge';
import { ClassificationChip } from '@/components/conduct/three-sixty/ClassificationLegend';
import { formatDateTime } from '@/lib/conductFactLabels';
import { REVIEW_ACTION_META, reviewStateLabel, type ReviewAction } from '@/lib/conductAdvisoryLabels';
import type { AdvisoryReviewEvent } from '@/hooks/useConductAdvisory';
import { advisoryPlainText } from './advisoryText';

export function HumanDecisionTrail({ events }: { events: AdvisoryReviewEvent[] }) {
  if (!events || events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No supervisory decision has been recorded against this advisory yet.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {[...events].reverse().map((event) => {
        const actionMeta = REVIEW_ACTION_META[event.action as ReviewAction];
        const approved = advisoryPlainText(event.human_output);
        return (
          <li key={event.id} className="rounded-md border-l-2 border-success/50 bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <ClassificationChip type="HUMAN_DECISION" />
              <span className="text-sm font-semibold">{actionMeta?.label ?? event.action}</span>
              <Badge variant="outline" className="text-[11px]">
                {reviewStateLabel(event.from_state)} → {reviewStateLabel(event.to_state)}
              </Badge>
              <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(event.created_at)}</span>
            </div>
            {event.rationale && (
              <p className="mt-2 text-sm">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Rationale: </span>
                {event.rationale}
              </p>
            )}
            {approved && (
              <div className="mt-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Supervisor-approved wording</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{approved}</p>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
