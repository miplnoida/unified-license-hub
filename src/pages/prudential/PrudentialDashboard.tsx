/**
 * EPR-02 — Prudential dashboard: read-only portfolio view.
 *
 * Answers "what is the supervisory risk position, what is deteriorating, what
 * needs attention, what is overdue, where is workload concentrated" from the
 * single `prudential_dashboard_portfolio()` read model. It never mutates
 * supervisory state, never runs engine sweeps (see Administration → Prudential
 * engine operations) and never computes regulatory thresholds in React. Every
 * actionable figure drills into the canonical Prudential work queue.
 */
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Clock, ListChecks } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/datetime';
import { humanize } from '@/lib/presentation/statusLabels';
import { usePrudentialPortfolio } from '@/hooks/usePrudentialProcess';
import { useSectorRiskDistribution, useSweepSchedule } from '@/hooks/usePrudentialSupervision';

const WORK = '/prudential/work';

function Stat({ label, value, to, tone }: { label: string; value: number | string | undefined; to?: string; tone?: 'warning' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-amber-600' : tone === 'success' ? 'text-emerald-600' : '';
  const body = (
    <Card className="h-full transition hover:shadow">
      <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent><div className={`text-2xl font-semibold ${color}`}>{value ?? 0}</div></CardContent>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

/** A sweep is considered stale once it has not completed for more than 36h. */
function isStale(iso?: string | null): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  return !Number.isFinite(t) || Date.now() - t > 36 * 60 * 60 * 1000;
}

export default function PrudentialDashboard() {
  const { data: p, isLoading, error } = usePrudentialPortfolio();
  const { data: sectorRisk = [] } = useSectorRiskDistribution();
  const { data: schedule } = useSweepSchedule();
  const lastSweep = schedule?.last_monitoring_sweep?.completed_at || schedule?.last_monitoring_sweep?.started_at;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Prudential supervision</h1>
            <p className="text-sm text-muted-foreground">
              Portfolio position and supervisory workload. This view is read-only — all supervisory
              action is taken from the work queue and case workspaces.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to={WORK}><ListChecks className="mr-2 h-4 w-4" />Open work queue</Link>
          </Button>
        </div>

        {error ? (
          <Card><CardContent className="py-4 text-sm text-destructive">{(error as Error).message}</CardContent></Card>
        ) : null}

        <Card>
          <CardContent className="flex flex-wrap items-center gap-6 py-3 text-sm">
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Last automated monitoring sweep</div>
                <div className="font-medium">{formatDateTime(lastSweep)}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Portfolio generated</div>
                <div className="font-medium">{p ? formatDateTime(p.generated_at) : '—'}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {isStale(lastSweep) && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-start gap-2 py-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
              <div>
                <div className="font-medium text-destructive">Monitoring data may be stale</div>
                <div className="text-muted-foreground">
                  The automated monitoring sweep has not completed in the last 36 hours, so breach,
                  early-warning and risk figures may not reflect the latest accepted filings. A reprocessing
                  run can be requested from Administration → Prudential engine operations.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Entities in scope" value={p?.portfolio.entities_in_scope} to="/prudential/entities" />
            <Stat label="Entities with signals" value={p?.portfolio.entities_with_signals} tone="warning" to={`${WORK}?type=BREACH,EWI,STRESS_EVENT`} />
            <Stat label="Current breaches" value={p?.signals.current_breaches} tone="danger" to={`${WORK}?type=BREACH`} />
            <Stat label="Awaiting acknowledgement" value={p?.signals.unacknowledged_breaches} tone="danger" to={`${WORK}?type=BREACH`} />
            <Stat label="Open early warnings" value={p?.signals.open_ewis} tone="warning" to={`${WORK}?type=EWI`} />
            <Stat label="Open supervisory actions" value={p?.work.open_actions} to={`${WORK}?type=SUPERVISORY_ACTION`} />
            <Stat label="Overdue work" value={p?.work.overdue} tone="danger" to={`${WORK}?sla=overdue`} />
            <Stat label="Due soon" value={p?.work.due_soon} tone="warning" to={`${WORK}?sla=due_soon`} />
            <Stat label="Assessments in progress" value={p?.work.assessments_in_progress} to={`${WORK}?type=ASSESSMENT`} />
            <Stat label="Open escalations" value={p?.work.open_escalations} tone="warning" to={`${WORK}?type=ESCALATION`} />
            <Stat label="Active examinations" value={p?.work.examinations_active} to={`${WORK}?type=EXAMINATION`} />
            <Stat label="Unassigned work" value={p?.work.unassigned} tone="warning" to={`${WORK}?scope=unassigned`} />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Entities requiring attention</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {(p?.deteriorating ?? []).map((e) => (
                <Link key={e.entity_id} to={`/entities/${e.entity_id}`}
                      className="flex items-center justify-between rounded border-b px-1 py-1.5 hover:bg-muted/50">
                  <span className="truncate">{e.entity_name}</span>
                  <span className="text-muted-foreground">{e.signals} signal(s) · {e.open_work} open item(s)</span>
                </Link>
              ))}
              {!p?.deteriorating?.length && <div className="text-muted-foreground">No entity currently carries a prudential signal.</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Upcoming supervisory deadlines</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {(p?.upcoming ?? []).map((u, i) => (
                <div key={`${u.title}-${i}`} className="flex items-center justify-between border-b py-1.5">
                  <span className="min-w-0 truncate">
                    {u.href ? <Link to={u.href} className="hover:underline">{u.title}</Link> : u.title}
                    <span className="text-muted-foreground"> · {u.entity_name}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">{formatDateTime(u.sla_due_at)}</span>
                </div>
              ))}
              {!p?.upcoming?.length && <div className="text-muted-foreground">No upcoming deadlines.</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Workload concentration</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {(p?.workload ?? []).map((w, i) => (
                <Link key={`${w.owner_user_id ?? 'unassigned'}-${i}`}
                      to={w.owner_user_id ? WORK : `${WORK}?scope=unassigned`}
                      className="flex items-center justify-between border-b py-1.5 hover:bg-muted/50">
                  <span className="truncate">{w.owner_name}{w.team ? <span className="text-muted-foreground"> · {w.team}</span> : null}</span>
                  <span className="text-muted-foreground">
                    {w.items} item(s){w.overdue ? <Badge variant="outline" className="ml-2 border-destructive/30 bg-destructive/10 text-[10px] text-destructive">{w.overdue} overdue</Badge> : null}
                  </span>
                </Link>
              ))}
              {!p?.workload?.length && <div className="text-muted-foreground">No open prudential work.</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Work by priority</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {Object.entries(p?.by_priority ?? {}).map(([k, v]) => (
                <Link key={k} to={WORK} className="flex items-center justify-between border-b py-1.5 hover:bg-muted/50">
                  <span>{humanize(k)}</span>
                  <span className="text-muted-foreground">{v}</span>
                </Link>
              ))}
              {!Object.keys(p?.by_priority ?? {}).length && <div className="text-muted-foreground">No open prudential work.</div>}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Sector risk distribution</CardTitle>
              <p className="text-xs text-muted-foreground">Analytical view · no supervisory action is taken here.</p>
            </CardHeader>
            <CardContent style={{ height: 260 }}>
              {sectorRisk.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sectorRisk}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="sector_name" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="entity_count" fill="hsl(var(--primary))" name="Entities" />
                    <Bar dataKey="breach_count" fill="hsl(var(--destructive))" name="Breaches" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="text-sm text-muted-foreground">No data.</div>}
            </CardContent>
          </Card>
        </div>

        <div className="text-sm text-muted-foreground">
          Looking for a specialist register? <Link to="/supervision/breaches" className="text-primary hover:underline">Breach register</Link>
          {' · '}<Link to="/prudential/analytics" className="text-primary hover:underline">Analytics</Link>
          {' · '}<Link to={WORK} className="inline-flex items-center gap-1 text-primary hover:underline">Work queue <ArrowUpRight className="h-3 w-3" /></Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
