/**
 * AML/CFT risk assessment register.
 *
 * Server-paged: the database performs the filter, the ordering, the range and
 * the count. The register renders one page and the record total reported by the
 * backend; nothing is counted or ordered in the browser.
 */
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RegisterToolbar } from '@/components/shared/RegisterToolbar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useAmlAssessmentStatuses, useAmlAssessmentsPage } from '@/hooks/useAmlSupervision';
import { AmlNewAssessmentDialog } from '@/components/supervision/aml/AmlNewAssessmentDialog';
import { AmlOrphanCasesAlert } from '@/components/supervision/aml/AmlOrphanCasesAlert';
import { SupervisoryRegister } from '@/components/supervision/SupervisoryRegister';
import { useListingState, useServerPageGuard } from '@/components/shared/listing';
import { EMERALD, fmtDate, ratingTone, statusTone, titleCase } from '@/lib/amlLabels';

export default function AmlAssessments() {
  const listing = useListingState({
    defaultSort: { key: 'created_at', direction: 'desc' },
    filterKeys: ['status'],
  });
  const status = listing.filters.status;
  const { data, isLoading, error, refetch, isFetching } = useAmlAssessmentsPage({
    page: listing.page,
    pageSize: listing.pageSize,
    sortKey: listing.sort?.key ?? null,
    sortDirection: listing.sort?.direction ?? 'desc',
    search: listing.search,
    status: status === 'all' ? null : status,
  });
  const { data: statuses = [] } = useAmlAssessmentStatuses();

  const rows = data?.rows ?? [];
  const total = data?.totalCount ?? 0;
  // The screen owns the authoritative count, so the screen repairs an invalid
  // page (e.g. ?page=99) before it can decide that nothing matches.
  const { repairing } = useServerPageGuard({
    page: listing.page,
    pageSize: listing.pageSize,
    totalCount: total,
    setPage: listing.setPage,
    ready: !isLoading && !error,
  });

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title="AML/CFT Risk Assessments"
          actions={
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                disabled={isFetching}
                aria-label="Refresh assessments"
                title="Refresh assessments"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
              <AmlNewAssessmentDialog size="sm" />
            </>
          }
        />

        <AmlOrphanCasesAlert />


        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load assessments</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardContent className="space-y-3 pt-4">
            <RegisterToolbar
              search={listing.search}
              onSearchChange={listing.setSearch}
              searchPlaceholder="Search reference or type…"
              trailing={
                <span className="text-sm text-muted-foreground">
                  {isLoading ? 'Loading…' : `${total} assessment${total === 1 ? '' : 's'}`}
                </span>
              }
            >
              <Select value={status} onValueChange={(v) => listing.setFilter('status', v)}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {titleCase(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </RegisterToolbar>

            {isLoading || repairing ? (
              <Skeleton className="h-64 w-full" />
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No AML/CFT assessments match the current filters.
              </p>
            ) : (
              <SupervisoryRegister
                rows={rows}
                getRowId={(r: any) => r.id}
                caption="AML/CFT risk assessments"
                mode="server"
                sort={listing.sort}
                onSortChange={listing.setSort}
                onSortToggle={listing.toggleSort}
                identifierSortable
                identifierSortKey="reference"
                paged
                page={listing.page}
                pageSize={listing.pageSize}
                totalCount={total}
                onPageChange={listing.setPage}
                onPageSizeChange={listing.setPageSize}
                showRecordCount
                identifier={(r: any) => ({
                  reference: r.reference || '—',
                  copyValue: r.id,
                  copyLabel: 'Copy assessment id',
                  subject: (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate">{r.entity_name || '—'}</span>
                      {r.is_current ? (
                        <Badge variant="outline" className={EMERALD}>
                          Current
                        </Badge>
                      ) : null}
                    </span>
                  ),
                })}
                columns={[
                  {
                    id: 'type',
                    header: 'Type / trigger',
                    sortable: true,
                    sortKey: 'type',
                    cell: (r: any) => (
                      <>
                        <div>{titleCase(r.assessment_type)}</div>
                        <div className="text-muted-foreground">{titleCase(r.trigger_type)}</div>
                      </>
                    ),
                  },
                  {
                    id: 'ratings',
                    header: 'Ratings',
                    sortable: true,
                    sortKey: 'residual',
                    cell: (r: any) => (
                      <>
                        <Badge variant="outline" className={ratingTone(r.residual_rating)}>
                          {titleCase(r.residual_rating)}
                        </Badge>
                        <div className="mt-1 text-muted-foreground">
                          I: {titleCase(r.inherent_rating)} · C: {titleCase(r.control_rating)}
                        </div>
                      </>
                    ),
                  },
                  {
                    id: 'status',
                    header: 'Status',
                    sortable: true,
                    sortKey: 'status',
                    cell: (r: any) => (
                      <>
                        <Badge variant="outline" className={statusTone(r.status)}>
                          {titleCase(r.status)}
                        </Badge>
                        {r.approved_at ? (
                          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                            Approved {fmtDate(r.approved_at)}
                          </div>
                        ) : null}
                      </>
                    ),
                  },
                  {
                    id: 'period',
                    header: 'Period / methodology',
                    priority: 3,
                    sortable: true,
                    sortKey: 'period',
                    cell: (r: any) => (
                      <>
                        <div className="font-mono">
                          {fmtDate(r.period_start)} → {fmtDate(r.period_end)}
                        </div>
                        <div className="font-mono text-muted-foreground">
                          {r.methodology_version ? `v${r.methodology_version}` : '—'}
                        </div>
                      </>
                    ),
                  },
                ]}
                actions={(r: any) => (
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/supervision/aml/assessments/${r.id}`}>
                      Open
                      <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
