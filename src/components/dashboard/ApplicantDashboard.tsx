import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApplicantMetrics } from '@/hooks/useApplicantMetrics';
import { buildInsights } from '@/lib/dashboardInsights';
import { MetricCard } from './cards/MetricCard';
import { InsightCard } from './cards/InsightCard';
import { StatusBreakdownCard } from './cards/StatusBreakdownCard';
import { PriorityListCard } from './cards/PriorityListCard';
import { FileText, DollarSign, Bell, PlusCircle } from 'lucide-react';

const fmtMoney = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

export function ApplicantDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useApplicantMetrics(user?.id);

  const insights = useMemo(() => {
    if (!data) return [];
    return buildInsights({
      applications: {
        draft: data.applications.draft,
        submitted: data.applications.submitted,
        returned: data.applications.returned,
      },
      payments: { pending: data.payments.pending },
    });
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard title="Drafts" value={data?.applications.draft ?? 0} icon={FileText} tone="default" loading={isLoading} to="/applications?status=draft" />
        <MetricCard title="Submitted" value={data?.applications.submitted ?? 0} icon={FileText} tone="primary" loading={isLoading} to="/applications" />
        <MetricCard title="Under review" value={data?.applications.under_review ?? 0} icon={FileText} tone="warning" loading={isLoading} to="/applications" />
        <MetricCard title="Approved" value={data?.applications.approved ?? 0} icon={FileText} tone="success" loading={isLoading} to="/applications" />
        <MetricCard title="Outstanding fees" value={data?.payments.outstanding_amount ?? 0} format={fmtMoney} icon={DollarSign} tone="warning" loading={isLoading} to="/billing/pre-licensee" />
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
            { label: 'Under review', value: data?.applications.under_review ?? 0, tone: 'warning' },
            { label: 'Approved', value: data?.applications.approved ?? 0, tone: 'success' },
            { label: 'Rejected', value: data?.applications.rejected ?? 0, tone: 'destructive' },
            { label: 'Returned', value: data?.applications.returned ?? 0, tone: 'warning' },
          ]}
        />
        <PriorityListCard
          title="Recent applications"
          loading={isLoading}
          viewAll={{ label: 'All', to: '/applications' }}
          rows={(data?.priority_lists.recent_applications ?? []).map((a: any) => ({
            id: a.id,
            primary: a.application_number || a.id.slice(0, 8),
            secondary: `Created ${new Date(a.created_at).toLocaleDateString()}`,
            badge: { label: a.status, tone: 'default' },
            to: `/applications/${a.id}`,
          }))}
        />
        <PriorityListCard
          title="Pending payments"
          loading={isLoading}
          viewAll={{ label: 'All', to: '/billing/pre-licensee' }}
          rows={(data?.priority_lists.pending_payments ?? []).map((p: any) => ({
            id: p.id,
            primary: fmtMoney(Number(p.amount) || 0),
            secondary: `Created ${new Date(p.created_at).toLocaleDateString()}`,
            badge: { label: p.status, tone: 'warning' },
          }))}
        />
      </div>

      <div className="rounded-lg border border-dashed p-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">Need to start a new application?</p>
          <p className="text-xs text-muted-foreground">Begin a new licence application from the public form catalogue.</p>
        </div>
        <a href="/applications/new" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <PlusCircle className="h-4 w-4" /> New application
        </a>
      </div>
    </div>
  );
}
