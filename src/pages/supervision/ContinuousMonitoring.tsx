/**
 * OS-02 — Continuous Monitoring register (continuous offsite supervision).
 *
 * ONE generic screen for every supervisory domain. There is no monitoring case
 * object: every column is a live derivation of the canonical supervisory record
 * that owns the fact (risk state, approved assessment, reassessment
 * requirement, reporting obligation/filing, signal, attention, engagement,
 * finding, remediation, work item, supervision assignment). The screen never
 * computes supervisory truth, never derives a rating and never invents a due
 * date — `supervisory_monitoring_register` does all of it server-side, under
 * the internal authority boundary and domain/regulator scope, and every row
 * links back to the record it came from.
 */
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/shared/PageHeader';
import { RegisterToolbar } from '@/components/shared/RegisterToolbar';
import { SupervisoryRegister } from '@/components/supervision/SupervisoryRegister';
import { useListingState } from '@/components/shared/listing';
import { useServerPageGuard } from '@/components/shared/listing/useServerPageGuard';
import {
  useSupervisoryMonitoringOptions,
  useSupervisoryMonitoringRegister,
  formatDate,
  humanize,
  type MonitoringRow,
} from '@/hooks/useSupervisoryMonitoring';

const FILTER_KEYS = [
  'domain', 'regulator', 'sector', 'risk', 'attention',
  'reassessment', 'returns', 'engagement', 'team',
];
const opt = (v: string) => (v === 'all' ? null : v);

const RISK_TONE: Record<string, string> = {
  CRITICAL: 'bg-destructive/15 text-destructive border-destructive/30',
  SEVERE: 'bg-destructive/10 text-destructive border-destructive/20',
  HIGH: 'bg-warning/15 text-warning-foreground border-warning/30',
  MEDIUM_HIGH: 'bg-warning/10 text-warning-foreground border-warning/20',
  MEDIUM: 'bg-muted text-foreground border-border',
  LOW: 'bg-success/10 text-success border-success/20',
};

function RiskBadge({ rating }: { rating: string | null | undefined }) {
  if (!rating) {
    return <span className="text-xs text-muted-foreground">Not assessed</span>;
  }
  return (
    <Badge variant="outline" className={RISK_TONE[rating.toUpperCase()] ?? ''}>
      {humanize(rating)}
    </Badge>
  );
}

function ReturnsCell({ row }: { row: MonitoringRow }) {
  const r = row.returns;
  if (r.state === 'NOT_AVAILABLE') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground underline decoration-dotted">Not available</span>
        </TooltipTrigger>
        <TooltipContent>{r.reason ?? 'No canonical reporting obligation for this entity'}</TooltipContent>
      </Tooltip>
    );
  }
  const tone = r.state === 'MISSING' ? 'text-destructive'
    : r.state === 'LATE' ? 'text-warning-foreground' : 'text-foreground';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`text-xs ${tone}`}>
          {humanize(r.state)}
          <span className="ml-1 font-mono text-muted-foreground">
            {r.filed ?? 0}/{r.periods_due ?? 0}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5 text-xs">
          <div>Periods due {r.periods_due ?? 0} · filed {r.filed ?? 0} · late {r.late ?? 0} · missing {r.missing ?? 0}</div>
          <div>Latest period {r.latest_period_label ?? formatDate(r.latest_period_end)}</div>
          <div className="text-muted-foreground">Obligation coverage is recorded at entity level, not per domain.</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function DueCell({ row }: { row: MonitoringRow }) {
  const re = row.reassessment;
  if (!re) {
    return <span className="text-xs text-muted-foreground">No requirement</span>;
  }
  if (!re.due_date) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs underline decoration-dotted">Not scheduled</span>
        </TooltipTrigger>
        <TooltipContent>Requirement open ({humanize(re.trigger_kind) || 'trigger not recorded'}) with no due date recorded.</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <span className={`font-mono text-xs ${re.is_overdue ? 'text-destructive' : ''}`}>
      {formatDate(re.due_date)}
      {re.is_overdue ? ' (overdue)' : ''}
    </span>
  );
}

