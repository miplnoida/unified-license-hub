import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Play, Pause } from 'lucide-react';

interface Schedule {
  id: string;
  returnType: string;
  frequency: string;
  generationDay: string;
  dueAfterDays: number;
  nextGeneration: string;
  status: string;
  autoGenerate: boolean;
}

const data: Schedule[] = [
  { id: '1', returnType: 'Insurance Monthly Return', frequency: 'Monthly', generationDay: '1st of month', dueAfterDays: 10, nextGeneration: '2024-02-01', status: 'active', autoGenerate: true },
  { id: '2', returnType: 'Banking Quarterly Report', frequency: 'Quarterly', generationDay: '1st of quarter', dueAfterDays: 30, nextGeneration: '2024-04-01', status: 'active', autoGenerate: true },
  { id: '3', returnType: 'Annual Compliance Return', frequency: 'Yearly', generationDay: 'Jan 1st', dueAfterDays: 90, nextGeneration: '2025-01-01', status: 'active', autoGenerate: true },
  { id: '4', returnType: 'Capital Markets Monthly', frequency: 'Monthly', generationDay: '1st of month', dueAfterDays: 15, nextGeneration: '2024-02-01', status: 'paused', autoGenerate: false },
  { id: '5', returnType: 'Pension Fund Quarterly', frequency: 'Quarterly', generationDay: '1st of quarter', dueAfterDays: 30, nextGeneration: '2024-04-01', status: 'active', autoGenerate: true },
];

const columns: Column<Schedule>[] = [
  { key: 'returnType', label: 'Return Type', render: (r) => <span className="font-medium text-foreground">{r.returnType}</span> },
  { key: 'frequency', label: 'Frequency', render: (r) => <Badge variant="outline">{r.frequency}</Badge> },
  { key: 'generationDay', label: 'Generation Day' },
  { key: 'dueAfterDays', label: 'Due After', render: (r) => `${r.dueAfterDays} days` },
  { key: 'nextGeneration', label: 'Next Generation' },
  { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'active' ? 'approved' : 'pending' as any} className="capitalize">{r.status}</Badge> },
  { key: 'actions', label: '', render: (r) => (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8">
        {r.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
    </div>
  )},
];

export default function ManageScheduling() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Manage Scheduling" description="Configure automatic return generation schedules and due dates." actions={<Button><Plus className="h-4 w-4 mr-2" />New Schedule</Button>} />
        <div className="animate-slide-up delay-100">
          <DataTableShell columns={columns} data={data} searchPlaceholder="Search schedules..." />
        </div>
      </div>
    </DashboardLayout>
  );
}
