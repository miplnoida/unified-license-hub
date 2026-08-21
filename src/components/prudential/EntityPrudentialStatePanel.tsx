/**
 * EPR-02 — Entity 360 prudential state.
 *
 * A concise supervisory state summary served by `prudential_entity_state()`:
 * rating, latest accepted reporting period, current signals, open actions,
 * current assessment, assigned supervisor and the next required supervisory
 * action. Drill-downs go to the canonical work queue or case workspace — this
 * panel never duplicates prudential tables and never mutates state.
 */
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/datetime';
import { formatDate } from '@/lib/presentation/format';
import { humanize } from '@/lib/presentation/statusLabels';
import { usePrudentialEntityState } from '@/hooks/usePrudentialProcess';

function Stat({ label, value, tone, to }: { label: string; value: number | string; tone?: 'danger' | 'warning'; to?: string }) {
  const color = tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-amber-600' : '';
  const body = (
    <div className="rounded-md border px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
  return to ? <Link to={to} className="block transition hover:bg-muted/40">{body}</Link> : body;
}

export function EntityPrudentialStatePanel({ entityId }: { entityId: string }) {
  const { data, isLoading, error } = usePrudentialEntityState(entityId);

  if (isLoading) return <Skeleton className="h-56 w-full" />;
  if (error) return <Card><CardContent className="py-4 text-sm text-destructive">{(error as Error).message}</CardContent></Card>;
  if (!data || data.allowed === false) return null;

  const queue = (type: string) => `/prudential/work?entity=${entityId}&type=${type}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" /> Prudential state
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Supervisory position from canonical prudential truth · as at {formatDateTime(data.generated_at)}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Overall supervisory rating</div>
            <div className="text-sm font-medium">{data.overall_rating ? humanize(data.overall_rating) : 'Not rated'}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Latest accepted reporting period</div>
            <div className="text-sm font-medium">
              {data.latest_accepted_period?.period_end ? (
                data.latest_accepted_period.filing_id ? (
                  <Link to={`/admin/returns/filings/${data.latest_accepted_period.filing_id}`} className="hover:underline">
                    {data.latest_accepted_period.period_label ?? formatDate(data.latest_accepted_period.period_end)}
                  </Link>
                ) : (data.latest_accepted_period.period_label ?? formatDate(data.latest_accepted_period.period_end))
              ) : 'No accepted filing'}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Assigned supervisor</div>
            <div className="text-sm font-medium">
              {data.supervisor?.name ?? 'Unassigned'}
              {data.supervisor?.team ? <span className="text-muted-foreground"> · {data.supervisor.team}</span> : null}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Current assessment</div>
            <div className="text-sm font-medium">
              {data.current_assessment ? (
                <Link to={`/prudential/assessments/${data.current_assessment.id}`} className="hover:underline">
                  {humanize(data.current_assessment.status)}
                  {data.current_assessment.period_end ? ` · ${formatDate(data.current_assessment.period_end)}` : ''}
                </Link>
              ) : 'None'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Current breaches" value={data.signals.breaches} tone={data.signals.breaches ? 'danger' : undefined} to={queue('BREACH')} />
          <Stat label="Early warnings" value={data.signals.ewis} tone={data.signals.ewis ? 'warning' : undefined} to={queue('EWI')} />
          <Stat label="Open actions" value={data.actions.open} to={queue('SUPERVISORY_ACTION')} />
          <Stat label="Overdue actions" value={data.actions.overdue} tone={data.actions.overdue ? 'danger' : undefined} to={queue('SUPERVISORY_ACTION')} />
          <Stat label="Escalations" value={data.escalations_open} to={queue('ESCALATION')} />
          <Stat label="Stress events" value={data.signals.stress_events} to={queue('STRESS_EVENT')} />
          <Stat label="Plan actions" value={data.plan_actions_open} to={queue('PLAN_ACTION')} />
          <Stat label="Active examinations" value={data.examinations_active} to={queue('EXAMINATION')} />
        </div>

        {data.signals.unacknowledged_breaches > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            <div className="flex items-center gap-1 font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {data.signals.unacknowledged_breaches} breach signal(s) awaiting supervisor acknowledgement
            </div>
            <p className="text-muted-foreground">
              Acknowledgement records that a supervisor has reviewed the signal — it does not resolve the
              risk or close any supervisory action.
            </p>
          </div>
        )}

        {data.next_required_action ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Next required supervisory action</div>
            <div className="mt-0.5 font-medium">
              {data.next_required_action.href ? (
                <Link to={data.next_required_action.href} className="inline-flex items-center gap-1 text-primary hover:underline">
                  {data.next_required_action.label} <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              ) : data.next_required_action.label}
            </div>
            <div className="text-muted-foreground">
              {data.next_required_action.title}
              {data.next_required_action.sla_due_at ? ` · Due ${formatDate(data.next_required_action.sla_due_at)}` : ''}
            </div>
            <Badge variant="outline" className="mt-1 text-[10px]">{humanize(data.next_required_action.priority)} priority</Badge>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No outstanding prudential work for this entity.</p>
        )}

        <Link to={`/prudential/work?entity=${entityId}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          Open all prudential work for this entity <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
