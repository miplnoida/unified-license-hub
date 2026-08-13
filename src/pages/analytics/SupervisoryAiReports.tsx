/**
 * Supervisory AI Reports hub.
 *
 * One place to see every AI-assisted analysis already stored across the
 * supervisory lifecycle. This page reads only — it never generates AI output,
 * never changes a status and never records a regulatory decision. Accepting,
 * rejecting or escalating an insight stays in AI Insight Review; every report
 * here links back to the source record where the official action is taken.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Sparkles,
  Search,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  FileText,
  Clock,
  Info,
  Flag,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateTime } from '@/lib/datetime';
import {
  DEFAULT_FILTERS,
  useSupervisoryAiReportById,
  useSupervisoryAiReportEntityOptions,
  useSupervisoryAiReportFacets,
  useSupervisoryAiReportSources,
  useSupervisoryAiReports,
  type ReportFilters,
} from '@/hooks/useSupervisoryAiReports';
import {
  FRESHNESS_LABEL,
  HUB_DISCLAIMER,
  HUB_MODULE_LABEL,
  LIFECYCLE_GROUPS,
  REVIEW_STATUS_LABEL,
  TIME_RANGES,
  analysisTypeLabel,
  rangeBounds,
  reportStateBadge,
  subjectLabel,
  type HubModule,
  type SupervisoryAiReport,
  type TimeRange,
} from '@/lib/ai/reportHub';
import { AiReportDetailDrawer } from '@/components/ai/AiReportDetailDrawer';
import { EntityCoverageView } from '@/components/ai-reports/EntityCoverageView';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const ALL_MODULES = Object.keys(HUB_MODULE_LABEL) as HubModule[];

function ReportCard({ report, onOpen }: { report: SupervisoryAiReport; onOpen: () => void }) {
  const stateBadge = reportStateBadge(report.reportState);
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-xs">
            {HUB_MODULE_LABEL[report.module]}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {analysisTypeLabel(report.analysisType)}
          </Badge>
          {report.flagged && (
            <Badge variant="destructive" className="gap-1 text-xs">
              <Flag className="h-3 w-3" />
              Flagged for review
            </Badge>
          )}
          {report.freshness === 'outdated' && (
            <Badge variant="outline" className="border-amber-500 text-xs text-amber-600">
              {FRESHNESS_LABEL.outdated}
            </Badge>
          )}
          {report.limitedEvidence && (
            <Badge variant="outline" className="text-xs">
              Limited evidence
            </Badge>
          )}
          {stateBadge && (
            <Badge variant="outline" className="text-xs">
              {stateBadge}
            </Badge>
          )}
        </div>

        <div>
          <p className="font-semibold leading-snug text-foreground">{subjectLabel(report)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Prepared {formatDateTime(report.generatedAt)}
            {report.periodKey ? ` · Period ${report.periodKey}` : ''}
            {report.reviewStatus && REVIEW_STATUS_LABEL[report.reviewStatus]
              ? ` · ${REVIEW_STATUS_LABEL[report.reviewStatus]}`
              : ''}
          </p>
        </div>

        {report.summary && (
          <p className="line-clamp-3 text-sm text-muted-foreground">{report.summary}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={onOpen}>
            <FileText className="h-3.5 w-3.5" />
            View report
          </Button>
          {report.sourceRoute && (
            <Button size="sm" variant="ghost" asChild className="gap-1.5">
              <Link to={report.sourceRoute}>
                <ExternalLink className="h-3.5 w-3.5" />
                {report.sourceActionLabel}
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Entity picker over the whole supervised population the user may see — not only
 * entities that already have a report. Entities without an analysis stay
 * selectable so the gap is visible instead of invisible.
 */
