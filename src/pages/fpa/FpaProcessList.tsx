import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RowActionsMenu, type RowAction } from '@/components/common/RowActionsMenu';
import { supabase } from '@/integrations/supabase/client';
import {
  Search, Loader2, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  User, ScrollText, ShieldCheck, Gavel, FileText, AlertCircle,
} from 'lucide-react';
import { fpStatusVariant, fpProcessStepLabel, FP_ASSESSMENT_STATUSES, FP_STATUS_LABELS } from '@/lib/fpStatus';

interface RefLookup { id: string; name: string }

interface FpProcessRow {
  id: string;
  individual_id: string;
  assessment_type: string | null;
  status: string | null;
  regulator_id: string | null;
  regulator_name: string | null;
  committee_id: string | null;
  created_at: string;
  submitted_at: string | null;
  determined_at: string | null;
  closed_at: string | null;
  last_activity_at: string;
  individual_name: string | null;
  individual_national_id: string | null;
}

const ASSESSMENT_TYPES = ['initial', 'renewal', 'change_of_role', 'triggered', 'ongoing_monitoring', 'cycle', 'material_change', 'adverse_event'];

const URL_KEYS = ['page', 'pageSize', 'sort', 'dir', 'q', 'status', 'type', 'regulator', 'from', 'to'] as const;
type UrlKey = typeof URL_KEYS[number];

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysAgo(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

export default function FpaProcessList() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const getParam = (k: UrlKey, d = '') => searchParams.get(k) ?? d;
  const page = Math.max(1, parseInt(getParam('page', '1'), 10) || 1);
  const pageSize = [25, 50, 100].includes(parseInt(getParam('pageSize', '25'), 10)) ? parseInt(getParam('pageSize', '25'), 10) : 25;
  const sortCol = getParam('sort', 'last_activity_at');
  const sortDir = (getParam('dir', 'desc') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const search = getParam('q', '');
  // Defaults to the open/in-progress bucket — this is the screen's core
  // requirement: users land on work still in flight, not a full history dump.
  const statusFilter = getParam('status', 'open');
  const typeFilter = getParam('type', 'all');
  const regulatorFilter = getParam('regulator', 'all');
  const dateFrom = getParam('from', '');
  const dateTo = getParam('to', '');

  const updateUrl = useCallback((patch: Partial<Record<UrlKey, string | null>>, opts?: { resetPage?: boolean }) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || v === 'all') next.delete(k);
      else next.set(k, String(v));
    }
    if (opts?.resetPage) next.delete('page');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const [searchDraft, setSearchDraft] = useState(search);
  useEffect(() => { setSearchDraft(search); }, [search]);
  const searchTimer = useRef<number | undefined>(undefined);
  const onSearchChange = (v: string) => {
    setSearchDraft(v);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => updateUrl({ q: v }, { resetPage: true }), 300);
  };

  const filtersPayload = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (statusFilter !== 'all') p.status = statusFilter;
    if (typeFilter !== 'all') p.assessment_type = typeFilter;
    if (regulatorFilter !== 'all') p.regulator_id = regulatorFilter;
    if (dateFrom) p.date_from = new Date(dateFrom).toISOString();
    if (dateTo) p.date_to = new Date(dateTo + 'T23:59:59').toISOString();
    return p;
  }, [statusFilter, typeFilter, regulatorFilter, dateFrom, dateTo]);

  const regulatorsQ = useQuery<RefLookup[]>({
    queryKey: ['regulators_ref_fp'],
    queryFn: async () => {
      const { data, error } = await supabase.from('regulators').select('id, name').order('name');
      if (error) throw error;
      return (data as RefLookup[]) ?? [];
    },
  });
  const regulators = regulatorsQ.data ?? [];
  const regulatorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of regulators) m[r.id] = r.name;
    return m;
  }, [regulators]);

  const listQ = useQuery<{ total: number; rows: FpProcessRow[] }>({
    queryKey: ['fp_process_list', { page, pageSize, sortCol, sortDir, search, filtersPayload }],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('list_fp_assessments', {
        _filters: filtersPayload,
        _sort: `${sortCol}.${sortDir}`,
        _page: page,
        _page_size: pageSize,
        _search: search.trim() ? search.trim() : undefined,
      });
      if (error) throw error;
      const payload = (data ?? {}) as any;
      return { total: Number(payload.total ?? 0), rows: Array.isArray(payload.rows) ? payload.rows : [] };
    },
  });

  const rows = listQ.data?.rows ?? [];
  const totalCount = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const hasExtraFilters = regulatorFilter !== 'all' || !!dateFrom || !!dateTo;

  function rowActionsFor(row: FpProcessRow): RowAction[] {
    const base = `/fpa/individuals/${row.individual_id}`;
    return [
      { label: 'Open Profile', icon: User, onClick: () => nav(base) },
      { label: 'Open Declaration', icon: FileText, onClick: () => nav(`${base}?tab=assessments`) },
      { label: 'Open Screening', icon: ShieldCheck, onClick: () => nav(`${base}?tab=screening`), hidden: !['submitted', 'screening'].includes(row.status ?? '') },
      { label: 'Open Committee Voting', icon: Gavel, onClick: () => nav('/fpa/committee'), hidden: row.status !== 'awaiting_committee' },
      { label: 'Open Determination', icon: ScrollText, onClick: () => nav(`${base}?tab=determinations`), hidden: !['determined', 'closed'].includes(row.status ?? '') },
    ];
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Fit & Proper Processes"
          description="Every F&P case across the register, in one searchable list — defaults to processes still in progress."
        />

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by name, national ID, or case ID…"
                  value={searchDraft}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </div>

              <Select value={statusFilter} onValueChange={(v) => updateUrl({ status: v }, { resetPage: true })}>
                <SelectTrigger className="h-9 w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">In progress (default)</SelectItem>
                  <SelectItem value="all">All statuses</SelectItem>
                  {FP_ASSESSMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{FP_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={(v) => updateUrl({ type: v }, { resetPage: true })}>
                <SelectTrigger className="h-9 w-48">
                  <SelectValue placeholder="Assessment type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {ASSESSMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5">
                    <Filter className="h-3.5 w-3.5" />
                    More filters
                    {hasExtraFilters && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">•</Badge>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 space-y-3" align="start">
                  <div>
                    <Label className="text-xs">Regulator</Label>
                    <Select value={regulatorFilter} onValueChange={(v) => updateUrl({ regulator: v }, { resetPage: true })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="All regulators" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All regulators</SelectItem>
                        {regulators.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Initiated from</Label>
                      <Input type="date" className="h-9" value={dateFrom} onChange={(e) => updateUrl({ from: e.target.value }, { resetPage: true })} />
                    </div>
                    <div>
                      <Label className="text-xs">Initiated to</Label>
                      <Input type="date" className="h-9" value={dateTo} onChange={(e) => updateUrl({ to: e.target.value }, { resetPage: true })} />
                    </div>
                  </div>
                  {hasExtraFilters && (
                    <Button data-rbac="fit_and_proper.view" variant="ghost" size="sm" className="w-full" onClick={() => updateUrl({ regulator: null, from: null, to: null }, { resetPage: true })}>
                      Clear these filters
                    </Button>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {listQ.isError ? (
              <div className="flex items-center gap-2 py-10 justify-center text-destructive text-sm">
                <AlertCircle className="h-4 w-4" /> Failed to load processes: {(listQ.error as any)?.message ?? 'Unknown error'}
              </div>
            ) : listQ.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading processes…</span>
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No processes match the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Individual</TableHead>
                      <TableHead>National ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Current Step</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Regulator</TableHead>
                      <TableHead>Initiated</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => nav(`/fpa/individuals/${row.individual_id}?tab=assessments`)}
                      >
                        <TableCell className="font-medium whitespace-nowrap">{row.individual_name ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{row.individual_national_id ?? '—'}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{(row.assessment_type ?? '—').replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fpProcessStepLabel(row.status)}</TableCell>
                        <TableCell>
                          <Badge variant={fpStatusVariant(row.status)} className="text-xs">{FP_STATUS_LABELS[(row.status ?? 'draft') as keyof typeof FP_STATUS_LABELS] ?? row.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {row.regulator_name ?? (row.regulator_id ? regulatorMap[row.regulator_id] : null) ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums whitespace-nowrap">{fmtDate(row.created_at)}</TableCell>
                        <TableCell className="text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                          {fmtDate(row.last_activity_at)} <span className="text-[10px]">({daysAgo(row.last_activity_at)}d ago)</span>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <RowActionsMenu actions={rowActionsFor(row)} label="Case actions" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
          <div className="text-xs text-muted-foreground">
            {totalCount === 0 ? 'No results' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`}
            {listQ.isFetching && rows.length > 0 && (
              <span className="ml-2 inline-flex items-center"><Loader2 className="h-3 w-3 animate-spin mr-1" />refreshing…</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Rows</Label>
            <Select value={String(pageSize)} onValueChange={(v) => updateUrl({ pageSize: v }, { resetPage: true })}>
              <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => updateUrl({ page: '1' })}><ChevronsLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => updateUrl({ page: String(page - 1) })}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-xs tabular-nums px-2">{page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => updateUrl({ page: String(page + 1) })}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => updateUrl({ page: String(totalPages) })}><ChevronsRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
