import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2 } from 'lucide-react';

interface ReturnGroup {
  id: string;
  name: string;
  sector: string;
  returnsCount: number;
  frequency: string;
  status: string;
  createdDate: string;
}

const data: ReturnGroup[] = [
  { id: '1', name: 'Insurance Core Returns', sector: 'Insurance', returnsCount: 6, frequency: 'Monthly', status: 'active', createdDate: '2023-06-15' },
  { id: '2', name: 'Banking Prudential Returns', sector: 'Banking', returnsCount: 4, frequency: 'Quarterly', status: 'active', createdDate: '2023-06-10' },
  { id: '3', name: 'Capital Markets Reporting', sector: 'Capital Markets', returnsCount: 3, frequency: 'Monthly', status: 'active', createdDate: '2023-07-01' },
  { id: '4', name: 'Annual Compliance Package', sector: 'All', returnsCount: 8, frequency: 'Yearly', status: 'active', createdDate: '2023-05-20' },
  { id: '5', name: 'Pension Solvency Reports', sector: 'Pension', returnsCount: 2, frequency: 'Quarterly', status: 'draft', createdDate: '2024-01-05' },
];

const columns: Column<ReturnGroup>[] = [
  { key: 'name', label: 'Group Name', render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
  { key: 'sector', label: 'Sector' },
  { key: 'returnsCount', label: 'Returns', render: (r) => <Badge variant="secondary">{r.returnsCount}</Badge> },
  { key: 'frequency', label: 'Frequency' },
  { key: 'createdDate', label: 'Created' },
  { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'active' ? 'approved' : 'draft' as any} className="capitalize">{r.status}</Badge> },
  { key: 'actions', label: '', render: () => (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
    </div>
  )},
];

export default function ReturnGroups() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Return Groups" description="Organize returns into logical groups for batch processing." backHref="/dashboard" backLabel="Dashboard" actions={<Button><Plus className="h-4 w-4 mr-2" />Create Group</Button>} />
        <div className="animate-slide-up delay-100">
          <DataTableShell columns={columns} data={data} searchPlaceholder="Search groups..." />
        </div>
      </div>
    </DashboardLayout>
  );
}