function EntityFilter({
  value,
  onChange,
  entities,
  isLoading,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  entities: Array<{ id: string; name: string; count: number }>;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = entities.find((e) => e.id === value);
  const withReports = entities.filter((e) => e.count > 0);
  const withoutReports = entities.filter((e) => e.count === 0);

  const row = (e: { id: string; name: string; count: number }) => (
    <CommandItem
      key={e.id}
      value={`${e.name} ${e.id}`}
      onSelect={() => {
        onChange(e.id === value ? null : e.id);
        setOpen(false);
      }}
    >
      <Check className={cn('mr-2 h-4 w-4', value === e.id ? 'opacity-100' : 'opacity-0')} />
      <span className={cn('flex-1 truncate', e.count === 0 && 'text-muted-foreground')}>{e.name}</span>
      <span className="ml-2 text-xs text-muted-foreground">
        {e.count > 0 ? `${e.count} report${e.count === 1 ? '' : 's'}` : 'none yet'}
      </span>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">
            {isLoading ? 'Loading entities…' : selected ? selected.name : 'All entities'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search entities…" />
          <CommandList>
            <CommandEmpty>No entity matches that name.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all entities"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', value ? 'opacity-0' : 'opacity-100')} />
                All entities
              </CommandItem>
            </CommandGroup>
            {!!withReports.length && (
              <CommandGroup heading="With AI reports">{withReports.map(row)}</CommandGroup>
            )}
            {!!withoutReports.length && (
              <CommandGroup heading="No reports yet">{withoutReports.map(row)}</CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function LoadIssue({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{label}</span>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default function SupervisoryAiReports() {
  const [params, setParams] = useSearchParams();

  const [range, setRange] = useState<TimeRange>((params.get('range') as TimeRange) || '30');
  const [customFrom, setCustomFrom] = useState(params.get('from') ?? '');
  const [customTo, setCustomTo] = useState(params.get('to') ?? '');
  const [filters, setFilters] = useState<ReportFilters>({
    ...DEFAULT_FILTERS,
    modules: params.get('module') ? [params.get('module') as HubModule] : [],
    analysisTypes: params.get('type') ? [params.get('type') as string] : [],
    entityId: params.get('entity'),
    search: params.get('q') ?? '',
  });
  const [selected, setSelected] = useState<SupervisoryAiReport | null>(null);

  const bounds = useMemo(() => rangeBounds(range, customFrom, customTo), [range, customFrom, customTo]);
  const effectiveFilters = useMemo<ReportFilters>(
    () => ({ ...filters, from: bounds.from, to: bounds.to }),
    [filters, bounds],
  );

  const {
    reports,
    latestByVersion,
    counts,
    loadedCount,
    isLoading,
    isError,
    isFetchingNextPage,
    hasMore,
    loadMore,
    retry,
  } = useSupervisoryAiReports(effectiveFilters);

  const facets = useSupervisoryAiReportFacets(effectiveFilters);
  const entityOptions = useSupervisoryAiReportEntityOptions();
  const { data: sourceAvailability } = useSupervisoryAiReportSources();

  /** `?report=` deep link — opens the drawer for an authorised report only. */
  const deepLinkId = params.get('report');
  const { data: deepLinked } = useSupervisoryAiReportById(
    deepLinkId && !selected ? deepLinkId : null,
  );
  useEffect(() => {
    if (deepLinked && !selected) setSelected(deepLinked);
  }, [deepLinked, selected]);

  /** Keep useful filters in the URL so the view is shareable. */
  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.modules[0]) next.set('module', filters.modules[0]);
    if (filters.analysisTypes[0]) next.set('type', filters.analysisTypes[0]);
    if (filters.entityId) next.set('entity', filters.entityId);
    if (filters.search.trim()) next.set('q', filters.search.trim());
    if (range !== '30') next.set('range', range);
    if (range === 'custom' && customFrom) next.set('from', customFrom);
    if (range === 'custom' && customTo) next.set('to', customTo);
    if (selected) next.set('report', selected.id);
    setParams(next, { replace: true });
  }, [filters, range, customFrom, customTo, selected, setParams]);

  const set = useCallback(<K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setRange('30');
    setCustomFrom('');
    setCustomTo('');
  };

  const anyFilterActive =
    !!filters.modules.length ||
    !!filters.analysisTypes.length ||
    !!filters.entityId ||
    !!filters.search.trim() ||
    !!filters.confidence ||
    !!filters.freshness ||
    range !== 'all';

  const noSourceAvailable =
    sourceAvailability && Object.values(sourceAvailability).every((v) => !v);

  const selectedEntityName =
    entityOptions.entities.find((e) => e.id === filters.entityId)?.name ?? null;

  const kpiValue = (value?: number) => {
    if (isError) return 'Counts incomplete';
    if (isLoading || counts === null) return 'Calculating…';
    return String(value ?? 0);
  };

  const renderList = (list: SupervisoryAiReport[]) => {
    if (isLoading) {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      );
    }
    if (!list.length) {
      return (
        <Card>
          <CardContent className="p-8 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
            {anyFilterActive ? (
              <>
                <p className="mt-3 font-medium text-foreground">No reports match the current filters</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try widening the date range or clearing the other filters.
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                  Clear filters
                </Button>
              </>
            ) : (
              <>
                <p className="mt-3 font-medium text-foreground">
                  {noSourceAvailable
                    ? 'No AI reports are available to you'
                    : 'No AI reports have been generated yet'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reports appear here once an officer generates an analysis in a module.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((r) => (
          <ReportCard key={`${r.source}-${r.id}`} report={r} onOpen={() => setSelected(r)} />
        ))}
      </div>
    );
  };

  const loadMoreRow = hasMore ? (
    <div className="flex flex-col items-center gap-1.5 pt-2">
      <Button variant="outline" onClick={() => loadMore()} disabled={isFetchingNextPage}>
        {isFetchingNextPage ? 'Loading…' : 'Load older reports'}
      </Button>
      {counts && (
        <p className="text-xs text-muted-foreground">
          Showing {loadedCount} of {counts.total} reports
        </p>
      )}
    </div>
  ) : null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Supervisory AI Reports"
          description="View AI analyses and reports across supervisory modules. Read-only — decisions stay in the source modules."
        />

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">{HUB_DISCLAIMER}</AlertDescription>
        </Alert>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            {range === 'all'
              ? 'Showing all available reports.'
              : `Showing reports prepared: ${TIME_RANGES.find((r) => r.value === range)?.label.toLowerCase()}.`}
          </span>
          {range !== 'all' && (
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setRange('all')}>
              Show all available
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Reports available', value: counts?.total },
            { label: 'Prepared in last 7 days', value: counts?.recent },
            { label: 'May be outdated', value: counts?.outdated },
            { label: 'Limited evidence', value: counts?.limited },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{kpiValue(s.value)}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {isError && (
          <LoadIssue
            label="The report list could not be loaded. This is a loading problem, not an empty library."
            onRetry={retry}
          />
        )}
        {entityOptions.isError && (
          <LoadIssue
            label="The entity list could not be loaded. The reports below are unaffected."
            onRetry={entityOptions.retry}
          />
        )}
        {facets.isError && (
          <LoadIssue
            label="Filter options (entities and analysis types) could not be loaded. The reports below are unaffected."
            onRetry={facets.retry}
          />
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Narrow down the list</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={filters.search}
                    onChange={(e) => set('search', e.target.value)}
                    placeholder="Title, summary, entity or reference"
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Area of work</Label>
                <Select
                  value={filters.modules[0] ?? 'all'}
                  onValueChange={(v) => set('modules', v === 'all' ? [] : [v as HubModule])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All areas</SelectItem>
                    {ALL_MODULES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {HUB_MODULE_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Type of analysis</Label>
                <Select
                  value={filters.analysisTypes[0] ?? 'all'}
                  onValueChange={(v) => set('analysisTypes', v === 'all' ? [] : [v])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {facets.analysisTypes.map((t) => (
                      <SelectItem key={t.type} value={t.type}>
                        {analysisTypeLabel(t.type)} ({t.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Prepared</Label>
                <Select value={range} onValueChange={(v) => setRange(v as TimeRange)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_RANGES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {range === 'custom' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">From</Label>
                    <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">To (whole day included)</Label>
                    <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Entity</Label>
                <EntityFilter
                  value={filters.entityId}
                  onChange={(id) => set('entityId', id)}
                  entities={entityOptions.entities}
                  isLoading={entityOptions.isLoading}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Evidence confidence</Label>
                <Select
                  value={filters.confidence ?? 'all'}
                  onValueChange={(v) => set('confidence', v === 'all' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any confidence</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="limited">Limited</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Freshness</Label>
                <Select
                  value={filters.freshness ?? 'all'}
                  onValueChange={(v) => set('freshness', v === 'all' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    <SelectItem value="current">Current</SelectItem>
                    <SelectItem value="outdated">May be outdated</SelectItem>
                    <SelectItem value="unknown">Freshness unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="include-failed"
                  checked={filters.includeFailed}
                  onCheckedChange={(v) => set('includeFailed', v)}
                />
                <Label htmlFor="include-failed" className="text-sm font-normal">
                  Include analyses that did not complete
                </Label>
              </div>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="lifecycle">
          <TabsList>
            <TabsTrigger value="lifecycle">By lifecycle stage</TabsTrigger>
            <TabsTrigger value="module">By area of work</TabsTrigger>
            <TabsTrigger value="recent">Most recent</TabsTrigger>
            <TabsTrigger value="entity">Entity view</TabsTrigger>
          </TabsList>

          <TabsContent value="lifecycle" className="mt-4 space-y-6">
            {LIFECYCLE_GROUPS.map((group) => {
              const list = latestByVersion.filter((r) => group.modules.includes(r.module));
              const total = group.modules.reduce((n, m) => n + (counts?.byModule[m] ?? 0), 0);
              if (!isLoading && !list.length) return null;
              return (
                <div key={group.key} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">{group.label}</h2>
                    <Badge variant="secondary">{total}</Badge>
                  </div>
                  {renderList(list)}
                </div>
              );
            })}
            {!isLoading && !latestByVersion.length && renderList([])}
            {loadMoreRow}
          </TabsContent>

          <TabsContent value="module" className="mt-4 space-y-6">
            {ALL_MODULES.map((m) => {
              const list = latestByVersion.filter((r) => r.module === m);
              if (!list.length) return null;
              return (
                <div key={m} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">{HUB_MODULE_LABEL[m]}</h2>
                    <Badge variant="secondary">{counts?.byModule[m] ?? list.length}</Badge>
                  </div>
                  {renderList(list)}
                </div>
              );
            })}
            {!isLoading && !latestByVersion.length && renderList([])}
            {loadMoreRow}
          </TabsContent>

          <TabsContent value="recent" className="mt-4 space-y-4">
            {renderList(reports)}
            {loadMoreRow}
          </TabsContent>

          <TabsContent value="entity" className="mt-4 space-y-4">
            <EntityCoverageView
              entityId={filters.entityId}
              entityName={selectedEntityName}
              onOpen={(r) => setSelected(r)}
            />
          </TabsContent>
        </Tabs>

        {reports.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Earlier versions of an analysis are listed inside each report.
          </p>
        )}

        <AiReportDetailDrawer
          report={selected}
          onOpenChange={(open) => !open && setSelected(null)}
          onSelectHistory={(r) => setSelected(r)}
        />
      </div>
    </DashboardLayout>
  );
}
