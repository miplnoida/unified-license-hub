import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { ApplicationCard } from '@/components/dashboard/ApplicationCard';
import { ReturnCard } from '@/components/dashboard/ReturnCard';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { Application, Return } from '@/types';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  ClipboardList,
  Users,
} from 'lucide-react';

// Mock data for admin/internal dashboard
const mockApplications: Application[] = [
  {
    id: '1',
    applicationNumber: 'APP-2024-0156',
    userId: 'user-1',
    sectorId: 'sec-1',
    subSectorId: 'sub-1',
    categoryId: 'cat-1',
    formId: 'form-1',
    status: 'under_review',
    submittedAt: '2024-01-10T09:00:00Z',
    createdAt: '2024-01-08T10:00:00Z',
    updatedAt: '2024-01-12T14:00:00Z',
    data: {},
  },
  {
    id: '2',
    applicationNumber: 'APP-2024-0155',
    userId: 'user-1',
    sectorId: 'sec-1',
    subSectorId: 'sub-1',
    categoryId: 'cat-2',
    formId: 'form-2',
    status: 'query_raised',
    submittedAt: '2024-01-05T11:00:00Z',
    createdAt: '2024-01-03T09:00:00Z',
    updatedAt: '2024-01-11T16:00:00Z',
    data: {},
  },
  {
    id: '3',
    applicationNumber: 'APP-2024-0154',
    userId: 'user-1',
    sectorId: 'sec-2',
    subSectorId: 'sub-2',
    categoryId: 'cat-3',
    formId: 'form-1',
    status: 'draft',
    createdAt: '2024-01-12T08:00:00Z',
    updatedAt: '2024-01-12T08:00:00Z',
    data: {},
  },
];

const mockReturns: Return[] = [
  {
    id: '1',
    returnNumber: 'RET-2024-M01',
    userId: 'user-1',
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
    userId: 'user-1',
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
    userId: 'user-1',
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

export default function Dashboard() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome Section */}
        <div className="animate-slide-up">
          <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Overview of applications, returns, and system activity.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard
            title="Pending Applications"
            value={47}
            change={-12}
            changeLabel="from yesterday"
            icon={<FileText className="h-6 w-6" />}
            variant="primary"
          />
          <StatCard
            title="Pending Returns"
            value={23}
            icon={<ClipboardList className="h-6 w-6" />}
            variant="warning"
          />
          <StatCard
            title="Overdue Compliance"
            value={8}
            icon={<AlertTriangle className="h-6 w-6" />}
            variant="danger"
          />
          <StatCard
            title="Active Licensees"
            value={1284}
            change={5}
            changeLabel="this month"
            icon={<Users className="h-6 w-6" />}
            variant="success"
          />
        </div>

        {/* Quick Actions */}
        <div className="animate-slide-up delay-200">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <QuickActions userRole="admin" />
        </div>

        {/* Processing Queues */}
        <div className="grid lg:grid-cols-2 gap-6 animate-slide-up delay-300">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Applications Queue</h2>
              <span className="text-sm text-muted-foreground">12 pending review</span>
            </div>
            <div className="space-y-4">
              {mockApplications.map((app) => (
                <ApplicationCard
                  key={app.id}
                  application={{ ...app, status: 'submitted' }}
                  onReview={() => {}}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Returns Queue</h2>
              <span className="text-sm text-muted-foreground">8 pending review</span>
            </div>
            <div className="space-y-4">
              {mockReturns.map((ret) => (
                <ReturnCard
                  key={ret.id}
                  returnItem={{ ...ret, status: 'submitted' }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Workload Stats */}
        <div className="card-elevated p-6 animate-slide-up delay-400">
          <h2 className="text-lg font-semibold mb-4">Processing Statistics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">156</p>
              <p className="text-sm text-muted-foreground">Processed Today</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-success">2.3h</p>
              <p className="text-sm text-muted-foreground">Avg. Processing Time</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-warning">94%</p>
              <p className="text-sm text-muted-foreground">SLA Compliance</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-info">1,847</p>
              <p className="text-sm text-muted-foreground">This Month</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
