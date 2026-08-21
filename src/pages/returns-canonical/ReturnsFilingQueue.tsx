/**
 * EPR-01 — canonical Regulatory Returns work queue (internal operations).
 *
 * Truth source: `returns_filing_queue_v2` (server-scoped) for rows and
 * `returns_filing_queue_counts` for the headline numbers — the SAME filtered
 * server source, so KPIs can never be a `rows.length` of a capped browser page.
 *
 * Stage, status, owner, priority, SLA, waiting-on and the next required action
 * are all server-derived. This screen only formats them.
 *
 * Deep-link contract: `?status=`, `?stage=`, `?overdue=1`, `?owner=` .
 */
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EnterpriseDataGrid, type GridColumn } from '@/components/data-grid';
import { StatusBadge } from '@/components/presentation/StatusBadge';
import { KpiTile } from '@/components/presentation/KpiTile';
import {
  useFilingQueueV2, useFilingQueueCounts, FREQUENCY_LABELS,
  RETURN_STAGE_LABELS, WAITING_ON_LABELS, SLA_STATE_LABELS,
  type FilingQueueRowV2,
} from '@/hooks/useWaveC';
import { formatDate, formatTimestamp, formatCount } from '@/lib/presentation/format';
import { objectRoute } from '@/lib/routes/objectRoutes';
import { Eye } from 'lucide-react';

const STAGE_TABS = [
  { value: 'ALL', label: 'All filings' },
  { value: 'SUBMITTED_INTAKE', label: 'Submitted — intake' },
  { value: 'REGULATOR_REVIEW', label: 'Regulator review' },
  { value: 'CORRECTION', label: 'Correction' },
  { value: 'ENTITY_PREPARATION', label: 'Entity preparation' },
  { value: 'CLOSED', label: 'Closed' },
] as const;

const STATUS_TONE: Record<string, 'positive' | 'critical' | 'warning' | 'progress' | 'info' | 'muted'> = {
  ACCEPTED: 'positive',
  REJECTED: 'critical',
  CORRECTION_REQUESTED: 'warning',
  UNDER_REVIEW: 'progress',
  SUBMITTED: 'info',
  DRAFT: 'muted',
  WITHDRAWN: 'muted',
};

const PRIORITY_TONE: Record<string, 'critical' | 'warning' | 'info' | 'muted'> = {
  CRITICAL: 'critical',
  HIGH: 'warning',
  MEDIUM: 'info',
  NORMAL: 'muted',
  NONE: 'muted',
};

const SLA_TONE: Record<string, 'critical' | 'warning' | 'positive' | 'muted'> = {
  BREACHED: 'critical',
  DUE_SOON: 'warning',
  ON_TRACK: 'positive',
  NOT_APPLICABLE: 'muted',
};

