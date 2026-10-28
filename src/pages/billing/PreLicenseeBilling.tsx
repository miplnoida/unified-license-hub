import { formatRecordMoney, formatTotalsByCurrency } from '@/lib/money';
import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, Clock, CheckCircle, FileText, Loader2 } from 'lucide-react';

interface BillingRow {
  id: string;
  applicationNumber: string;
  applicant: string;
  feeType: string;
  amount: string;
  rawAmount: number;
  status: string;
  date: string;
}

export default function PreLicenseeBilling() {
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Fetch fee components with their application and fee type info
      const { data: components } = await supabase
        .from('fee_components' as any)
        .select('id, amount, description, created_at, application_id, fee_type_id')
        .order('created_at', { ascending: false });

      if (!components || components.length === 0) { setLoading(false); return; }

      // Get unique application and fee type IDs
      const appIds = [...new Set((components as any[]).map(c => c.application_id))];
      const ftIds = [...new Set((components as any[]).map(c => c.fee_type_id))];

      const [appsRes, ftRes] = await Promise.all([
        supabase.from('applications' as any).select('id, application_number, status, data').in('id', appIds),
        supabase.from('fee_types' as any).select('id, name').in('id', ftIds),
      ]);

      const appsMap = new Map((appsRes.data as any[] || []).map(a => [a.id, a]));
      const ftMap = new Map((ftRes.data as any[] || []).map(f => [f.id, f.name]));

      const mapped: BillingRow[] = (components as any[]).map(c => {
        const app = appsMap.get(c.application_id);
        const applicantName = app?.data?.applicant_name || app?.data?.entity_name || '—';
        const paymentStatus = app?.status === 'approved' ? 'paid' : app?.status === 'submitted' ? 'pending' : 'pending';
        return {
          id: c.id,
          applicationNumber: app?.application_number || '—',
          applicant: applicantName,
          feeType: ftMap.get(c.fee_type_id) || '—',
          amount: formatRecordMoney(c.amount),
          rawAmount: Number(c.amount),
          status: paymentStatus,
          date: new Date(c.created_at).toLocaleDateString(),
        };
      });
      setRows(mapped);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const totalFor = (status?: string) => formatTotalsByCurrency([
      { amount: 0 },
      ...rows.filter(r => !status || r.status === status).map(r => ({ amount: r.rawAmount })),
    ]);
    return { total: totalFor(), paid: totalFor('paid'), pending: totalFor('pending'), overdue: totalFor('overdue') };
  }, [rows]);

  const columns: Column<BillingRow>[] = [
    { key: 'applicationNumber', label: 'Application #', render: r => <span className="font-medium text-foreground">{r.applicationNumber}</span> },
    { key: 'applicant', label: 'Applicant' },
    { key: 'feeType', label: 'Fee Type' },
    { key: 'amount', label: 'Amount', render: r => <span className="font-semibold">{r.amount}</span> },
    { key: 'date', label: 'Date' },
    {
      key: 'status', label: 'Status', render: r => {
        const v = r.status === 'paid' ? 'approved' : r.status === 'pending' ? 'pending' : 'rejected';
        return <Badge variant={v as any} className="capitalize">{r.status}</Badge>;
      }
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Pre-Licensee Billing" description="Manage billing and fee collection for pre-license applications." />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Billed" value={stats.total} icon={<DollarSign className="h-6 w-6" />} />
          <StatCard title="Collected" value={stats.paid} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="Pending" value={stats.pending} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Overdue" value={stats.overdue} icon={<FileText className="h-6 w-6" />} variant="danger" />
        </div>
        <div className="animate-slide-up delay-200">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <DataTableShell columns={columns} data={rows} searchPlaceholder="Search billing records..." />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
