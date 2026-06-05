import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/dashboard/StatCard';
import { supabase } from '@/integrations/supabase/client';
import { RETURN_STATUS_LABELS, ReturnStatus } from '@/types/platform';
import { Search, Loader2, ClipboardList, CheckCircle, Clock, AlertTriangle, ChevronLeft, ChevronRight, Download } from 'lucide-react';

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

interface Profile {
  id: string;
  full_name: string;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  submitted: 'default', accepted: 'default', rejected: 'destructive', overdue: 'destructive', resubmission_requested: 'outline',
};

const PAGE_SIZE = 10;

export default function ViewReturns() {
  const [returns, setReturns] = useState<ComplianceReturn[]>([]);
  const [configs, setConfigs] = useState<ReturnConfig[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [retRes, confRes, profRes] = await Promise.all([
        supabase.from('compliance_returns' as any).select('*')
          .not('status', 'in', '("pending","draft")')
          .order('submitted_at', { ascending: false }),
        supabase.from('return_configurations' as any).select('*'),
        supabase.from('profiles').select('id, full_name'),
      ]);
      if (!retRes.error) setReturns((retRes.data || []) as any);
      if (!confRes.error) setConfigs((confRes.data || []) as any);
      if (!profRes.error) setProfiles((profRes.data || []) as any);
      setLoading(false);
    }
    load();
  }, []);

  const getConfigName = (id: string | null) => configs.find(c => c.id === id)?.name || '—';
  const getSubmitterName = (id: string) => profiles.find(p => p.id === id)?.full_name || '—';

  const processedReturns = useMemo(() => {
    const now = new Date();
    return returns.map(r => {
      if (r.status === 'submitted' && new Date(r.due_date) < now && !r.reviewed_at) {
        return { ...r, status: 'overdue' as ReturnStatus };
      }
      return r;
    });
  }, [returns]);

  // Allowed statuses for filter (no draft/pending)
  const submittedStatuses: [string, string][] = [
    ['submitted', 'Submitted'],
    ['accepted', 'Accepted'],
    ['rejected', 'Rejected'],
    ['overdue', 'Overdue'],
    ['resubmission_requested', 'To Be Resubmitted'],
  ];

  const filtered = useMemo(() => {
    return processedReturns.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = getConfigName(r.return_config_id).toLowerCase();
        const submitter = getSubmitterName(r.submitter_id).toLowerCase();
        if (!name.includes(q) && !submitter.includes(q)) return false;
      }
      return true;
    });
  }, [processedReturns, statusFilter, search, configs, profiles]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const accepted = processedReturns.filter(r => r.status === 'accepted').length;
  const submitted = processedReturns.filter(r => r.status === 'submitted').length;
  const overdue = processedReturns.filter(r => r.status === 'overdue').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Returns Management" description="View submitted compliance returns. Drafts and pending returns are excluded." />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Submitted" value={processedReturns.length} icon={<ClipboardList className="h-6 w-6" />} />
          <StatCard title="Accepted" value={accepted} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="Awaiting Review" value={submitted} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Overdue" value={overdue} icon={<AlertTriangle className="h-6 w-6" />} variant="danger" />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by return type or licensee..."
                  className="pl-10"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                />
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {submittedStatuses.map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="ml-auto">
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Licensee Name</TableHead>
                    <TableHead>Return Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Submission Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        No submitted returns found.
                      </TableCell>
                    </TableRow>
                  ) : paged.map(ret => (
                    <TableRow key={ret.id}>
                      <TableCell className="font-medium">{getSubmitterName(ret.submitter_id)}</TableCell>
                      <TableCell>{getConfigName(ret.return_config_id)}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(ret.period_start).toLocaleDateString()} – {new Date(ret.period_end).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ret.submitted_at ? new Date(ret.submitted_at).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[ret.status] || 'outline'} className="capitalize">
                          {RETURN_STATUS_LABELS[ret.status] || ret.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">{page + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
