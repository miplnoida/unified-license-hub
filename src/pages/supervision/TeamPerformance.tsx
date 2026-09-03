/**
 * EPIC 4 / W6 — supervisory team workload (`/supervision/team-performance`).
 *
 * Workload is read from the single canonical enterprise work model
 * (`supervisory_work_item`) through `sup_team_performance`, so this page can
 * never disagree with My Work, Entity 360's next action or the enterprise
 * portfolio. No utilisation or capacity percentage is shown: there is no
 * approved workload-capacity denominator, so only workload and availability
 * facts are reported.
 */
import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EnterpriseDataGrid, type GridColumn } from '@/components/data-grid';
import { KpiTile } from '@/components/presentation/KpiTile';
import { formatCount, formatDate } from '@/lib/presentation/format';
import { useSupTeamPerformance, type SupTeamPerformanceOfficer } from '@/hooks/useSupervisoryReadModels';

const numberColumn = (
  id: keyof SupTeamPerformanceOfficer,
  header: string,
  opts: { critical?: boolean; width?: string } = {},
): GridColumn<SupTeamPerformanceOfficer> => ({
  id: String(id),
  header,
  accessor: (r) => (r[id] as number) ?? 0,
  cell: (r) => {
    const value = (r[id] as number) ?? 0;
    return (
      <span className={`tabular-nums ${opts.critical && value > 0 ? 'font-semibold text-destructive' : ''}`}>
        {formatCount(value)}
      </span>
    );
  },
  sortable: true,
  align: 'right',
  minWidth: opts.width ?? '8rem',
});

export default function TeamPerformance() {
  const { data, isLoading, error, refetch } = useSupTeamPerformance();

  const officers = useMemo<SupTeamPerformanceOfficer[]>(() => data?.officers ?? [], [data]);
  const totals = data?.totals;
  const unassigned = data?.unassigned;

  const columns = useMemo<Array<GridColumn<SupTeamPerformanceOfficer>>>(() => [
    {
      id: 'officer_name',
      header: 'Supervisory officer',
      accessor: (r) => r.officer_name ?? 'Unnamed officer',
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium">{r.officer_name ?? 'Unnamed officer'}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[r.team_name, r.department].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      ),
      sortable: true,
      filterable: true,
      filterType: 'text',
      mandatory: true,
      minWidth: '16rem',
    },
    numberColumn('open_items', 'Open work'),
    numberColumn('high_priority_items', 'High priority', { critical: true, width: '9rem' }),
    numberColumn('overdue_items', 'Overdue', { critical: true, width: '7rem' }),
    numberColumn('due_soon_items', 'Due soon', { width: '8rem' }),
    numberColumn('awaiting_decision_items', 'Awaiting decision', { width: '11rem' }),
    numberColumn('examination_items', 'Examinations', { width: '9rem' }),
    numberColumn('finding_remediation_items', 'Findings / remediation', { width: '12rem' }),
    {
      id: 'earliest_due_date',
      header: 'Earliest due',
      accessor: (r) => r.earliest_due_date ?? '',
      cell: (r) => <span className="text-xs">{r.earliest_due_date ? formatDate(r.earliest_due_date) : '—'}</span>,
      sortable: true,
      minWidth: '9rem',
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
            {entries.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')}
          </span>
        );
      },
      minWidth: '18rem',
    },
  ], []);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title="Supervisory team workload"
          description="Officer and team workload derived from the single enterprise supervisory work model. Workload facts only — no capacity utilisation is inferred."
        />

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : error ? (
          <Card><CardContent className="py-10 text-center text-sm text-destructive">
            {(error as Error).message === 'forbidden'
              ? 'You do not have access to supervisory team workload.'
              : (error as Error).message}
          </CardContent></Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiTile label="Open supervisory work" value={formatCount(totals?.open_items)} hint={`${officers.length} officers hold work`} icon={Users} to="/my-work" />
              <KpiTile label="High priority" value={formatCount(totals?.high_priority_items)} tone={(totals?.high_priority_items ?? 0) > 0 ? 'warning' : 'positive'} to="/my-work" />
              <KpiTile label="Overdue" value={formatCount(totals?.overdue_items)} tone={(totals?.overdue_items ?? 0) > 0 ? 'critical' : 'positive'} hint="Past the recorded due date" to="/my-work" />
              <KpiTile label="Awaiting decision" value={formatCount(totals?.awaiting_decision_items)} tone={(totals?.awaiting_decision_items ?? 0) > 0 ? 'warning' : 'neutral'} hint="Governed decision points" to="/my-work" />
            </div>

            <EnterpriseDataGrid<SupTeamPerformanceOfficer>
              gridId="supervisory-team-workload"
              rows={officers}
              columns={columns}
              getRowId={(r) => r.officer_id ?? 'unassigned'}
              isLoading={isLoading}
              onRefresh={() => { void refetch(); }}
              searchPlaceholder="Search officers"
              emptyTitle="No supervisory workload"
              emptyDescription="No officers currently hold open supervisory work in the domains you can access."
              exportFileName="supervisory-team-workload"
            />

            {(data?.teams?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Team workload</CardTitle>
                  <CardDescription>Team totals from the same work model — never recomputed on the client.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data!.teams.map((t) => (
                    <div key={t.team_id ?? 'none'} className="rounded-md border p-3">
                      <p className="text-sm font-medium">{t.team_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatCount(t.officers)} officers · {formatCount(t.open_items)} open · {formatCount(t.high_priority_items)} high priority
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCount(t.overdue_items)} overdue · {formatCount(t.due_soon_items)} due soon · {formatCount(t.awaiting_decision_items)} awaiting decision
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {unassigned && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Unassigned supervisory work</CardTitle>
                  <CardDescription>
                    Work with no owner or team is a supervisory risk in its own right and is reported separately from the
                    canonical work model.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <KpiTile label="Unassigned work" value={formatCount(unassigned.items)} tone={unassigned.items > 0 ? 'warning' : 'positive'} to="/my-work" />
                  <KpiTile label="High priority" value={formatCount(unassigned.high_priority_items)} tone={unassigned.high_priority_items > 0 ? 'critical' : 'positive'} to="/my-work" />
                  <KpiTile label="Overdue" value={formatCount(unassigned.overdue_items)} tone={unassigned.overdue_items > 0 ? 'critical' : 'positive'} to="/my-work" />
                  <KpiTile label="Awaiting decision" value={formatCount(unassigned.awaiting_decision_items)} tone={unassigned.awaiting_decision_items > 0 ? 'warning' : 'neutral'} to="/my-work" />
                </CardContent>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">
                    Open the{' '}
                    <Link to="/my-work" className="text-primary hover:underline">unassigned scope in My Work</Link>{' '}
                    to claim items. No capacity utilisation percentage is published — no approved workload-capacity
                    methodology exists.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
