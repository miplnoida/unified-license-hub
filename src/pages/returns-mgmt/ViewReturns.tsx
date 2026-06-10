import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
import { Search, Loader2, ClipboardList, CheckCircle, Clock, AlertTriangle, ChevronLeft, ChevronRight, Download, Eye } from 'lucide-react';
import {
  ADMIN_RETURN_DRILLDOWNS,
  ADMIN_RETURN_STATUS_FILTERS,
  getAdminReturnDisplayStatus,
  matchesAdminReturnFilter,
  todayDateIso,
  type AdminReturnDisplayStatus,
  type AdminReturnStatusFilter,
} from '@/lib/adminReturnFilters';

/** Map returns_filed.workflow_status (TEMP/WIP/SUB/VAL/TBR) → admin status model. */
function mapWorkflowStatus(ws: string | null | undefined): string {
  switch (ws) {
    case 'SUB': return 'submitted';
    case 'VAL': return 'accepted';
    case 'TBR': return 'resubmission_requested';
    case 'REJ': return 'rejected';
    default: return ws || ''; // TEMP/WIP fall through and get filtered out
  }
}

interface AdminReturnRow {
  id: string;
  unique_id: string | null;
  return_configuration_id: string | null;
  entity_id: string | null;
  on_behalf_of_licensee_id: string | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  status: string;            // mapped
  workflow_status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  submitted: 'default', accepted: 'default', rejected: 'destructive', overdue: 'destructive', resubmission_requested: 'outline',
};

const PAGE_SIZE = 10;

const statusFilterMeta: Record<AdminReturnDisplayStatus, { label: string; chip: string }> = {
  submitted: { label: 'Submitted', chip: 'Pending Review' },
  accepted: { label: 'Accepted', chip: 'Accepted Returns' },
  rejected: { label: 'Rejected', chip: 'Rejected Returns' },
  resubmission_requested: { label: 'To Be Resubmitted', chip: 'Returns To Be Resubmitted' },
  overdue: { label: 'Overdue', chip: 'Overdue Returns' },
};

