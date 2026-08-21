/**
 * P12 — the single operational correspondence work queue (`/correspondence/inbox`).
 *
 * Server-paged and count-backed: rows, totals and bucket counts all come from
 * `correspondence_work_queue`. There are no capped client arrays and no client
 * KPI arithmetic, and priority/SLA/waiting-on/next-action are server authority.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EnterpriseDataGrid } from '@/components/data-grid/EnterpriseDataGrid';
import { emptyGridState, type GridColumn, type GridState } from '@/components/data-grid/types';
import { IntakeForm } from '@/components/correspondence/IntakeForm';
import { formatDateTime } from '@/lib/datetime';
import { useIsInternal } from '@/hooks/useUserPermissions';
import {
  useCorrespondenceWorkQueue, type CorrespondenceQueueRow,
} from '@/hooks/useCorrespondenceQueue';
import { CORRESPONDENCE_MODULE_LABELS, THREAD_STATE_LABELS, THREAD_TYPE_LABELS } from '@/hooks/useCorrespondence';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Lock } from 'lucide-react';

const BUCKETS: Array<{ key: string; label: string; countKey: keyof NonNullable<ReturnType<typeof useCorrespondenceWorkQueue>['data']>['counts'] }> = [
  { key: 'open', label: 'Open', countKey: 'total_open' },
  { key: 'action_required', label: 'Action required', countKey: 'action_required' },
  { key: 'mine', label: 'Assigned to me', countKey: 'mine' },
  { key: 'unassigned', label: 'Unassigned', countKey: 'unassigned' },
  { key: 'awaiting_response', label: 'Awaiting response', countKey: 'awaiting_response' },
  { key: 'breached', label: 'SLA breached', countKey: 'breached' },
  { key: 'unread', label: 'Unread', countKey: 'unread' },
  { key: 'all', label: 'All', countKey: 'total' },
];

const SLA_TONE: Record<string, string> = {
  breached: 'bg-destructive/10 text-destructive border-destructive/30',
  at_risk: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  on_track: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
};

export default function CorrespondenceInbox() {
  const isInternal = useIsInternal();
  const [bucket, setBucket] = useState('open');
  const [grid, setGrid] = useState<GridState>(emptyGridState(25));

  const filters = useMemo(() => ({
    bucket,
    query: grid.search || undefined,
  }), [bucket, grid.search]);

  const { data, isLoading, error, refetch } = useCorrespondenceWorkQueue(filters, grid.pageIndex, grid.pageSize);
  const counts = data?.counts ?? {};

  const columns: Array<GridColumn<CorrespondenceQueueRow>> = useMemo(() => [
    {
      id: 'reference', header: 'Reference', mandatory: true, priority: 1, width: '150px',
      accessor: (r) => r.reference,
      cell: (r) => (
        <Link to={r.canonical_href} className="font-mono text-xs text-primary hover:underline">{r.reference}</Link>
      ),
    },
    {
      id: 'subject', header: 'Subject', priority: 1, minWidth: '260px', truncate: true,
      accessor: (r) => r.subject,
      cell: (r) => (
        <div className="min-w-0">
          <div className={r.unread_count > 0 ? 'truncate font-semibold' : 'truncate font-medium'}>{r.subject}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{THREAD_TYPE_LABELS[r.thread_type as keyof typeof THREAD_TYPE_LABELS] ?? r.thread_type}</span>
            {r.unread_count > 0 && <Badge className="h-4 px-1 text-[10px]">{r.unread_count} unread</Badge>}
          </div>
        </div>
      ),
    },
    {
      id: 'entity', header: 'Entity / person', priority: 2, minWidth: '180px',
      accessor: (r) => r.entity_name ?? r.person_name ?? '',
      cell: (r) => (
        <div className="min-w-0 text-sm">
          <div className="truncate">{r.entity_name ?? r.person_name ?? '—'}</div>
          {r.person_org && <div className="truncate text-[11px] text-muted-foreground">{r.person_org}</div>}
        </div>
      ),
    },
    {
      id: 'related_case', header: 'Related case', priority: 2, minWidth: '160px',
      accessor: (r) => r.source_reference ?? r.source_type ?? '',
      cell: (r) => r.related_href
        ? <Link to={r.related_href} className="text-xs text-primary hover:underline">
            {r.source_reference ?? r.source_type}
          </Link>
        : <span className="text-xs text-muted-foreground">{r.source_reference ?? '—'}</span>,
    },
    {
      id: 'module', header: 'Domain', priority: 3, accessor: (r) => r.module,
      cell: (r) => <Badge variant="outline" className="text-[10px]">{CORRESPONDENCE_MODULE_LABELS[r.module] ?? r.module}</Badge>,
    },
    { id: 'channel', header: 'Channel', priority: 3, accessor: (r) => r.channel },
    {
      id: 'direction', header: 'Direction', priority: 3, accessor: (r) => r.effective_direction,
      cell: (r) => r.effective_direction === 'internal'
        ? <Badge variant="secondary" className="gap-1 text-[10px]"><Lock className="h-2.5 w-2.5" />Internal</Badge>
        : r.effective_direction === 'inbound'
          ? <Badge variant="outline" className="gap-1 text-[10px]"><ArrowDownLeft className="h-2.5 w-2.5" />Inbound</Badge>
          : <Badge variant="outline" className="gap-1 text-[10px]"><ArrowUpRight className="h-2.5 w-2.5" />Outbound</Badge>,
    },
    {
      id: 'owner', header: 'Owner / team', priority: 2,
      accessor: (r) => r.owner_name ?? '',
      cell: (r) => (
        <div className="text-sm">
          <div>{r.owner_name ?? 'Unassigned'}</div>
          <div className="text-[11px] text-muted-foreground">{r.team ?? '—'}</div>
        </div>
      ),
    },
    {
      id: 'priority', header: 'Priority', priority: 3, accessor: (r) => r.priority,
      cell: (r) => <Badge variant="outline" className="text-[10px] capitalize">{r.priority}</Badge>,
    },
    {
      id: 'sla', header: 'SLA', priority: 1, accessor: (r) => r.sla_due_at ?? '',
      cell: (r) => r.sla_state === 'none'
        ? <span className="text-xs text-muted-foreground">—</span>
        : (
          <div className="space-y-0.5">
            <Badge variant="outline" className={`text-[10px] ${SLA_TONE[r.sla_state] ?? ''}`}>
              {r.sla_state === 'breached' && <AlertTriangle className="mr-1 h-2.5 w-2.5" />}
              {r.sla_state.replace('_', ' ')}
            </Badge>
            <div className="text-[11px] text-muted-foreground">{r.sla_due_at ? formatDateTime(r.sla_due_at) : '—'}</div>
          </div>
        ),
    },
    {
      id: 'waiting_on', header: 'Waiting on', priority: 2, accessor: (r) => r.waiting_on ?? '',
      cell: (r) => <span className="text-xs capitalize">{r.waiting_on ?? '—'}</span>,
    },
    {
      id: 'next_action', header: 'Next action', priority: 3, minWidth: '200px', truncate: true,
      accessor: (r) => r.next_action ?? '',
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate text-xs">{r.next_action ?? '—'}</div>
          {r.action_required && <Badge className="mt-0.5 h-4 px-1 text-[10px]">Action required</Badge>}
        </div>
      ),
    },
    {
      id: 'state', header: 'Status', priority: 2, accessor: (r) => r.thread_state,
      cell: (r) => <Badge variant="secondary" className="text-[10px]">{THREAD_STATE_LABELS[r.thread_state as keyof typeof THREAD_STATE_LABELS] ?? r.thread_state}</Badge>,
    },
    {
      id: 'last_activity', header: 'Last activity', priority: 1, accessor: (r) => r.last_activity_at ?? '',
      cell: (r) => <span className="text-xs">{r.last_activity_at ? formatDateTime(r.last_activity_at) : '—'}</span>,
    },
  ], []);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title="Correspondence work queue"
          description="Every regulator-entity conversation needing attention, with server-computed ownership, service levels, waiting-on and next action."
          actions={isInternal ? <IntakeForm /> : undefined}
        />

        <EnterpriseDataGrid<CorrespondenceQueueRow>
          gridId="correspondence-work-queue"
          columns={columns}
          rows={data?.rows ?? []}
          getRowId={(r) => r.id}
          mode="server"
          totalCount={data?.total ?? 0}
          state={grid}
          onStateChange={setGrid}
          isLoading={isLoading}
          error={error ? (error as Error).message : null}
          onRefresh={() => refetch()}
          enableGlobalSearch
          searchPlaceholder="Search subject, reference, entity or sender…"
          emptyTitle="Nothing in this queue"
          emptyDescription="No correspondence matches the selected queue."
          primaryRowAction={(r) => ({ label: 'Open thread', to: r.canonical_href })}
          aboveGrid={(
            <div className="flex flex-wrap gap-2">
              {BUCKETS.map((b) => (
                <Button
                  key={b.key}
                  size="sm"
                  variant={bucket === b.key ? 'default' : 'outline'}
                  onClick={() => { setBucket(b.key); setGrid((s) => ({ ...s, pageIndex: 0 })); }}
                >
                  {b.label}
                  <span className="ml-1.5 text-xs opacity-80">{counts[b.countKey] ?? 0}</span>
                </Button>
              ))}
            </div>
          )}
        />
      </div>
    </DashboardLayout>
  );
}
