import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2 } from 'lucide-react';

interface Rule {
  id: string;
  name: string;
  type: string;
  appliesTo: string;
  condition: string;
  status: string;
  priority: number;
}

const data: Rule[] = [
  { id: '1', name: 'Mandatory Asset Disclosure', type: 'Required Field', appliesTo: 'Insurance Monthly', condition: 'Always', status: 'active', priority: 1 },
  { id: '2', name: 'Capital Adequacy Check', type: 'Threshold', appliesTo: 'Banking Quarterly', condition: 'If total_assets > 1M', status: 'active', priority: 2 },
  { id: '3', name: 'Late Submission Penalty', type: 'Penalty', appliesTo: 'All Returns', condition: 'If submitted_after_due', status: 'active', priority: 3 },
  { id: '4', name: 'Cross-field Validation', type: 'Validation', appliesTo: 'Insurance Monthly', condition: 'assets = liabilities + equity', status: 'draft', priority: 4 },
  { id: '5', name: 'Minimum Reserve Ratio', type: 'Threshold', appliesTo: 'Banking Quarterly', condition: 'If reserve_ratio < 0.08', status: 'active', priority: 5 },
];

const columns: Column<Rule>[] = [
  { key: 'name', label: 'Rule Name', render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
  { key: 'type', label: 'Type', render: (r) => <Badge variant="outline">{r.type}</Badge> },
  { key: 'appliesTo', label: 'Applies To' },
  { key: 'condition', label: 'Condition', render: (r) => <code className="text-xs bg-muted px-2 py-1 rounded">{r.condition}</code> },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'active' ? 'approved' : 'draft' as any} className="capitalize">{r.status}</Badge> },
  { key: 'actions', label: '', render: () => (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
    </div>
  )},
];

export default function ManageRules() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Manage Rules" description="Configure business rules for return processing and validation." backHref="/dashboard" backLabel="Dashboard" actions={<Button><Plus className="h-4 w-4 mr-2" />Add Rule</Button>} />
        <div className="animate-slide-up delay-100">
          <DataTableShell columns={columns} data={data} searchPlaceholder="Search rules..." />
        </div>
      </div>
    </DashboardLayout>
  );
}
