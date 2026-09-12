/**
 * EPR-05 — P03 Licensing Work Queue.
 *
 * Server-owned queue: rows, KPI counts, stage, priority, SLA, waiting-on,
 * blockers and next action all come from `application_work_queue` /
 * `application_work_queue_counts`. Filters are deep-linkable query params and
 * paging is server-side (no capped client fetch, no client SLA maths).
 */
import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, Info, Loader2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveSector } from '@/contexts/ActiveSectorContext';
import { INTERNAL_ROLES } from '@/types/platform';
import { applicationTriageUpdate } from '@/lib/applicationGovernedOps';
import { formatDateTime } from '@/lib/datetime';
import { formatTaxonomyLabel } from '@/lib/formatTaxonomyLabel';
import { useQuery } from '@tanstack/react-query';
import {
  useApplicationQueueCounts,
  useApplicationWorkQueue,
  type ApplicationQueueRow,
} from '@/hooks/useApplicationCaseModels';

const PRIORITY_CLASS: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  medium: 'bg-muted text-muted-foreground',
  low: 'bg-muted text-muted-foreground',
};

const SLA_CLASS: Record<string, string> = {
  breached: 'bg-destructive/10 text-destructive border-destructive/30',
  due_soon: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  on_track: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  paused: 'bg-muted text-muted-foreground',
  unknown: 'bg-muted text-muted-foreground',
};

const SLA_LABEL: Record<string, string> = {
  breached: 'Breached',
  due_soon: 'Due soon',
  on_track: 'On track',
  paused: 'Paused',
  unknown: '—',
};

const WAITING_LABEL: Record<string, string> = {
  regulator: 'Regulator',
  entity: 'Applicant',
  third_party: 'Third party',
  system: 'System',
};

const STAGE_TABS: Array<{ key: string; label: string; stages: string[] | null; countKey?: string }> = [
  { key: 'all', label: 'All open', stages: null, countKey: 'total_open' },
  { key: 'intake', label: 'Intake', stages: ['SUBMITTED_INTAKE'], countKey: 'awaiting_triage' },
  { key: 'sufficiency', label: 'Sufficiency', stages: ['SUFFICIENCY_REVIEW'], countKey: 'sufficiency_review' },
  { key: 'review', label: 'Review', stages: ['REGULATORY_REVIEW'], countKey: 'under_review' },
  { key: 'applicant', label: 'With applicant', stages: ['AWAITING_APPLICANT'], countKey: 'awaiting_applicant' },
  { key: 'decision', label: 'Decision', stages: ['DECISION'], countKey: 'decision_ready' },
  { key: 'authorisation', label: 'Authorisation', stages: ['AUTHORISATION'], countKey: 'authorisation' },
  { key: 'closed', label: 'Closed', stages: ['CLOSED'], countKey: 'closed' },
];

const PAGE_SIZE = 25;

