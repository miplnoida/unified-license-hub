import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, DollarSign, Clock, CheckCircle, Plus } from 'lucide-react';

interface Penalty {
  id: string;
  penaltyNumber: string;
  licensee: string;
  reason: string;
  amount: string;
  status: string;
  issuedDate: string;
  dueDate: string;
}

const data: Penalty[] = [
  { id: '1', penaltyNumber: 'PEN-2024-0032', licensee: 'Acme Insurance Ltd', reason: 'Late Return Submission', amount: '$500.00', status: 'unpaid', issuedDate: '2024-01-15', dueDate: '2024-02-15' },
  { id: '2', penaltyNumber: 'PEN-2024-0031', licensee: 'Global Life Corp', reason: 'Non-Compliance Finding', amount: '$2,500.00', status: 'disputed', issuedDate: '2024-01-10', dueDate: '2024-02-10' },
  { id: '3', penaltyNumber: 'PEN-2024-0029', licensee: 'Pacific Mutual', reason: 'Late Return Submission', amount: '$350.00', status: 'paid', issuedDate: '2024-01-05', dueDate: '2024-02-05' },
  { id: '4', penaltyNumber: 'PEN-2023-0128', licensee: 'Safe Harbor Insurance', reason: 'Unauthorized Activity', amount: '$10,000.00', status: 'unpaid', issuedDate: '2023-12-20', dueDate: '2024-01-20' },
  { id: '5', penaltyNumber: 'PEN-2023-0125', licensee: 'Continental Reinsurance', reason: 'Late Return Submission', amount: '$250.00', status: 'paid', issuedDate: '2023-12-10', dueDate: '2024-01-10' },
  { id: '6', penaltyNumber: 'PEN-2023-0120', licensee: 'Summit Financial', reason: 'Incomplete Disclosure', amount: '$1,000.00', status: 'waived', issuedDate: '2023-12-01', dueDate: '2024-01-01' },
];

const columns: Column<Penalty>[] = [
  { key: 'penaltyNumber', label: 'Penalty #', render: (r) => <span className="font-medium text-foreground">{r.penaltyNumber}</span> },
  { key: 'licensee', label: 'Licensee' },
  { key: 'reason', label: 'Reason' },
  { key: 'amount', label: 'Amount', render: (r) => <span className="font-semibold text-destructive">{r.amount}</span> },
  { key: 'issuedDate', label: 'Issued' },
  { key: 'dueDate', label: 'Due Date' },
  {
    key: 'status', label: 'Status', render: (r) => {
      const map: Record<string, string> = { paid: 'approved', unpaid: 'rejected', disputed: 'pending', waived: 'draft' };
      return <Badge variant={(map[r.status] || 'default') as any} className="capitalize">{r.status}</Badge>;
    }
  },
];

export default function Penalties() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Penalties"
          description="Manage penalty assessments, collections, and dispute resolution."
          backHref="/dashboard"
          backLabel="Dashboard"
          actions={<Button><Plus className="h-4 w-4 mr-2" />Issue Penalty</Button>}
        />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Penalties" value="$14,600" icon={<AlertTriangle className="h-6 w-6" />} />
          <StatCard title="Collected" value="$600" icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="Outstanding" value="$10,500" icon={<DollarSign className="h-6 w-6" />} variant="danger" />
          <StatCard title="Disputed" value="$2,500" icon={<Clock className="h-6 w-6" />} variant="warning" />
        </div>
        <div className="animate-slide-up delay-200">
          <DataTableShell columns={columns} data={data} searchPlaceholder="Search penalties..." />
        </div>
      </div>
    </DashboardLayout>
  );
}