function FlagsCell({ row }: { row: MonitoringRow }) {
  if (row.flags.length === 0) {
    return <span className="text-xs text-muted-foreground">None</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {row.flags.slice(0, 3).map((f, i) => (
        <Tooltip key={`${f.code}-${i}`}>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[11px]">{f.label}</Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">
              <div>{f.reason}</div>
              <div className="text-muted-foreground">Source: {f.source_object}{f.source_date ? ` · ${formatDate(f.source_date)}` : ''}</div>
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
      {row.flags.length > 3 ? (
        <Badge variant="outline" className="text-[11px]">+{row.flags.length - 3}</Badge>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'bad' }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`font-mono text-xl ${tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-warning-foreground' : ''}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ContinuousMonitoring() {
  const navigate = useNavigate();
  const listing = useListingState({
    defaultSort: { key: 'risk', direction: 'desc' },
    filterKeys: FILTER_KEYS,
  });
  const options = useSupervisoryMonitoringOptions();
  const f = listing.filters;

  const query = useSupervisoryMonitoringRegister({
    domain: opt(f.domain),
    regulatorId: opt(f.regulator),
    sectorId: opt(f.sector),
    risk: opt(f.risk),
    attentionState: opt(f.attention),
    reassessmentState: opt(f.reassessment),
    returnsState: opt(f.returns),
    engagementType: opt(f.engagement),
    teamId: opt(f.team),
    search: listing.search,
    sortKey: listing.sort?.key ?? 'risk',
    sortDirection: listing.sort?.direction ?? 'desc',
    page: listing.page,
    pageSize: listing.pageSize,
  });

  const total = query.data?.total_count ?? 0;
  const guard = useServerPageGuard({
    page: listing.page, pageSize: listing.pageSize, totalCount: total,
    setPage: listing.setPage, ready: query.isSuccess,
  });
  const o = options.data;
  const s = query.data?.summary;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Continuous Monitoring"
        actions={
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {s ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Kpi label="Entity–domain rows" value={s.rows_in_scope} />
          <Kpi label="Reassessment required" value={s.reassessment_required} tone="warn" />
          <Kpi label="Reassessment overdue" value={s.reassessment_overdue} tone="bad" />
          <Kpi
            label="Entities with filing issues (entity level)"
            value={s.entities_with_filing_issues}
            tone="warn"
          />
          <Kpi label="Open attention" value={s.open_attention} />
          <Kpi label="Open findings" value={s.open_findings} />
          <Kpi label="Remediation overdue" value={s.overdue_remediation} tone="bad" />
        </div>
      ) : null}

      <RegisterToolbar
        search={listing.search}
        onSearchChange={listing.setSearch}
        searchPlaceholder="Search entity name or licence reference"
      >
        <Select value={f.domain} onValueChange={(v) => listing.setFilter('domain', v)}>
          <SelectTrigger className="h-9 w-[11rem]" aria-label="Supervisory domain"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All domains</SelectItem>
            {(o?.domains ?? []).map((d) => <SelectItem key={d} value={d}>{humanize(d)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.risk} onValueChange={(v) => listing.setFilter('risk', v)}>
          <SelectTrigger className="h-9 w-[10rem]" aria-label="Residual risk"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any risk</SelectItem>
            {(o?.risk_ratings ?? []).map((r) => <SelectItem key={r} value={r}>{humanize(r)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.reassessment} onValueChange={(v) => listing.setFilter('reassessment', v)}>
          <SelectTrigger className="h-9 w-[12rem]" aria-label="Reassessment state"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any reassessment state</SelectItem>
            {(o?.reassessment_states ?? []).map((r) => <SelectItem key={r} value={r}>{humanize(r)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.returns} onValueChange={(v) => listing.setFilter('returns', v)}>
          <SelectTrigger className="h-9 w-[11rem]" aria-label="Filing state"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any filing state</SelectItem>
            {(o?.returns_states ?? []).map((r) => <SelectItem key={r} value={r}>{humanize(r)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.attention} onValueChange={(v) => listing.setFilter('attention', v)}>
          <SelectTrigger className="h-9 w-[11rem]" aria-label="Attention state"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any attention state</SelectItem>
            {(o?.attention_states ?? []).map((r) => <SelectItem key={r} value={r}>{humanize(r)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.engagement} onValueChange={(v) => listing.setFilter('engagement', v)}>
          <SelectTrigger className="h-9 w-[13rem]" aria-label="Engagement type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any engagement</SelectItem>
            {(o?.engagement_types ?? []).map((r) => <SelectItem key={r} value={r}>{humanize(r)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.sector} onValueChange={(v) => listing.setFilter('sector', v)}>
          <SelectTrigger className="h-9 w-[12rem]" aria-label="Sector"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sectors</SelectItem>
            {(o?.sectors ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.regulator} onValueChange={(v) => listing.setFilter('regulator', v)}>
          <SelectTrigger className="h-9 w-[12rem]" aria-label="Regulator"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All regulators</SelectItem>
            {(o?.regulators ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.team} onValueChange={(v) => listing.setFilter('team', v)}>
          <SelectTrigger className="h-9 w-[12rem]" aria-label="Supervision team"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {(o?.teams ?? []).filter((t) => t.id).map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name ?? 'Unnamed team'}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </RegisterToolbar>

      {query.error ? (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <div className="text-sm font-medium">This register could not be read.</div>
              <div className="text-xs text-muted-foreground">{(query.error as Error).message}</div>
            </div>
          </CardContent>
        </Card>
      ) : query.isLoading || options.isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : total === 0 && !guard.repairing ? (
        <Card>
          <CardContent className="p-6 text-sm">
            <div className="font-medium">No monitored entity matches these filters.</div>
            <div className="text-xs text-muted-foreground">
              Clear the search or a filter. Visibility follows your supervisory domain and regulator scope.
            </div>
          </CardContent>
        </Card>
      ) : (
        <SupervisoryRegister<MonitoringRow>
          rows={query.data?.rows ?? []}
          getRowId={(r) => r.row_key}
          identifierHeader="Entity"
          identifier={(r) => ({
            reference: r.business_reference ?? r.entity_name,
            subject: r.business_reference ? r.entity_name : undefined,
            copyValue: r.entity_id,
            copyLabel: 'Copy entity id',
          })}
          identifierSortable
          identifierSortKey="entity"
          mode="server"
          sort={listing.sort}
          onSortToggle={listing.toggleSort}
          paged
          page={guard.validPage}
          pageSize={listing.pageSize}
          totalCount={total}
          onPageChange={listing.setPage}
          onPageSizeChange={listing.setPageSize}
          showRecordCount
          onRowClick={(r) => navigate(r.route)}
          columns={[
            { id: 'domain', header: 'Domain', cell: (r) => <span className="text-sm">{humanize(r.domain_code)}</span> },
            { id: 'sector', header: 'Sector', priority: 3, cell: (r) => (
              <span className="text-xs">{r.sector_name ?? <span className="text-muted-foreground">Not recorded</span>}</span>) },
            { id: 'risk', header: 'Residual risk', sortable: true, sortKey: 'risk', cell: (r) => (
              <div className="space-y-0.5">
                <RiskBadge rating={r.risk?.residual_rating} />
                {r.risk?.trend ? <div className="text-[11px] text-muted-foreground">{humanize(r.risk.trend)}</div> : null}
              </div>) },
            { id: 'last_assessment', header: 'Last assessment', sortable: true, sortKey: 'last_assessment', priority: 2, cell: (r) => (
              r.assessment ? (
                <div className="space-y-0.5">
                  <div className="font-mono text-xs">{formatDate(r.assessment.assessment_date)}</div>
                  <div className="text-[11px] text-muted-foreground">{r.assessment.reference ?? humanize(r.assessment.assessment_type)}</div>
                </div>
              ) : <span className="text-xs text-muted-foreground">None approved</span>) },
            { id: 'due_date', header: 'Reassessment due', sortable: true, sortKey: 'due_date', cell: (r) => <DueCell row={r} /> },
            { id: 'returns', header: 'Filings', priority: 2, cell: (r) => <ReturnsCell row={r} /> },
            { id: 'engagement', header: 'Engagement', priority: 3, cell: (r) => (
              r.engagement ? (
                <div className="space-y-0.5">
                  <div className="text-xs">{humanize(r.engagement.engagement_type)}</div>
                  <div className="text-[11px] text-muted-foreground">{r.engagement.reference ?? humanize(r.engagement.stage)}</div>
                </div>
              ) : <span className="text-xs text-muted-foreground">None open</span>) },
            { id: 'open_findings', header: 'Findings / remediation', align: 'right', sortable: true, sortKey: 'open_findings', cell: (r) => (
              <div className="space-y-0.5">
                <div className="font-mono text-xs">{r.findings.open}{r.findings.material > 0 ? ` (${r.findings.material} material)` : ''}</div>
                <div className={`font-mono text-[11px] ${r.remediation.overdue > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {r.remediation.open} open · {r.remediation.overdue} overdue
                </div>
              </div>) },

            { id: 'flags', header: 'Monitoring flags', cell: (r) => <FlagsCell row={r} /> },
            { id: 'owner', header: 'Owner', priority: 3, cell: (r) => (
              <div className="space-y-0.5 text-xs">
                <div>{r.owner.lead_supervisor_name ?? <span className="text-muted-foreground">Unassigned</span>}</div>
                {r.owner.team_name ? <div className="text-[11px] text-muted-foreground">{r.owner.team_name}</div> : null}
              </div>) },
            { id: 'as_of', header: 'As of', sortable: true, sortKey: 'as_of', priority: 3, cell: (r) => (
              <span className="font-mono text-xs">{formatDate(r.freshness.risk_updated_at ?? r.freshness.entity_updated_at)}</span>) },
          ]}
          actions={(r) => (
            <div className="flex items-center gap-1">
              {r.work.next_item ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); navigate(r.work.next_item!.route); }}
                >
                  {r.work.next_item.work_type_label}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); navigate(r.route); }}
              >
                <ArrowUpRight className="mr-1 h-4 w-4" />
                Open
              </Button>
            </div>
          )}
        />
      )}

      {query.data?.coverage?.length ? (
        <p className="text-xs text-muted-foreground">
          Filing coverage is derived from entity-level reporting obligations, so it is not attributed per supervisory domain.
        </p>
      ) : null}
    </div>
  );
}
