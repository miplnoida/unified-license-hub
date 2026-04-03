import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Clock, CheckCircle, CreditCard } from 'lucide-react';

interface Payment {
  id: string;
  receiptNumber: string;
  payer: string;
  type: string;
  method: string;
  amount: string;
  status: string;
  date: string;
  reference: string;
}

const data: Payment[] = [
  { id: '1', receiptNumber: 'RCP-2024-0201', payer: 'Acme Insurance Ltd', type: 'Application Fee', method: 'Bank Transfer', amount: '$500.00', status: 'confirmed', date: '2024-01-15', reference: 'APP-2024-0156' },
  { id: '2', receiptNumber: 'RCP-2024-0200', payer: 'Pacific Mutual', type: 'Penalty Payment', method: 'Online', amount: '$350.00', status: 'confirmed', date: '2024-01-14', reference: 'PEN-2024-0029' },
  { id: '3', receiptNumber: 'RCP-2024-0199', payer: 'Global Life Corp', type: 'Service Fee', method: 'Cheque', amount: '$250.00', status: 'processing', date: '2024-01-13', reference: 'SVC-2024-0088' },
  { id: '4', receiptNumber: 'RCP-2024-0198', payer: 'Continental Reinsurance', type: 'License Renewal', method: 'Online', amount: '$350.00', status: 'confirmed', date: '2024-01-12', reference: 'SVC-2024-0083' },
  { id: '5', receiptNumber: 'RCP-2024-0195', payer: 'Summit Financial', type: 'Application Fee', method: 'Bank Transfer', amount: '$500.00', status: 'failed', date: '2024-01-10', reference: 'APP-2024-0145' },
  { id: '6', receiptNumber: 'RCP-2024-0192', payer: 'Safe Harbor Insurance', type: 'Penalty Payment', method: 'Online', amount: '$500.00', status: 'refunded', date: '2024-01-08', reference: 'PEN-2024-0032' },
];

const columns: Column<Payment>[] = [
  { key: 'receiptNumber', label: 'Receipt #', render: (r) => <span className="font-medium text-foreground">{r.receiptNumber}</span> },
  { key: 'payer', label: 'Payer' },
  { key: 'type', label: 'Type' },
  { key: 'method', label: 'Method' },
  { key: 'amount', label: 'Amount', render: (r) => <span className="font-semibold">{r.amount}</span> },
  { key: 'date', label: 'Date' },
  {
    key: 'status', label: 'Status', render: (r) => {
      const map: Record<string, string> = { confirmed: 'approved', processing: 'pending', failed: 'rejected', refunded: 'draft' };
      return <Badge variant={(map[r.status] || 'default') as any} className="capitalize">{r.status}</Badge>;
    }
  },
];

export default function PaymentList() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Payment List" description="View all payment transactions across the system." />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Received" value="$12,450" icon={<DollarSign className="h-6 w-6" />} variant="success" />
          <StatCard title="Processing" value="$250" icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Failed" value="$500" icon={<CreditCard className="h-6 w-6" />} variant="danger" />
          <StatCard title="This Month" value="$2,450" icon={<CheckCircle className="h-6 w-6" />} />
        </div>
        <div className="animate-slide-up delay-200">
          <DataTableShell columns={columns} data={data} searchPlaceholder="Search payments..." />
        </div>
      </div>
    </DashboardLayout>
  );
}
