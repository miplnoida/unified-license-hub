import { Link, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { RegisterToolbar } from '@/components/shared/RegisterToolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useAmlFindingSeverities, useAmlFindingsPage } from '@/hooks/useAmlSupervision';
import { PaginationBar, useInvalidPageRecovery, useListingState } from '@/components/shared/listing';
import { AMBER, EMERALD, RED, fmtDate, ratingTone, statusTone, titleCase } from '@/lib/amlLabels';

/** Sort choices for the findings loop view — canonical values only. */
const SORT_OPTIONS = [
  { key: 'severity', label: 'Severity' },
  { key: 'status', label: 'Status' },
  { key: 'due_date', label: 'Due date' },
  { key: 'entity', label: 'Entity' },
  { key: 'reference', label: 'Reference' },
] as const;

export default function AmlFindings() {
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const listing = useListingState({
    defaultSort: { key: 'severity', direction: 'desc' },
    filterKeys: ['severity', 'view'],
  });
  const q = listing.search;
  const setQ = listing.setSearch;
  const severity = listing.filters.severity;
  const view = listing.filters.view;
  const sort = listing.sort ?? { key: 'severity', direction: 'desc' as const };

  // Real server paging behind the card UX: severity and status order by
  // canonical business ordinal, and remediation detail arrives with the page.
  const { data, isLoading, error, refetch, isFetching } = useAmlFindingsPage({
    page: listing.page,
    pageSize: listing.pageSize,
    sortKey: sort.key,
    sortDirection: sort.direction,
    search: q,
    severity: severity === 'all' ? null : severity,
    view: view === 'all' ? null : view,
  });
  const { data: severities = [] } = useAmlFindingSeverities();
  const visible = (data?.rows ?? []) as any[];
  const total = data?.totalCount ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const effectivePage = useInvalidPageRecovery({
    page: listing.page,
    totalCount: total,
    pageSize: listing.pageSize,
    onPageChange: listing.setPage,
    enabled: !isLoading,
  });

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title="AML/CFT Findings & Remediation"
          actions={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh findings"
              title="Refresh findings"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          }
        />

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load findings</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardContent className="space-y-3 pt-4">
            <RegisterToolbar
              search={q}
              onSearchChange={setQ}
              searchPlaceholder="Search entity, reference or title…"
              trailing={
                <span className="text-sm text-muted-foreground">
                  {isLoading ? 'Loading…' : `${total} finding${total === 1 ? '' : 's'}`}
                </span>
              }
            >
              <Select value={severity} onValueChange={(v) => listing.setFilter('severity', v)}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  {severities.map((s) => (
                    <SelectItem key={s} value={s}>
                      {titleCase(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={view} onValueChange={(v) => listing.setFilter('view', v)}>
                <SelectTrigger className="h-9 w-56">
                  <SelectValue placeholder="Loop stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All findings</SelectItem>
                  <SelectItem value="open">Open findings</SelectItem>
                  <SelectItem value="response_due">Management response overdue</SelectItem>
                  <SelectItem value="remediation_overdue">Remediation overdue</SelectItem>
                  <SelectItem value="escalated">Escalated to attention</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={sort.key}
                onValueChange={(key) => listing.setSort({ key, direction: sort.direction })}
              >
                <SelectTrigger className="h-9 w-44" aria-label="Sort by">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      Sort: {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                aria-label={sort.direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
                title={sort.direction === 'asc' ? 'Ascending — switch to descending' : 'Descending — switch to ascending'}
                onClick={() =>
                  listing.setSort({ key: sort.key, direction: sort.direction === 'asc' ? 'desc' : 'asc' })
                }
              >
                {sort.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            </RegisterToolbar>

            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No AML/CFT findings match the current filters.
              </p>
            ) : (
              <div className="space-y-3">
                {visible.map((f) => {
                  const responseOverdue = f.response_target_date && f.response_target_date < today && !f.response_at;
                  return (
                    <div
                      key={f.id}
                      className={`rounded-lg border p-4 ${focus === f.id ? 'ring-2 ring-primary' : ''}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-semibold">{f.reference}</div>
                          <div className="text-sm font-semibold">{f.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {f.entity_name || '—'} · {titleCase(f.finding_category)}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={ratingTone(f.severity)}>
                            {titleCase(f.severity)}
                          </Badge>
                          <Badge variant="outline" className={statusTone(f.status)}>
                            {titleCase(f.status)}
                          </Badge>
                          {f.assessment_id ? (
                            <Button asChild size="sm" variant="outline">
                              <Link to={`/supervision/aml/assessments/${f.assessment_id}`}>
                                Assessment
                                <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          ) : null}
                          <Button asChild size="sm">
                            <Link to={`/supervision/findings/${f.id}`}>
                              Open finding
                              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-4">
                        <div>
                          <div className="uppercase tracking-wide text-muted-foreground">Issued</div>
                          <div className="font-mono">{fmtDate(f.issued_at)}</div>
                        </div>
                        <div>
                          <div className="uppercase tracking-wide text-muted-foreground">Response state</div>
                          <Badge variant="outline" className={responseOverdue ? RED : statusTone(f.response_state)}>
                            {responseOverdue ? 'Response overdue' : titleCase(f.response_state)}
                          </Badge>
                        </div>
                        <div>
                          <div className="uppercase tracking-wide text-muted-foreground">Finding due</div>
                          <div className={`font-mono ${f.due_date && f.due_date < today && !f.closed_at ? 'text-destructive' : ''}`}>
                            {fmtDate(f.due_date)}
                          </div>
                        </div>
                        <div>
                          <div className="uppercase tracking-wide text-muted-foreground">Validation</div>
                          <div>{titleCase(f.validation_conclusion)}</div>
                        </div>
                      </div>

                      <div className="mt-3 border-t pt-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Remediation actions ({(f.remediation ?? []).length})
                        </div>
                        {(f.remediation ?? []).length === 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            No remediation action has been recorded against this finding.
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-2">
                            {(f.remediation ?? []).map((a: any) => {
                              const overdue =
                                a.target_date && a.target_date < today && !['EFFECTIVE', 'CLOSED'].includes((a.status ?? '').toUpperCase());
                              return (
                                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-2 text-xs">
                                  <span className="min-w-0 flex-1 truncate">{a.description || a.reference}</span>
                                  <span className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className={overdue ? RED : statusTone(a.status)}>
                                      {overdue ? 'Overdue' : titleCase(a.status)}
                                    </Badge>
                                    {a.effectiveness ? (
                                      <Badge variant="outline" className={a.effectiveness === 'EFFECTIVE' ? EMERALD : AMBER}>
                                        {titleCase(a.effectiveness)}
                                      </Badge>
                                    ) : null}
                                    {a.escalated_attention_id ? (
                                      <Badge variant="outline" className={RED}>
                                        Escalated
                                      </Badge>
                                    ) : null}
                                    <span className="font-mono text-muted-foreground">{fmtDate(a.target_date)}</span>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}
                <PaginationBar
                  totalCount={total}
                  page={effectivePage}
                  pageSize={listing.pageSize}
                  onPageChange={listing.setPage}
                  onPageSizeChange={listing.setPageSize}
                  alwaysShowCount
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
