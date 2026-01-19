import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ReturnCard } from '@/components/dashboard/ReturnCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Return } from '@/types';
import {
  ClipboardList,
  Clock,
  CheckCircle,
  AlertTriangle,
  Calendar,
  Filter,
} from 'lucide-react';

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
  {
    id: '4',
    returnNumber: 'RET-2023-M12',
    userId: 'user-1',
    licenseId: 'lic-1',
    serviceId: 'svc-1',
    formId: 'form-ret-1',
    frequency: 'monthly',
    periodStart: '2023-12-01T00:00:00Z',
    periodEnd: '2023-12-31T23:59:59Z',
    dueDate: '2024-01-10T23:59:59Z',
    status: 'accepted',
    submittedAt: '2024-01-08T14:30:00Z',
    createdAt: '2023-12-01T00:00:00Z',
    data: {},
  },
  {
    id: '5',
    returnNumber: 'RET-2023-M11',
    userId: 'user-1',
    licenseId: 'lic-1',
    serviceId: 'svc-1',
    formId: 'form-ret-1',
    frequency: 'monthly',
    periodStart: '2023-11-01T00:00:00Z',
    periodEnd: '2023-11-30T23:59:59Z',
    dueDate: '2023-12-10T23:59:59Z',
    status: 'accepted',
    submittedAt: '2023-12-05T10:15:00Z',
    createdAt: '2023-11-01T00:00:00Z',
    data: {},
  },
  {
    id: '6',
    returnNumber: 'RET-2023-Y1',
    userId: 'user-1',
    licenseId: 'lic-1',
    serviceId: 'svc-3',
    formId: 'form-ret-3',
    frequency: 'yearly',
    periodStart: '2023-01-01T00:00:00Z',
    periodEnd: '2023-12-31T23:59:59Z',
    dueDate: '2024-03-31T23:59:59Z',
    status: 'pending',
    createdAt: '2023-01-01T00:00:00Z',
    data: {},
  },
];

export default function Returns() {
  const [activeTab, setActiveTab] = useState('all');

  const pendingReturns = mockReturns.filter(r => r.status === 'pending' || r.status === 'draft');
  const overdueReturns = mockReturns.filter(r => r.status === 'overdue');
  const submittedReturns = mockReturns.filter(r => r.status === 'submitted' || r.status === 'accepted');

  const getFilteredReturns = () => {
    switch (activeTab) {
      case 'pending':
        return pendingReturns;
      case 'overdue':
        return overdueReturns;
      case 'submitted':
        return submittedReturns;
      default:
        return mockReturns;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between animate-slide-up">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Return Management</h1>
            <p className="mt-1 text-muted-foreground">
              View and submit your periodic returns based on your license obligations.
            </p>
          </div>
          <Button>
            <Calendar className="h-4 w-4 mr-2" />
            View Calendar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard
            title="Total Returns"
            value={mockReturns.length}
            icon={<ClipboardList className="h-6 w-6" />}
          />
          <StatCard
            title="Pending Submission"
            value={pendingReturns.length}
            icon={<Clock className="h-6 w-6" />}
            variant="warning"
          />
          <StatCard
            title="Overdue"
            value={overdueReturns.length}
            icon={<AlertTriangle className="h-6 w-6" />}
            variant="danger"
          />
          <StatCard
            title="Submitted"
            value={submittedReturns.length}
            icon={<CheckCircle className="h-6 w-6" />}
            variant="success"
          />
        </div>

        {/* Overdue Alert */}
        {overdueReturns.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3 animate-slide-up delay-200">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive">
                You have {overdueReturns.length} overdue return{overdueReturns.length > 1 ? 's' : ''}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Please submit these returns as soon as possible to avoid penalties.
              </p>
            </div>
            <Button variant="destructive" size="sm" className="shrink-0 ml-auto">
              View Overdue
            </Button>
          </div>
        )}

        {/* Returns List */}
        <div className="animate-slide-up delay-300">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="all">
                  All Returns
                  <Badge variant="secondary" className="ml-2">{mockReturns.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending
                  <Badge variant="pending" className="ml-2">{pendingReturns.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="overdue">
                  Overdue
                  <Badge variant="rejected" className="ml-2">{overdueReturns.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="submitted">
                  Submitted
                  <Badge variant="approved" className="ml-2">{submittedReturns.length}</Badge>
                </TabsTrigger>
              </TabsList>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
            </div>

            <TabsContent value={activeTab} className="mt-0">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {getFilteredReturns().map((returnItem) => (
                  <ReturnCard key={returnItem.id} returnItem={returnItem} />
                ))}
              </div>
              {getFilteredReturns().length === 0 && (
                <div className="text-center py-12 bg-muted/30 rounded-lg">
                  <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No returns found in this category.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Submission Schedule */}
        <div className="card-elevated p-6 animate-slide-up delay-400">
          <h2 className="text-lg font-semibold mb-4">Upcoming Due Dates</h2>
          <div className="space-y-3">
            {mockReturns
              .filter(r => r.status === 'pending' || r.status === 'draft')
              .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
              .slice(0, 4)
              .map((returnItem) => (
                <div
                  key={returnItem.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10">
                      <ClipboardList className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{returnItem.returnNumber}</p>
                      <p className="text-sm text-muted-foreground capitalize">{returnItem.frequency} Return</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">
                      {new Date(returnItem.dueDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                    <Badge variant={returnItem.status === 'draft' ? 'draft' : 'pending'}>
                      {returnItem.status === 'draft' ? 'In Progress' : 'Not Started'}
                    </Badge>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
