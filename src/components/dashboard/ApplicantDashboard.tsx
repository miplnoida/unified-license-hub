import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApplicantMetrics } from '@/hooks/useApplicantMetrics';
import { useExternalPortalAccess } from '@/hooks/useExternalPortalAccess';
import { useApplicantLicenses } from '@/hooks/useApplicantLicenses';
import { useLicenseExpiryStatus } from '@/hooks/useLicenseExpiryStatus';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { useRegistrationApprovalStatus } from '@/hooks/useRegistrationApprovalStatus';
import { buildInsights } from '@/lib/dashboardInsights';
import { MetricCard } from './cards/MetricCard';
import { InsightCard } from './cards/InsightCard';
import { LicenseStatusList } from './cards/LicenseStatusList';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { FileText, DollarSign, PlusCircle, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { ActionRequiredList } from './applicant/ActionRequiredList';
import { RecentActivityPanel } from './applicant/RecentActivityPanel';
import { ApplicationTimeline } from './applicant/ApplicationTimeline';
import { RequiredFormsList } from './applicant/RequiredFormsList';

const fmtMoney = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

export function ApplicantDashboard() {
  const { user } = useAuth();
  const portalAccess = useExternalPortalAccess();
  const portalCtx = useEffectivePortalContext();
  const scope: 'pre' | 'all' = portalCtx.isPreLicensee ? 'pre' : 'all';
  const appsListPath = portalCtx.isPreLicensee ? '/applications?type=pre' : '/applications';
  const draftsPath = portalCtx.isPreLicensee ? '/applications?type=pre&status=draft' : '/applications?status=draft';
  const rejectedPath = portalCtx.isPreLicensee ? '/applications?type=pre&status=rejected' : '/applications?status=rejected';
  const newApplicationPath = portalCtx.isPreLicensee ? '/pre-license/new' : '/applications/new';
  const { data, isLoading } = useApplicantMetrics(user?.id, scope);
  const { data: myLicenses } = useApplicantLicenses(user?.id);
  const { data: expiryStatuses } = useLicenseExpiryStatus(user?.id);
  const regApproval = useRegistrationApprovalStatus();

  const canUseLicensing = portalAccess.hasAreaAccess('licensing') && portalAccess.can('licensing', 'can_view_status');
  const canStartApplication = portalAccess.can('licensing', 'can_submit');

  const actionRequiredRows = (data?.priority_lists.action_required ?? []) as any[];
  const recentApps = (data?.priority_lists.recent_applications ?? []) as any[];

  const applicantTypeLabel = portalCtx.isPreLicensee
    ? 'Pre-Licensee'
    : portalCtx.isLicensee
      ? 'Licensee'
      : 'Applicant';

  // Surface latest non-draft application for the timeline; otherwise the
  // first row (which may be a draft) so the user still sees the journey.
  const timelineApp = useMemo(() => {
    const nonDraft = recentApps.find((a) => a.status && a.status !== 'draft');
    return nonDraft || recentApps[0] || null;
  }, [recentApps]);

  // Map metrics rows into the "Required Forms" card shape. Uses existing data
  // only — no extra fetches. The form name/description come from the row's
  // `data` payload when present (matches what PreLicenseeDashboard reads).
  const requiredFormsRows = useMemo(() => {
    return recentApps.slice(0, 5).map((a: any) => ({
      id: a.id,
      application_number: a.application_number,
      status: a.status,
      created_at: a.created_at,
      updated_at: a.updated_at,
      name: a.data?.entity_name || a.data?.applicant_name || a.application_number || null,
      description: a.data?.license_type || a.data?.sector_name || null,
      progress: null,
    }));
  }, [recentApps]);

  const insights = useMemo(() => {
    if (!data) return [];
    return buildInsights({
      applications: { draft: data.applications.draft, submitted: data.applications.submitted },
      payments: { pending: data.payments.pending },
    });
  }, [data]);

  // Welcome banner derived values.
  const entityName =
    recentApps.find((a) => a.data?.entity_name)?.data?.entity_name ||
    recentApps.find((a) => a.data?.applicant_name)?.data?.applicant_name ||
    null;
  const currentStatusLabel = (() => {
    if (myLicenses?.[0]?.status) return `License: ${myLicenses[0].status.replace(/_/g, ' ')}`;
    if (regApproval.registration?.status) return `Registration: ${regApproval.registration.status.replace(/_/g, ' ')}`;
    return null;
  })();

  return (
    <div className="space-y-6">
      {/* Phase 1 — Welcome banner */}
      <Card className="bg-gradient-to-br from-primary/5 via-background to-background border-primary/20">
        <CardContent className="pt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Welcome back</p>
            <h2 className="text-lg md:text-xl font-semibold truncate">{user?.fullName || 'Applicant'}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">{applicantTypeLabel}</Badge>
              {entityName && <span className="truncate">Entity: <span className="text-foreground font-medium">{entityName}</span></span>}
              {regApproval.registration?.registration_reference && (
                <span className="font-mono">Ref: {regApproval.registration.registration_reference}</span>
              )}
              {myLicenses?.[0]?.license_number && (
                <span className="font-mono">License: {myLicenses[0].license_number}</span>
              )}
              {currentStatusLabel && (
                <Badge variant="outline" className="text-[10px]">{currentStatusLabel}</Badge>
              )}
            </div>
          </div>
          {canStartApplication && (
            <Button asChild size="sm">
              <Link to={newApplicationPath}>
                <PlusCircle className="h-4 w-4 mr-1.5" /> New application
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Phase 1 — Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        {canUseLicensing && <MetricCard title="Drafts" value={data?.applications.draft ?? 0} icon={FileText} tone="default" loading={isLoading} to={draftsPath} />}
        {canUseLicensing && <MetricCard title="Submitted" value={data?.applications.submitted ?? 0} icon={FileText} tone="primary" loading={isLoading} to={appsListPath} />}
        {canUseLicensing && <MetricCard title="Under review" value={data?.applications.under_review ?? 0} icon={Clock} tone="warning" loading={isLoading} to={appsListPath} />}
        {canUseLicensing && <MetricCard title="Approved" value={data?.applications.approved ?? 0} icon={CheckCircle2} tone="success" loading={isLoading} to={appsListPath} />}
        {canUseLicensing && <MetricCard title="Rejected" value={data?.applications.rejected ?? 0} icon={XCircle} tone="destructive" loading={isLoading} to={rejectedPath} />}
        {canUseLicensing && <MetricCard title="Action required" value={actionRequiredRows.length} icon={AlertCircle} tone={actionRequiredRows.length > 0 ? 'destructive' : 'muted'} loading={isLoading} to={appsListPath} hint="Info, resubmission, correction" />}
        <MetricCard
          title="Pending payments"
          value={data?.payments.outstanding_amount ?? 0}
          format={fmtMoney}
          icon={DollarSign}
          tone={(data?.payments.pending ?? 0) > 0 ? 'warning' : 'muted'}
          loading={isLoading}
          to="/billing/pre-licensee"
        />
      </div>

      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.slice(0, 4).map((i) => <InsightCard key={i.id} insight={i} />)}
        </div>
      )}

      {/* Phase 8 layout — Row 3: Applications | Action Required */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {canUseLicensing && (
          <RequiredFormsList rows={requiredFormsRows} newApplicationPath={newApplicationPath} />
        )}
        {canUseLicensing && <ActionRequiredList rows={actionRequiredRows} />}
      </div>

      {/* Phase 4 — Application timeline (full width when present) */}
      {canUseLicensing && timelineApp && (
        <ApplicationTimeline status={timelineApp.status} applicationNumber={timelineApp.application_number} />
      )}

      {/* Phase 8 layout — Row 4: Recent Activity | My Licenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {canUseLicensing && <RecentActivityPanel rows={recentApps} />}
        {canUseLicensing && (myLicenses?.length ?? 0) > 0 ? (
          <LicenseStatusList
            licenses={myLicenses!}
            expiryStatuses={expiryStatuses}
            renewMode="expired-only"
            title="My licenses"
          />
        ) : canUseLicensing ? (
          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold mb-3">My licenses</h3>
              <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                No licenses yet.
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
