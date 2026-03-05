import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2 } from 'lucide-react';

interface Validation {
  id: string;
  name: string;
  type: string;
  field: string;
  expression: string;
  errorMessage: string;
  status: string;
}

const data: Validation[] = [
  { id: '1', name: 'Total Assets Balance', type: 'Cross-field', field: 'total_assets', expression: 'total_assets == current_assets + fixed_assets', errorMessage: 'Assets must balance', status: 'active' },
  { id: '2', name: 'Positive Revenue', type: 'Range', field: 'revenue', expression: 'revenue >= 0', errorMessage: 'Revenue cannot be negative', status: 'active' },
  { id: '3', name: 'Email Format', type: 'Pattern', field: 'contact_email', expression: '/^[\\w-]+@[\\w-]+\\.[a-z]{2,}$/', errorMessage: 'Invalid email format', status: 'active' },
  { id: '4', name: 'Date Range Check', type: 'Comparison', field: 'period_end', expression: 'period_end > period_start', errorMessage: 'End date must be after start', status: 'active' },
  { id: '5', name: 'Max Attachment Size', type: 'Limit', field: 'attachments', expression: 'file_size <= 10MB', errorMessage: 'File exceeds 10MB limit', status: 'draft' },
];

const columns: Column<Validation>[] = [
  { key: 'name', label: 'Validation Name', render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
  { key: 'type', label: 'Type', render: (r) => <Badge variant="outline">{r.type}</Badge> },
  { key: 'field', label: 'Field', render: (r) => <code className="text-xs bg-muted px-2 py-1 rounded">{r.field}</code> },
  { key: 'errorMessage', label: 'Error Message' },
  { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'active' ? 'approved' : 'draft' as any} className="capitalize">{r.status}</Badge> },
  { key: 'actions', label: '', render: () => (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
    </div>
  )},
];

export default function ManageValidations() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Manage Validations" description="Define validation rules for return data integrity." backHref="/dashboard" backLabel="Dashboard" actions={<Button><Plus className="h-4 w-4 mr-2" />Add Validation</Button>} />
        <div className="animate-slide-up delay-100">
          <DataTableShell columns={columns} data={data} searchPlaceholder="Search validations..." />
        </div>
      </div>
    </DashboardLayout>
  );
}
