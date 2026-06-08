import { useAuth } from '@/contexts/AuthContext';
import { usePpoc } from '@/contexts/PpocContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import {
  FileCheck,
  ClipboardList,
  AlertTriangle,
  CreditCard,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { useLicenseeMetrics } from '@/hooks/useLicenseeMetrics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const fmtMoney = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0);

export default function PostLicenseeDashboard() {
  const { user } = useAuth();
  const { resolvedLicenseeId, activeLicensee } = usePpoc();
  const { data: metrics, isLoading } = useLicenseeMetrics(resolvedLicenseeId, user?.id);

  if (!user) return null;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome */}
        <div className="animate-slide-up">
          <h1 className="text-2xl font-bold text-foreground">Welcome back, {user.fullName}</h1>
          <p className="mt-1 text-muted-foreground">
            {(activeLicensee?.licensee_name || user.entityName) && (
              <span className="font-medium text-foreground">{activeLicensee?.licensee_name || user.entityName}</span>
            )}
            {(activeLicensee?.licensee_name || user.entityName) && ' — '}
            Manage your compliance, returns, and billing.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard
            title="Active Licenses"
            value={isLoading ? '…' : metrics?.licenses.active ?? 0}
            icon={<FileCheck className="h-6 w-6" />}
            variant="success"
          />
          <StatCard
            title="Pending Returns"
            value={isLoading ? '…' : metrics?.returns.due_soon ?? 0}
            icon={<ClipboardList className="h-6 w-6" />}
            variant="warning"
          />
          <StatCard
            title="Overdue Returns"
            value={isLoading ? '…' : metrics?.returns.overdue ?? 0}
            icon={<AlertTriangle className="h-6 w-6" />}
            variant="danger"
          />
          <StatCard
            title="Outstanding Billing"
            value={isLoading ? '…' : fmtMoney(metrics?.payments.outstanding_amount ?? 0)}
            icon={<CreditCard className="h-6 w-6" />}
            variant="primary"
          />
        </div>

        {/* Quick Actions */}
        <div className="animate-slide-up delay-200">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <QuickActions userRole="post_licensee" />
        </div>

        {/* Returns & Activity */}
        <div className="grid lg:grid-cols-2 gap-6 animate-slide-up delay-300">
          <div>
            <h2 className="text-lg font-semibold mb-4">Pending Returns</h2>
            <Card>
              <CardContent className="p-4">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading upcoming returns…</p>
                ) : (metrics?.priority_lists.upcoming_returns.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No upcoming returns for the selected entity.</p>
                ) : (
                  <div className="space-y-3">
                    {metrics?.priority_lists.upcoming_returns.map((ret) => {
                      const isOverdue = !!ret.due_date && ret.due_date < new Date().toISOString().slice(0, 10);
                      return (
                        <div key={ret.id} className="flex items-center justify-between rounded-lg border p-3">
                          <div>
                            <p className="font-medium text-foreground">{ret.unique_id || ret.id.slice(0, 8)}</p>
                            <p className="text-sm text-muted-foreground">
                              {ret.due_date ? `Due ${new Date(ret.due_date).toLocaleDateString()}` : 'No due date'}
                            </p>
                          </div>
                          <Badge variant={isOverdue ? 'destructive' : 'outline'}>
                            {ret.status}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <RecentActivity />
          </div>
        </div>

        {/* Compliance Overview */}
        <div className="card-elevated p-6 animate-slide-up delay-400">
          <h2 className="text-lg font-semibold mb-4">Compliance Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-success">
                {isLoading
                  ? '…'
                  : (() => {
                      const submitted = metrics?.returns.submitted ?? 0;
                      const dueSoon = metrics?.returns.due_soon ?? 0;
                      const overdue = metrics?.returns.overdue ?? 0;
                      const total = submitted + dueSoon + overdue;
                      return total === 0 ? '100%' : `${Math.round((submitted / total) * 100)}%`;
                    })()}
              </p>
              <p className="text-sm text-muted-foreground">Filing Compliance</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{isLoading ? '…' : metrics?.returns.submitted ?? 0}</p>
              <p className="text-sm text-muted-foreground">Returns Filed (YTD)</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-warning">{isLoading ? '…' : metrics?.returns.pending_review ?? 0}</p>
              <p className="text-sm text-muted-foreground">Upcoming Due</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-info">{isLoading ? '…' : metrics?.payments.paid ?? 0}</p>
              <p className="text-sm text-muted-foreground">Paid Transactions</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entity Status</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Submitted returns</p>
              <p className="text-xl font-semibold">{isLoading ? '…' : metrics?.returns.submitted ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Pending review</p>
              <p className="text-xl font-semibold">{isLoading ? '…' : metrics?.returns.pending_review ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Pending payments</p>
              <p className="text-xl font-semibold">{isLoading ? '…' : metrics?.payments.pending ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Unread notifications</p>
              <p className="text-xl font-semibold">{isLoading ? '…' : metrics?.notifications.unread ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