export default function ViewReturns() {
  const navigate = useNavigate();
  const adminBasePath = window.location.pathname.startsWith('/admin/returns/') ? '/admin/returns/queue' : '/returns-management';
  const [returns, setReturns] = useState<AdminReturnRow[]>([]);
  const [configs, setConfigs] = useState<Array<{ id: string; name: string }>>([]);
  const [licensees, setLicensees] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStatus = (ADMIN_RETURN_STATUS_FILTERS as readonly string[]).includes(searchParams.get('status') || '')
    ? (searchParams.get('status') as AdminReturnStatusFilter)
    : 'all';
  const [statusFilter, setStatusFilter] = useState<AdminReturnStatusFilter>(urlStatus);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (urlStatus !== statusFilter) { setStatusFilter(urlStatus); setPage(0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStatus]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (statusFilter === 'all') next.delete('status');
    else next.set('status', statusFilter);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [statusFilter, searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [retRes, confRes, licRes] = await Promise.all([
        (supabase as any)
          .from('returns_filed')
          .select('id, unique_id, return_configuration_id, entity_id, on_behalf_of_licensee_id, period_start_date, period_end_date, due_date, workflow_status, submit_date, created_at')
          .in('workflow_status', ['SUB', 'VAL', 'TBR'])
          .order('submit_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
        (supabase as any).from('return_configs').select('id, name'),
        (supabase as any).from('licensees').select('id, name'),
      ]);
      if (cancelled) return;
      if (!retRes.error) {
        const mapped: AdminReturnRow[] = (retRes.data || []).map((r: any) => ({
          id: r.id,
          unique_id: r.unique_id,
          return_configuration_id: r.return_configuration_id,
          entity_id: r.entity_id,
          on_behalf_of_licensee_id: r.on_behalf_of_licensee_id,
          period_start: r.period_start_date,
          period_end: r.period_end_date,
          due_date: r.due_date,
          workflow_status: r.workflow_status,
          status: mapWorkflowStatus(r.workflow_status),
          submitted_at: r.submit_date,
          reviewed_at: r.workflow_status === 'VAL' ? r.submit_date : null,
          created_at: r.created_at,
        }));
        setReturns(mapped);
      }
      if (!confRes.error) setConfigs(confRes.data || []);
      if (!licRes.error) setLicensees(licRes.data || []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [statusFilter]);

  const getConfigName = (id: string | null) => configs.find(c => c.id === id)?.name || '—';
  const getLicenseeName = (r: AdminReturnRow) => {
    const id = r.on_behalf_of_licensee_id || r.entity_id;
    return licensees.find(l => l.id === id)?.name || '—';
  };

  const processedReturns = useMemo(() => returns, [returns]);

  const submittedStatuses: [AdminReturnStatusFilter, string][] = [
    ['submitted', statusFilterMeta.submitted.label],
    ['accepted', statusFilterMeta.accepted.label],
    ['rejected', statusFilterMeta.rejected.label],
    ['overdue', statusFilterMeta.overdue.label],
    ['resubmission_requested', statusFilterMeta.resubmission_requested.label],
  ];

  const activeFilterMeta = statusFilter !== 'all' ? statusFilterMeta[statusFilter as AdminReturnDisplayStatus] : null;

  const filtered = useMemo(() => {
    const today = todayDateIso();
    return processedReturns.filter(r => {
      if (!matchesAdminReturnFilter(r, statusFilter, today)) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = getConfigName(r.return_configuration_id).toLowerCase();
        const lic = getLicenseeName(r).toLowerCase();
        const uid = (r.unique_id || '').toLowerCase();
        if (!name.includes(q) && !lic.includes(q) && !uid.includes(q)) return false;
      }
      return true;
    });
  }, [processedReturns, statusFilter, search, configs, licensees]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const today = todayDateIso();
  const accepted = processedReturns.filter(r => getAdminReturnDisplayStatus(r, today) === 'accepted').length;
  const submitted = processedReturns.filter(r => getAdminReturnDisplayStatus(r, today) === 'submitted').length;
  const overdue = processedReturns.filter(r => getAdminReturnDisplayStatus(r, today) === 'overdue').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={activeFilterMeta?.chip || ADMIN_RETURN_DRILLDOWNS.all.label}
          description="View admin-visible submitted and finalized compliance returns. Draft and in-progress returns are excluded."
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Submitted" value={processedReturns.length} icon={<ClipboardList className="h-6 w-6" />} />
          <StatCard title="Accepted" value={accepted} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="Awaiting Review" value={submitted} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Overdue" value={overdue} icon={<AlertTriangle className="h-6 w-6" />} variant="danger" />
        </div>

        {activeFilterMeta && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Filter: {activeFilterMeta.chip}</Badge>
            <Button variant="ghost" size="sm" onClick={() => { setStatusFilter('all'); setPage(0); }}>
              Clear filter
            </Button>
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by reference, return type or licensee..."
                  className="pl-10"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                />
              </div>
              <Select value={statusFilter} onValueChange={v => { if ((ADMIN_RETURN_STATUS_FILTERS as readonly string[]).includes(v)) { setStatusFilter(v as AdminReturnStatusFilter); setPage(0); } }}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {submittedStatuses.map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={loading || filtered.length === 0}
                onClick={() => {
                  const headers = ['Reference', 'Licensee Name', 'Return Type', 'Period Start', 'Period End', 'Submission Date', 'Status'];
                  const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
                  const rows = filtered.map(r => [
                    r.unique_id || '',
                    getLicenseeName(r),
                    getConfigName(r.return_configuration_id),
                    r.period_start ? new Date(r.period_start).toLocaleDateString() : '',
                    r.period_end ? new Date(r.period_end).toLocaleDateString() : '',
                    r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '',
                    RETURN_STATUS_LABELS[r.status as ReturnStatus] || r.status,
                  ].map(escape).join(','));
                  const csv = [headers.map(escape).join(','), ...rows].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `returns-${statusFilter}-${todayDateIso()}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
            </div>
          </CardContent>
        </Card>

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
                    <TableHead>Reference</TableHead>
                    <TableHead>Licensee Name</TableHead>
                    <TableHead>Return Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Submission Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        {activeFilterMeta ? `No ${activeFilterMeta.chip.toLowerCase()} found.` : 'No submitted returns found.'}
                      </TableCell>
                    </TableRow>
                  ) : paged.map(ret => (
                    <TableRow key={ret.id}>
                      <TableCell className="font-medium">{ret.unique_id || '—'}</TableCell>
                      <TableCell>{getLicenseeName(ret)}</TableCell>
                      <TableCell>{getConfigName(ret.return_configuration_id)}</TableCell>
                      <TableCell className="text-sm">
                        {ret.period_start ? new Date(ret.period_start).toLocaleDateString() : '—'} – {ret.period_end ? new Date(ret.period_end).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ret.submitted_at ? new Date(ret.submitted_at).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[ret.status] || 'outline'} className="capitalize">
                          {RETURN_STATUS_LABELS[ret.status as ReturnStatus] || ret.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => navigate(`${adminBasePath}/${ret.id}`)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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
