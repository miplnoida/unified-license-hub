/**
 * AML/CFT work queue.
 *
 * Reads the single enterprise work model through the paged AML/CFT contract
 * (`aml_work_queue_page`). Nothing is counted, filtered, ordered or prioritised
 * in the browser: the page, the authoritative total, the scope counts, the
 * overdue/due-soon flags and the route to open each item all come from the read
 * model, and the default order keeps supervisory queue semantics (overdue,
 * priority, due date, deterministic identifier).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { SupervisoryRegister } from '@/components/supervision/SupervisoryRegister';
import { RegisterToolbar } from '@/components/shared/RegisterToolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ArrowUpRight, RefreshCw } from 'lucide-react';
import { WORK_SCOPES, WORK_SCOPE_LABELS, type WorkScope } from '@/hooks/useSupervisoryWork';
import { useAmlWorkQueuePage, useAmlWorkTypes } from '@/hooks/useAmlSupervision';
import { useListingState } from '@/components/shared/listing';
import { RED, fmtDate, ratingTone, statusTone, titleCase } from '@/lib/amlLabels';

const SCOPE_LABELS: Record<WorkScope, string> = { ...WORK_SCOPE_LABELS, ALL: 'All AML/CFT work' };

export default function AmlWorkQueue() {
  const [scope, setScope] = useState<WorkScope>('MY_WORK');
  // `queue` is the read model's own supervisory order; an explicit column sort
  // replaces it server-side.
  const listing = useListingState({
    defaultSort: { key: 'queue', direction: 'asc' },
    filterKeys: ['type'],
  });
  const q = listing.search;
  const setQ = listing.setSearch;
  const workType = listing.filters.type;
  const { data, isLoading, error, refetch, isFetching } = useAmlWorkQueuePage({
    page: listing.page,
    pageSize: listing.pageSize,
    sortKey: listing.sort?.key ?? null,
    sortDirection: listing.sort?.direction ?? 'asc',
    search: q,
    scope,
    workType: workType === 'all' ? null : workType,
  });
  const { data: workTypes = [] } = useAmlWorkTypes();

  const items = data?.rows ?? [];
  const total = data?.totalCount ?? 0;
  const counts = data?.counts ?? {};

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title="AML/CFT Work Queue"
          actions={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh queue"
              title="Refresh queue"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          }
        />

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load the work queue</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="flex flex-wrap gap-1.5">
              {WORK_SCOPES.map((s) => (
                <Button key={s} size="sm" variant={scope === s ? 'default' : 'outline'} onClick={() => setScope(s)}>
                  {SCOPE_LABELS[s]}
                  {counts[s] != null ? (
                    <span className="ml-1.5 font-mono text-xs opacity-80">{counts[s]}</span>
                  ) : null}
                </Button>
              ))}
            </div>

            <RegisterToolbar
              search={q}
              onSearchChange={setQ}
              searchPlaceholder="Search entity, reference or item…"
              trailing={
                <span className="text-sm text-muted-foreground">
                  {isLoading ? 'Loading…' : `${total} item${total === 1 ? '' : 's'}`}
                </span>
              }
            >
              <Select value={workType} onValueChange={(v) => listing.setFilter('type', v)}>
                <SelectTrigger className="h-9 w-56">
                  <SelectValue placeholder="Work type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All work types</SelectItem>
                  {workTypes.map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      {label || titleCase(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </RegisterToolbar>

            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No AML/CFT work items in this scope.
              </p>
            ) : (
              <SupervisoryRegister
                rows={items}
                getRowId={(i) => i.work_key}
                caption="AML/CFT work queue"
                mode="server"
                totalCount={total}
                sort={listing.sort}
                onSortChange={listing.setSort}
                identifierSortable
                paged
                page={listing.page}
                pageSize={listing.pageSize}
                onPageChange={listing.setPage}
                onPageSizeChange={listing.setPageSize}
                showRecordCount
                identifierHeader="Reference / item"
                identifier={(i) => ({
                  reference: i.reference || i.work_type_label || titleCase(i.work_type),
                  copyValue: i.work_key,
                  copyLabel: 'Copy work key',
                  subject: <span className="truncate">{i.title || i.entity_name || '—'}</span>,
                })}
                columns={[
                  {
                    id: 'work_type',
                    header: 'Work type',
                    sortable: true,
                    sortAccessor: (i) => i.work_type_label || i.work_type,
                    dataType: 'text',
                    cell: (i) => (
                      <>
                        <div className="text-sm">{i.work_type_label || titleCase(i.work_type)}</div>
                        {i.decision_point ? (
                          <Badge variant="outline" className="mt-1 text-[10px]">
                            Decision
                          </Badge>
                        ) : null}
                      </>
                    ),
                  },
                  {
                    id: 'state',
                    header: 'State / priority',
                    sortable: true,
                    sortAccessor: (i) => i.priority,
                    dataType: 'risk',
                    cell: (i) => (
                      <>
                        <Badge variant="outline" className={statusTone(i.work_state)}>
                          {titleCase(i.work_state)}
                        </Badge>
                        <Badge variant="outline" className={`ml-1 ${ratingTone(i.priority)}`}>
                          {titleCase(i.priority)}
                        </Badge>
                      </>
                    ),
                  },
                  {
                    id: 'due',
                    header: 'Due',
                    sortable: true,
                    sortAccessor: (i) => i.due_date,
                    dataType: 'date',
                    cell: (i) => (
                      <>
                        <span
                          className={`font-mono ${i.is_overdue ? 'font-semibold text-destructive' : ''}`}
                        >
                          {fmtDate(i.due_date)}
                        </span>
                        {i.is_overdue ? (
                          <Badge variant="outline" className={`ml-1 ${RED}`}>
                            Overdue
                          </Badge>
                        ) : i.is_due_soon ? (
                          <Badge variant="outline" className="ml-1">
                            Due soon
                          </Badge>
                        ) : null}
                      </>
                    ),
                  },
                  {
                    id: 'entity',
                    header: 'Entity / owner',
                    priority: 3,
                    sortable: true,
                    sortAccessor: (i) => i.entity_name,
                    dataType: 'text',
                    cell: (i) => (
                      <>
                        <div className="text-sm">{i.entity_name || '—'}</div>
                        <div className="text-muted-foreground">
                          {i.is_unassigned ? 'Unassigned' : i.assignment_note || 'Assigned'}
                        </div>
                      </>
                    ),
                  },
                ]}
                actions={(i) => (
                  <Button asChild size="sm" variant="outline">
                    <Link to={i.route}>
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
