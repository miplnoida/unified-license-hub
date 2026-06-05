import { useMemo, useState } from 'react';
import { useSupervisoryMetrics, SupervisoryFilters } from '@/hooks/useSupervisoryMetrics';
import { buildInsights } from '@/lib/dashboardInsights';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { MetricCard } from './cards/MetricCard';
import { InsightCard } from './cards/InsightCard';
import { StatusBreakdownCard } from './cards/StatusBreakdownCard';
import { PriorityListCard } from './cards/PriorityListCard';
import {
  AlertTriangle, FileText, ClipboardList, DollarSign, AlertOctagon,
  Building2, ShieldAlert, Gauge, MessagesSquare,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const fmtMoney = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

export function SupervisoryDashboard() {
  const [filters] = useState<SupervisoryFilters>({});
  const { data, isLoading } = useSupervisoryMetrics(filters);
  const { hasModuleAccess } = useUserDynamicPermissions();

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
  };

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
      {/* Summary strip — each tile is permission-gated */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {can.applications && (
          <>
            <MetricCard title="Pending Applications" value={data?.applications.submitted ?? 0} icon={FileText} tone="primary" loading={isLoading} to="/applications/queue?sla=pending" />
            <MetricCard title="SLA Breaches" value={data?.applications.sla_breached ?? 0} icon={AlertOctagon} tone="destructive" loading={isLoading} to="/applications/queue?sla=breached" />
          </>
        )}
        {can.returns && (
          <MetricCard title="Overdue Returns" value={data?.returns.overdue ?? 0} icon={ClipboardList} tone="warning" loading={isLoading} to="/returns-management?status=overdue" />
        )}
        {can.risk && (
          <MetricCard title="High-Risk Entities" value={data?.risk.high ?? 0} icon={ShieldAlert} tone="destructive" loading={isLoading} />
        )}
        {can.fees && (
          <MetricCard title="Outstanding Fees" value={data?.payments.outstanding_amount ?? 0} format={fmtMoney} icon={DollarSign} tone="warning" loading={isLoading} to="/payments?status=pending" />
        )}
        {can.enforcement && (
          <MetricCard title="Open Enforcement" value={data?.enforcement.open ?? 0} icon={AlertTriangle} tone="destructive" loading={isLoading} />
        )}
      </div>

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
              { label: 'Draft', value: data?.applications.draft ?? 0, tone: 'default' },
              { label: 'Submitted', value: data?.applications.submitted ?? 0, tone: 'primary' },
              { label: 'Under review', value: data?.applications.under_review ?? 0, tone: 'warning' },
              { label: 'Approved', value: data?.applications.approved ?? 0, tone: 'success' },
              { label: 'Rejected', value: data?.applications.rejected ?? 0, tone: 'destructive' },
              { label: 'Returned', value: data?.applications.returned ?? 0, tone: 'warning' },
            ]}
          />
        )}
        {can.licenses && (
          <StatusBreakdownCard
            title="Licences by status"
            loading={isLoading}
            items={[
              { label: 'Active', value: data?.licenses.active ?? 0, tone: 'success' },
              { label: 'Expiring ≤30d', value: data?.licenses.expiring_30d ?? 0, tone: 'warning' },
              { label: 'Expiring ≤90d', value: data?.licenses.expiring_90d ?? 0, tone: 'primary' },
              { label: 'Expired', value: data?.licenses.expired ?? 0, tone: 'destructive' },
              { label: 'Suspended', value: data?.licenses.suspended ?? 0, tone: 'warning' },
              { label: 'Revoked', value: data?.licenses.revoked ?? 0, tone: 'destructive' },
            ]}
          />
        )}
        {can.returns && (
          <StatusBreakdownCard
            title="Returns"
            loading={isLoading}
            items={[
              { label: 'Due soon', value: data?.returns.due_soon ?? 0, tone: 'warning' },
              { label: 'Overdue', value: data?.returns.overdue ?? 0, tone: 'destructive' },
              { label: 'Pending review', value: data?.returns.pending_review ?? 0, tone: 'primary' },
              { label: 'Submitted', value: data?.returns.submitted ?? 0, tone: 'success' },
            ]}
          />
        )}
        {can.fees && (
          <StatusBreakdownCard
            title="Payments"
            loading={isLoading}
            items={[
              { label: 'Pending', value: data?.payments.pending ?? 0, tone: 'warning' },
              { label: 'Paid', value: data?.payments.paid ?? 0, tone: 'success' },
              { label: 'Failed', value: data?.payments.failed ?? 0, tone: 'destructive' },
            ]}
          />
        )}
        {can.inspections && (
          <StatusBreakdownCard
            title="Inspections"
            loading={isLoading}
            items={[
              { label: 'Scheduled', value: data?.inspections.scheduled ?? 0, tone: 'primary' },
              { label: 'Completed', value: data?.inspections.completed ?? 0, tone: 'success' },
              { label: 'Overdue', value: data?.inspections.overdue ?? 0, tone: 'destructive' },
            ]}
          />
        )}
        {can.enforcement && (
          <StatusBreakdownCard
            title="Enforcement"
            loading={isLoading}
            items={[
              { label: 'Open', value: data?.enforcement.open ?? 0, tone: 'destructive' },
              { label: 'New this month', value: data?.enforcement.new_this_month ?? 0, tone: 'warning' },
              { label: 'Pending action', value: data?.enforcement.pending_action ?? 0, tone: 'warning' },
              { label: 'Closed', value: data?.enforcement.closed ?? 0, tone: 'success' },
            ]}
          />
        )}
        {can.complaints && (
          <StatusBreakdownCard
            title="Complaints"
            loading={isLoading}
            items={[
              { label: 'Open', value: data?.complaints.open ?? 0, tone: 'destructive' },
              { label: 'Under investigation', value: data?.complaints.under_investigation ?? 0, tone: 'warning' },
              { label: 'Closed', value: data?.complaints.closed ?? 0, tone: 'success' },
            ]}
          />
        )}
        {can.risk && (
          <StatusBreakdownCard
            title="Risk distribution"
            loading={isLoading}
            items={[
              { label: 'High', value: data?.risk.high ?? 0, tone: 'destructive' },
              { label: 'Medium', value: data?.risk.medium ?? 0, tone: 'warning' },
              { label: 'Low', value: data?.risk.low ?? 0, tone: 'success' },
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
      </div>

      {/* Priority lists — gated per module */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {can.applications && (
          <PriorityListCard
            title="Oldest pending applications"
            loading={isLoading}
            viewAll={{ label: 'All', to: '/applications/queue?sla=pending' }}
            rows={(data?.priority_lists.oldest_pending_applications ?? []).map((a: any) => ({
              id: a.id,
              primary: a.application_number || a.id.slice(0, 8),
              secondary: `Created ${new Date(a.created_at).toLocaleDateString()}`,
              badge: { label: a.status, tone: 'warning' },
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
        {can.returns && (
          <PriorityListCard
            title="Overdue returns"
            loading={isLoading}
            viewAll={{ label: 'All', to: '/returns-management?status=overdue' }}
            rows={(data?.priority_lists.overdue_returns ?? []).map((r: any) => ({
              id: r.id,
              primary: r.id.slice(0, 8),
              secondary: r.due_date ? `Due ${new Date(r.due_date).toLocaleDateString()}` : undefined,
              badge: { label: r.status, tone: 'destructive' },
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
            }))}
          />
        )}
        {(() => {
          const links: Array<{ to: string; label: string }> = [];
          if (can.applications) links.push({ to: '/applications/queue', label: 'Application queue' });
          if (can.returns) links.push({ to: '/admin/returns', label: 'Returns admin' });
          if (can.fees) links.push({ to: '/admin/fees', label: 'Fee management' });
          if (can.workflows) links.push({ to: '/workflows', label: 'Workflows' });
          if (can.complaints) links.push({ to: '/complaints', label: 'Complaints' });
          if (can.reports) links.push({ to: '/reports', label: 'Reports' });
          if (links.length === 0) return null;
          return (
            <Card className="h-full">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MessagesSquare className="h-4 w-4" /> Quick links</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-xs">
                {links.map((l) => (
                  <a key={l.to} className="rounded-md border p-2 hover:bg-muted" href={l.to}>{l.label}</a>
                ))}
              </CardContent>
            </Card>
          );
        })()}
      </div>
    </div>
  );
}

