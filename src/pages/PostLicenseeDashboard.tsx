import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { ReturnCard } from '@/components/dashboard/ReturnCard';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { Return } from '@/types';
import {
  FileCheck,
  ClipboardList,
  AlertTriangle,
  Users,
  CreditCard,
  TrendingUp,
} from 'lucide-react';

const mockReturns: Return[] = [
  {
    id: '1',
    returnNumber: 'RET-2024-M01',
    userId: 'user-2',
    licenseId: 'lic-1',
    serviceId: 'svc-1',
    formId: 'form-ret-1',
    frequency: 'monthly',
    periodStart: '2024-01-01T00:00:00Z',
    periodEnd: '2024-01-31T23:59:59Z',
    dueDate: '2024-02-10T23:59:59Z',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00Z',
    data: {},
  },
  {
    id: '2',
    returnNumber: 'RET-2023-Q4',
    userId: 'user-2',
    licenseId: 'lic-1',
    serviceId: 'svc-2',
    formId: 'form-ret-2',
    frequency: 'quarterly',
    periodStart: '2023-10-01T00:00:00Z',
    periodEnd: '2023-12-31T23:59:59Z',
    dueDate: '2024-01-15T23:59:59Z',
    status: 'overdue',
    createdAt: '2023-10-01T00:00:00Z',
    data: {},
  },
  {
    id: '3',
    returnNumber: 'RET-2024-M02',
    userId: 'user-2',
    licenseId: 'lic-1',
    serviceId: 'svc-1',
    formId: 'form-ret-1',
    frequency: 'monthly',
    periodStart: '2024-02-01T00:00:00Z',
    periodEnd: '2024-02-29T23:59:59Z',
    dueDate: '2024-03-10T23:59:59Z',
    status: 'draft',
    createdAt: '2024-02-01T00:00:00Z',
    data: {},
  },
];

export default function PostLicenseeDashboard() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome */}
        <div className="animate-slide-up">
          <h1 className="text-2xl font-bold text-foreground">Welcome back, {user.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {user.organizationName && (
              <span className="font-medium text-foreground">{user.organizationName}</span>
            )}
            {user.organizationName && ' — '}
            Manage your compliance, returns, and billing.
          </p>
          {user.licenseNumber && (
            <p className="mt-1 text-sm text-muted-foreground">
              License: <span className="font-medium text-primary">{user.licenseNumber}</span>
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard
            title="Active Licenses"
            value={3}
            icon={<FileCheck className="h-6 w-6" />}
            variant="success"
          />
          <StatCard
            title="Pending Returns"
            value={5}
            icon={<ClipboardList className="h-6 w-6" />}
            variant="warning"
          />
          <StatCard
            title="Overdue Returns"
            value={1}
            icon={<AlertTriangle className="h-6 w-6" />}
            variant="danger"
          />
          <StatCard
            title="Outstanding Billing"
            value="$12,450"
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
            <div className="space-y-4">
              {mockReturns.map((ret) => (
                <ReturnCard key={ret.id} returnItem={ret} />
              ))}
            </div>
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
              <p className="text-3xl font-bold text-success">98%</p>
              <p className="text-sm text-muted-foreground">Filing Compliance</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">12</p>
              <p className="text-sm text-muted-foreground">Returns Filed (YTD)</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-warning">2</p>
              <p className="text-sm text-muted-foreground">Upcoming Due</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-info">$45,200</p>
              <p className="text-sm text-muted-foreground">Fees Paid (YTD)</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
