/**
 * Entity 360 cross-domain timeline.
 *
 * Presents the entity's regulatory history as a narrative of dated events with
 * domain filters, so a supervisor can reconstruct what happened and when.
 */
import { useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTimestamp } from '@/lib/presentation/format';
import { humanize, titleCase } from '@/lib/presentation/statusLabels';
import { useEntity360Timeline } from '@/hooks/useEntity360';

const TIMELINE_DOMAINS = [
  'licensing', 'ownership', 'governance', 'returns', 'risk', 'examination',
  'enforcement', 'conduct', 'aml', 'resilience', 'requests', 'change', 'correspondence',
];

export function Entity360TimelinePanel({ entityId }: { entityId: string }) {
  const [domains, setDomains] = useState<string[]>([]);
  const { data, isLoading } = useEntity360Timeline(entityId, domains);
  const events = data?.events ?? [];

  const toggle = (d: string) =>
    setDomains((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" aria-hidden /> Regulatory history
        </CardTitle>
        <CardDescription>
          {data?.total ?? 0} recorded events across the entity lifecycle
          {domains.length > 0 ? ` · filtered to ${domains.length} domain${domains.length === 1 ? '' : 's'}` : ''}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-2">
          {TIMELINE_DOMAINS.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={domains.includes(d) ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => toggle(d)}
            >
              {titleCase(d)}
            </Button>
          ))}
          {domains.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDomains([])}>
              Show all domains
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="inline h-5 w-5 animate-spin" aria-label="Loading history" />
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No events recorded for the selected domains.
          </p>
        )}

        {events.length > 0 && (
          <ol className="relative space-y-4 border-l pl-6">
            {events.map((ev, i) => (
              <li key={`${ev.source_table}-${ev.source_id}-${i}`} className="relative">
                <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs">{titleCase(ev.domain)}</Badge>
                  <span className="font-medium">{ev.title || humanize(ev.event_type)}</span>
                  <span className="text-xs text-muted-foreground">{formatTimestamp(ev.occurred_at)}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {humanize(ev.event_type)}{ev.detail ? ` · ${ev.detail}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default Entity360TimelinePanel;
