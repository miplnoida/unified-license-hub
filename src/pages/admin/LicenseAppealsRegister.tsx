import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Gavel, Clock, CheckCircle, Users } from 'lucide-react';
import { LicenseAppeal, useLicenseAppeals } from '@/hooks/useLicenseAppeals';
import {
  appealDecisionMeta, appealStatusMeta, formatAppealDate, isAppealOpen,
} from '@/lib/licenseAppeals';
import { AppealActionsDialog } from '@/components/appeals/AppealActionsDialog';

const STATUS_FILTERS = [
  { value: 'all', label: 'All appeals' },
  { value: 'submitted', label: 'Pending decision' },
  { value: 'decided', label: 'Decided' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

export default function LicenseAppealsRegister() {
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<LicenseAppeal | null>(null);
  const { data: appeals, isLoading } = useLicenseAppeals({ status });

  const rows = appeals || [];
  const openCount = rows.filter((a) => isAppealOpen(a.status)).length;
  const decidedCount = rows.filter((a) => a.status === 'decided').length;


  const columns: Column<LicenseAppeal>[] = [
    {
      key: 'appeal_reference', label: 'Appeal ref.',
      render: (r) => <span className="font-mono text-sm font-medium text-primary">{r.appeal_reference}</span>,
    },
    { key: 'filed_at', label: 'Lodged', render: (r) => formatAppealDate(r.filed_at) },
    { key: 'appeal_deadline', label: 'Deadline', render: (r) => formatAppealDate(r.appeal_deadline) },
    {
      key: 'grounds', label: 'Grounds',
      render: (r) => <span className="line-clamp-2 max-w-[24rem] text-sm">{r.grounds}</span>,
    },
    {
      key: 'status', label: 'Status',
      render: (r) => {
        const m = appealStatusMeta(r.status);
        return <Badge variant="outline" className={m.className}>{m.label}</Badge>;
      },
    },
    {
      key: 'decision', label: 'Outcome',
      render: (r) => {
        const m = appealDecisionMeta(r.decision);
        return m ? <Badge variant="outline" className={m.className}>{m.label}</Badge> : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      key: 'actions', label: '',
      render: (r) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelected(r)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Licensing Appeals"
          description="Register of appeals lodged against licensing refusals, with panel referral and outcome tracking."
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatCard title="Total appeals" value={rows.length} icon={<Gavel className="h-6 w-6" />} />
          <StatCard title="Open" value={openCount} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="With panel" value={panelCount} icon={<Users className="h-6 w-6" />} />
          <StatCard title="Decided" value={decidedCount} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
        </div>

        <DataTableShell
          columns={columns}
          data={rows}
          searchPlaceholder="Search appeals..."
          actions={
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </div>

      <AppealActionsDialog appeal={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </DashboardLayout>
  );
}
