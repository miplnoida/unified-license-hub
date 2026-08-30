/**
 * EPR-03 — the single Enforcement work queue (P11).
 *
 * One ranked, server-filtered and server-counted list of every enforcement case,
 * whatever it was referred from. Rows and KPI counts come from the same
 * RLS-scoped read model (`enforcement_work_queue` / `_counts`), filters live in
 * query parameters and every row carries the server-supplied next action and
 * blockers. This screen mutates nothing.
 */
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Gavel, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ScreenHelpLink } from '@/components/help/ScreenHelpLink';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/datetime';
import { ENFORCEMENT_SOURCE_LABEL, type EnforcementSourceKind } from '@/lib/enforcementProcessOps';
import {
  useEnforcementQueueCounts,
  useEnforcementWorkQueue,
  type EnforcementStage,
  type SlaState,
} from '@/hooks/useEnforcementProcess';

const STAGES: Array<{ key: EnforcementStage; label: string }> = [
  { key: 'REFERRAL', label: 'Referral' },
  { key: 'ASSESSMENT', label: 'Assessment' },
  { key: 'NOTICE', label: 'Notice' },
  { key: 'REPRESENTATIONS', label: 'Representations' },
  { key: 'DECISION', label: 'Decision' },
  { key: 'SANCTION', label: 'Sanction' },
  { key: 'REMEDIATION_MONITORING', label: 'Monitoring' },
  { key: 'APPEAL', label: 'Appeal' },
];

const SOURCES = Object.keys(ENFORCEMENT_SOURCE_LABEL) as EnforcementSourceKind[];

const SLA_CLASS: Record<string, string> = {
  breached: 'bg-destructive/10 text-destructive border-destructive/30',
  due_soon: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  on_track: 'bg-muted text-muted-foreground',
  paused: 'bg-muted text-muted-foreground',
};

const PRIORITY_CLASS: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  medium: 'bg-muted text-muted-foreground',
  low: 'bg-muted text-muted-foreground',
};

const PAGE_SIZE = 50;