export default function ReturnsFilingQueue() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const statusParam = (searchParams.get('status') ?? '').toUpperCase() || null;
  const stageParam = (searchParams.get('stage') ?? '').toUpperCase() || null;
  const ownerParam = searchParams.get('owner') || null;
  const overdueOnly = searchParams.get('overdue') === '1';

  const filters = useMemo(() => ({
    status: statusParam,
    stage: stageParam,
    ownerUserId: ownerParam,
    overdueOnly,
  }), [statusParam, stageParam, ownerParam, overdueOnly]);

  const { data: rows = [], isLoading, error, refetch } = useFilingQueueV2(filters);
  const { data: counts } = useFilingQueueCounts(filters);

  const tab = stageParam && STAGE_TABS.some((t) => t.value === stageParam) ? stageParam : 'ALL';
  const selectTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'ALL') next.delete('stage'); else next.set('stage', value);
    setSearchParams(next, { replace: true });
  };

  const optionsFor = (key: keyof FilingQueueRowV2, labels?: Record<string, string>) =>
    [...new Set(rows.map((r) => r[key] as string).filter(Boolean))].sort()
      .map((value) => ({ value, label: labels?.[value] ?? value }));

  const statusOptions = useMemo(() => optionsFor('status'), [rows]);
  const stageOptions = useMemo(() => optionsFor('stage', RETURN_STAGE_LABELS), [rows]);
  const frequencyOptions = useMemo(() => optionsFor('frequency', FREQUENCY_LABELS), [rows]);
  const returnOptions = useMemo(() => optionsFor('definition_code'), [rows]);
  const ownerOptions = useMemo(() => optionsFor('owner_name'), [rows]);
  const slaOptions = useMemo(() => optionsFor('sla_state', SLA_STATE_LABELS), [rows]);
  const priorityOptions = useMemo(() => optionsFor('priority'), [rows]);
  const waitingOptions = useMemo(() => optionsFor('waiting_on', WAITING_ON_LABELS), [rows]);

  const columns = useMemo<Array<GridColumn<FilingQueueRowV2>>>(() => [
    {
      id: 'filing_reference',
      header: 'Filing reference',
      accessor: (r) => r.filing_reference,
      cell: (r) => <span className="font-mono text-xs font-medium text-primary">{r.filing_reference}</span>,
      sortable: true, filterable: true, filterType: 'text', mandatory: true, minWidth: '11rem',
    },
    {
      id: 'entity_name',
      header: 'Regulated entity',
      accessor: (r) => r.entity_name,
      cell: (r) => <span className="font-medium">{r.entity_name || 'Not recorded'}</span>,
      sortable: true, filterable: true, filterType: 'text', truncate: true, minWidth: '14rem',
    },
    {
      id: 'definition_code',
      header: 'Return',
      accessor: (r) => r.definition_code,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium">{r.definition_code}</p>
          <p className="truncate text-xs text-muted-foreground">{r.definition_name}</p>
        </div>
      ),
      sortable: true, filterable: true, filterType: 'multiEnum',
      filterOptions: returnOptions, filterLabel: 'Return type', minWidth: '13rem',
    },
    {
      id: 'period_label',
      header: 'Reporting period',
      accessor: (r) => r.period_end,
      cell: (r) => <span className="whitespace-nowrap">{r.period_label}</span>,
      sortable: true, filterable: true, filterType: 'text', minWidth: '11rem',
    },
    {
      id: 'frequency',
      header: 'Frequency',
      accessor: (r) => r.frequency,
      cell: (r) => <span>{FREQUENCY_LABELS[r.frequency] ?? r.frequency}</span>,
      sortable: true, filterable: true, filterType: 'multiEnum', filterOptions: frequencyOptions,
      defaultVisible: false, priority: 3, minWidth: '9rem',
    },
    {
      id: 'stage',
      header: 'Stage',
      accessor: (r) => r.stage,
      cell: (r) => <StatusBadge code={r.stage} label={r.stage_label} tone="info" />,
      sortable: true, filterable: true, filterType: 'multiEnum', filterOptions: stageOptions,
      mandatory: true, minWidth: '12rem',
    },
    {
      id: 'status',
      header: 'Filing status',
      accessor: (r) => r.status,
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge code={r.status} label={r.status_label} tone={STATUS_TONE[r.status] ?? 'muted'} />
          {r.blocking_validation_count > 0 && (
            <StatusBadge
              code="blocking_errors"
              label={`${formatCount(r.blocking_validation_count)} blocking`}
              tone="critical"
              description="Validation errors prevent acceptance of this filing."
            />
          )}
        </div>
      ),
      sortable: true, filterable: true, filterType: 'multiEnum', filterOptions: statusOptions, minWidth: '13rem',
    },
    {
      id: 'owner_name',
      header: 'Owner / team',
      accessor: (r) => r.owner_name,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate">{r.owner_name || 'Unassigned'}</p>
          {r.team && <p className="truncate text-xs text-muted-foreground">{r.team}</p>}
        </div>
      ),
      sortable: true, filterable: true, filterType: 'multiEnum', filterOptions: ownerOptions,
      mandatory: true, minWidth: '12rem',
    },
    {
      id: 'priority',
      header: 'Priority',
      accessor: (r) => r.priority,
      cell: (r) => (
        <StatusBadge
          code={r.priority}
          label={r.priority}
          tone={PRIORITY_TONE[r.priority] ?? 'muted'}
          description={r.priority_reason}
        />
      ),
      sortable: true, filterable: true, filterType: 'multiEnum', filterOptions: priorityOptions, minWidth: '10rem',
    },
    {
      id: 'sla_state',
      header: 'Service level',
      accessor: (r) => r.sla_due_at,
      cell: (r) => (
        <div className="whitespace-nowrap">
          <StatusBadge
            code={r.sla_state}
            label={SLA_STATE_LABELS[r.sla_state] ?? r.sla_state}
            tone={SLA_TONE[r.sla_state] ?? 'muted'}
          />
          {r.sla_due_at && (
            <p className="mt-0.5 text-xs text-muted-foreground">Due {formatTimestamp(r.sla_due_at)}</p>
          )}
        </div>
      ),
      sortable: true, filterable: true, filterType: 'multiEnum', filterOptions: slaOptions, minWidth: '13rem',
    },
    {
      id: 'due_date',
      header: 'Regulatory due date',
      accessor: (r) => r.due_date,
      cell: (r) => (
        <div className="whitespace-nowrap">
          {formatDate(r.due_date)}
          {r.is_overdue && (
            <StatusBadge code="overdue" label={`${formatCount(r.days_late)} days late`} tone="critical" className="ml-2" />
          )}
        </div>
      ),
      sortable: true, filterable: true, filterType: 'dateRange', minWidth: '13rem',
    },
    {
      id: 'waiting_on',
      header: 'Waiting on',
      accessor: (r) => r.waiting_on,
      cell: (r) => <span>{WAITING_ON_LABELS[r.waiting_on] ?? r.waiting_on}</span>,
      sortable: true, filterable: true, filterType: 'multiEnum', filterOptions: waitingOptions,
      priority: 2, minWidth: '10rem',
    },
    {
      id: 'next_action',
      header: 'Next action',
      accessor: (r) => r.next_action_label,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate">{r.next_action_label}</p>
          {r.blocker_count > 0 && (
            <p className="text-xs text-muted-foreground">{formatCount(r.blocker_count)} blocking condition(s)</p>
          )}
        </div>
      ),
      sortable: true, filterable: true, filterType: 'text', mandatory: true, minWidth: '16rem',
    },
    {
      id: 'open_request_count',
      header: 'Open requests',
      accessor: (r) => r.open_request_count,
      cell: (r) => <span>{r.open_request_count > 0 ? formatCount(r.open_request_count) : 'None'}</span>,
      sortable: true, align: 'right', priority: 2, minWidth: '9rem',
    },
    {
      id: 'current_version_number',
      header: 'Version',
      accessor: (r) => r.current_version_number,
      cell: (r) => <span className="font-mono text-xs">v{r.current_version_number}</span>,
      sortable: true, align: 'right', defaultVisible: false, priority: 3, minWidth: '7rem',
    },
    {
      id: 'last_activity_at',
      header: 'Last activity',
      accessor: (r) => r.last_activity_at,
      cell: (r) => <span className="whitespace-nowrap">{formatTimestamp(r.last_activity_at)}</span>,
      sortable: true, filterable: true, filterType: 'dateRange', priority: 2, minWidth: '12rem',
    },
    {
      id: 'submitted_at',
      header: 'Submitted',
      accessor: (r) => r.submitted_at,
      cell: (r) => <span className="whitespace-nowrap">{formatTimestamp(r.submitted_at)}</span>,
      sortable: true, filterable: true, filterType: 'dateRange', defaultVisible: false, priority: 3, minWidth: '12rem',
    },
  ], [statusOptions, stageOptions, frequencyOptions, returnOptions, ownerOptions, slaOptions, priorityOptions, waitingOptions]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Returns Filing Queue"
          description="Canonical return filings across all supervised entities — stage, ownership, service level and next action are supplied by the supervisory read model."
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            label="Filings in view"
            value={formatCount(counts?.total ?? 0)}
            hint="Server count for the current filters"
          />
          <KpiTile
            label="Service level breached"
            value={formatCount(counts?.sla_breached ?? 0)}
            tone={(counts?.sla_breached ?? 0) > 0 ? 'critical' : 'positive'}
            hint="Past the review service level"
          />
          <KpiTile
            label="Awaiting regulator"
            value={formatCount(counts?.awaiting_regulator ?? 0)}
            tone={(counts?.unassigned ?? 0) > 0 ? 'warning' : 'positive'}
            hint={`${formatCount(counts?.unassigned ?? 0)} unassigned`}
          />
          <KpiTile
            label="Blocking validations"
            value={formatCount(counts?.blocking_validations ?? 0)}
            tone={(counts?.blocking_validations ?? 0) > 0 ? 'warning' : 'positive'}
            hint="Cannot be accepted until cleared"
          />
        </div>

        <EnterpriseDataGrid<FilingQueueRowV2>
          gridId="returns-filing-queue"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.filing_id}
          isLoading={isLoading}
          error={error ? 'The filing queue could not be loaded.' : null}
          emptyTitle="No filings in this view"
          emptyDescription="No return filings match the selected stage and filters."
          searchPlaceholder="Search filing reference, entity, return or period…"
          onRowClick={(r) => navigate(objectRoute.returnFiling(r.filing_id))}
          primaryRowAction={(r) => ({
            label: 'Open filing',
            to: objectRoute.returnFiling(r.filing_id),
            icon: <Eye className="h-3.5 w-3.5" />,
          })}
          onRefresh={() => refetch()}
          exportFileName="returns-filing-queue"
          syncUrlState
          caption="Canonical return filings visible to your role."
          aboveGrid={(
            <Tabs value={tab} onValueChange={selectTab}>
              <TabsList className="flex-wrap">
                {STAGE_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                    {t.value !== 'ALL' && counts?.by_stage?.[t.value] !== undefined
                      ? ` (${formatCount(counts.by_stage[t.value])})`
                      : ''}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        />
      </div>
    </DashboardLayout>
  );
}
