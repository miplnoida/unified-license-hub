import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

interface ReturnRecord {
  id: string;
  returnNumber: string;
  licensee: string;
  type: string;
  period: string;
  dueDate: string;
  submittedDate: string;
  status: string;
}

const data: ReturnRecord[] = [
  { id: '1', returnNumber: 'RET-2024-M01-001', licensee: 'Acme Insurance Ltd', type: 'Monthly', period: 'Jan 2024', dueDate: '2024-02-10', submittedDate: '2024-02-08', status: 'accepted' },
  { id: '2', returnNumber: 'RET-2024-M01-002', licensee: 'Global Life Corp', type: 'Monthly', period: 'Jan 2024', dueDate: '2024-02-10', submittedDate: '—', status: 'pending' },
  { id: '3', returnNumber: 'RET-2023-Q4-001', licensee: 'Pacific Mutual', type: 'Quarterly', period: 'Q4 2023', dueDate: '2024-01-30', submittedDate: '2024-01-28', status: 'accepted' },
  { id: '4', returnNumber: 'RET-2023-Q4-002', licensee: 'Continental Reinsurance', type: 'Quarterly', period: 'Q4 2023', dueDate: '2024-01-30', submittedDate: '—', status: 'overdue' },
  { id: '5', returnNumber: 'RET-2024-M01-003', licensee: 'Summit Financial', type: 'Monthly', period: 'Jan 2024', dueDate: '2024-02-10', submittedDate: '2024-02-05', status: 'under_review' },
  { id: '6', returnNumber: 'RET-2023-Y1-001', licensee: 'Safe Harbor Insurance', type: 'Yearly', period: 'FY 2023', dueDate: '2024-03-31', submittedDate: '—', status: 'draft' },
];

const columns: Column<ReturnRecord>[] = [
  { key: 'returnNumber', label: 'Return #', render: (r) => <span className="font-medium text-foreground">{r.returnNumber}</span> },
  { key: 'licensee', label: 'Licensee' },
  { key: 'type', label: 'Type', render: (r) => <Badge variant="outline">{r.type}</Badge> },
  { key: 'period', label: 'Period' },
  { key: 'dueDate', label: 'Due Date' },
  { key: 'submittedDate', label: 'Submitted' },
  { key: 'status', label: 'Status', render: (r) => {
    const map: Record<string, string> = { accepted: 'approved', pending: 'pending', overdue: 'rejected', under_review: 'under-review', draft: 'draft' };
    return <Badge variant={(map[r.status] || 'default') as any} className="capitalize">{r.status.replace('_', ' ')}</Badge>;
  }},
];

export default function ViewReturns() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="View Returns" description="Read-only view of all returns across the system." backHref="/dashboard" backLabel="Dashboard" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Returns" value={data.length} icon={<ClipboardList className="h-6 w-6" />} />
          <StatCard title="Accepted" value={data.filter(r => r.status === 'accepted').length} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="Pending" value={data.filter(r => r.status === 'pending' || r.status === 'draft').length} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Overdue" value={data.filter(r => r.status === 'overdue').length} icon={<AlertTriangle className="h-6 w-6" />} variant="danger" />
        </div>
        <div className="animate-slide-up delay-200">
          <DataTableShell columns={columns} data={data} searchPlaceholder="Search returns..." />
        </div>
      </div>
    </DashboardLayout>
  );
}
