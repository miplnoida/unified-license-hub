import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/dashboard/StatCard';
import { supabase } from '@/integrations/supabase/client';
import { RETURN_STATUS_LABELS, ReturnStatus } from '@/types/platform';
import { Search, Loader2, ClipboardList, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

interface ComplianceReturn {
  id: string;
  return_config_id: string | null;
  submitter_id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  status: ReturnStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface ReturnConfig {
  id: string;
  name: string;
  frequency: string;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline', draft: 'secondary', submitted: 'default', accepted: 'default', rejected: 'destructive', overdue: 'destructive',
};

export default function ViewReturns() {
  const [returns, setReturns] = useState<ComplianceReturn[]>([]);
  const [configs, setConfigs] = useState<ReturnConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [retRes, confRes] = await Promise.all([
        supabase.from('compliance_returns' as any).select('*').order('due_date', { ascending: false }),
        supabase.from('return_configurations' as any).select('*'),
      ]);
      if (!retRes.error) setReturns((retRes.data || []) as any);
      if (!confRes.error) setConfigs((confRes.data || []) as any);
      setLoading(false);
    }
    load();
  }, []);

  const getConfigName = (id: string | null) => configs.find(c => c.id === id)?.name || '—';
  const getFrequency = (id: string | null) => configs.find(c => c.id === id)?.frequency || '';

  const processedReturns = returns.map(r => {
    const now = new Date();
    if ((r.status === 'pending' || r.status === 'draft') && new Date(r.due_date) < now) {
      return { ...r, status: 'overdue' as ReturnStatus };
    }
    return r;
  });

  const filtered = processedReturns.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search) {
      const name = getConfigName(r.return_config_id).toLowerCase();
      if (!name.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const total = processedReturns.length;
  const accepted = processedReturns.filter(r => r.status === 'accepted').length;
  const pending = processedReturns.filter(r => ['pending', 'draft', 'submitted'].includes(r.status)).length;
  const overdue = processedReturns.filter(r => r.status === 'overdue').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="View Returns" description="Overview of all compliance returns across the system." />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Total Returns" value={total} icon={<ClipboardList className="h-6 w-6" />} />
          <StatCard title="Accepted" value={accepted} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="In Progress" value={pending} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Overdue" value={overdue} icon={<AlertTriangle className="h-6 w-6" />} variant="danger" />
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search returns..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(RETURN_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Return Type</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No returns found</TableCell></TableRow>
                  ) : filtered.map(ret => (
                    <TableRow key={ret.id}>
                      <TableCell className="font-medium">{getConfigName(ret.return_config_id)}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{getFrequency(ret.return_config_id) || '—'}</Badge></TableCell>
                      <TableCell className="text-sm">{new Date(ret.period_start).toLocaleDateString()} – {new Date(ret.period_end).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm">{new Date(ret.due_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ret.submitted_at ? new Date(ret.submitted_at).toLocaleDateString() : '—'}</TableCell>
                      <TableCell><Badge variant={statusVariant[ret.status] || 'outline'} className="capitalize">{RETURN_STATUS_LABELS[ret.status] || ret.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
