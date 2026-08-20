/**
 * RDM-ENTITY-001 Wave C — canonical returns filing queue (regulator view).
 * Reads `returns_filing_queue`, which is scoped by the caller's permissions.
 *
 * Presentation follows the enterprise list standard: EnterpriseDataGrid owns
 * search, per-column filtering, sorting, column choice, paging and export, and
 * every value is rendered through the shared presentation layer.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EnterpriseDataGrid, type GridColumn } from '@/components/data-grid';
import { StatusBadge } from '@/components/presentation/StatusBadge';
import { KpiTile } from '@/components/presentation/KpiTile';
import { useFilingQueue, FILING_STATUS_LABELS, FREQUENCY_LABELS, type FilingQueueRow } from '@/hooks/useWaveC';
import { formatDate, formatTimestamp, formatCount } from '@/lib/presentation/format';
import { Eye } from 'lucide-react';

const TABS = ['ALL', 'SUBMITTED', 'UNDER_REVIEW', 'CORRECTION_REQUESTED', 'ACCEPTED', 'REJECTED', 'DRAFT'] as const;

const STATUS_TONE: Record<string, 'positive' | 'critical' | 'warning' | 'progress' | 'info' | 'muted'> = {
  ACCEPTED: 'positive',
  REJECTED: 'critical',
  CORRECTION_REQUESTED: 'warning',
  UNDER_REVIEW: 'progress',
  SUBMITTED: 'info',
  DRAFT: 'muted',
  WITHDRAWN: 'muted',
};

export default function ReturnsFilingQueue() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<string>('ALL');
  const { data: rows = [], isLoading, error, refetch } = useFilingQueue(tab === 'ALL' ? null : tab);

  const overdue = rows.filter((r) => r.is_overdue).length;
  const blocking = rows.filter((r) => r.blocking_errors > 0).length;
  const requests = rows.filter((r) => r.open_requests > 0).length;

  const statusOptions = useMemo(
    () => [...new Set(rows.map((r) => r.status).filter(Boolean))].sort()
      .map((value) => ({ value, label: FILING_STATUS_LABELS[value] ?? value })),
    [rows],
  );
  const frequencyOptions = useMemo(
    () => [...new Set(rows.map((r) => r.frequency).filter(Boolean))].sort()
      .map((value) => ({ value, label: FREQUENCY_LABELS[value] ?? value })),
    [rows],
  );
  const returnOptions = useMemo(
    () => [...new Set(rows.map((r) => r.definition_code).filter(Boolean))].sort()
      .map((value) => ({ value, label: value })),
    [rows],
  );

  const columns = useMemo<Array<GridColumn<FilingQueueRow>>>(() => [
    {
      id: 'filing_reference',
      header: 'Filing reference',
      accessor: (r) => r.filing_reference,
      cell: (r) => <span className="font-mono text-xs font-medium text-primary">{r.filing_reference}</span>,
      sortable: true,
      filterable: true,
      filterType: 'text',
      mandatory: true,
      minWidth: '11rem',
    },
    {
      id: 'entity_name',
      header: 'Regulated entity',
      accessor: (r) => r.entity_name,
      cell: (r) => <span className="font-medium">{r.entity_name || 'Not recorded'}</span>,
      sortable: true,
      filterable: true,
      filterType: 'text',
      truncate: true,
      minWidth: '14rem',
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
      sortable: true,
      filterable: true,
      filterType: 'multiEnum',
      filterOptions: returnOptions,
      filterLabel: 'Return type',
      minWidth: '13rem',
    },
    {
      id: 'frequency',
      header: 'Frequency',
      accessor: (r) => r.frequency,
      cell: (r) => <span>{FREQUENCY_LABELS[r.frequency] ?? r.frequency}</span>,
      sortable: true,
      filterable: true,
      filterType: 'multiEnum',
      filterOptions: frequencyOptions,
      priority: 2,
      minWidth: '9rem',
    },
    {
      id: 'period_label',
      header: 'Reporting period',
      accessor: (r) => r.period_end,
      cell: (r) => <span className="whitespace-nowrap">{r.period_label}</span>,
      sortable: true,
      filterable: true,
      filterType: 'text',
      minWidth: '11rem',
    },
    {
      id: 'due_date',
      header: 'Due date',
      accessor: (r) => r.due_date,
      cell: (r) => (
        <div className="whitespace-nowrap">
          {formatDate(r.due_date)}
          {r.is_overdue && (
            <StatusBadge
              code="overdue"
              label={`${formatCount(r.days_late)} days late`}
              tone="critical"
              className="ml-2"
            />
          )}
        </div>
      ),
      sortable: true,
      filterable: true,
      filterType: 'dateRange',
      minWidth: '12rem',
    },
    {
      id: 'status',
      header: 'Filing status',
      accessor: (r) => r.status,
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge
            code={r.status}
            label={FILING_STATUS_LABELS[r.status] ?? r.status}
            tone={STATUS_TONE[r.status] ?? 'neutral'}
          />
          {r.blocking_errors > 0 && (
            <StatusBadge
              code="blocking_errors"
              label={`${formatCount(r.blocking_errors)} blocking`}
              tone="critical"
              description="Validation errors prevent acceptance of this filing."
            />
          )}
        </div>
      ),
      sortable: true,
      filterable: true,
      filterType: 'multiEnum',
      filterOptions: statusOptions,
      mandatory: true,
      minWidth: '13rem',
    },
    {
      id: 'open_requests',
      header: 'Open requests',
      accessor: (r) => r.open_requests,
      cell: (r) => <span>{r.open_requests > 0 ? formatCount(r.open_requests) : 'None'}</span>,
      sortable: true,
      align: 'right',
      priority: 2,
      minWidth: '9rem',
    },
    {
      id: 'current_version_number',
      header: 'Version',
      accessor: (r) => r.current_version_number,
      cell: (r) => <span className="font-mono text-xs">v{r.current_version_number}</span>,
      sortable: true,
      align: 'right',
      priority: 3,
      minWidth: '7rem',
    },
    {
      id: 'submitted_at',
      header: 'Submitted',
      accessor: (r) => r.submitted_at,
      cell: (r) => <span className="whitespace-nowrap">{formatTimestamp(r.submitted_at)}</span>,
      sortable: true,
      filterable: true,
      filterType: 'dateRange',
      priority: 2,
      minWidth: '12rem',
    },
  ], [statusOptions, frequencyOptions, returnOptions]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Returns Filing Queue"
          description="Canonical return filings across all supervised entities"
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiTile label="Filings in view" value={formatCount(rows.length)} hint="Matches the selected status tab" />
          <KpiTile label="Overdue" value={formatCount(overdue)} tone={overdue > 0 ? 'critical' : 'positive'} hint="Past the regulatory due date" />
          <KpiTile label="Blocking validations" value={formatCount(blocking)} tone={blocking > 0 ? 'warning' : 'positive'} hint="Cannot be accepted until cleared" />
          <KpiTile label="Open requests" value={formatCount(requests)} tone={requests > 0 ? 'warning' : 'positive'} hint="Awaiting a response from the entity" />
        </div>

        <EnterpriseDataGrid<FilingQueueRow>
          gridId="returns-filing-queue"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.filing_id}
          isLoading={isLoading}
          error={error ? 'The filing queue could not be loaded.' : null}
          emptyTitle="No filings in this view"
          emptyDescription="No return filings match the selected status and filters."
          searchPlaceholder="Search filing reference, entity, return or period…"
          onRowClick={(r) => navigate(`/returns/filings/${r.filing_id}`)}
          primaryRowAction={(r) => ({
            label: 'Open filing',
            to: `/returns/filings/${r.filing_id}`,
            icon: <Eye className="h-3.5 w-3.5" />,
          })}
          onRefresh={() => refetch()}
          exportFileName="returns-filing-queue"
          syncUrlState
          caption="Canonical return filings visible to your role."
          aboveGrid={(
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex-wrap">
                {TABS.map((t) => (
                  <TabsTrigger key={t} value={t}>
                    {t === 'ALL' ? 'All filings' : FILING_STATUS_LABELS[t] ?? t}
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
