/**
 * Phase 1A — SLA stage timeline.
 *
 * Shows the persisted stage SLA record (start, due, state, where the SLA
 * duration came from) and its append-only event history, so pause/resume/
 * breach/escalation evidence is visible in the case view rather than only
 * recomputed on the fly.
 */
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Timer } from 'lucide-react';
import { useSlaStageHistory, type SlaStageEventRow } from '@/hooks/useSlaStageHistory';

const STATE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  paused: 'secondary',
  breached: 'destructive',
  completed: 'outline',
};

const EVENT_LABEL: Record<string, string> = {
  started: 'Stage started',
  paused: 'SLA paused',
  resumed: 'SLA resumed',
  breached: 'SLA breached',
  escalated: 'Escalation dispatched',
  completed: 'Stage completed',
};

function fmt(ts?: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function eventDetail(ev: SlaStageEventRow): string {
  const bits: string[] = [];
  if (ev.reason) bits.push(ev.reason);
  const md = ev.metadata || {};
  if (md.tier != null) bits.push(`tier ${md.tier}`);
  if (md.pause_seconds_added != null) {
    bits.push(`+${Math.round(Number(md.pause_seconds_added) / 60)}m paused`);
  }
  if (md.sla_source) bits.push(`SLA from ${md.sla_source}`);
  return bits.join(' · ');
}

interface Props {
  entityType: string;
  entityId?: string | null;
}

export function SlaStageTimeline({ entityType, entityId }: Props) {
  const { data, isLoading, isError } = useSlaStageHistory(entityType, entityId);

  if (!entityId) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Timer className="h-4 w-4" /> SLA stage evidence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading SLA history…
          </div>
        )}
        {isError && (
          <p className="text-sm text-muted-foreground">SLA history is not available for your role.</p>
        )}
        {!isLoading && !isError && (data?.stages.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            No SLA stage record yet for this case.
          </p>
        )}
        {(data?.stages ?? []).map(stage => {
          const events = (data?.events ?? []).filter(e => e.stage_instance_id === stage.id);
          return (
            <div key={stage.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{stage.stage_name || 'Stage'}</span>
                <Badge variant={STATE_VARIANT[stage.state] ?? 'outline'}>{stage.state}</Badge>
                <Badge variant="outline">
                  {stage.sla_hours != null
                    ? `${stage.sla_hours}h (${stage.sla_source === 'configuration' ? 'SLA Manager' : 'workflow step'})`
                    : 'SLA not configured'}
                </Badge>
              </div>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                <div><dt className="text-muted-foreground">Started</dt><dd>{fmt(stage.started_at)}</dd></div>
                <div><dt className="text-muted-foreground">Due</dt><dd>{fmt(stage.due_at)}</dd></div>
                <div>
                  <dt className="text-muted-foreground">Paused time</dt>
                  <dd>{Math.round((stage.pause_seconds ?? 0) / 60)} min</dd>
                </div>
              </dl>
              {events.length > 0 && (
                <ul className="mt-3 space-y-1 border-t pt-2 text-sm">
                  {events.map(ev => (
                    <li key={ev.id} className="flex flex-wrap items-baseline gap-2">
                      <span className="text-muted-foreground">{fmt(ev.occurred_at)}</span>
                      <span className="font-medium">{EVENT_LABEL[ev.event_type] ?? ev.event_type}</span>
                      <span className="text-muted-foreground">
                        {ev.actor_kind === 'system' ? '(system)' : '(user)'}
                      </span>
                      {eventDetail(ev) && <span className="text-muted-foreground">{eventDetail(ev)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
