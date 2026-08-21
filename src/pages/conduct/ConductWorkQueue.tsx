/**
 * P08 — the single Market Conduct work queue.
 *
 * One ranked, server-filtered and server-counted list of every actionable
 * conduct record: complaints, conduct alerts, investigations and supervisory
 * actions. Stage, priority, service-level state, waiting-on, next action and
 * blockers come from `conduct_work_queue` / `_counts`. This screen mutates
 * nothing — it routes officers to the canonical case workspace.
 */
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Search, ShieldAlert } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/datetime';
import {
  CONDUCT_KIND_LABEL,
  useConductQueueCounts,
  useConductWorkQueue,
  type ConductSlaState,
  type ConductWorkKind,
} from '@/hooks/useConductProcess';

const KINDS = Object.keys(CONDUCT_KIND_LABEL) as ConductWorkKind[];

const SLA_CLASS: Record<string, string> = {
  breached: 'bg-destructive/10 text-destructive border-destructive/30',
  due_soon: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  on_track: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  paused: 'bg-muted text-muted-foreground',
};

const PRIORITY_CLASS: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  medium: 'bg-muted text-muted-foreground',
  low: 'bg-muted text-muted-foreground',
};

const PAGE_SIZE = 50;

export default function ConductWorkQueue() {
  const [params, setParams] = useSearchParams();

  const kindParam = params.get('kind');
  const slaParam = params.get('sla') as ConductSlaState | null;
  const entityId = params.get('entity');
  const search = params.get('q') ?? '';
  const unassigned = params.get('unassigned') === '1';
  const includeClosed = params.get('closed') === '1';
  const sort = (params.get('sort') as 'sla' | 'priority') || 'sla';
  const page = Math.max(1, Number(params.get('page') ?? '1'));

  const filters = useMemo(() => ({
    kinds: kindParam ? (kindParam.split(',') as ConductWorkKind[]) : null,
    slaStates: slaParam ? [slaParam] : null,
    entityId: entityId || null,
    unassigned,
    search: search || null,
    includeClosed,
    sort,
  }), [kindParam, slaParam, entityId, unassigned, search, includeClosed, sort]);

  const { data: counts } = useConductQueueCounts();
  const { data: rows = [], isLoading, error } = useConductWorkQueue({
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
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldAlert className="h-5 w-5 text-primary" /> Market Conduct work queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Every actionable conduct record in your scope — complaints, surveillance alerts,
            investigations and supervisory actions. Stage, priority, service level, waiting-on and the
            next required action are computed by the conduct process authority, not by this screen.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Open items', value: counts?.total_open, onClick: () => { set('sla', null); set('closed', null); } },
            { label: 'SLA breached', value: counts?.breached, tone: 'text-destructive', onClick: () => set('sla', 'breached') },
            { label: 'Due soon', value: counts?.due_soon, onClick: () => set('sla', 'due_soon') },
            { label: 'Unassigned', value: counts?.unassigned, onClick: () => set('unassigned', unassigned ? null : '1') },
          ].map((kpi) => (
            <button key={kpi.label} type="button" onClick={kpi.onClick} className="text-left">
              <Card className="h-full transition hover:shadow">
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-semibold ${kpi.tone ?? ''}`}>{kpi.value ?? 0}</div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 py-3">
            {KINDS.map((k) => {
              const active = kindParam?.split(',').includes(k);
              return (
                <Button key={k} size="sm" variant={active ? 'default' : 'outline'} onClick={() => toggle('kind', k)}>
                  {CONDUCT_KIND_LABEL[k]}
                  <span className="ml-1 text-xs opacity-70">{counts?.by_kind?.[k] ?? 0}</span>
                </Button>
              );
            })}
            <div className="relative ml-auto">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="w-64 pl-8"
                placeholder="Search reference, subject or entity"
                defaultValue={search}
                onKeyDown={(e) => { if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value); }}
              />
            </div>
            <Button size="sm" variant={sort === 'priority' ? 'default' : 'outline'} onClick={() => set('sort', sort === 'priority' ? null : 'priority')}>
              Sort by priority
            </Button>
            <Button size="sm" variant={includeClosed ? 'default' : 'outline'} onClick={() => set('closed', includeClosed ? null : '1')}>
              Include closed
            </Button>
            {(kindParam || slaParam || entityId || search || unassigned || includeClosed) && (
              <Button size="sm" variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Stage / status</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>SLA</TableHead>
                    <TableHead>Waiting on</TableHead>
                    <TableHead>Next action</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={10}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                  ))}
                  {error && !isLoading && (
                    <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-destructive">
                      {(error as Error).message}
                    </TableCell></TableRow>
                  )}
                  {!isLoading && !error && rows.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                      No conduct work matches these filters.
                    </TableCell></TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={`${r.kind}-${r.item_id}`}>
                      <TableCell className="max-w-[260px]">
                        <Link to={r.canonical_href} className="font-mono text-xs text-primary hover:underline">
                          {r.reference ?? r.item_id.slice(0, 8)}
                        </Link>
                        <div className="truncate text-xs text-muted-foreground">{r.subject ?? '—'}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{r.kind_label}</Badge></TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {r.entity_id
                          ? <Link to={`/entities/${r.entity_id}`} className="hover:underline">{r.entity_name ?? '—'}</Link>
                          : (r.entity_name ?? '—')}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{r.stage_label ?? '—'}</div>
                        <div className="text-muted-foreground">{r.status ?? ''}</div>
                      </TableCell>
                      <TableCell className="text-xs">{r.assigned_to_name ?? 'Unassigned'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={PRIORITY_CLASS[r.priority] ?? PRIORITY_CLASS.medium}>
                          {r.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={SLA_CLASS[r.sla_state] ?? SLA_CLASS.paused}>
                          {r.sla_state.replace('_', ' ')}
                        </Badge>
                        <div className="text-[11px] text-muted-foreground">
                          {r.sla_due_at ? formatDateTime(r.sla_due_at) : '—'}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{r.waiting_on ?? '—'}</TableCell>
                      <TableCell className="max-w-[200px] text-xs">
                        <div>{r.next_action_label ?? '—'}</div>
                        {(r.blockers ?? []).length > 0 && (
                          <div className="text-[11px] text-amber-700 dark:text-amber-400">
                            {(r.blockers ?? []).map((b) => b.label).join(' · ')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={r.canonical_href}>Open <ArrowUpRight className="ml-1 h-3 w-3" /></Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{total} items · page {page} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => set('page', String(page + 1))}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
