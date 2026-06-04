import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePpoc } from '@/contexts/PpocContext';
import { useLicenseeMetrics } from '@/hooks/useLicenseeMetrics';
import { buildInsights } from '@/lib/dashboardInsights';
import { MetricCard } from './cards/MetricCard';
import { InsightCard } from './cards/InsightCard';
import { StatusBreakdownCard } from './cards/StatusBreakdownCard';
import { PriorityListCard } from './cards/PriorityListCard';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, ClipboardList, DollarSign, Bell, FileText, AlertTriangle } from 'lucide-react';

const fmtMoney = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

export function LicenseeDashboard() {
  const { user } = useAuth();
  const { resolvedLicenseeId, activeLicensee } = usePpoc();
  const { data, isLoading } = useLicenseeMetrics(resolvedLicenseeId, user?.id);

  const insights = useMemo(() => {
    if (!data) return [];
    return buildInsights({
      licenses: { expiring_30d: data.licenses.expiring_30d, expired: data.licenses.expired },
      returns: { overdue: data.returns.overdue, due_soon: data.returns.due_soon, pending_review: data.returns.pending_review },
      payments: { overdue: data.payments.pending },
    });
  }, [data]);

  return (
    <div className="space-y-6">
      {!resolvedLicenseeId && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            No active licensee selected yet — showing your personal scope. Use the licensee switcher above to load entity-level metrics.
          </CardContent>
        </Card>
      )}
      {activeLicensee && (
        <p className="text-sm text-muted-foreground">Showing metrics for <span className="font-medium text-foreground">{activeLicensee.licensee_name}</span>.</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard title="Active licences" value={data?.licenses.active ?? 0} icon={Shield} tone="success" loading={isLoading} to="/licenses" />
        <MetricCard title="Expiring ≤30d" value={data?.licenses.expiring_30d ?? 0} icon={AlertTriangle} tone="warning" loading={isLoading} to="/licenses" />
        <MetricCard title="Returns due" value={data?.returns.due_soon ?? 0} icon={ClipboardList} tone="warning" loading={isLoading} to="/compliance/returns" />
        <MetricCard title="Overdue returns" value={data?.returns.overdue ?? 0} icon={ClipboardList} tone="destructive" loading={isLoading} to="/compliance/returns" />
        <MetricCard title="Outstanding fees" value={data?.payments.outstanding_amount ?? 0} format={fmtMoney} icon={DollarSign} tone="warning" loading={isLoading} to="/billing/post-licensee" />
        <MetricCard title="Unread notifications" value={data?.notifications.unread ?? 0} icon={Bell} tone="primary" loading={isLoading} to="/notifications" />
      </div>

      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.slice(0, 4).map((i) => <InsightCard key={i.id} insight={i} />)}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatusBreakdownCard
          title="My applications"
          loading={isLoading}
          items={[
            { label: 'Draft', value: data?.applications.draft ?? 0 },
            { label: 'Submitted', value: data?.applications.submitted ?? 0, tone: 'primary' },
            { label: 'Approved', value: data?.applications.approved ?? 0, tone: 'success' },
            { label: 'Rejected', value: data?.applications.rejected ?? 0, tone: 'destructive' },
          ]}
        />
        <StatusBreakdownCard
          title="My returns"
          loading={isLoading}
          items={[
            { label: 'Due soon', value: data?.returns.due_soon ?? 0, tone: 'warning' },
            { label: 'Overdue', value: data?.returns.overdue ?? 0, tone: 'destructive' },
            { label: 'Submitted', value: data?.returns.submitted ?? 0, tone: 'success' },
            { label: 'Pending review', value: data?.returns.pending_review ?? 0, tone: 'primary' },
          ]}
        />
        <StatusBreakdownCard
          title="My payments"
          loading={isLoading}
          items={[
            { label: 'Pending', value: data?.payments.pending ?? 0, tone: 'warning' },
            { label: 'Paid', value: data?.payments.paid ?? 0, tone: 'success' },
          ]}
        />
        <PriorityListCard
          title="Upcoming returns"
          loading={isLoading}
          viewAll={{ label: 'All', to: '/compliance/returns' }}
          rows={(data?.priority_lists.upcoming_returns ?? []).map((r: any) => ({
            id: r.id,
            primary: r.id.slice(0, 8),
            secondary: r.due_date ? `Due ${new Date(r.due_date).toLocaleDateString()}` : undefined,
            badge: { label: r.status, tone: 'warning' },
          }))}
        />
        <PriorityListCard
          title="Expiring licences"
          loading={isLoading}
          viewAll={{ label: 'All', to: '/licenses' }}
          rows={(data?.priority_lists.expiring_licenses ?? []).map((l: any) => ({
            id: l.id,
            primary: l.license_number || l.id.slice(0, 8),
            secondary: l.valid_until ? `Expires ${new Date(l.valid_until).toLocaleDateString()}` : undefined,
            badge: { label: 'expiring', tone: 'warning' },
          }))}
        />
        <PriorityListCard
          title="Pending payments"
          loading={isLoading}
          viewAll={{ label: 'All', to: '/billing/post-licensee' }}
          rows={(data?.priority_lists.pending_payments ?? []).map((p: any) => ({
            id: p.id,
            primary: fmtMoney(Number(p.amount) || 0),
            secondary: `Created ${new Date(p.created_at).toLocaleDateString()}`,
            badge: { label: p.status, tone: 'warning' },
          }))}
        />
      </div>
    </div>
  );
}
