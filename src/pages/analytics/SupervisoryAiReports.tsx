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
  Library,
  CalendarClock,
  BellRing,
  ShieldQuestion,
  SlidersHorizontal,
  ChevronDown,
  Building2,
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  ATTENTION_BUCKETS,
  HUB_DISCLAIMER,
  HUB_MODULE_LABEL,
  LIFECYCLE_GROUPS,
  REVIEW_STATUS_LABEL,
  TIME_RANGES,
  analysisTypeLabel,
  needsAttention,
  rangeBounds,
  reportStatusChips,
  subjectLabel,
  type HubModule,
  type ReportStatusTone,
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
import { cn } from '@/lib/utils';

const ALL_MODULES = Object.keys(HUB_MODULE_LABEL) as HubModule[];

const STATUS_TONE: Record<ReportStatusTone, string> = {
  urgent: 'border-destructive/40 bg-destructive/10 text-destructive',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  neutral: 'border-border bg-muted text-muted-foreground',
};

function ReportCard({ report, onOpen }: { report: SupervisoryAiReport; onOpen: () => void }) {
  const chips = reportStatusChips(report);
  return (
    <Card className="border-border/60 shadow-none transition-all hover:border-border hover:shadow-md">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div>
          <p className="font-semibold leading-snug text-foreground">{subjectLabel(report)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {analysisTypeLabel(report.analysisType)} · {HUB_MODULE_LABEL[report.module]}
          </p>
        </div>

        {report.summary && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{report.summary}</p>
        )}

        <p className="text-xs text-muted-foreground">
          Prepared {formatDateTime(report.generatedAt)}
          {report.periodKey ? ` · Period ${report.periodKey}` : ''}
          {report.reviewStatus && REVIEW_STATUS_LABEL[report.reviewStatus]
            ? ` · ${REVIEW_STATUS_LABEL[report.reviewStatus]}`
            : ''}
        </p>

        {!!chips.length && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <Badge key={c.key} variant="outline" className={cn('text-xs font-medium', STATUS_TONE[c.tone])}>
                {c.label}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button size="sm" className="gap-1.5" onClick={onOpen}>
            <FileText className="h-3.5 w-3.5" />
            View Report
          </Button>
          {report.sourceRoute && (
            <Button
              size="sm"
              variant="link"
              asChild
              className="h-auto gap-1 p-0 text-xs text-muted-foreground hover:text-foreground"
            >
              <Link to={report.sourceRoute}>
                {report.sourceActionLabel}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Organisation picker over the whole supervised population the user may see —
 * not only entities that already have a report. Entities without an analysis
 * stay selectable so the gap is visible instead of invisible.
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
            {isLoading ? 'Loading organisations…' : selected ? selected.name : 'All organisations'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search organisations…" />
          <CommandList>
            <CommandEmpty>No organisation matches that name.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all organisations"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', value ? 'opacity-0' : 'opacity-100')} />
                All organisations
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
  const [tab, setTab] = useState('all');
  const [areaGrouping, setAreaGrouping] = useState<'area' | 'lifecycle'>('area');
  const [moreOpen, setMoreOpen] = useState(false);

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

  const advancedActive =
    (filters.confidence ? 1 : 0) +
    (filters.freshness ? 1 : 0) +
    (filters.includeFailed ? 1 : 0);

  const noSourceAvailable =
    sourceAvailability && Object.values(sourceAvailability).every((v) => !v);

  const selectedEntityName =
    entityOptions.entities.find((e) => e.id === filters.entityId)?.name ?? null;

  const attentionList = useMemo(() => reports.filter(needsAttention), [reports]);

  const kpiValue = (value?: number) => {
    if (isError) return 'Counts incomplete';
    if (isLoading || counts === null) return 'Calculating…';
    return String(value ?? 0);
  };

  const summaryCards = [
    {
      key: 'total',
      label: 'Total Reports',
      icon: Library,
      value: kpiValue(counts?.total),
      hint: 'across all supervisory areas',
      onClick: undefined as undefined | (() => void),
    },
    {
      key: 'recent',
      label: 'New This Week',
      icon: CalendarClock,
      value: kpiValue(counts?.recent),
      hint: 'prepared in the last 7 days',
      onClick: undefined as undefined | (() => void),
    },
    {
      key: 'attention',
      label: 'Needs Attention',
      icon: BellRing,
      value: isLoading ? 'Calculating…' : String(attentionList.length),
      hint: 'flagged, outdated or incomplete (of reports loaded)',
      onClick: () => setTab('attention'),
    },
    {
      key: 'limited',
      label: 'Limited Evidence',
      icon: ShieldQuestion,
      value: kpiValue(counts?.limited),
      hint: 'based on thin underlying data',
      onClick: undefined as undefined | (() => void),
    },
  ];

  const renderList = (list: SupervisoryAiReport[]) => {
    if (isLoading) {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      );
    }
    if (!list.length) {
      return (
        <Card className="border-border/60 shadow-none">
          <CardContent className="p-10 text-center">
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
      <div className="grid gap-4 md:grid-cols-2">
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

  const areaGroups =
    areaGrouping === 'area'
      ? ALL_MODULES.map((m) => ({
          key: m,
          label: HUB_MODULE_LABEL[m],
          list: latestByVersion.filter((r) => r.module === m),
          total: counts?.byModule[m] ?? null,
        }))
      : LIFECYCLE_GROUPS.map((g) => ({
          key: g.key,
          label: g.label,
          list: latestByVersion.filter((r) => g.modules.includes(r.module)),
          total: g.modules.reduce((n, m) => n + (counts?.byModule[m] ?? 0), 0),
        }));

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="space-y-2">
          <PageHeader
            title="Supervisory AI Reports"
            description="Review AI-assisted supervisory reports across regulated entities and supervisory areas."
          />
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{HUB_DISCLAIMER}</span>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((s) => {
            const Icon = s.icon;
            const clickable = !!s.onClick;
            return (
              <Card
                key={s.key}
                onClick={s.onClick}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={(e) => {
                  if (clickable && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    s.onClick?.();
                  }
                }}
                className={cn(
                  'border-border/60 shadow-none',
                  clickable && 'cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/40',
                )}
              >
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                    <p className="text-sm font-medium">{s.label}</p>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-foreground">{s.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {isError && (
          <LoadIssue
            label="The report list could not be loaded. This is a loading problem, not an empty library."
            onRetry={retry}
          />
        )}
        {entityOptions.isError && (
          <LoadIssue
            label="The organisation list could not be loaded. The reports below are unaffected."
            onRetry={entityOptions.retry}
          />
        )}
        {facets.isError && (
          <LoadIssue
            label="Filter options could not be loaded. The reports below are unaffected."
            onRetry={facets.retry}
          />
        )}

        <Card className="border-border/60 shadow-none">
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <div className="space-y-1.5">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={filters.search}
                    onChange={(e) => set('search', e.target.value)}
                    placeholder="Organisation, reference or title"
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Organisation</Label>
                <EntityFilter
                  value={filters.entityId}
                  onChange={(id) => set('entityId', id)}
                  entities={entityOptions.entities}
                  isLoading={entityOptions.isLoading}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Supervisory Area</Label>
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
                <Label className="text-xs">Date</Label>
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

              <div className="space-y-1.5">
                <Label className="text-xs">Analysis Type</Label>
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
            </div>

            <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    More filters
                    {!moreOpen && advancedActive > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {advancedActive}
                      </Badge>
                    )}
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', moreOpen && 'rotate-180')} />
                  </Button>
                </CollapsibleTrigger>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {range === 'all'
                      ? 'Showing all available reports'
                      : `Showing: ${TIME_RANGES.find((r) => r.value === range)?.label.toLowerCase()}`}
                  </span>
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearFilters}>
                    Clear filters
                  </Button>
                </div>
              </div>

              <CollapsibleContent className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Evidence Quality</Label>
                  <Select
                    value={filters.confidence ?? 'all'}
                    onValueChange={(v) => set('confidence', v === 'all' ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any quality</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="limited">Limited</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Report Status</Label>
                  <Select
                    value={filters.freshness ?? 'all'}
                    onValueChange={(v) => set('freshness', v === 'all' ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any status</SelectItem>
                      <SelectItem value="current">Current</SelectItem>
                      <SelectItem value="outdated">May be outdated</SelectItem>
                      <SelectItem value="unknown">Status unknown</SelectItem>
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

                <div className="flex items-center gap-2 md:col-span-2">
                  <Switch
                    id="include-failed"
                    checked={filters.includeFailed}
                    onCheckedChange={(v) => set('includeFailed', v)}
                  />
                  <Label htmlFor="include-failed" className="text-sm font-normal">
                    Show incomplete analyses
                  </Label>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All Reports</TabsTrigger>
            <TabsTrigger value="attention" className="gap-1.5">
              Needs Attention
              {!isLoading && attentionList.length > 0 && (
                <Badge variant="secondary">{attentionList.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="organisation">By Organisation</TabsTrigger>
            <TabsTrigger value="area">By Supervisory Area</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6 space-y-4">
            {renderList(reports)}
            {loadMoreRow}
          </TabsContent>

          <TabsContent value="attention" className="mt-6 space-y-8">
            {isLoading ? (
              renderList([])
            ) : !attentionList.length ? (
              <Card className="border-border/60 shadow-none">
                <CardContent className="p-10 text-center">
                  <p className="font-medium text-foreground">Nothing needs attention right now</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    No loaded report is flagged, outdated, incomplete or based on limited evidence in this date
                    range.
                  </p>
                </CardContent>
              </Card>
            ) : (
              ATTENTION_BUCKETS.map((bucket) => {
                const list = attentionList.filter(bucket.match);
                if (!list.length) return null;
                return (
                  <div key={bucket.key} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-foreground">{bucket.label}</h2>
                      <Badge variant="secondary">{list.length}</Badge>
                    </div>
                    {renderList(list)}
                  </div>
                );
              })
            )}
            {loadMoreRow}
          </TabsContent>

          <TabsContent value="organisation" className="mt-6 space-y-4">
            <Card className="border-border/60 shadow-none">
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs">
                    <Building2 className="h-3.5 w-3.5" />
                    Choose an organisation
                  </Label>
                  <EntityFilter
                    value={filters.entityId}
                    onChange={(id) => set('entityId', id)}
                    entities={entityOptions.entities}
                    isLoading={entityOptions.isLoading}
                  />
                </div>
                <p className="text-xs text-muted-foreground sm:max-w-xs">
                  Pick a regulated entity to see which supervisory areas already have a report and where a gap
                  remains.
                </p>
              </CardContent>
            </Card>

            <EntityCoverageView
              entityId={filters.entityId}
              entityName={selectedEntityName}
              onOpen={(r) => setSelected(r)}
            />
          </TabsContent>

          <TabsContent value="area" className="mt-6 space-y-8">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-muted-foreground">Group by</Label>
              <Select value={areaGrouping} onValueChange={(v) => setAreaGrouping(v as 'area' | 'lifecycle')}>
                <SelectTrigger className="h-8 w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="area">Supervisory area</SelectItem>
                  <SelectItem value="lifecycle">Lifecycle stage</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {areaGroups.map((group) => {
              if (!isLoading && !group.list.length) return null;
              return (
                <div key={group.key} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">{group.label}</h2>
                    <Badge variant="secondary">{group.total ?? group.list.length}</Badge>
                  </div>
                  {renderList(group.list)}
                </div>
              );
            })}
            {!isLoading && !latestByVersion.length && renderList([])}
            {loadMoreRow}
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
