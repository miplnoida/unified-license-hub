import { useMemo, useState } from 'react';
import { useSupervisoryMetrics, SupervisoryFilters } from '@/hooks/useSupervisoryMetrics';
import { buildInsights } from '@/lib/dashboardInsights';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { MetricCard } from './cards/MetricCard';
import { InsightCard } from './cards/InsightCard';
import { StatusBreakdownCard } from './cards/StatusBreakdownCard';
import { PriorityListCard } from './cards/PriorityListCard';
import {
  AlertTriangle, FileText, Shield, ClipboardList, DollarSign, AlertOctagon,
  Building2, ShieldAlert, Gauge, MessagesSquare, ClipboardCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const fmtMoney = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

export function SupervisoryDashboard() {
  const [filters] = useState<SupervisoryFilters>({});
  const { data, isLoading } = useSupervisoryMetrics(filters);
  const { hasModuleAccess } = useUserDynamicPermissions();

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);

  const can = (m: string) => hasModuleAccess(m);

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard title="Pending Applications" value={data?.applications.submitted ?? 0} icon={FileText} tone="primary" loading={isLoading} to="/applications/queue" />
        <MetricCard title="SLA Breaches" value={data?.applications.sla_breached ?? 0} icon={AlertOctagon} tone="destructive" loading={isLoading} to="/applications/queue" />
        <MetricCard title="Overdue Returns" value={data?.returns.overdue ?? 0} icon={ClipboardList} tone="warning" loading={isLoading} to="/admin/returns" />
        <MetricCard title="High-Risk Entities" value={data?.risk.high ?? 0} icon={ShieldAlert} tone="destructive" loading={isLoading} />
        <MetricCard title="Outstanding Fees" value={data?.payments.outstanding_amount ?? 0} format={fmtMoney} icon={DollarSign} tone="warning" loading={isLoading} to="/admin/fees" />
        <MetricCard title="Open Enforcement" value={data?.enforcement.open ?? 0} icon={AlertTriangle} tone="destructive" loading={isLoading} />
      </div>

      {/* Insights */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" /> Supervisory Insights
            <span className="text-xs font-normal text-muted-foreground ml-2">{isLoading ? '' : `${insights.length} actionable`}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : insights.length === 0 ? (
            <p className="text-sm text-muted-foreground">All clear. No supervisory issues detected based on current data.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {insights.slice(0, 8).map((i) => <InsightCard key={i.id} insight={i} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Module breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {can('application_management') && (
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
        {can('license_management') && (
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
        {can('returns_management') && (
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
        {can('fee_management') && (
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
        <StatusBreakdownCard
          title="Inspections"
          loading={isLoading}
          items={[
            { label: 'Scheduled', value: data?.inspections.scheduled ?? 0, tone: 'primary' },
            { label: 'Completed', value: data?.inspections.completed ?? 0, tone: 'success' },
            { label: 'Overdue', value: data?.inspections.overdue ?? 0, tone: 'destructive' },
          ]}
        />
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
        {can('complaint_management') && (
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
        <StatusBreakdownCard
          title="Risk distribution"
          loading={isLoading}
          items={[
            { label: 'High', value: data?.risk.high ?? 0, tone: 'destructive' },
            { label: 'Medium', value: data?.risk.medium ?? 0, tone: 'warning' },
            { label: 'Low', value: data?.risk.low ?? 0, tone: 'success' },
          ]}
        />
        <Card className="h-full">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Licensees</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold tabular-nums">{isLoading ? '—' : data?.licensees.total ?? 0}</p></div>
            <div><p className="text-xs text-muted-foreground">Active</p><p className="text-xl font-bold tabular-nums">{isLoading ? '—' : data?.licensees.active ?? 0}</p></div>
            <div className="col-span-2"><p className="text-xs text-muted-foreground">Revenue this month</p><p className="text-xl font-bold tabular-nums">{isLoading ? '—' : fmtMoney(data?.payments.revenue_month ?? 0)}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Priority lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <PriorityListCard
          title="Oldest pending applications"
          loading={isLoading}
          viewAll={{ label: 'All', to: '/applications/queue' }}
          rows={(data?.priority_lists.oldest_pending_applications ?? []).map((a: any) => ({
            id: a.id,
            primary: a.application_number || a.id.slice(0, 8),
            secondary: `Created ${new Date(a.created_at).toLocaleDateString()}`,
            badge: { label: a.status, tone: 'warning' },
            to: `/applications/${a.id}`,
          }))}
        />
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
        <PriorityListCard
          title="Overdue returns"
          loading={isLoading}
          viewAll={{ label: 'All', to: '/admin/returns' }}
          rows={(data?.priority_lists.overdue_returns ?? []).map((r: any) => ({
            id: r.id,
            primary: r.id.slice(0, 8),
            secondary: r.due_date ? `Due ${new Date(r.due_date).toLocaleDateString()}` : undefined,
            badge: { label: r.status, tone: 'destructive' },
          }))}
        />
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
        <PriorityListCard
          title="Open enforcement cases"
          loading={isLoading}
          rows={(data?.priority_lists.open_enforcement_cases ?? []).map((c: any) => ({
            id: c.id,
            primary: c.case_number || c.id.slice(0, 8),
            badge: { label: c.status, tone: 'destructive' },
          }))}
        />
        <Card className="h-full">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MessagesSquare className="h-4 w-4" /> Quick links</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-xs">
            <a className="rounded-md border p-2 hover:bg-muted" href="/applications/queue">Application queue</a>
            <a className="rounded-md border p-2 hover:bg-muted" href="/admin/returns">Returns admin</a>
            <a className="rounded-md border p-2 hover:bg-muted" href="/admin/fees">Fee management</a>
            <a className="rounded-md border p-2 hover:bg-muted" href="/workflows">Workflows</a>
            <a className="rounded-md border p-2 hover:bg-muted" href="/complaints">Complaints</a>
            <a className="rounded-md border p-2 hover:bg-muted" href="/reports">Reports</a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
