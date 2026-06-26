import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApplicantMetrics } from '@/hooks/useApplicantMetrics';
import { useExternalPortalAccess } from '@/hooks/useExternalPortalAccess';
import { useApplicantLicenses } from '@/hooks/useApplicantLicenses';
import { useLicenseExpiryStatus } from '@/hooks/useLicenseExpiryStatus';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { buildInsights } from '@/lib/dashboardInsights';
import { MetricCard } from './cards/MetricCard';
import { InsightCard } from './cards/InsightCard';
import { StatusBreakdownCard } from './cards/StatusBreakdownCard';
import { PriorityListCard } from './cards/PriorityListCard';
import { LicenseStatusList } from './cards/LicenseStatusList';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { FileText, DollarSign, PlusCircle, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

const fmtMoney = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

export function ApplicantDashboard() {
  const { user } = useAuth();
  const portalAccess = useExternalPortalAccess();
  const portalCtx = useEffectivePortalContext();
  const scope: 'pre' | 'all' = portalCtx.isPreLicensee ? 'pre' : 'all';
  const appsListPath = portalCtx.isPreLicensee ? '/applications?type=pre' : '/applications';
  const draftsPath = portalCtx.isPreLicensee ? '/applications?type=pre&status=draft' : '/applications?status=draft';
  const { data, isLoading } = useApplicantMetrics(user?.id, scope);
  const { data: myLicenses } = useApplicantLicenses(user?.id);
  const { data: expiryStatuses } = useLicenseExpiryStatus(user?.id);

  const canUseLicensing = portalAccess.hasAreaAccess('licensing') && portalAccess.can('licensing', 'can_view_status');
  const canStartApplication = portalAccess.can('licensing', 'can_submit');


  const actionRequired =
    (data?.applications.clarification_requested ?? 0) +
    (data?.applications.resubmission_requested ?? 0);

  const insights = useMemo(() => {
    if (!data) return [];
    return buildInsights({
      applications: {
        draft: data.applications.draft,
        submitted: data.applications.submitted,
      },
      payments: { pending: data.payments.pending },
    });
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Top metric strip — applicant-relevant only */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {canUseLicensing && <MetricCard title="Drafts" value={data?.applications.draft ?? 0} icon={FileText} tone="default" loading={isLoading} to={draftsPath} />}
        {canUseLicensing && <MetricCard title="Submitted" value={data?.applications.submitted ?? 0} icon={FileText} tone="primary" loading={isLoading} to={appsListPath} />}
        {canUseLicensing && <MetricCard title="Under review" value={data?.applications.under_review ?? 0} icon={Clock} tone="warning" loading={isLoading} to={appsListPath} />}
        {canUseLicensing && <MetricCard title="Approved" value={data?.applications.approved ?? 0} icon={CheckCircle2} tone="success" loading={isLoading} to={appsListPath} />}
        {canUseLicensing && <MetricCard title="Action required" value={actionRequired} icon={AlertCircle} tone={actionRequired > 0 ? 'destructive' : 'muted'} loading={isLoading} to={appsListPath} hint="Clarification or resubmission" />}

        <MetricCard
          title="Pending payment"
          value={data?.payments.outstanding_amount ?? 0}
          format={fmtMoney}
          icon={DollarSign}
          tone={(data?.payments.pending ?? 0) > 0 ? 'warning' : 'muted'}
          loading={isLoading}
          to="/billing/pre-licensee"
        />
      </div>

      {/* Licensee / license details — shows the user's licenses with a Renew
          action when expired (past grace). Lets applicants and pre-licensees
          renew an existing entity license without needing a Primary User profile. */}
      {canUseLicensing && (myLicenses?.length ?? 0) > 0 && (
        <LicenseStatusList
          licenses={myLicenses!}
          expiryStatuses={expiryStatuses}
          renewMode="expired-only"
          title="My licenses"
        />
      )}



      {/* Primary CTA — directly under the metrics */}
      {canStartApplication && <div className="rounded-lg border bg-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <p className="font-medium text-sm">Start a new licence application</p>
          <p className="text-xs text-muted-foreground">
            Choose a sector and category to begin a fresh application.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/applications/new">
            <PlusCircle className="h-4 w-4 mr-1.5" /> New application
          </Link>
        </Button>
      </div>}


      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.slice(0, 4).map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {canUseLicensing && <StatusBreakdownCard
          title="My applications"
          loading={isLoading}
          items={[
            { label: 'Draft', value: data?.applications.draft ?? 0 },
            { label: 'Submitted', value: data?.applications.submitted ?? 0, tone: 'primary' },
            { label: 'Under review', value: data?.applications.under_review ?? 0, tone: 'warning' },
            { label: 'Clarification requested', value: data?.applications.clarification_requested ?? 0, tone: 'warning' },
            { label: 'Resubmission requested', value: data?.applications.resubmission_requested ?? 0, tone: 'warning' },
            { label: 'Approved', value: data?.applications.approved ?? 0, tone: 'success' },
            { label: 'Rejected', value: data?.applications.rejected ?? 0, tone: 'destructive' },
          ]}
        />}
        {canUseLicensing && <PriorityListCard
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
        />}
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
    </div>
  );
}
