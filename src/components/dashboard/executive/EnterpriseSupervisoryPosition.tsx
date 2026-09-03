import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, ArrowUpRight, Building2, ClipboardCheck, Gauge, Landmark, ShieldAlert } from 'lucide-react';
import { useEnterpriseSupervisoryOverview, RATING_ORDER } from '@/hooks/useEnterpriseSupervision';
import { DOMAIN_LABELS } from '@/hooks/useEntitySupervisory360';

/**
 * EPIC 4 / W5 — the enterprise supervisory position on the Executive Dashboard.
 *
 * Sourced only from `enterprise_supervisory_overview`, i.e. only from the
 * canonical supervisory spine (perimeter, entity risk state, findings,
 * remediation, attention, programme, work items, payment systems and PFMI).
 * The legacy KPI strip above it keeps its own licensing/returns/complaints
 * figures; nothing here is recomputed in the browser.
 */

const num = (v: unknown) => (typeof v === 'number' ? v : 0);

function Figure({
  label, value, sub, href, tone = 'default', icon,
}: {
  label: string; value: number | string; sub?: string; href?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success'; icon?: React.ReactNode;
}) {
  const toneClass =
    tone === 'danger' ? 'border-destructive/40 bg-destructive/5'
    : tone === 'warning' ? 'border-amber-300 bg-amber-50/60'
    : tone === 'success' ? 'border-emerald-300 bg-emerald-50/50'
    : 'border-border';
  const body = (
    <div className={`rounded-lg border p-3 ${toneClass} ${href ? 'transition hover:shadow-sm' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
  return href ? <Link to={href} className="block">{body}</Link> : body;
}

export function EnterpriseSupervisoryPosition({
  sectorId = null, windowDays = 30,
}: { sectorId?: string | null; windowDays?: number }) {
  const { data, isLoading, error } = useEnterpriseSupervisoryOverview(sectorId, windowDays);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Enterprise supervisory position</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.available) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Enterprise supervisory position</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error
              ? `The enterprise supervisory position could not be produced: ${(error as any)?.message ?? 'unknown error'}`
              : 'You are not authorised to view any supervisory domain, so no enterprise position can be shown.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const c = data.concern;
  const p = data.programme as Record<string, any>;
  const f = data.findings as Record<string, any>;
  const a = data.attention as Record<string, any>;
  const w = data.work;
  const pay = data.payment_systems as Record<string, any>;

  return (
    <div className="space-y-4">
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4" /> Enterprise supervisory position
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Canonical supervisory spine</Badge>
              <Badge variant="outline">{data.authorised_domains.length} domain(s) authorised</Badge>
              <Link to="/supervision/portfolio" className="text-xs font-medium text-primary hover:underline">
                Open portfolio <ArrowUpRight className="inline h-3 w-3" />
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label="Entities of concern" value={c.entities_of_concern}
            sub={`${c.entities_in_scope} in scope · ${c.multi_domain_concern} in more than one domain`}
            href="/supervision/portfolio?concern=1"
            tone={c.entities_of_concern > 0 ? 'warning' : 'success'}
            icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
          />
          <Figure
            label="Open findings" value={num(f.findings_open)}
            sub={`${num(f.findings_awaiting_response)} awaiting response · ${num(f.findings_overdue)} overdue`}
            href="/supervision/portfolio?concern=1"
            tone={num(f.findings_overdue) > 0 ? 'danger' : num(f.findings_open) > 0 ? 'warning' : 'success'}
            icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
          />
          <Figure
            label="Remediation health" value={num(f.remediation_open)}
            sub={`${num(f.remediation_overdue)} overdue · ${num(f.remediation_validation_pending)} awaiting validation · ${num(f.remediation_ineffective)} not effective`}
            href="/supervision/portfolio?overdue_remediation=1"
            tone={num(f.remediation_overdue) > 0 ? 'danger' : 'default'}
            icon={<ClipboardCheck className="h-4 w-4 text-muted-foreground" />}
          />
          <Figure
            label="Outstanding supervisory work" value={w.open}
            sub={`${w.overdue} overdue · ${w.unassigned} unassigned · ${w.decision_points} decision points`}
            href="/my-work"
            tone={w.overdue > 0 ? 'warning' : 'default'}
            icon={<ShieldAlert className="h-4 w-4 text-muted-foreground" />}
          />
          <Figure
            label="Open supervisory attention" value={num(a.open)}
            sub={`${num(a.awaiting_priority_confirmation)} awaiting priority confirmation · ${num(a.overdue_review)} past review date`}
            href="/supervision/portfolio?concern=1"
          />
          <Figure
            label="Programme in delivery" value={num(p.plans_active)}
            sub={`${num(p.interventions_active)} interventions · ${num(p.examinations_open)} examinations open`}
            href="/supervision/plans"
          />
          <Figure
            label="Assessment obligations" value={num(p.reassessments_required)}
            sub={`${num(p.reassessments_overdue)} overdue · ${num(p.assessments_awaiting_approval)} assessments awaiting approval`}
            href="/supervision/portfolio?reassessment=1"
            tone={num(p.reassessments_overdue) > 0 ? 'warning' : 'default'}
          />
          <Figure
            label="Enforcement open" value={num(f.enforcement_open)}
            sub={`${num(f.enforcement_from_supervision)} arising from supervision · ${num(f.residual_acceptances)} residual risk acceptances`}
            href="/enforcement"
            tone={num(f.enforcement_open) > 0 ? 'danger' : 'default'}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Risk position by supervisory domain</CardTitle>
            <p className="text-xs text-muted-foreground">
              Denominators are the supervisory perimeter, so entities outside a domain are never counted as unrated.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.risk.map((d) => {
              const coverage = d.in_perimeter > 0 ? Math.round((d.assessed / d.in_perimeter) * 100) : 0;
              return (
                <div key={d.domain_code} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{DOMAIN_LABELS[d.domain_code] ?? d.domain_code}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {RATING_ORDER.filter((r) => (d.rating_distribution?.[r] ?? 0) > 0).map((r) => (
                        <Badge key={r} variant="outline" className="font-mono text-[10px]">
                          {r.replace('_', ' ')} {d.rating_distribution[r]}
                        </Badge>
                      ))}
                      {d.outside_perimeter > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          {d.outside_perimeter} outside perimeter
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Progress value={coverage} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    {d.assessed} of {d.in_perimeter} assessed ({coverage}%) · {d.review_overdue} review overdue ·{' '}
                    {d.movements_in_window} rating movements ({d.deteriorations_in_window} deteriorating)
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Concern by domain</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {Object.keys(c.concern_by_domain ?? {}).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No entity currently meets the supervisory concern definition.
                </p>
              ) : (
                Object.entries(c.concern_by_domain).map(([domain, n]) => (
                  <Link
                    key={domain}
                    to={`/supervision/portfolio?domain=${domain}&concern=1`}
                    className="rounded-lg border p-3 transition hover:shadow-sm"
                  >
                    <p className="text-xs text-muted-foreground">{DOMAIN_LABELS[domain] ?? domain}</p>
                    <p className="font-mono text-xl font-semibold tabular-nums">{n}</p>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {pay?.available && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Landmark className="h-4 w-4" /> Payment systems &amp; PFMI oversight
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Figure
                  label="Designated operators" value={num(pay.operators)}
                  sub={`${num(pay.systemically_important)} systemically important`}
                  href="/prudential/payment-systems"
                />
                <Figure
                  label="Open incidents" value={num(pay.incidents_open)}
                  sub={`${num(pay.incidents_in_window)} in window · ${num(pay.incidents_sla_breached)} notification SLA breached`}
                  href="/prudential/payment-systems"
                  tone={num(pay.incidents_open) > 0 ? 'warning' : 'default'}
                />
                <Figure
                  label="PFMI assessments" value={num(pay.pfmi_assessments_completed)}
                  sub={`${num(pay.pfmi_assessments_in_progress)} in progress`}
                  href="/prudential/payment-systems"
                />
                <Figure
                  label="PFMI coverage gap" value={num(pay.operators_without_current_pfmi)}
                  sub="No assessment completed in the last two years"
                  href="/prudential/payment-systems"
                  tone={num(pay.operators_without_current_pfmi) > 0 ? 'warning' : 'success'}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
