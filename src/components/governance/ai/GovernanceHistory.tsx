/**
 * MC-08 — lifecycle history for a governed AI configuration.
 *
 * Who created it, who approved it, when it became effective, whether it was
 * suspended and why, who reinstated it, whether it was retired. Append-only on
 * the server; this view can only read it.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  useGovernanceEvents, useGovernanceEventsForObject, type GovernanceEventRow,
} from '@/hooks/useAiGovernance';
import { EVENT_LABEL, LIFECYCLE_LABEL, label } from '@/lib/aiGovernanceLabels';
import { formatDateTime } from '@/lib/datetime';

export function GovernanceHistory({
  objectType, objectCode, objectId, title = 'Governance history',
}: { objectType: string; objectCode?: string; objectId?: string; title?: string }) {
  const byCode = useGovernanceEvents(objectType, objectId ? undefined : objectCode, 200);
  const byId = useGovernanceEventsForObject(objectType, objectId ?? null);
  const { data: events = [], isLoading } = objectId ? byId : byCode;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading history…</p>}
        {!isLoading && events.length === 0 && (
          <p className="text-sm text-muted-foreground">No governance decisions recorded for this configuration yet.</p>
        )}
        {events.map((e: GovernanceEventRow) => (
          <div key={e.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{label(EVENT_LABEL, e.event_type)}</Badge>
              {e.from_state && e.to_state && (
                <span className="text-xs text-muted-foreground">
                  {label(LIFECYCLE_LABEL, e.from_state)} → {label(LIFECYCLE_LABEL, e.to_state)}
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(e.created_at)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Recorded by {e.actor_id ? 'a signed-in officer' : 'the system'}
              {(e.metadata as Record<string, unknown>)?.actor_role
                ? ` (${String((e.metadata as Record<string, unknown>).actor_role)})`
                : ''}
            </p>
            {e.rationale && <p className="mt-2 text-sm whitespace-pre-wrap">{e.rationale}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
