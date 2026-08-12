/**
 * Supervisory AI Reports hub.
 *
 * One place to see every AI-assisted analysis already stored across the
 * supervisory lifecycle. This page reads only — it never generates AI output,
 * never changes a status and never records a regulatory decision. Every report
 * links back to the source record where the official action is taken.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Search,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  FileText,
  Clock,
  Info,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
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
  useSupervisoryAiReports,
  type ReportFilters,
} from '@/hooks/useSupervisoryAiReports';
import {
  FRESHNESS_LABEL,
  HUB_DISCLAIMER,
  HUB_MODULE_LABEL,
  LIFECYCLE_GROUPS,
  TIME_RANGES,
  analysisTypeLabel,
  providerStateBadge,
  rangeStart,
  subjectLabel,
  type HubModule,
  type SupervisoryAiReport,
  type TimeRange,
} from '@/lib/ai/reportHub';
import { AiReportDetailDrawer } from '@/components/ai/AiReportDetailDrawer';

const ALL_MODULES = Object.keys(HUB_MODULE_LABEL) as HubModule[];

function ReportCard({
  report,
  historyCount,
  onOpen,
}: {
  report: SupervisoryAiReport;
  historyCount: number;
  onOpen: () => void;
}) {
  const stateBadge = providerStateBadge(report.providerState);
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
          {historyCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {historyCount} earlier version{historyCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SourceIssue({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {label} reports could not be loaded, so this list is incomplete. Everything else on this page is unaffected.
        </span>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default function SupervisoryAiReports() {
  const [range, setRange] = useState<TimeRange>('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filters, setFilters] = useState<ReportFilters>({ ...DEFAULT_FILTERS });
  const [selected, setSelected] = useState<SupervisoryAiReport | null>(null);

  const effectiveFilters = useMemo<ReportFilters>(
    () => ({
      ...filters,
      from: rangeStart(range, customFrom),
      to: range === 'custom' && customTo ? new Date(customTo).toISOString() : null,
    }),
    [filters, range, customFrom, customTo],
  );

  const {
    reports,
    grouped,
    counts,
    entities,
    analysisTypes,
    isLoading,
    sources,
    hasMore,
    retry,
  } = useSupervisoryAiReports(effectiveFilters);

  const historyFor = (report: SupervisoryAiReport) =>
    grouped.find((g) => g.latest.id === report.id)?.history ?? [];

  const latestOnly = grouped.map((g) => g.latest);

  const set = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value, page: 0 }));

  const renderList = (list: SupervisoryAiReport[], emptyHint: string) => {
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
            <p className="mt-3 font-medium text-foreground">No AI reports to show</p>
            <p className="mt-1 text-sm text-muted-foreground">{emptyHint}</p>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((r) => (
          <ReportCard
            key={`${r.source}-${r.id}`}
            report={r}
            historyCount={historyFor(r).length}
            onOpen={() => setSelected(r)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supervisory AI Reports"
        description="Every AI-assisted analysis prepared across licensing, prudential, examination, conduct, complaints and enforcement work — in one place."
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">{HUB_DISCLAIMER}</AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Reports available', value: counts.total },
          { label: 'Prepared in last 7 days', value: counts.recent },
          { label: 'May be outdated', value: counts.outdated },
          { label: 'Limited evidence', value: counts.limited },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{isLoading ? '—' : s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {sources.insights.isError && !sources.insights.isLoading && (
        <SourceIssue label="Supervisory advisory" onRetry={() => retry('insights')} />
      )}
      {sources.licensing.isError && !sources.licensing.isLoading && (
        <SourceIssue label="Licensing application" onRetry={() => retry('licensing')} />
      )}
      {sources.fpa.isError && !sources.fpa.isLoading && (
        <SourceIssue label="Fit & Proper screening" onRetry={() => retry('fpa')} />
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
                  {analysisTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {analysisTypeLabel(t)}
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
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Entity</Label>
              <Select
                value={filters.entityId ?? 'all'}
                onValueChange={(v) => set('entityId', v === 'all' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All entities</SelectItem>
                  {entities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilters({ ...DEFAULT_FILTERS });
                setRange('30');
                setCustomFrom('');
                setCustomTo('');
              }}
            >
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
        </TabsList>

        <TabsContent value="lifecycle" className="mt-4 space-y-6">
          {LIFECYCLE_GROUPS.map((group) => {
            const list = latestOnly.filter((r) => group.modules.includes(r.module));
            if (!isLoading && !list.length) return null;
            return (
              <div key={group.key} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">{group.label}</h2>
                  <Badge variant="secondary">{list.length}</Badge>
                </div>
                {renderList(list, 'No analyses have been prepared for this stage yet.')}
              </div>
            );
          })}
          {!isLoading && !latestOnly.length &&
            renderList([], 'No AI analyses match the current filters. Analyses appear here once an officer generates one in a module.')}
        </TabsContent>

        <TabsContent value="module" className="mt-4 space-y-6">
          {ALL_MODULES.map((m) => {
            const list = latestOnly.filter((r) => r.module === m);
            if (!list.length) return null;
            return (
              <div key={m} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">{HUB_MODULE_LABEL[m]}</h2>
                  <Badge variant="secondary">{list.length}</Badge>
                </div>
                {renderList(list, 'No analyses in this area yet.')}
              </div>
            );
          })}
          {!isLoading && !latestOnly.length &&
            renderList([], 'No AI analyses match the current filters.')}
        </TabsContent>

        <TabsContent value="recent" className="mt-4 space-y-4">
          {renderList(reports.slice(0, 60), 'No AI analyses match the current filters.')}
          {hasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}
              >
                Load older reports
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AiReportDetailDrawer
        report={selected}
        history={selected ? historyFor(selected) : []}
        onOpenChange={(open) => !open && setSelected(null)}
        onSelectHistory={(r) => setSelected(r)}
      />
    </div>
  );
}
