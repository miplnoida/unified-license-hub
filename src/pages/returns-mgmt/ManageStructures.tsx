import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2 } from 'lucide-react';

interface Structure {
  id: string;
  name: string;
  sector: string;
  fields: number;
  sections: number;
  status: string;
  lastModified: string;
}

const data: Structure[] = [
  { id: '1', name: 'Insurance Monthly Return', sector: 'Insurance', fields: 24, sections: 5, status: 'active', lastModified: '2024-01-15' },
  { id: '2', name: 'Banking Quarterly Report', sector: 'Banking', fields: 36, sections: 8, status: 'active', lastModified: '2024-01-10' },
  { id: '3', name: 'Capital Markets Annual', sector: 'Capital Markets', fields: 48, sections: 12, status: 'draft', lastModified: '2024-01-08' },
  { id: '4', name: 'Pension Fund Monthly', sector: 'Pension', fields: 18, sections: 4, status: 'active', lastModified: '2024-01-05' },
  { id: '5', name: 'Cooperative Quarterly', sector: 'Cooperatives', fields: 20, sections: 5, status: 'inactive', lastModified: '2023-12-20' },
];

const columns: Column<Structure>[] = [
  { key: 'name', label: 'Structure Name', render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
  { key: 'sector', label: 'Sector' },
  { key: 'fields', label: 'Fields' },
  { key: 'sections', label: 'Sections' },
  { key: 'lastModified', label: 'Last Modified' },
  { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'active' ? 'approved' : r.status === 'draft' ? 'draft' : 'rejected' as any} className="capitalize">{r.status}</Badge> },
  { key: 'actions', label: '', render: () => (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
    </div>
  )},
];

export default function ManageStructures() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Manage Structures" description="Define and manage return template structures." backHref="/dashboard" backLabel="Dashboard" actions={<Button><Plus className="h-4 w-4 mr-2" />New Structure</Button>} />
        <div className="animate-slide-up delay-100">
          <DataTableShell columns={columns} data={data} searchPlaceholder="Search structures..." />
        </div>
      </div>
    </DashboardLayout>
  );
}
