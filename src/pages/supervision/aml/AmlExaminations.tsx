import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { AlertTriangle, ArrowUpRight, Filter, RefreshCw } from 'lucide-react';
import { useAmlExaminationStages, useAmlExaminationsPage } from '@/hooks/useAmlSupervision';
import { businessActionLabel, isTerminalStage } from '@/lib/examinationWorkflow';
import { engagementLabel } from '@/lib/supervisoryEngagement';
import { useListingState, useServerPageGuard } from '@/components/shared/listing';
import { AMBER, EMERALD, RED, fmtDate, ratingTone, statusTone, titleCase } from '@/lib/amlLabels';

const STAGE_ORDER = [
  'planned',
  'scoping',
  'pre_exam_request',
  'fieldwork',
  'exit_meeting',
  'draft_report',
  'management_response',
  'final_report',
  'remediation',
  'closed',
  'cancelled',
];

/** Next supervisory action for the register — derived from the canonical stage engine. */
function nextAction(stage?: string | null, engagementType?: string | null): string {
  if (isTerminalStage(stage)) return '—';
  const idx = STAGE_ORDER.indexOf(String(stage ?? ''));
  const next = idx >= 0 && idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
  return next ? businessActionLabel(next, engagementType) : '—';
}

export default function AmlExaminations() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const focus = params.get('focus');
  // Default order puts current work first: stage lifecycle ordinal, with closed
  // and cancelled examinations last. Ordering, filtering and paging are all
  // executed by the database.
  const listing = useListingState({
    defaultSort: { key: 'stage', direction: 'asc' },
    filterKeys: ['stage', 'open'],
  });
  const q = listing.search;
  const setQ = listing.setSearch;
  const stage = listing.filters.stage;
  const openOnly = listing.filters.open === 'true';
  const setOpenOnly = (next: boolean) => listing.setFilter('open', next ? 'true' : 'all');

  const { data, isLoading, error, refetch, isFetching } = useAmlExaminationsPage({
    page: listing.page,
    pageSize: listing.pageSize,
    sortKey: listing.sort?.key ?? null,
    sortDirection: listing.sort?.direction ?? 'asc',
    search: q,
    stage: stage === 'all' ? null : stage,
    openOnly,
  });
  const { data: stages = [] } = useAmlExaminationStages();
  const rows = (data?.rows ?? []) as any[];
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

  const open = (id: string) => navigate(`/supervision/examinations/${id}`);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title="AML/CFT Examinations"
          actions={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh examinations"
              title="Refresh examinations"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          }
        />

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load examinations</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardContent className="space-y-3 pt-4">
            <RegisterToolbar
              search={q}
              onSearchChange={setQ}
              searchPlaceholder="Search entity, reference, assessment or plan…"
              trailing={
                <span className="text-sm text-muted-foreground">
                  {isLoading ? 'Loading…' : `${total} examination${total === 1 ? '' : 's'}`}
                </span>
              }
            >
              <Select value={stage} onValueChange={(v) => listing.setFilter('stage', v)}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s} value={s}>
                      {titleCase(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-9"
                variant={openOnly ? 'default' : 'outline'}
                onClick={() => setOpenOnly(!openOnly)}
                aria-pressed={openOnly}
              >
                <Filter className="mr-1.5 h-4 w-4" />
                Open only
              </Button>
            </RegisterToolbar>

            {isLoading || repairing ? (
              <Skeleton className="h-64 w-full" />
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No AML/CFT examinations match the current filters.
              </p>
            ) : (
              <SupervisoryRegister
                rows={rows}
                getRowId={(r) => r.id}
                mode="server"
                totalCount={total}
                caption="AML/CFT examinations"
                onRowClick={(r) => open(r.id)}
                isRowFocused={(r) => focus === r.id}
                identifier={(r) => ({
                  reference: r.reference || '—',
                  copyValue: r.id,
                  copyLabel: 'Copy examination id',
                  subject: (
                    <>
                      <span className="block truncate">{r.entity_name || '—'}</span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {r.title}
                      </span>
                    </>
                  ),
                })}
                sort={listing.sort}
                onSortChange={listing.setSort}
                onSortToggle={listing.toggleSort}
                identifierSortable
                paged
                page={listing.page}
                pageSize={listing.pageSize}
                onPageChange={listing.setPage}
                onPageSizeChange={listing.setPageSize}
                showRecordCount
                columns={[
                  {
                    id: 'type_risk',
                    header: 'Type / risk',
                    sortable: true,
                    sortAccessor: (r) => r.risk_rating,
                    dataType: 'risk',
                    cell: (r) => (
                      <>
                        <div>{engagementLabel(r.engagement_type)}</div>
                        <div className="text-muted-foreground">{titleCase(r.examination_type)}</div>
                        {r.risk_rating ? (
                          <Badge variant="outline" className={`mt-1 ${ratingTone(r.risk_rating)}`}>
                            {titleCase(r.risk_rating)}
                          </Badge>
                        ) : null}
                        <div className="mt-1 max-w-[12rem] text-muted-foreground">
                          {(r.scope_dimensions ?? []).length
                            ? (r.scope_dimensions ?? [])
                                .map((d: any) => titleCase(d.dimension_code))
                                .slice(0, 3)
                                .join(', ')
                            : 'Scope not yet set'}
                          {(r.scope_dimensions ?? []).length > 3
                            ? ` +${(r.scope_dimensions ?? []).length - 3}`
                            : ''}
                        </div>
                      </>
                    ),
                  },
                  {
                    id: 'stage',
                    header: 'Stage / dates',
                    sortable: true,
                    sortAccessor: (r) => r.stage,
                    dataType: 'stage',
                    businessOrder: STAGE_ORDER,
                    cell: (r) => (
                      <>
                        <Badge variant="outline" className={statusTone(r.stage)}>
                          {titleCase(r.stage)}
                        </Badge>
                        {r.reassessment_required ? (
                          <Badge variant="outline" className={`mt-1 block w-fit ${RED}`}>
                            Reassessment required
                          </Badge>
                        ) : null}
                        {r.fieldwork_start || r.fieldwork_end ? (
                          <div className="mt-1 font-mono">
                            {fmtDate(r.fieldwork_start)} → {fmtDate(r.fieldwork_end)}
                          </div>
                        ) : (
                          <div className="mt-1 text-muted-foreground">Fieldwork not scheduled</div>
                        )}
                        <div className="text-muted-foreground">
                          {r.closed_at ? `Closed ${fmtDate(r.closed_at)}` : 'In progress'}
                        </div>
                        <div className="mt-1">Next: {nextAction(r.stage, r.engagement_type)}</div>
                      </>
                    ),
                  },
                  {
                    id: 'workload',
                    header: 'Workload',
                    priority: 2,
                    sortable: true,
                    sortAccessor: (r) => Number(r.open_rfis ?? 0) + Number(r.findings_open ?? 0),
                    dataType: 'number',
                    cell: (r) => (
                      <>
                        <div>
                          RFIs{' '}
                          <span className={r.overdue_rfis ? RED : undefined}>{r.open_rfis ?? 0} open</span>
                          {r.overdue_rfis ? (
                            <span className="text-muted-foreground"> · {r.overdue_rfis} overdue</span>
                          ) : null}
                        </div>
                        <div>
                          Workpapers{' '}
                          <span className={r.workpapers_outstanding ? AMBER : EMERALD}>
                            {r.workpapers_outstanding ?? 0}
                          </span>
                          <span className="text-muted-foreground"> of {r.workpapers_total ?? 0}</span>
                        </div>
                        <div>
                          Findings {r.findings_open ?? 0} open
                          <span className="text-muted-foreground"> of {r.findings_total ?? 0}</span>
                        </div>
                      </>
                    ),
                  },
                  {
                    id: 'provenance',
                    header: 'Provenance / team',
                    priority: 3,
                    sortable: true,
                    sortAccessor: (r) => r.lead_examiner_name,
                    dataType: 'text',
                    cell: (r) => (
                      <>
                        {r.driving_assessment_reference ? (
                          <div className="font-mono">{r.driving_assessment_reference}</div>
                        ) : (
                          <div className="text-muted-foreground">No driving assessment</div>
                        )}
                        <div className="text-muted-foreground">
                          {r.plan_reference ? `Plan ${r.plan_reference}` : 'No plan'}
                          {r.intervention_reference ? ` · ${r.intervention_reference}` : ''}
                        </div>
                        {r.intervention_type ? (
                          <div className="text-muted-foreground">{titleCase(r.intervention_type)}</div>
                        ) : null}
                        <div className="mt-1">{r.lead_examiner_name || 'Unassigned'}</div>
                        <div className="text-muted-foreground">
                          {r.team_size ? `${r.team_size} on team` : 'No team'}
                        </div>
                      </>
                    ),
                  },
                ]}
                actions={(r) => (
                  <Button size="sm" variant="outline" onClick={() => open(r.id)}>
                    Open <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
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
