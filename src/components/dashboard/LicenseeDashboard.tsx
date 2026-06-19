import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePpoc } from '@/contexts/PpocContext';
import { useLicenseeMetrics } from '@/hooks/useLicenseeMetrics';
import { useExternalPortalAccess } from '@/hooks/useExternalPortalAccess';
import { buildInsights } from '@/lib/dashboardInsights';
import { MetricCard } from './cards/MetricCard';
import { InsightCard } from './cards/InsightCard';
import { StatusBreakdownCard } from './cards/StatusBreakdownCard';
import { PriorityListCard } from './cards/PriorityListCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, ClipboardList, DollarSign, Bell, AlertTriangle } from 'lucide-react';
import { licenseeDrilldownTo, recordPath } from '@/lib/licenseeDashboardDrilldowns';

const LICENSE_BADGE_VARIANT: Record<string, 'approved' | 'destructive' | 'warning' | 'outline'> = {
  active: 'approved',
  expired: 'destructive',
  suspended: 'destructive',
  revoked: 'destructive',
  cancelled: 'destructive',
};


const fmtMoney = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

export function LicenseeDashboard() {
  const { user } = useAuth();
  const { resolvedLicenseeId, activeLicensee } = usePpoc();
  const portalAccess = useExternalPortalAccess();
  const { data, isLoading } = useLicenseeMetrics(resolvedLicenseeId, user?.id);
  const canViewLicensing = Boolean(resolvedLicenseeId) || portalAccess.can('licensing', 'can_view_status', resolvedLicenseeId) || portalAccess.can('licensing', 'can_view_status');
  const canViewReturns = portalAccess.can('returns', 'can_view_status', resolvedLicenseeId) || portalAccess.can('returns', 'can_view_status');

  const insights = useMemo(() => {
    if (!data) return [];
    return buildInsights({
      licenses: { expiring_30d: data.licenses.expiring_30d, expired: data.licenses.expired },
      returns: { overdue: data.returns.overdue, due_soon: data.returns.due_soon, pending_review: data.returns.pending_review },
      payments: { overdue: data.payments.pending },
    }, 'licensee');
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
        <p className="text-sm text-muted-foreground">
          Showing metrics for <span className="font-medium text-foreground">{activeLicensee.licensee_name}</span>
          {activeLicensee.license_number ? <span> · Licence no. <span className="font-mono font-medium text-foreground">{activeLicensee.license_number}</span></span> : null}.
        </p>
      )}

      {canViewLicensing && (data?.licenses.list?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">License status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data!.licenses.list.map((lic) => {
              const days = lic.days_until_expiry;
              const isExpiringSoon = lic.status === 'active' && days !== null && days >= 0 && days <= 30;
              const variant = isExpiringSoon ? 'warning' : (LICENSE_BADGE_VARIANT[lic.status] || 'outline');
              let badgeLabel: string = lic.status.charAt(0).toUpperCase() + lic.status.slice(1);
              if (isExpiringSoon) badgeLabel = days === 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'}`;
              return (
                <div key={lic.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium text-foreground truncate">{lic.license_number || lic.id.slice(0, 8)}</p>
                    {lic.valid_until && (
                      <p className="text-xs text-muted-foreground">
                        Valid until {new Date(lic.valid_until).toLocaleDateString()}
                        {lic.status === 'active' && days !== null && days < 0 ? ` · expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago` : ''}
                      </p>
                    )}
                  </div>
                  <Badge variant={variant as any}>{badgeLabel}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}


      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {canViewLicensing && <MetricCard title="Active licences" value={data?.licenses.active ?? 0} icon={Shield} tone="success" loading={isLoading} to={licenseeDrilldownTo('licensesActive')} />}
        {canViewLicensing && <MetricCard title="Expiring ≤30d" value={data?.licenses.expiring_30d ?? 0} icon={AlertTriangle} tone="warning" loading={isLoading} to={licenseeDrilldownTo('licensesExpiring')} />}
        {canViewReturns && <MetricCard title="Returns due" value={data?.returns.due_soon ?? 0} icon={ClipboardList} tone="warning" loading={isLoading} to={licenseeDrilldownTo('returnsDueSoon')} />}
        {canViewReturns && <MetricCard title="Overdue returns" value={data?.returns.overdue ?? 0} icon={ClipboardList} tone="destructive" loading={isLoading} to={licenseeDrilldownTo('returnsOverdue')} />}
        {canViewLicensing && <MetricCard title="Outstanding fees" value={data?.payments.outstanding_amount ?? 0} format={fmtMoney} icon={DollarSign} tone="warning" loading={isLoading} to={licenseeDrilldownTo('paymentsPending')} />}
        <MetricCard title="Unread notifications" value={data?.notifications.unread ?? 0} icon={Bell} tone="primary" loading={isLoading} to={licenseeDrilldownTo('notificationsUnread')} />
      </div>

      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.slice(0, 4).map((i) => <InsightCard key={i.id} insight={i} />)}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {canViewLicensing && <StatusBreakdownCard
          title="My applications"
          loading={isLoading}
          items={[
            { label: 'Draft', value: data?.applications.draft ?? 0, to: licenseeDrilldownTo('appsDraft') },
            { label: 'Submitted', value: data?.applications.submitted ?? 0, tone: 'primary', to: licenseeDrilldownTo('appsSubmitted') },
            { label: 'Approved', value: data?.applications.approved ?? 0, tone: 'success', to: licenseeDrilldownTo('appsApproved') },
            { label: 'Rejected', value: data?.applications.rejected ?? 0, tone: 'destructive', to: licenseeDrilldownTo('appsRejected') },
          ]}
        />}
        {canViewReturns && <StatusBreakdownCard
          title="My returns"
          loading={isLoading}
          items={[
            { label: 'Due soon', value: data?.returns.due_soon ?? 0, tone: 'warning', to: licenseeDrilldownTo('returnsDueSoon') },
            { label: 'Overdue', value: data?.returns.overdue ?? 0, tone: 'destructive', to: licenseeDrilldownTo('returnsOverdue') },
            { label: 'Submitted', value: data?.returns.submitted ?? 0, tone: 'success', to: licenseeDrilldownTo('returnsSubmitted') },
            { label: 'Pending review', value: data?.returns.pending_review ?? 0, tone: 'primary', to: licenseeDrilldownTo('returnsPendingReview') },
          ]}
        />}
        {canViewLicensing && <StatusBreakdownCard
          title="My payments"
          loading={isLoading}
          items={[
            { label: 'Pending', value: data?.payments.pending ?? 0, tone: 'warning', to: licenseeDrilldownTo('paymentsPending') },
            { label: 'Paid', value: data?.payments.paid ?? 0, tone: 'success', to: licenseeDrilldownTo('paymentsPaid') },
          ]}
        />}
        {canViewReturns && <PriorityListCard
          title="Upcoming returns"
          loading={isLoading}
          viewAll={{ label: 'All', to: licenseeDrilldownTo('returnsDueSoon') }}
          emptyText="No upcoming returns in the due-soon window."
          rows={(data?.priority_lists.upcoming_returns ?? []).map((r: any) => ({
            id: r.id,
            primary: r.id.slice(0, 8),
            secondary: r.due_date ? `Due ${new Date(r.due_date).toLocaleDateString()}` : undefined,
            badge: { label: r.status, tone: 'warning' },
            to: recordPath.return(r.id),
          }))}
        />}
        {canViewLicensing && <PriorityListCard
          title="Expiring licences"
          loading={isLoading}
          viewAll={{ label: 'All', to: licenseeDrilldownTo('licensesExpiring') }}
          emptyText="No licences expiring in the next 30 days."
          rows={(data?.priority_lists.expiring_licenses ?? []).map((l: any) => ({
            id: l.id,
            primary: l.license_number || l.id.slice(0, 8),
            secondary: l.valid_until ? `Expires ${new Date(l.valid_until).toLocaleDateString()}` : undefined,
            badge: { label: 'expiring', tone: 'warning' },
            to: recordPath.license(l.id),
          }))}
        />}
        {canViewLicensing && <PriorityListCard
          title="Pending payments"
          loading={isLoading}
          viewAll={{ label: 'All', to: licenseeDrilldownTo('paymentsPending') }}
          emptyText="No pending payments."
          rows={(data?.priority_lists.pending_payments ?? []).map((p: any) => ({
            id: p.id,
            primary: fmtMoney(Number(p.amount) || 0),
            secondary: `Created ${new Date(p.created_at).toLocaleDateString()}`,
            badge: { label: p.status, tone: 'warning' },
            to: recordPath.payment(p.id),
          }))}
        />}
      </div>
    </div>
  );
}