export default function EnforcementWorkQueue() {
  const [params, setParams] = useSearchParams();

  const stageParam = params.get('stage');
  const sourceParam = params.get('source');
  const slaParam = params.get('sla') as SlaState | null;
  const entityId = params.get('entity');
  const search = params.get('q') ?? '';
  const includeClosed = params.get('closed') === '1';
  const sort = (params.get('sort') as 'sla' | 'priority' | 'stage') || 'sla';
  const page = Math.max(1, Number(params.get('page') ?? '1'));

  const filters = useMemo(() => ({
    stages: stageParam ? (stageParam.split(',') as EnforcementStage[]) : null,
    sourceKinds: sourceParam ? sourceParam.split(',') : null,
    slaStates: slaParam ? [slaParam] : null,
    entityId: entityId || null,
    search: search || null,
    includeClosed,
    sort,
  }), [stageParam, sourceParam, slaParam, entityId, search, includeClosed, sort]);

  const { data: counts } = useEnforcementQueueCounts();
  const { data: rows = [], isLoading, error } = useEnforcementWorkQueue({
    ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  });

  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const toggle = (key: string, value: string) => {
    const current = (params.get(key) ?? '').split(',').filter(Boolean);
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    set(key, next.join(','));
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Gavel className="h-5 w-5 text-primary" /> Enforcement work queue
            </h1>
            <ScreenHelpLink surface="enforcement" />
          </div>
          <p className="text-sm text-muted-foreground">
            Every enforcement case in your scope — referred from complaints, conduct investigations,
            thematic findings, prudential breaches, examinations, licensing and fit-and-proper matters.
            Stage, priority, service level and the next required action are set by the enforcement
            process configuration, not by this screen.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {[
            { label: 'Open cases', value: counts?.total_open, onClick: () => { set('sla', null); set('closed', null); } },
            { label: 'SLA breached', value: counts?.breached, tone: 'text-destructive', onClick: () => set('sla', 'breached') },
            { label: 'Due soon', value: counts?.due_soon, onClick: () => set('sla', 'due_soon') },
            { label: 'Awaiting entity', value: counts?.awaiting_entity, onClick: () => set('stage', 'NOTICE,REPRESENTATIONS') },
            { label: 'Unassigned', value: counts?.unassigned, onClick: () => set('sla', null) },
            { label: 'Penalty outstanding', value: counts?.penalty_outstanding, money: true, onClick: () => set('stage', 'REMEDIATION_MONITORING') },
          ].map((kpi) => (
            <button key={kpi.label} type="button" onClick={kpi.onClick} className="text-left">
              <Card className="h-full transition hover:shadow">
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-semibold ${kpi.tone ?? ''}`}>
                    {kpi.money
                      ? Number(kpi.value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
                      : (kpi.value ?? 0)}
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {STAGES.map((s) => {
                const active = stageParam?.split(',').includes(s.key);
                return (
                  <Button key={s.key} size="sm" variant={active ? 'default' : 'outline'} onClick={() => toggle('stage', s.key)}>
                    {s.label}
                    <span className="ml-1 text-xs opacity-70">{counts?.by_stage?.[s.key] ?? 0}</span>
                  </Button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {SOURCES.map((k) => {
                const active = sourceParam?.split(',').includes(k);
                return (
                  <Button key={k} size="sm" variant={active ? 'secondary' : 'ghost'} onClick={() => toggle('source', k)}>
                    {ENFORCEMENT_SOURCE_LABEL[k]}
                    <span className="ml-1 text-xs opacity-70">{counts?.by_source?.[k] ?? 0}</span>
                  </Button>
                );
              })}
              <div className="relative ml-auto">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="w-64 pl-8"
                  placeholder="Search case, entity or source reference"
                  defaultValue={search}
                  onKeyDown={(e) => { if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value); }}
                />
              </div>
              <Button data-rbac="enforcement_management.edit" size="sm" variant={includeClosed ? 'default' : 'outline'} onClick={() => set('closed', includeClosed ? null : '1')}>
                Include closed
              </Button>
              {(stageParam || sourceParam || slaParam || entityId || search || includeClosed) && (
                <Button size="sm" variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Referred from</TableHead>
                    <TableHead>Stage / status</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>SLA</TableHead>
                    <TableHead>Waiting on</TableHead>
                    <TableHead>Next action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(8)].map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                    ))
                  ) : error ? (
                    <TableRow><TableCell colSpan={9} className="text-destructive">{(error as Error).message}</TableCell></TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-muted-foreground">
                      No enforcement cases match these filters.
                    </TableCell></TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.case_id}>
                      <TableCell className="max-w-[16rem]">
                        <Link to={r.canonical_href} className="font-mono text-xs text-primary hover:underline">
                          {r.case_number}
                        </Link>
                        <div className="truncate text-sm">{r.enforcement_type ?? '—'}</div>
                        {r.blockers?.length ? (
                          <div className="text-xs text-amber-700 dark:text-amber-400">{r.blockers.length} blocker(s)</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-[14rem] truncate">
                        {r.entity_id ? (
                          <Link to={`/entities/${r.entity_id}`} className="hover:underline">{r.entity_name}</Link>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="max-w-[12rem]">
                        <div className="text-sm">
                          {ENFORCEMENT_SOURCE_LABEL[(r.source_kind ?? 'MANUAL_REFERRAL') as EnforcementSourceKind] ?? r.source_kind}
                        </div>
                        {r.source_href ? (
                          <Link to={r.source_href} className="font-mono text-[11px] text-muted-foreground hover:underline">
                            {r.source_reference ?? 'open source record'}
                          </Link>
                        ) : (
                          <span className="font-mono text-[11px] text-muted-foreground">{r.source_reference ?? '—'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{r.stage_label ?? r.stage}</div>
                        <div className="text-xs capitalize text-muted-foreground">{(r.status ?? '').replace(/_/g, ' ')}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.assigned_to_name ?? <span className="text-muted-foreground">Unassigned</span>}
                        {r.assigned_team ? <div className="text-xs text-muted-foreground">{r.assigned_team}</div> : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={PRIORITY_CLASS[r.priority] ?? PRIORITY_CLASS.medium}>{r.priority}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={SLA_CLASS[r.sla_state] ?? SLA_CLASS.paused}>
                          {r.sla_state.replace('_', ' ')}
                        </Badge>
                        <div className="text-xs text-muted-foreground">{r.sla_due_at ? formatDateTime(r.sla_due_at) : '—'}</div>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{r.waiting_on ?? '—'}</TableCell>
                      <TableCell>
                        {r.next_action_label ? (
                          <Link to={`${r.canonical_href}?section=current`}
                                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                            {r.next_action_label} <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        ) : <span className="text-sm text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} case(s) · page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => set('page', String(page + 1))}>Next</Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
