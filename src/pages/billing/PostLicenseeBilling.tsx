import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Clock, CheckCircle, FileCheck } from 'lucide-react';

interface BillingRecord {
  id: string;
  serviceNumber: string;
  licensee: string;
  service: string;
  amount: string;
  status: string;
  date: string;
}

const data: BillingRecord[] = [
  { id: '1', serviceNumber: 'SVC-2024-0089', licensee: 'Acme Insurance Ltd', service: 'License Amendment', amount: '$250.00', status: 'paid', date: '2024-01-12' },
  { id: '2', serviceNumber: 'SVC-2024-0088', licensee: 'Global Life Corp', service: 'Branch Addition', amount: '$300.00', status: 'pending', date: '2024-01-10' },
  { id: '3', serviceNumber: 'SVC-2024-0085', licensee: 'Pacific Mutual', service: 'Name Change', amount: '$150.00', status: 'paid', date: '2024-01-05' },
  { id: '4', serviceNumber: 'SVC-2024-0083', licensee: 'Continental Reinsurance', service: 'License Renewal', amount: '$350.00', status: 'overdue', date: '2023-12-28' },
  { id: '5', serviceNumber: 'SVC-2024-0080', licensee: 'Summit Financial', service: 'Certificate Reissue', amount: '$100.00', status: 'paid', date: '2023-12-20' },
];

const columns: Column<BillingRecord>[] = [
  { key: 'serviceNumber', label: 'Service #', render: (r) => <span className="font-medium text-foreground">{r.serviceNumber}</span> },
  { key: 'licensee', label: 'Licensee' },
  { key: 'service', label: 'Service Type' },
  { key: 'amount', label: 'Amount', render: (r) => <span className="font-semibold">{r.amount}</span> },
  { key: 'date', label: 'Date' },
  {
    key: 'status', label: 'Status', render: (r) => {
      const v = r.status === 'paid' ? 'approved' : r.status === 'pending' ? 'pending' : 'rejected';
      return <Badge variant={v as any} className="capitalize">{r.status}</Badge>;
    }
  },
];

export default function PostLicenseeBilling() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Post-Licensee Billing" description="Billing records for post-license services and renewals." />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Billed" value="$2,850" icon={<DollarSign className="h-6 w-6" />} />
          <StatCard title="Collected" value="$2,100" icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="Pending" value="$400" icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Overdue" value="$350" icon={<FileCheck className="h-6 w-6" />} variant="danger" />
        </div>
        <div className="animate-slide-up delay-200">
          <DataTableShell columns={columns} data={data} searchPlaceholder="Search post-licensee billing..." />
        </div>
      </div>
    </DashboardLayout>
  );
}
