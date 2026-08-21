/**
 * EPR-02 — the single canonical Prudential work queue.
 *
 * One ranked, server-filtered list of every actionable prudential matter
 * (breaches, early warnings, assessments, supervisory actions, escalations,
 * stress events, plan actions, examinations). KPI counts and rows come from the
 * same RLS-scoped read model, filters live in query parameters, and each row
 * carries the server-supplied next action.
 */
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, ListChecks, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/datetime';
import { useAuth } from '@/contexts/AuthContext';
import {
  usePrudentialWorkQueue,
  usePrudentialWorkQueueCounts,
  type PrudentialWorkItemType,
} from '@/hooks/usePrudentialProcess';

const TYPES: Array<{ key: PrudentialWorkItemType; label: string }> = [
  { key: 'BREACH', label: 'Breaches' },
  { key: 'EWI', label: 'Early warnings' },
  { key: 'ASSESSMENT', label: 'Assessments' },
  { key: 'SUPERVISORY_ACTION', label: 'Supervisory actions' },
  { key: 'ESCALATION', label: 'Escalations' },
  { key: 'STRESS_EVENT', label: 'Stress events' },
  { key: 'PLAN_ACTION', label: 'Plan actions' },
  { key: 'EXAMINATION', label: 'Examinations' },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  TYPES.map((t) => [t.key, t.label.replace(/e?s$/, '')]),
);

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

export default function PrudentialWorkQueue() {
  const [params, setParams] = useSearchParams();

  const scope = params.get('scope') ?? 'all';        // all | mine | unassigned
  const sla = params.get('sla');                      // overdue | due_soon
  const typeParam = params.get('type');
  const stage = params.get('stage');
  const entityId = params.get('entity');
  const search = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? '1'));

  const { user } = useAuth();

  const rpcFilters = useMemo(() => ({
    types: typeParam ? (typeParam.split(',') as PrudentialWorkItemType[]) : null,
    entityId: entityId || null,
    owner: scope === 'mine' ? (user?.id ?? null) : null,
    unassigned: scope === 'unassigned',
    sla: (sla as 'overdue' | 'due_soon' | null) || null,
    stage: stage || null,
    search: search || null,
  }), [typeParam, entityId, scope, user?.id, sla, stage, search]);

  const { data: counts } = usePrudentialWorkQueueCounts(rpcFilters);
  const { data: rows = [], isLoading, error } = usePrudentialWorkQueue({
    ...rpcFilters,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const total = counts?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const toggleType = (key: PrudentialWorkItemType) => {
    const current = typeParam ? typeParam.split(',') : [];
    const next = current.includes(key) ? current.filter((t) => t !== key) : [...current, key];
    set('type', next.join(','));
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ListChecks className="h-5 w-5 text-primary" /> Prudential work queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Every actionable prudential matter in your supervisory scope, ranked by regulatory
            consequence. Priority, SLA state, stage and next action are set by the supervisory rules,
            not by this screen.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { label: 'Total in scope', value: counts?.total, key: 'all' },
            { label: 'Assigned to me', value: counts?.mine, key: 'mine' },
            { label: 'Unassigned', value: counts?.unassigned, key: 'unassigned' },
            { label: 'Overdue', value: counts?.overdue, key: 'overdue' },
            { label: 'Due soon', value: counts?.due_soon, key: 'due_soon' },
          ].map((kpi) => (
            <button
              key={kpi.key}
              type="button"
              onClick={() => {
                if (kpi.key === 'overdue' || kpi.key === 'due_soon') { set('sla', kpi.key === 'overdue' ? 'overdue' : 'due_soon'); }
                else { set('sla', null); set('scope', kpi.key === 'all' ? null : kpi.key); }
              }}
              className="text-left"
            >
              <Card className="h-full transition hover:shadow">
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.label}</CardTitle>
                </CardHeader>
                <CardContent><div className="text-2xl font-semibold">{kpi.value ?? 0}</div></CardContent>
              </Card>
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 py-3">
            {TYPES.map((t) => {
              const active = typeParam?.split(',').includes(t.key);
              return (
                <Button key={t.key} size="sm" variant={active ? 'default' : 'outline'} onClick={() => toggleType(t.key)}>
                  {t.label}
                  <span className="ml-1 text-xs opacity-70">{counts?.by_type?.[t.key] ?? 0}</span>
                </Button>
              );
            })}
            <div className="relative ml-auto">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="w-64 pl-8"
                placeholder="Search entity, reference or title"
                defaultValue={search}
                onKeyDown={(e) => { if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value); }}
              />
            </div>
            {(typeParam || sla || stage || entityId || search || scope !== 'all') && (
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
                    <TableHead>Work item</TableHead>
                    <TableHead>Entity</TableHead>
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
                      <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                    ))
                  ) : error ? (
                    <TableRow><TableCell colSpan={8} className="text-destructive">{(error as Error).message}</TableCell></TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-muted-foreground">
                      No outstanding prudential work matches these filters.
                    </TableCell></TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={`${r.work_item_type}-${r.work_item_id}`}>
                      <TableCell className="max-w-[22rem]">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[r.work_item_type] ?? r.work_item_type}</Badge>
                          <span className="font-mono text-[11px] text-muted-foreground">{r.reference ?? '—'}</span>
                        </div>
                        <div className="truncate text-sm font-medium">{r.title}</div>
                        {r.blocker_count > 0 && (
                          <div className="text-xs text-amber-700 dark:text-amber-400">{r.blocker_count} blocker(s)</div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[14rem] truncate">
                        {r.entity_id ? (
                          <Link to={`/entities/${r.entity_id}`} className="hover:underline">{r.entity_name}</Link>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{r.stage_label}</div>
                        <div className="text-xs text-muted-foreground">{r.status_label}</div>
                      </TableCell>
                      <TableCell className="text-sm">{r.owner_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={PRIORITY_CLASS[r.priority] ?? PRIORITY_CLASS.medium}>{r.priority}</Badge>
                        {r.priority_reason ? <div className="mt-0.5 max-w-[12rem] text-xs text-muted-foreground">{r.priority_reason}</div> : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={SLA_CLASS[r.sla_state] ?? SLA_CLASS.paused}>{r.sla_state.replace('_', ' ')}</Badge>
                        <div className="text-xs text-muted-foreground">{r.sla_due_at ? formatDateTime(r.sla_due_at) : '—'}</div>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{r.waiting_on ?? '—'}</TableCell>
                      <TableCell>
                        {r.next_action_href ? (
                          <Link to={r.next_action_href} data-rbac={r.next_action_permission ?? undefined}
                                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                            {r.next_action_label} <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        ) : <span className="text-sm text-muted-foreground">{r.next_action_label ?? '—'}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} item(s) · page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => set('page', String(page + 1))}>Next</Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
