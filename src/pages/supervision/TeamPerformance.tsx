/**
 * Package A4 — Supervisory team performance (`/supervision/team-performance`).
 *
 * Workload and timeliness per supervisory officer, served by
 * `sup_team_performance`. The read model applies the same permission gating as
 * every other supervisory surface, so officers only appear with the domains the
 * viewer may read. Unassigned work is reported separately so it cannot hide.
 */
import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EnterpriseDataGrid, type GridColumn } from '@/components/data-grid';
import { KpiTile } from '@/components/presentation/KpiTile';
import { formatCount, formatDate } from '@/lib/presentation/format';
import { useSupTeamPerformance, type SupTeamPerformanceOfficer } from '@/hooks/useSupervisoryReadModels';

export default function TeamPerformance() {
  const { data, isLoading, error, refetch } = useSupTeamPerformance();

  const officers = useMemo<SupTeamPerformanceOfficer[]>(() => data?.officers ?? [], [data]);

  const totals = useMemo(() => officers.reduce(
    (acc, o) => ({
      open: acc.open + (o.open_items ?? 0),
      overdue: acc.overdue + (o.overdue_items ?? 0),
      dueSoon: acc.dueSoon + (o.due_soon_items ?? 0),
      completed: acc.completed + (o.completed_in_period ?? 0),
    }),
    { open: 0, overdue: 0, dueSoon: 0, completed: 0 },
  ), [officers]);

  const columns = useMemo<Array<GridColumn<SupTeamPerformanceOfficer>>>(() => [
    {
      id: 'officer_name',
      header: 'Supervisory officer',
      accessor: (r) => r.officer_name ?? 'Unassigned',
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium">{r.officer_name ?? 'Unassigned'}</p>
          {r.department && <p className="truncate text-xs text-muted-foreground">{r.department}</p>}
        </div>
      ),
      sortable: true,
      filterable: true,
      filterType: 'text',
      mandatory: true,
      minWidth: '15rem',
    },
    {
      id: 'open_items',
      header: 'Open items',
      accessor: (r) => r.open_items ?? 0,
      cell: (r) => <span className="tabular-nums">{formatCount(r.open_items)}</span>,
      sortable: true,
      align: 'right',
      minWidth: '8rem',
    },
    {
      id: 'overdue_items',
      header: 'Overdue',
      accessor: (r) => r.overdue_items ?? 0,
      cell: (r) => (
        <span className={`tabular-nums ${(r.overdue_items ?? 0) > 0 ? 'font-semibold text-destructive' : ''}`}>
          {formatCount(r.overdue_items)}
        </span>
      ),
      sortable: true,
      align: 'right',
      minWidth: '7rem',
    },
    {
      id: 'due_soon_items',
      header: 'Due soon',
      accessor: (r) => r.due_soon_items ?? 0,
      cell: (r) => <span className="tabular-nums">{formatCount(r.due_soon_items)}</span>,
      sortable: true,
      align: 'right',
      minWidth: '7rem',
    },
    {
      id: 'completed_in_period',
      header: 'Completed in period',
      accessor: (r) => r.completed_in_period ?? 0,
      cell: (r) => <span className="tabular-nums">{formatCount(r.completed_in_period)}</span>,
      sortable: true,
      align: 'right',
      minWidth: '11rem',
    },
    {
      id: 'by_domain',
      header: 'Workload by domain',
      accessor: (r) => Object.keys(r.by_domain ?? {}).join(', '),
      cell: (r) => {
        const entries = Object.entries(r.by_domain ?? {});
        if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="text-xs text-muted-foreground">
            {entries.map(([k, v]) => `${k}: ${v}`).join(' · ')}
          </span>
        );
      },
      minWidth: '16rem',
    },
  ], []);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title="Supervisory team performance"
          description="Workload, timeliness and completed supervisory work per officer, derived from canonical supervisory records."
        />

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : error ? (
          <Card><CardContent className="py-10 text-center text-sm text-destructive">
            {(error as Error).message === 'forbidden'
              ? 'You do not have access to supervisory team performance.'
              : (error as Error).message}
          </CardContent></Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiTile label="Open supervisory items" value={formatCount(totals.open)} hint={`${officers.length} officers in scope`} icon={Users} />
              <KpiTile label="Overdue" value={formatCount(totals.overdue)} tone={totals.overdue > 0 ? 'critical' : 'positive'} hint="Past the recorded due date" />
              <KpiTile label="Due soon" value={formatCount(totals.dueSoon)} tone={totals.dueSoon > 0 ? 'warning' : 'neutral'} hint="Falling due inside the review window" />
              <KpiTile
                label="Completed in period"
                value={formatCount(totals.completed)}
                tone="positive"
                hint={data?.period ? `${formatDate(data.period.from)} – ${formatDate(data.period.to)}` : undefined}
              />
            </div>

            <EnterpriseDataGrid<SupTeamPerformanceOfficer>
              gridId="supervisory-team-performance"
              rows={officers}
              columns={columns}
              getRowId={(r) => r.officer_id ?? 'unassigned'}
              isLoading={isLoading}
              onRefresh={() => { void refetch(); }}
              searchPlaceholder="Search officers"
              emptyTitle="No supervisory workload"
              emptyDescription="No officers currently hold open supervisory items in the domains you can access."
              exportFileName="supervisory-team-performance"
            />

            {data?.unassigned && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Unassigned supervisory work</CardTitle>
                  <CardDescription>Work with no owner is a supervisory risk in its own right and is reported separately.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  <KpiTile
                    label="Breaches awaiting acknowledgement"
                    value={formatCount(data.unassigned.breaches_awaiting_acknowledgement)}
                    tone={data.unassigned.breaches_awaiting_acknowledgement > 0 ? 'critical' : 'positive'}
                    to="/supervision/breaches"
                  />
                  <KpiTile
                    label="Complaints without a team"
                    value={formatCount(data.unassigned.complaints_unassigned_team)}
                    tone={data.unassigned.complaints_unassigned_team > 0 ? 'warning' : 'positive'}
                    to="/complaints"
                  />
                  <KpiTile
                    label="Filings without a reviewer"
                    value={formatCount(data.unassigned.filings_unassigned)}
                    tone={data.unassigned.filings_unassigned > 0 ? 'warning' : 'positive'}
                    to="/returns/queue?status=SUBMITTED"
                  />
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
