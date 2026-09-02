import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  TIMELINE_CATEGORY_LABELS,
  useSupervisoryTimeline,
  type SupervisoryTimelineEvent,
} from '@/hooks/useSupervisoryTimeline';

/**
 * EPIC 4 / W2 — the single supervisory timeline for an entity.
 *
 * Answers "what has happened, who decided it and why" using only the
 * authoritative supervisory records.
 */
export function SupervisoryTimelinePanel({ entityId }: { entityId: string }) {
  const [category, setCategory] = useState<string | null>(null);
  const { data, isLoading, error } = useSupervisoryTimeline({ entityId, category });

  const categories = Object.entries(data?.counts ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Supervisory timeline</CardTitle>
        <CardDescription>
          Every recorded supervisory decision and event for this entity, in order, with the
          responsible officer and the reason given at the time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={category === null ? 'default' : 'outline'}
              onClick={() => setCategory(null)}
            >
              All activity
            </Button>
            {categories.map(([key, count]) => (
              <Button
                key={key}
                size="sm"
                variant={category === key ? 'default' : 'outline'}
                onClick={() => setCategory(key)}
              >
                {TIMELINE_CATEGORY_LABELS[key] ?? key} ({count})
              </Button>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="py-10 text-center text-muted-foreground">
            <Loader2 className="inline h-5 w-5 animate-spin" aria-label="Loading supervisory timeline" />
          </div>
        )}

        {error && (
          <p className="py-8 text-center text-sm text-destructive">
            The supervisory timeline could not be loaded. {(error as Error).message}
          </p>
        )}

        {!isLoading && !error && (data?.events.length ?? 0) === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No supervisory activity has been recorded for this entity yet.
          </p>
        )}

        {!isLoading && !error && (data?.events.length ?? 0) > 0 && (
          <ol className="space-y-3 border-l pl-4">
            {data!.events.map((event, index) => (
              <TimelineRow key={`${event.source_object}-${event.source_id}-${event.event_type}-${index}`} event={event} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineRow({ event }: { event: SupervisoryTimelineEvent }) {
  return (
    <li className="relative space-y-1">
      <span className="absolute -left-[1.4rem] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{event.title ?? event.event_type}</span>
        <Badge variant="outline">{TIMELINE_CATEGORY_LABELS[event.event_category] ?? event.event_category}</Badge>
        {event.domain_code && <Badge variant="secondary">{event.domain_code.replace(/_/g, ' ')}</Badge>}
        {event.is_decision && <Badge>Decision</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">
        {new Date(event.occurred_at).toLocaleString()}
        {event.reference ? ` · ${event.reference}` : ''}
      </p>
      {event.detail && <p className="text-sm text-muted-foreground">{event.detail}</p>}
      {event.rationale && (
        <p className="text-sm">
          <span className="font-medium">Reason recorded: </span>
          {event.rationale}
        </p>
      )}
    </li>
  );
}
