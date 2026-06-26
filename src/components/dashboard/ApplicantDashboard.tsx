import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApplicantMetrics } from '@/hooks/useApplicantMetrics';
import { useExternalPortalAccess } from '@/hooks/useExternalPortalAccess';
import { useApplicantLicenses } from '@/hooks/useApplicantLicenses';
import { useLicenseExpiryStatus } from '@/hooks/useLicenseExpiryStatus';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { useRegistrationApprovalStatus } from '@/hooks/useRegistrationApprovalStatus';
import { buildInsights } from '@/lib/dashboardInsights';
import { getApplicationStatusLabel } from '@/lib/applicationStatus';
import { MetricCard } from './cards/MetricCard';
import { InsightCard } from './cards/InsightCard';
import { StatusBreakdownCard } from './cards/StatusBreakdownCard';
import { PriorityListCard } from './cards/PriorityListCard';
import { LicenseStatusList } from './cards/LicenseStatusList';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { FileText, DollarSign, PlusCircle, AlertCircle, CheckCircle2, Clock, BellRing } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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
  const regApproval = useRegistrationApprovalStatus();

  const canUseLicensing = portalAccess.hasAreaAccess('licensing') && portalAccess.can('licensing', 'can_view_status');
  const canStartApplication = portalAccess.can('licensing', 'can_submit');

  const actionRequiredRows = data?.priority_lists.action_required ?? [];
  const actionRequired = actionRequiredRows.length;

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

  // Recent activity derived from recent applications (uses existing data only).
  const recentActivity = useMemo(() => {
    const rows = data?.priority_lists.recent_applications ?? [];
    return rows.slice(0, 6).map((a: any) => {
      const ts = a.updated_at || a.created_at;
      const label = getApplicationStatusLabel(a.status);
      return {
        id: a.id,
        title: `${a.application_number || a.id.slice(0, 8)} — ${label}`,
        when: ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : '',
        to: `/applications/${a.id}`,
      };
    });
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Welcome banner — applicant identity + registration context */}
      <Card className="bg-gradient-to-br from-primary/5 via-background to-background border-primary/20">
        <CardContent className="pt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Welcome back</p>
            <h2 className="text-lg md:text-xl font-semibold truncate">{user?.fullName || 'Applicant'}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {regApproval.registration?.registration_reference && (
                <span className="font-mono">Ref: {regApproval.registration.registration_reference}</span>
              )}
              {regApproval.registration?.status && (
                <Badge variant="outline" className="text-[10px]">
                  Registration: {regApproval.registration.status.replace(/_/g, ' ')}
                </Badge>
              )}
              {(myLicenses?.[0]?.license_number) && (
                <span className="font-mono">License: {myLicenses[0].license_number}</span>
              )}
            </div>
          </div>
          {canStartApplication && (
            <Button asChild size="sm">
              <Link to="/applications/new">
                <PlusCircle className="h-4 w-4 mr-1.5" /> New application
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Top metric strip — applicant-relevant only */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {canUseLicensing && <MetricCard title="Drafts" value={data?.applications.draft ?? 0} icon={FileText} tone="default" loading={isLoading} to={draftsPath} />}
        {canUseLicensing && <MetricCard title="Submitted" value={data?.applications.submitted ?? 0} icon={FileText} tone="primary" loading={isLoading} to={appsListPath} />}
        {canUseLicensing && <MetricCard title="Under review" value={data?.applications.under_review ?? 0} icon={Clock} tone="warning" loading={isLoading} to={appsListPath} />}
        {canUseLicensing && <MetricCard title="Approved" value={data?.applications.approved ?? 0} icon={CheckCircle2} tone="success" loading={isLoading} to={appsListPath} />}
        {canUseLicensing && <MetricCard title="Action required" value={actionRequired} icon={AlertCircle} tone={actionRequired > 0 ? 'destructive' : 'muted'} loading={isLoading} to={appsListPath} hint="Info, resubmission, correction" />}

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

      {/* Action Required — sourced from existing workflow statuses (RFI,
          resubmission, return-for-correction). No new RFI tables. */}
      {canUseLicensing && actionRequiredRows.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <BellRing className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold">Open requests requiring your action</h3>
              <Badge variant="outline" className="ml-auto bg-amber-500/10 text-amber-700 border-amber-500/30">
                {actionRequiredRows.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {actionRequiredRows.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {a.application_number || a.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getApplicationStatusLabel(a.status)}
                      {a.updated_at && ` · updated ${formatDistanceToNow(new Date(a.updated_at), { addSuffix: true })}`}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/applications/${a.id}`}>Respond</Link>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
            { label: 'More info requested', value: data?.applications.clarification_requested ?? 0, tone: 'warning' },
            { label: 'Resubmission requested', value: data?.applications.resubmission_requested ?? 0, tone: 'warning' },
            { label: 'Approved', value: data?.applications.approved ?? 0, tone: 'success' },
            { label: 'Rejected', value: data?.applications.rejected ?? 0, tone: 'destructive' },
          ]}
        />}
        {canUseLicensing && <PriorityListCard
          title="Recent applications"
          loading={isLoading}
          viewAll={{ label: 'All', to: appsListPath }}
          rows={(data?.priority_lists.recent_applications ?? []).map((a: any) => ({
            id: a.id,
            primary: a.application_number || a.id.slice(0, 8),
            secondary: `Created ${new Date(a.created_at).toLocaleDateString()}`,
            badge: { label: getApplicationStatusLabel(a.status), tone: 'default' },
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

      {/* Recent activity — derived from existing applications data. */}
      {recentActivity.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-3">Recent activity</h3>
            <ul className="divide-y">
              {recentActivity.map((row) => (
                <li key={row.id} className="py-2 flex items-center justify-between gap-3">
                  <Link to={row.to} className="text-sm hover:underline truncate">
                    {row.title}
                  </Link>
                  <span className="text-xs text-muted-foreground shrink-0">{row.when}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
