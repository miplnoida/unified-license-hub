import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, DollarSign, Clock, CheckCircle } from 'lucide-react';

interface BillingRecord {
  id: string;
  applicationNumber: string;
  applicant: string;
  type: string;
  amount: string;
  status: string;
  date: string;
  dueDate: string;
}

const data: BillingRecord[] = [
  { id: '1', applicationNumber: 'APP-2024-0156', applicant: 'Acme Insurance Ltd', type: 'Application Fee', amount: '$500.00', status: 'paid', date: '2024-01-10', dueDate: '2024-01-20' },
  { id: '2', applicationNumber: 'APP-2024-0155', applicant: 'Global Life Corp', type: 'Application Fee', amount: '$500.00', status: 'pending', date: '2024-01-08', dueDate: '2024-01-18' },
  { id: '3', applicationNumber: 'APP-2024-0153', applicant: 'Safe Harbor Insurance', type: 'Application Fee', amount: '$500.00', status: 'overdue', date: '2024-01-02', dueDate: '2024-01-12' },
  { id: '4', applicationNumber: 'APP-2024-0150', applicant: 'Pacific Mutual', type: 'Processing Fee', amount: '$250.00', status: 'paid', date: '2023-12-28', dueDate: '2024-01-07' },
  { id: '5', applicationNumber: 'APP-2024-0148', applicant: 'Continental Reinsurance', type: 'Application Fee', amount: '$500.00', status: 'paid', date: '2023-12-20', dueDate: '2023-12-30' },
  { id: '6', applicationNumber: 'APP-2024-0145', applicant: 'Summit Financial', type: 'Application Fee', amount: '$500.00', status: 'waived', date: '2023-12-15', dueDate: '2023-12-25' },
];

const columns: Column<BillingRecord>[] = [
  { key: 'applicationNumber', label: 'Application #', render: (r) => <span className="font-medium text-foreground">{r.applicationNumber}</span> },
  { key: 'applicant', label: 'Applicant' },
  { key: 'type', label: 'Fee Type' },
  { key: 'amount', label: 'Amount', render: (r) => <span className="font-semibold">{r.amount}</span> },
  { key: 'dueDate', label: 'Due Date' },
  {
    key: 'status', label: 'Status', render: (r) => {
      const v = r.status === 'paid' ? 'approved' : r.status === 'pending' ? 'pending' : r.status === 'overdue' ? 'rejected' : 'draft';
      return <Badge variant={v as any} className="capitalize">{r.status}</Badge>;
    }
  },
];

export default function PreLicenseeBilling() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Pre-Licensee Billing"
          description="Manage billing and fee collection for pre-license applications."
        />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Billed" value="$4,250" icon={<DollarSign className="h-6 w-6" />} />
          <StatCard title="Collected" value="$3,000" icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="Pending" value="$750" icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Overdue" value="$500" icon={<FileText className="h-6 w-6" />} variant="danger" />
        </div>
        <div className="animate-slide-up delay-200">
          <DataTableShell columns={columns} data={data} searchPlaceholder="Search billing records..." />
        </div>
      </div>
    </DashboardLayout>
  );
}
