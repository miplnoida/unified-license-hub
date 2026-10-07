import { formatBaseMoney } from '@/lib/money';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupervisoryMetrics, SupervisoryFilters } from '@/hooks/useSupervisoryMetrics';
import { useFpaDashboardMetrics } from '@/hooks/useFpaDashboardMetrics';
import { useConductDashboardMetrics } from '@/hooks/useConductDashboardMetrics';
import { usePrudentialDashboardMetrics } from '@/hooks/usePrudentialSupervision';
import { useSectors } from '@/hooks/useMasterConfig';
import { buildInsights } from '@/lib/dashboardInsights';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { MetricCard } from './cards/MetricCard';
import { InsightCard } from './cards/InsightCard';
import { StatusBreakdownCard } from './cards/StatusBreakdownCard';
import { PriorityListCard } from './cards/PriorityListCard';
import { WorkflowSlaOverviewWidget } from './widgets/WorkflowSlaOverviewWidget';
import { SupervisoryTrendsWidget } from './widgets/SupervisoryTrendsWidget';
import { SupervisoryPriorityQueueWidget } from './widgets/SupervisoryPriorityQueueWidget';
import { useSupDashboardSummary } from '@/hooks/useSupervisoryReadModels';
import { APPLICATION_DRILLDOWNS, drilldownTo } from '@/lib/dashboardDrilldowns';
import {
  AlertTriangle, FileText, ClipboardList, DollarSign, AlertOctagon,
  Building2, ShieldAlert, Gauge, MessagesSquare, UserCheck, Landmark, Megaphone, Filter as FilterIcon,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const fmtMoney = (v: number) => formatBaseMoney(v);

export function SupervisoryDashboard() {
  const [filters, setFilters] = useState<SupervisoryFilters>({});
  const { data, isLoading } = useSupervisoryMetrics(filters);
  const { data: sectors } = useSectors();
  const { hasModuleAccess } = useUserDynamicPermissions();

  // Package A4: supervisory truth (prudential signals, canonical returns,
  // conduct and licensing) comes from the governed `sup_dashboard_summary`
  // read model, so this dashboard and Entity 360 can never disagree.
  const { data: supSummary, isLoading: loadingSup } = useSupDashboardSummary();

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);

  // Permission-gated module map. `hasModuleAccess` returns true for super_admin
  // and for legacy admins without dynamic roles; otherwise it strictly checks
  // dynamic role permissions. We use it for EVERY widget, link and metric so
  // users never see actions they cannot perform.
  const can = {
    applications: hasModuleAccess('application_management'),
    licenses: hasModuleAccess('license_management'),
    returns: hasModuleAccess('returns_management'),
    fees: hasModuleAccess('fee_management'),
    complaints: hasModuleAccess('complaint_management'),
    workflows: hasModuleAccess('workflow_management'),
    reports: hasModuleAccess('report_management'),
    // Inspections / enforcement / risk currently live under generic admin/settings
    // visibility — surface them only to users with admin/settings access.
    inspections: hasModuleAccess('settings'),
    enforcement: hasModuleAccess('settings'),
    risk: hasModuleAccess('settings'),
    licensees: hasModuleAccess('license_management'),
    fitAndProper: hasModuleAccess('fit_and_proper'),
    prudential: hasModuleAccess('prudential_supervision'),
    marketConduct: hasModuleAccess('market_conduct'),
  };

  // Cross-module tiles — Fit & Proper, Prudential, and Market Conduct were
  // previously absent from this dashboard entirely. Fetched only when the
  // user actually has access to each module, and reuse the exact same hooks
  // each module's own dashboard uses so the numbers always agree.
  const { data: fpaMetrics, isLoading: loadingFpa } = useFpaDashboardMetrics(can.fitAndProper);
  const { data: conductMetrics, isLoading: loadingConduct } = useConductDashboardMetrics(can.marketConduct);
  const { data: prudentialMetrics, isLoading: loadingPrudential } = usePrudentialDashboardMetrics(can.prudential);

  // Filter insights to modules the user can act on.
  const visibleInsights = insights.filter((i) => {
    const m = i.module.toLowerCase();
    if (m === 'applications') return can.applications;
    if (m === 'licensing') return can.licenses;
    if (m === 'returns') return can.returns;
    if (m === 'payments') return can.fees;
    if (m === 'inspections') return can.inspections;
    if (m === 'enforcement') return can.enforcement;
    if (m === 'complaints') return can.complaints;
    if (m === 'risk') return can.risk;
    if (m === 'workflow') return can.workflows;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Sector filter — re-scopes every metric, breakdown, and priority list below to the selected sector */}
      <div className="w-full flex justify-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dashboard-sector-filter" className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
            <FilterIcon className="h-3 w-3" /> Sector
          </Label>
          <Select
            value={filters.sectorId ?? 'all'}
            onValueChange={(value) => setFilters((prev) => ({ ...prev, sectorId: value === 'all' ? null : value }))}
          >
            <SelectTrigger id="dashboard-sector-filter" className="w-[220px]">
              <SelectValue placeholder="All sectors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sectors</SelectItem>
              {(sectors ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary strip — each tile is permission-gated */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {can.applications && (
          <>
            <MetricCard title={APPLICATION_DRILLDOWNS.pending.label} value={data?.applications.pending ?? 0} icon={FileText} tone="primary" loading={isLoading} to={drilldownTo('pending')} />
            <MetricCard title={APPLICATION_DRILLDOWNS.slaBreached.label} value={data?.applications.sla_breached ?? 0} icon={AlertOctagon} tone="destructive" loading={isLoading} to={drilldownTo('slaBreached')} />
          </>
        )}
        {can.returns && (
          <MetricCard title="Overdue Return Filings" value={supSummary?.returns?.overdue ?? 0} icon={ClipboardList} tone="warning" loading={loadingSup} to="/returns/queue?overdue=1" />
        )}
        {can.risk && (
          <MetricCard title="High-Risk Entities" value={data?.risk.high ?? 0} icon={ShieldAlert} tone="destructive" loading={isLoading} to="/supervision/risk?risk=high" />
        )}
        {can.fees && (
          <MetricCard title="Outstanding Fees" value={data?.payments.outstanding_amount ?? 0} format={fmtMoney} icon={DollarSign} tone="warning" loading={isLoading} to="/payments?status=pending" />
        )}
        {can.enforcement && (
          <MetricCard title="Open Enforcement" value={data?.enforcement.open ?? 0} icon={AlertTriangle} tone="destructive" loading={isLoading} to="/enforcement?status=open" />
        )}
        {can.returns && (
          <MetricCard title="Breaches Awaiting Acknowledgement" value={supSummary?.prudential?.awaiting_acknowledgement ?? 0} icon={ShieldAlert} tone="destructive" loading={loadingSup} to="/supervision/breaches" />
        )}
        {can.fitAndProper && (
          <MetricCard title="F&P High-Severity Open" value={fpaMetrics?.openHighSeverityFindings ?? 0} icon={UserCheck} tone="destructive" loading={loadingFpa} to="/fpa/findings?quickTab=high" />
        )}
        {can.prudential && (
          <MetricCard title="Prudential Escalations" value={prudentialMetrics?.open_escalations ?? 0} icon={Landmark} tone="destructive" loading={loadingPrudential} to="/prudential/escalations" />
        )}
        {can.marketConduct && (
          <MetricCard title="Conduct Alerts Open" value={conductMetrics?.openAlerts ?? 0} icon={Megaphone} tone="warning" loading={loadingConduct} to="/conduct/alerts" />
        )}
      </div>

      {/* Canonical supervisory priority queue — one ranked list of outstanding work */}
      <SupervisoryPriorityQueueWidget />

      {/* Workflow SLA Overview — same calculation as Applications list + WorkflowPanel */}
      {(can.applications || can.workflows) && <WorkflowSlaOverviewWidget />}

      {/* Volume trends — six-month view across the modules already surfaced above */}
      <SupervisoryTrendsWidget
        enabled={{
          applications: can.applications,
          complaints: can.complaints,
          enforcement: can.enforcement,
          returns: can.returns,
        }}
      />

      {/* Insights */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" /> Supervisory Insights
            <span className="text-xs font-normal text-muted-foreground ml-2">{isLoading ? '' : `${visibleInsights.length} actionable`}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : visibleInsights.length === 0 ? (
            <p className="text-sm text-muted-foreground">All clear. No supervisory issues detected based on current data.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {visibleInsights.slice(0, 8).map((i) => <InsightCard key={i.id} insight={i} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Module breakdowns — all permission-gated */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {can.applications && (
          <StatusBreakdownCard
            title="Applications by status"
            loading={isLoading}
            items={[
              { label: 'Draft', value: data?.applications.draft ?? 0, tone: 'default', to: drilldownTo('draft') },
              { label: 'Submitted', value: data?.applications.submitted ?? 0, tone: 'primary', to: drilldownTo('submitted') },
              { label: 'In progress', value: data?.applications.under_review ?? 0, tone: 'warning', to: drilldownTo('inProgress') },
              { label: 'Approved', value: data?.applications.approved ?? 0, tone: 'success', to: drilldownTo('approved') },
              { label: 'Rejected', value: data?.applications.rejected ?? 0, tone: 'destructive', to: drilldownTo('rejected') },
              { label: 'Returned', value: data?.applications.returned ?? 0, tone: 'warning', to: drilldownTo('returned') },
            ]}
          />
        )}
        {can.licenses && (
          <StatusBreakdownCard
            title="Licences by status"
            loading={isLoading}
            items={[
              { label: 'Active', value: data?.licenses.active ?? 0, tone: 'success', to: '/licenses?status=active' },
              { label: 'Expiring ≤30d', value: data?.licenses.expiring_30d ?? 0, tone: 'warning', to: '/licenses?filter=expiring&days=30' },
              { label: 'Expiring ≤90d', value: data?.licenses.expiring_90d ?? 0, tone: 'primary', to: '/licenses?filter=expiring&days=90' },
              { label: 'Expired', value: data?.licenses.expired ?? 0, tone: 'destructive', to: '/licenses?status=expired' },
              { label: 'Suspended', value: data?.licenses.suspended ?? 0, tone: 'warning', to: '/licenses?status=suspended' },
              { label: 'Revoked', value: data?.licenses.revoked ?? 0, tone: 'destructive', to: '/licenses?status=revoked' },
            ]}
          />
        )}
        {can.returns && (
          <StatusBreakdownCard
            title="Return filings (canonical)"
            loading={loadingSup}
            items={[
              { label: 'Due next 30 days', value: supSummary?.returns?.due_next_30_days ?? 0, tone: 'warning', to: '/returns/queue' },
              { label: 'Overdue', value: supSummary?.returns?.overdue ?? 0, tone: 'destructive', to: '/returns/queue?overdue=1' },
              { label: 'Awaiting review', value: supSummary?.returns?.awaiting_review ?? 0, tone: 'primary', to: '/returns/queue?status=SUBMITTED' },
              { label: 'Accepted (30 days)', value: supSummary?.returns?.accepted_last_30_days ?? 0, tone: 'success', to: '/returns/queue?status=ACCEPTED' },
            ]}
          />
        )}
        {can.fees && (
          <StatusBreakdownCard
            title="Payments"
            loading={isLoading}
            items={[
              { label: 'Pending', value: data?.payments.pending ?? 0, tone: 'warning', to: '/payments?status=pending' },
              { label: 'Paid', value: data?.payments.paid ?? 0, tone: 'success', to: '/payments?status=paid' },
              { label: 'Failed', value: data?.payments.failed ?? 0, tone: 'destructive', to: '/payments?status=failed' },
            ]}
          />
        )}
        {can.inspections && (
          <StatusBreakdownCard
            title="Inspections"
            loading={isLoading}
            items={[
              { label: 'Scheduled', value: data?.inspections.scheduled ?? 0, tone: 'primary', to: '/inspections?status=scheduled' },
              { label: 'Completed', value: data?.inspections.completed ?? 0, tone: 'success', to: '/inspections?status=completed' },
              { label: 'Overdue', value: data?.inspections.overdue ?? 0, tone: 'destructive', to: '/inspections?filter=overdue' },
            ]}
          />
        )}
        {can.enforcement && (
          <StatusBreakdownCard
            title="Enforcement"
            loading={isLoading}
            items={[
              { label: 'Open', value: data?.enforcement.open ?? 0, tone: 'destructive', to: '/enforcement?status=open' },
              { label: 'New this month', value: data?.enforcement.new_this_month ?? 0, tone: 'warning', to: '/enforcement?filter=new_this_month' },
              { label: 'Pending action', value: data?.enforcement.pending_action ?? 0, tone: 'warning', to: '/enforcement?filter=pending_action' },
              { label: 'Closed', value: data?.enforcement.closed ?? 0, tone: 'success', to: '/enforcement?status=closed' },
            ]}
          />
        )}
        {can.complaints && (
          <StatusBreakdownCard
            title="Complaints"
            loading={isLoading}
            items={[
              { label: 'Open', value: data?.complaints.open ?? 0, tone: 'destructive', to: '/complaints?status=open' },
              { label: 'Under investigation', value: data?.complaints.under_investigation ?? 0, tone: 'warning', to: '/complaints?status=under_investigation' },
              { label: 'Closed', value: data?.complaints.closed ?? 0, tone: 'success', to: '/complaints?status=closed' },
            ]}
          />
        )}
        {can.risk && (
          <StatusBreakdownCard
            title="Risk distribution"
            loading={isLoading}
            items={[
              { label: 'High', value: data?.risk.high ?? 0, tone: 'destructive', to: '/supervision/risk?risk=high' },
              { label: 'Medium', value: data?.risk.medium ?? 0, tone: 'warning', to: '/supervision/risk?risk=medium' },
              { label: 'Low', value: data?.risk.low ?? 0, tone: 'success', to: '/supervision/risk?risk=low' },
            ]}
          />
        )}
        {can.licensees && (
          <Card className="h-full">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Licensees</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold tabular-nums">{isLoading ? '—' : data?.licensees.total ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">Active</p><p className="text-xl font-bold tabular-nums">{isLoading ? '—' : data?.licensees.active ?? 0}</p></div>
              {can.fees && (
                <div className="col-span-2"><p className="text-xs text-muted-foreground">Revenue this month</p><p className="text-xl font-bold tabular-nums">{isLoading ? '—' : fmtMoney(data?.payments.revenue_month ?? 0)}</p></div>
              )}
            </CardContent>
          </Card>
        )}
        {can.fitAndProper && (
          <StatusBreakdownCard
            title="Fit & Proper"
            loading={loadingFpa}
            items={[
              { label: 'Active assessments', value: fpaMetrics?.activeAssessments ?? 0, tone: 'primary', to: '/fpa' },
              { label: 'Open findings', value: fpaMetrics?.openFindings ?? 0, tone: 'warning', to: '/fpa/findings' },
              { label: 'High-severity open', value: fpaMetrics?.openHighSeverityFindings ?? 0, tone: 'destructive', to: '/fpa/findings?quickTab=high' },
              { label: 'Active conditions', value: fpaMetrics?.activeConditions ?? 0, tone: 'warning', to: '/fpa/conditions' },
            ]}
          />
        )}
        {can.prudential && (
          <StatusBreakdownCard
            title="Prudential supervision"
            loading={loadingPrudential}
            items={[
              { label: 'Open actions', value: prudentialMetrics?.open_actions ?? 0, tone: 'warning', to: '/prudential/actions' },
              { label: 'Overdue actions', value: prudentialMetrics?.overdue_actions ?? 0, tone: 'destructive', to: '/prudential/actions' },
              { label: 'Open escalations', value: prudentialMetrics?.open_escalations ?? 0, tone: 'destructive', to: '/prudential/escalations' },
              { label: 'Stress events (30d)', value: prudentialMetrics?.stress_events_30d ?? 0, tone: 'warning', to: '/prudential/dashboard' },
              { label: 'Recent breaches (30d)', value: prudentialMetrics?.recent_breaches ?? 0, tone: 'destructive', to: '/prudential/dashboard' },
            ]}
          />
        )}
        {can.marketConduct && (
          <StatusBreakdownCard
            title="Market conduct"
            loading={loadingConduct}
            items={[
              { label: 'Open complaints', value: conductMetrics?.openComplaints ?? 0, tone: 'warning', to: '/conduct' },
              { label: 'Critical complaints', value: conductMetrics?.criticalComplaints ?? 0, tone: 'destructive', to: '/conduct' },
              { label: 'SLA breached', value: conductMetrics?.slaBreachedComplaints ?? 0, tone: 'destructive', to: '/conduct' },
              { label: 'Open alerts', value: conductMetrics?.openAlerts ?? 0, tone: 'warning', to: '/conduct/alerts' },
            ]}
          />
        )}
      </div>

      {/* Priority lists — gated per module */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {can.applications && (
          <PriorityListCard
            title="Oldest pending applications"
            loading={isLoading}
            viewAll={{ label: 'All', to: drilldownTo('pending') }}
            rows={(data?.priority_lists.oldest_pending_applications ?? []).map((a: any) => ({
              id: a.id,
              primary: a.application_number || a.id.slice(0, 8),
              secondary: `Created ${new Date(a.created_at).toLocaleDateString()}`,
              ageDays: Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86400000),
              to: `/applications/${a.id}`,
            }))}
          />
        )}
        {can.licenses && (
          <PriorityListCard
            title="Upcoming licence expiries"
            loading={isLoading}
            viewAll={{ label: 'All', to: '/admin/approved-licensees' }}
            rows={(data?.priority_lists.upcoming_license_expiries ?? []).map((l: any) => ({
              id: l.id,
              primary: l.license_number || l.id.slice(0, 8),
              secondary: l.valid_until ? `Expires ${new Date(l.valid_until).toLocaleDateString()}` : undefined,
              badge: { label: 'expiring', tone: 'warning' },
            }))}
          />
        )}
        {can.risk && (
          <PriorityListCard
            title="High-risk entities"
            loading={isLoading}
            rows={(data?.priority_lists.high_risk_entities ?? []).map((r: any) => ({
              id: r.id,
              primary: r.entity_id.slice(0, 8),
              secondary: `Rating: ${r.overall_rating}`,
              badge: { label: 'high', tone: 'destructive' },
              to: `/entities/${r.entity_id}`,
            }))}
          />
        )}
        {can.enforcement && (
          <PriorityListCard
            title="Open enforcement cases"
            loading={isLoading}
            rows={(data?.priority_lists.open_enforcement_cases ?? []).map((c: any) => ({
              id: c.id,
              primary: c.case_number || c.id.slice(0, 8),
              badge: { label: c.status, tone: 'destructive' },
              to: `/enforcement/${c.id}`,
            }))}
          />
        )}
        {(() => {
          const links: Array<{ to: string; label: string }> = [];
          if (can.applications) links.push({ to: '/applications/queue', label: 'Application queue' });
          if (can.returns) links.push({ to: '/returns/queue', label: 'Return filing queue' });
          if (can.prudential) links.push({ to: '/supervision/team-performance', label: 'Team performance' });
          if (can.fees) links.push({ to: '/payments', label: 'Fee management' });
          if (can.workflows) links.push({ to: '/workflows', label: 'Workflows' });
          if (can.complaints) links.push({ to: '/complaints', label: 'Complaints' });
          if (can.reports) links.push({ to: '/reports', label: 'Reports' });
          if (links.length === 0) return null;
          return (
            <Card className="h-full">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MessagesSquare className="h-4 w-4" /> Quick links</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-xs">
                {links.map((l) => (
                  <Link key={l.to} className="rounded-md border p-2 hover:bg-muted" to={l.to}>{l.label}</Link>
                ))}
              </CardContent>
            </Card>
          );
        })()}
      </div>
    </div>
  );
}