export default function ApplicationQueue() {
  const { user } = useAuth();
  const { activeSectorId, availableSectors } = useActiveSector();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  const tab = params.get('tab') ?? 'all';
  const slaFilter = params.get('sla') ?? 'all';
  const priorityFilter = params.get('priority') ?? 'all';
  const ownerFilter = params.get('owner') ?? 'all';
  const sectorFilter = params.get('sector') ?? 'all';
  const sort = params.get('sort') ?? 'priority';
  const page = Math.max(1, Number(params.get('page') ?? '1'));
  const search = params.get('q') ?? '';

  const [searchDraft, setSearchDraft] = useState(search);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPriority, setBulkPriority] = useState('none');
  const [bulkAssignee, setBulkAssignee] = useState('none');
  const [bulkReason, setBulkReason] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = !!user && INTERNAL_ROLES.includes(user.role as never);

  const setParam = useCallback((patch: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(patch).forEach(([k, v]) => {
        if (v === null || v === '' || v === 'all') next.delete(k);
        else next.set(k, v);
      });
      if (!('page' in patch)) next.delete('page');
      return next;
    }, { replace: true });
  }, [setParams]);

  const activeTab = STAGE_TABS.find((t) => t.key === tab) ?? STAGE_TABS[0];
  const sectorId = sectorFilter === 'active' ? activeSectorId : sectorFilter === 'all' ? null : sectorFilter;

  const queueQuery = useApplicationWorkQueue({
    stages: activeTab.stages,
    slaStates: slaFilter === 'all' ? null : [slaFilter],
    priorities: priorityFilter === 'all' ? null : [priorityFilter],
    assignedTo: ownerFilter === 'me' ? (user?.id ?? null) : null,
    unassigned: ownerFilter === 'unassigned',
    sectorId,
    search,
    includeClosed: activeTab.key === 'closed',
    sort,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const countsQuery = useApplicationQueueCounts(null, sectorId);
  const counts = countsQuery.data;

  const { data: internalUsers = [] } = useQuery({
    queryKey: ['licensing-queue-internal-users'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', INTERNAL_ROLES as unknown as string[])
        .limit(500);
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
    staleTime: 300_000,
  });

  const rows = queueQuery.data?.rows ?? [];
  const total = queueQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleRow = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected((prev) => (
    prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.application_id))
  ));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['application-work-queue'] });
    queryClient.invalidateQueries({ queryKey: ['application-work-queue-counts'] });
  };

  const applyBulk = async () => {
    if (selected.size === 0) return;
    if (bulkPriority === 'none' && bulkAssignee === 'none') {
      toast.error('Choose a priority or an assignee');
      return;
    }
    setSaving(true);
    try {
      const ids = Array.from(selected);
      await applicationTriageUpdate({
        applicationIds: ids,
        priority: bulkPriority !== 'none' ? Number(bulkPriority) : null,
        priorityReason: bulkReason || null,
        assignedTo: bulkAssignee !== 'none' ? bulkAssignee : null,
      });
      toast.success(`Updated ${ids.length} application${ids.length === 1 ? '' : 's'}`);
      setBulkOpen(false);
      setBulkPriority('none');
      setBulkAssignee('none');
      setBulkReason('');
      setSelected(new Set());
      refresh();
    } catch (e) {
      toast.error((e as Error).message || 'Bulk update failed');
    } finally {
      setSaving(false);
    }
  };

  const kpis = useMemo(() => ([
    { label: 'Open cases', value: counts?.total_open ?? 0 },
    { label: 'SLA breached', value: counts?.breached ?? 0, tone: 'destructive' as const },
    { label: 'Due soon', value: counts?.due_soon ?? 0, tone: 'warning' as const },
    { label: 'Unassigned', value: counts?.unassigned ?? 0 },
    { label: 'Decision ready', value: counts?.decision_ready ?? 0 },
  ]), [counts]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Licensing Work Queue"
          helpSurface="licensing"
          description="Server-derived stage, priority, service level and next required action for every licensing case."
          actions={
            canManage ? (
              <Button data-rbac="application_management.edit" size="sm" disabled={selected.size === 0} onClick={() => setBulkOpen(true)}>
                <Users className="mr-2 h-4 w-4" />
                Triage {selected.size > 0 ? `(${selected.size})` : ''}
              </Button>
            ) : null
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="py-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
                <div className={`mt-1 text-2xl font-semibold ${
                  k.tone === 'destructive' ? 'text-destructive'
                    : k.tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : ''
                }`}>
                  {k.value}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {STAGE_TABS.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={t.key === activeTab.key ? 'default' : 'outline'}
              onClick={() => { setSelected(new Set()); setParam({ tab: t.key === 'all' ? null : t.key, page: null }); }}
            >
              {t.label}
              {t.countKey && counts ? (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[11px]">
                  {(counts as unknown as Record<string, number>)[t.countKey] ?? 0}
                </Badge>
              ) : null}
            </Button>
          ))}
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 py-4">
            <div className="min-w-[220px] flex-1 space-y-1">
              <Label className="text-xs">Search</Label>
              <form
                onSubmit={(e) => { e.preventDefault(); setParam({ q: searchDraft || null }); }}
              >
                <Input
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Reference, applicant, entity, licence type"
                />
              </form>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Service level</Label>
              <Select value={slaFilter} onValueChange={(v) => setParam({ sla: v })}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="breached">Breached</SelectItem>
                  <SelectItem value="due_soon">Due soon</SelectItem>
                  <SelectItem value="on_track">On track</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select value={priorityFilter} onValueChange={(v) => setParam({ priority: v })}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ownership</Label>
              <Select value={ownerFilter} onValueChange={(v) => setParam({ owner: v })}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  <SelectItem value="me">Assigned to me</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sector</Label>
              <Select value={sectorFilter} onValueChange={(v) => setParam({ sector: v })}>
                <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sectors</SelectItem>
                  {activeSectorId && <SelectItem value="active">Active sector</SelectItem>}
                  {(availableSectors ?? []).map((s: { id: string; name: string }) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sort</Label>
              <Select value={sort} onValueChange={(v) => setParam({ sort: v })}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="sla">Service level</SelectItem>
                  <SelectItem value="submitted_desc">Newest submitted</SelectItem>
                  <SelectItem value="submitted_asc">Oldest submitted</SelectItem>
                  <SelectItem value="applicant">Applicant</SelectItem>
                  <SelectItem value="app_number">Reference</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canManage && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={rows.length > 0 && selected.size === rows.length}
                          onCheckedChange={toggleAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                    )}
                    <TableHead>Reference</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Owner / team</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Service level</TableHead>
                    <TableHead>Waiting on</TableHead>
                    <TableHead>Blockers</TableHead>
                    <TableHead>Next action</TableHead>
                    <TableHead>Last activity</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={13} className="py-10 text-center text-muted-foreground">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                      </TableCell>
                    </TableRow>
                  ) : queueQuery.isError ? (
                    <TableRow>
                      <TableCell colSpan={13} className="py-10 text-center text-destructive">
                        {(queueQuery.error as Error).message || 'Failed to load the queue'}
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="py-10 text-center text-muted-foreground">
                        No licensing cases match these filters.
                      </TableCell>
                    </TableRow>
                  ) : rows.map((r: ApplicationQueueRow) => (
                    <TableRow key={r.application_id}>
                      {canManage && (
                        <TableCell>
                          <Checkbox
                            checked={selected.has(r.application_id)}
                            onCheckedChange={() => toggleRow(r.application_id)}
                            aria-label={`Select ${r.application_number}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-mono text-xs">
                        <Link to={r.canonical_href} className="hover:underline">{r.application_number}</Link>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="truncate font-medium">
                          {r.entity_name || r.applicant_name || '—'}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {formatTaxonomyLabel(r.license_type ?? '') || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.stage_label}</TableCell>
                      <TableCell className="text-sm">{r.status_label}</TableCell>
                      <TableCell className="text-sm">
                        <div>{r.owner_name || <span className="text-muted-foreground">Unassigned</span>}</div>
                        {r.team ? <div className="text-xs text-muted-foreground">{r.team}</div> : null}
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className={PRIORITY_CLASS[r.priority] ?? PRIORITY_CLASS.medium}>
                                {r.priority}
                                <Info className="ml-1 h-3 w-3 opacity-60" />
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {r.priority_reason || 'Server-derived priority'}
                              {r.priority_source ? ` · ${r.priority_source}` : ''}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={SLA_CLASS[r.sla_state ?? 'unknown'] ?? SLA_CLASS.unknown}>
                          {SLA_LABEL[r.sla_state ?? 'unknown'] ?? r.sla_state}
                        </Badge>
                        {r.sla_due_at ? (
                          <div className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(r.sla_due_at)}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.waiting_on ? (WAITING_LABEL[r.waiting_on] ?? r.waiting_on) : '—'}
                      </TableCell>
                      <TableCell>
                        {r.blocker_count > 0 ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                  <AlertTriangle className="mr-1 h-3 w-3" />{r.blocker_count}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <ul className="space-y-0.5">
                                  {(r.blockers ?? []).map((b) => <li key={b.code}>{b.label}</li>)}
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="max-w-[200px] text-sm">
                        {r.next_action_href ? (
                          <Link to={r.next_action_href} className="underline hover:no-underline">
                            {r.next_action_label}
                          </Link>
                        ) : (r.next_action_label ?? '—')}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.last_activity_at ? formatDateTime(r.last_activity_at) : '—'}
                      </TableCell>
                      <TableCell>
                        <Button asChild size="icon" variant="ghost">
                          <Link to={r.canonical_href} aria-label={`Open ${r.application_number}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
              <div className="text-muted-foreground">
                {total > 0
                  ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
                  : 'No results'}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm" variant="outline" disabled={page <= 1}
                  onClick={() => setParams((prev) => {
                    const n = new URLSearchParams(prev); n.set('page', String(page - 1)); return n;
                  }, { replace: true })}
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <span className="text-muted-foreground">Page {page} of {totalPages}</span>
                <Button
                  size="sm" variant="outline" disabled={page >= totalPages}
                  onClick={() => setParams((prev) => {
                    const n = new URLSearchParams(prev); n.set('page', String(page + 1)); return n;
                  }, { replace: true })}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Triage {selected.size} application{selected.size === 1 ? '' : 's'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={bulkPriority} onValueChange={setBulkPriority}>
                <SelectTrigger><SelectValue placeholder="Leave unchanged" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Leave unchanged</SelectItem>
                  <SelectItem value="1">Critical</SelectItem>
                  <SelectItem value="2">High</SelectItem>
                  <SelectItem value="3">Normal</SelectItem>
                  <SelectItem value="4">Low</SelectItem>
                  <SelectItem value="5">Deferred</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assign to</Label>
              <Select value={bulkAssignee} onValueChange={setBulkAssignee}>
                <SelectTrigger><SelectValue placeholder="Leave unchanged" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Leave unchanged</SelectItem>
                  {internalUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={applyBulk} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
