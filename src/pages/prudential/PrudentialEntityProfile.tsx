import { formatBaseMoney } from '@/lib/money';
import { useParams, Link } from 'react-router-dom';
import { objectRoute } from '@/lib/routes/objectRoutes';
import { useEntityHistoricalProfile, useEvaluateStressForReturn, useEntityAuditHistory } from '@/hooks/usePrudentialSupervision';
import { usePeerSnapshot } from '@/hooks/usePrudentialConfig';
import { usePeerMinPeers } from '@/hooks/usePeerSettings';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { History, Download, ChevronLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreatePrudentialActionDialog } from '@/components/prudential/CreatePrudentialActionDialog';
import { CreatePrudentialEscalationDialog } from '@/components/prudential/CreatePrudentialEscalationDialog';
import { PrudentialEntityHistoryDrawer } from '@/components/prudential/PrudentialEntityHistoryDrawer';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { authorizedExport } from '@/lib/rbac/authorizedExport';
import { useLicenseeGroupMembership } from '@/hooks/useFinancialGroups';
import { EwiPanel } from '@/components/prudential/EwiPanel';
import { readPeerState, RATIO_RESULT_STATE_LABEL, deriveRatioResultState } from '@/lib/prudentialPhase2';
import { EntityExaminationsTab } from '@/components/prudential/examination/EntityExaminationsTab';
import { AdvisoryAiPanel } from '@/components/prudential/AdvisoryAiPanel';
import { SupervisoryAiPanel } from '@/components/ai/SupervisoryAiPanel';
import { AiReportsTab } from '@/components/ai/report/AiReportsTab';

import { RiskScoreTab } from '@/components/prudential/RiskScoreTab';

import { severityLabel, severityTone, worstSeverity, isEscalatable } from '@/lib/prudentialSeverity';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import { useUserDisplayNames, actorLabel } from '@/hooks/useUserDisplayNames';
import {
  isOpenPrudentialAction,
  isOpenPrudentialEscalation,
  isOverduePrudentialAction,
} from '@/lib/supervision/canonicalStatusPredicates';
import {
  humanizeToken,

  stressSeverityLabel,

  returnStatusLabel,
  isSubmittedReturnStatus,
  isRatedAssessmentStatus,
  assessmentStatusLabel,
  actionTypeLabel,
  actionStatusLabel,
  escalationTypeLabel,
  escalationStatusLabel,
  auditObjectLabel,
  auditActionLabel,
  groupMemberRoleLabel,
  consolidationTreatmentLabel,
  formatObservedValue,
} from '@/lib/prudentialLabels';


function formatRatio(value: any, fmt?: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  switch ((fmt || '').toLowerCase()) {
    case 'percent':
    case 'percentage':
      return `${(n * 100).toFixed(2)}%`;
    case 'multiple':
    case 'ratio':
      return `${n.toFixed(2)}x`;
    case 'currency':
      return formatBaseMoney(n);
    default:
      return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
}

function toCsv(rows: Array<Record<string, any>>): string {
  if (!rows.length) return '';
  const headerSet = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
  const headers = Array.from(headerSet);
  const esc = (v: any) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

function downloadCsv(name: string, rows: Array<Record<string, any>>) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PrudentialEntityProfile() {
  const { id } = useParams();
  const { data, isLoading, refetch } = useEntityHistoricalProfile(id);
  const evalStress = useEvaluateStressForReturn();
  const audit = useEntityAuditHistory(id);
  const auditActorNames = useUserDisplayNames(
    ((audit.data as any[]) || []).map((a: any) => a.user_id),
  );

  const [createAction, setCreateAction] = useState<any>(null);
  const [createEscalation, setCreateEscalation] = useState<any>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hiddenRatios, setHiddenRatios] = useState<Set<string>>(new Set());
  const [ratioPoint, setRatioPoint] = useState<{ period: string; ratioKey: string; value: number } | null>(null);
  const [ratioYear, setRatioYear] = useState<string>('');
  const [ratioQuarter, setRatioQuarter] = useState<string>('all');

  const periodMeta = (p: string): { year: string; quarter: string } => {
    if (!p) return { year: 'unassigned', quarter: 'unassigned' };
    const d = new Date(p);
    if (isNaN(d.getTime())) return { year: 'unassigned', quarter: 'unassigned' };
    return { year: String(d.getUTCFullYear()), quarter: `Q${Math.floor(d.getUTCMonth() / 3) + 1}` };
  };

  const ratioLabels = useMemo(() => {
    const m: Record<string, { label: string; fmt?: string }> = {};
    (data?.ratios || []).forEach((r: any) => {
      if (!m[r.ratio_key]) m[r.ratio_key] = { label: r.label || r.ratio_key, fmt: r.display_format };
    });
    return m;
  }, [data?.ratios]);

  const ratioTrend = useMemo(() => {
    if (!data?.ratios) return [] as any[];
    const byPeriod: Record<string, any> = {};
    const returnsById: Record<string, any> = Object.fromEntries((data.returns || []).map((r: any) => [r.id, r]));
    (data.ratios || []).forEach((r: any) => {
      const rf = returnsById[r.return_id];
      const key = rf?.period_end_date || r.computed_at;
      byPeriod[key] = { period: key, ...(byPeriod[key] || {}), [r.ratio_key]: Number(r.value) };
    });
    return Object.values(byPeriod).sort((a: any, b: any) => String(a.period).localeCompare(String(b.period)));
  }, [data]);

  const [breachYear, setBreachYear] = useState<string>('');
  const [breachQuarter, setBreachQuarter] = useState<string>('all');

  const breachPeriodInfo = useMemo(() => {
    const returnsById: Record<string, any> = Object.fromEntries((data?.returns || []).map((r: any) => [r.id, r]));
    const withPeriod = (data?.breaches || []).map((b: any) => {
      const rf = returnsById[b.return_id];
      const ped = rf?.period_end_date ? new Date(rf.period_end_date) : null;
      const year = ped ? String(ped.getUTCFullYear()) : 'unassigned';
      const quarter = ped ? `Q${Math.floor(ped.getUTCMonth() / 3) + 1}` : 'unassigned';
      return { breach: b, year, quarter };
    });
    const years = Array.from(new Set(withPeriod.map((x) => x.year))) as string[];
    years.sort((a, b) => (a === 'unassigned' ? 1 : b === 'unassigned' ? -1 : b.localeCompare(a)));
    return { withPeriod, years };
  }, [data?.breaches, data?.returns]);

  const defaultYear = breachPeriodInfo.years[0] || '';
  const activeYear = breachYear || defaultYear;

  const visibleBreaches = useMemo(() => {
    return breachPeriodInfo.withPeriod
      .filter((x) => (activeYear ? x.year === activeYear : true))
      .filter((x) => (breachQuarter === 'all' ? true : x.quarter === breachQuarter))
      .map((x) => x.breach);
  }, [breachPeriodInfo, activeYear, breachQuarter]);

  if (isLoading || !data?.entity) return <DashboardLayout><div>Loading…</div></DashboardLayout>;
  const e: any = data.entity;
  const latestAssess = data.assessments?.[0];
  // Overview must distinguish supervisory facts from work-in-progress:
  // only submitted/validated returns and rated assessments count.
  const latestSubmittedReturn = (data.returns || []).find((r: any) =>
    isSubmittedReturnStatus(r.workflow_status || r.status),
  );
  const latestDraftReturn = (data.returns || []).find((r: any) =>
    !isSubmittedReturnStatus(r.workflow_status || r.status),
  );
  const latestRatedAssess = (data.assessments || []).find((a: any) => isRatedAssessmentStatus(a.status));

  // DCI-01: shared canonical predicates — identical definition to the
  // prudential work queue and the executive dashboard.
  const openActions = (data.actions || []).filter((a: any) => isOpenPrudentialAction(a.status));
  const overdueActions = openActions.filter((a: any) => isOverduePrudentialAction(a.status));
  const openEsc = (data.escalations || []).filter((es: any) => isOpenPrudentialEscalation(es.status));
  const worstBreachSev = worstSeverity(
    (data.breaches || []).map((b: any) => b.risk_level || b.severity || b.level),
  );

  // ---- Advisory AI inputs -------------------------------------------------
  // Only facts the deterministic engines have already produced are shared with
  // the advisory layer. Nothing here changes what is displayed above.
  const latestRatioFacts = (() => {
    const byKey: Record<string, any> = {};
    (data.ratios || []).forEach((r: any) => {
      const cur = byKey[r.ratio_key];
      if (!cur || String(r.computed_at || '') > String(cur.computed_at || '')) byKey[r.ratio_key] = r;
    });
    return Object.values(byKey).map((r: any) => ({
      ratio: r.label || r.ratio_key,
      value: formatRatio(r.value, r.display_format),
      calculated_at: r.computed_at ?? null,
    }));
  })();

  const overviewFacts = {
    entity_sector_id: e.sector_id ?? null,
    latest_submitted_return_period: latestSubmittedReturn?.period_end_date ?? null,
    latest_rating: latestRatedAssess?.overall_rating ?? null,
    worst_breach_severity: worstBreachSev ? severityLabel(worstBreachSev) : null,
    // DCI-01: both figures named explicitly so "breach count" can never be
    // read as the dashboard's open (unacknowledged) breach KPI.
    current_breach_count: (data.breaches || []).length,
    unacknowledged_breach_count: (data.breaches || []).filter((b: any) => !b.acknowledged_at).length,
    breaches_by_severity: (data.breaches || []).reduce((acc: Record<string, number>, b: any) => {
      const key = severityLabel(b.risk_level || b.severity || b.level) || 'Unclassified';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    open_actions: openActions.length,
    overdue_actions: overdueActions.length,
    open_escalations: openEsc.length,
    unresolved_stress_events: (data.stress_events || []).filter((s: any) => !s.resolved_at).length,
    latest_ratios: latestRatioFacts,
  };

  const trendFacts = {
    periods: ratioTrend.slice(-8).map((p: any) => {
      const { period, ...values } = p;
      const labelled: Record<string, number> = {};
      Object.entries(values).forEach(([k, v]) => {
        labelled[ratioLabels[k]?.label ?? k] = v as number;
      });
      return { period, ratios: labelled };
    }),
    breaches: (data.breaches || []).slice(0, 40).map((b: any) => ({
      metric: b.metric_key || b.ratio_key || null,
      severity: severityLabel(b.risk_level || b.severity || b.level) || null,
      observed_value: b.value ?? b.observed_value ?? null,
      threshold_value: b.threshold_value ?? null,
      acknowledged: !!b.acknowledged_at,
    })),
  };



  const exportProfile = async () => {
    await authorizedExport('prudential_supervision', 'export', { entity: e.name });
    const returnsById: Record<string, any> = Object.fromEntries((data.returns || []).map((r: any) => [r.id, r]));
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`${e.name}-ratios-${stamp}.csv`, (data.ratios || []).map((r: any) => {
      const rf = returnsById[r.return_id];
      return {
        ratio_key: r.ratio_key,
        label: r.label || r.ratio_key,
        period_end: rf?.period_end_date ?? '',
        value_raw: r.value,
        value_formatted: formatRatio(r.value, r.display_format),
        display_format: r.display_format ?? '',
        computed_at: r.computed_at ?? '',
      };
    }));
    downloadCsv(`${e.name}-breaches-${stamp}.csv`, (data.breaches || []).map((b: any) => {
      const rf = returnsById[b.return_id];
      return {
        metric_key: b.metric_key || b.ratio_key || '',
        level: b.level || '',
        risk_level: b.risk_level || b.severity || '',
        value: b.value ?? b.observed_value ?? '',
        threshold_value: b.threshold_value ?? '',
        comparator: b.comparator ?? '',
        period_end: rf?.period_end_date ?? '',
        detected_at: b.detected_at ?? '',
      };
    }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
      <div>
        <Button size="sm" variant="outline" asChild>
          <Link to="/prudential/entities"><ChevronLeft className="h-4 w-4 mr-1" />Back to Entities</Link>
        </Button>
      </div>
      {/* EPR-02: this surface is prudential ANALYSIS only. Entity identity, licence
          status and supervisory state live on the canonical Entity 360 profile;
          operational actions are raised from the work queue / case workspaces. */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Prudential analysis</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link to={`/entities/${e.id}?view=prudential`} className="text-primary hover:underline">{e.name}</Link>
            <span>· ratio trends, peer comparison and analytical evidence</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/entities/${e.id}?view=prudential`}>Open Entity 360</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/prudential/work?entity=${e.id}`}>Open work queue</Link>
          </Button>
          <Button data-rbac="prudential_supervision.export" size="sm" variant="outline" onClick={exportProfile}><Download className="h-3 w-3 mr-1" />Export</Button>
          <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}><History className="h-3 w-3 mr-1" />History</Button>
        </div>
      </div>


      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ai-reports">AI Analysis Reports</TabsTrigger>
          <TabsTrigger value="risk">Risk Heatmap</TabsTrigger>

          <TabsTrigger value="returns">Historical Returns</TabsTrigger>

          <TabsTrigger value="ratios">Ratios & Trends</TabsTrigger>
          <TabsTrigger value="breaches">Breaches</TabsTrigger>
          <TabsTrigger value="ewi">Early Warning</TabsTrigger>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="escalations">Escalations</TabsTrigger>
          <TabsTrigger value="examinations">Examinations</TabsTrigger>
          <TabsTrigger value="stress">Stress Events</TabsTrigger>
          <TabsTrigger value="peers">Peer Comparison</TabsTrigger>
          <TabsTrigger value="group">Group Structure</TabsTrigger>
          <TabsTrigger value="audit">Audit History</TabsTrigger>
        </TabsList>

        <TabsContent value="risk">
          <RiskScoreTab entityId={e.id} entityName={e.name} />
        </TabsContent>

        <TabsContent value="ai-reports">
          {/* Read-only presentation of every AI-assisted analysis for this entity.
              Reads existing prudential, examination, complaint and enforcement
              records; changes none of them. */}
          <AiReportsTab
            blocks={[
              {
                id: 'ai-entity-brief',
                label: 'Entity supervisory brief',
                hint: 'cross-module view of risk, examinations, complaints and enforcement',
                node: (
                  <SupervisoryAiPanel
                    module="cross_module"
                    analysisType="entity_supervisory_brief"
                    scope="entity"
                    scopeId={e.id}
                    label={e.name}
                    title="AI entity supervisory brief"
                    actionLabel="Generate brief"
                    description="A single view across risk, examinations, complaints and enforcement for this entity. It changes no rating, finding, case or decision."
                    stalenessFacts={{ entity: e.id, updated_at: (e as any).updated_at ?? null }}
                  />
                ),
              },
              {
                id: 'ai-risk-interpretation',
                label: 'Risk interpretation',
                hint: 'plain-language reading of the supervisory picture',
                node: (
                  <AdvisoryAiPanel
                    analysisType="risk_interpretation"
                    scopeId={e.id}
                    periodKey={latestSubmittedReturn?.period_end_date ?? null}
                    label={e.name}
                    facts={overviewFacts}
                    title="AI-assisted risk interpretation"
                    description="Explains the supervisory picture in plain language. Scores, ratings, breaches and counts remain calculated by the system."
                  />
                ),
              },
              {
                id: 'ai-trend-commentary',
                label: 'Trend commentary',
                hint: 'movement in the charted ratios',
                node: (
                  <AdvisoryAiPanel
                    analysisType="trend_commentary"
                    scopeId={e.id}
                    periodKey={ratioTrend.length ? String((ratioTrend[ratioTrend.length - 1] as any).period) : null}
                    label={e.name}
                    facts={trendFacts}
                    ready={ratioTrend.length > 0}
                    disabledReason="Available once ratios have been computed for at least one period."
                    title="AI-assisted trend commentary"
                    description="Narrative on the movement in the ratios charted under Ratios & Trends. Every ratio value and threshold state is calculated by the system."
                  />
                ),
              },
              {
                id: 'ai-ask-entity',
                label: 'Ask about this entity',
                hint: 'governed question and answer over records you may already see',
                node: (
                  <SupervisoryAiPanel
                    module="cross_module"
                    analysisType="supervisory_query"
                    scope="entity"
                    scopeId={e.id}
                    label={e.name}
                    title="Ask about this entity"
                    actionLabel="Ask"
                    askable
                    description="Answers come only from records you are already permitted to see. Asking a question changes nothing."
                    stalenessFacts={{ entity: e.id, ask: true }}
                  />
                ),
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="overview">
          <div className="grid md:grid-cols-4 gap-3">
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Latest submitted return</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {latestSubmittedReturn ? (
                  <>
                    {formatDateOnly(latestSubmittedReturn.period_end_date)}<br />
                    <Badge variant="outline">{returnStatusLabel(latestSubmittedReturn.workflow_status || latestSubmittedReturn.status)}</Badge>
                  </>
                ) : (
                  <span className="text-muted-foreground">No submitted return</span>
                )}
                {latestDraftReturn && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Draft in progress: {formatDateOnly(latestDraftReturn.period_end_date)}
                  </div>
                )}
              </CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Latest rating</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {latestRatedAssess ? (
                  <>
                    {latestRatedAssess.overall_rating || 'Not rated'}<br />
                    <span className="text-xs text-muted-foreground">{assessmentStatusLabel(latestRatedAssess.status)}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {latestAssess ? `Draft assessment in progress` : 'No assessment'}
                  </span>
                )}
              </CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Worst breach</CardTitle></CardHeader>
              <CardContent className="text-sm">{worstBreachSev ? <Badge variant="outline" className={severityTone(worstBreachSev)}>{severityLabel(worstBreachSev)}</Badge> : '—'}</CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Open actions</CardTitle></CardHeader>
              <CardContent className="text-sm">{openActions.length} <span className="text-destructive">({overdueActions.length} overdue)</span></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Open escalations</CardTitle></CardHeader>
              <CardContent className="text-sm">{openEsc.length}</CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Recent stress events</CardTitle></CardHeader>
              <CardContent className="text-sm">{(data.stress_events || []).filter((s: any) => !s.resolved_at).length}</CardContent></Card>
          </div>
        </TabsContent>



        <TabsContent value="returns">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Return</TableHead><TableHead>Period end</TableHead><TableHead>Submitted</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {data.returns.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell><Link className="text-primary underline" to={objectRoute.returnFiling(r.id)}>{r.unique_id || r.id.slice(0,8)}</Link></TableCell>
                    <TableCell>{formatDateOnly(r.period_end_date)}</TableCell>
                    <TableCell>{formatDateTime(r.submit_date)}</TableCell>
                    <TableCell><Badge variant="outline">{returnStatusLabel(r.workflow_status || r.status)}</Badge></TableCell>

                    <TableCell className="text-right">
                      <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" onClick={async () => { await evalStress.mutateAsync(r.id); refetch(); }}>Evaluate stress</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!data.returns.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No returns.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ratios">
          {(() => {
            const allKeys = ratioTrend.length
              ? (Object.keys(ratioTrend[0] as any).filter((k) => k !== 'period') as string[])
              : [];
            const colorFor = (i: number, total: number) => {
              const palette = ['#3b82f6','#dc2626','#10b981','#f59e0b','#8b5cf6','#ec4899','#0ea5e9','#16a34a','#f97316','#a855f7','#14b8a6','#e11d48','#64748b'];
              if (i < palette.length) return palette[i];
              return `hsl(${Math.round((360 * i) / Math.max(total, 1))}, 65%, 45%)`;
            };
            const toggleKey = (k: string) => setHiddenRatios((prev) => {
              const next = new Set(prev);
              if (next.has(k)) next.delete(k); else next.add(k);
              return next;
            });
            const visibleKeys = allKeys.filter((k) => !hiddenRatios.has(k));
            const handleDotClick = (k: string) => (payload: any) => {
              if (!payload || payload.value == null) return;
              setRatioPoint({ period: payload.payload?.period, ratioKey: k, value: Number(payload.value) });
            };

            const yearsSet = new Set<string>();
            ratioTrend.forEach((row: any) => yearsSet.add(periodMeta(row.period).year));
            const years = Array.from(yearsSet).sort((a, b) => (a === 'unassigned' ? 1 : b === 'unassigned' ? -1 : b.localeCompare(a)));
            const defaultRatioYear = years[0] || '';
            const activeRatioYear = ratioYear || defaultRatioYear;

            const filteredTrend = ratioTrend.filter((row: any) => {
              const { year, quarter } = periodMeta(row.period);
              if (activeRatioYear && year !== activeRatioYear) return false;
              if (ratioQuarter !== 'all' && quarter !== ratioQuarter) return false;
              return true;
            });

            const returnsByIdLocal: Record<string, any> = Object.fromEntries((data.returns || []).map((r: any) => [r.id, r]));
            const filteredRatioRows = (data.ratios || []).filter((r: any) => {
              const rf = returnsByIdLocal[r.return_id];
              const period = rf?.period_end_date || (r.computed_at ? String(r.computed_at).slice(0, 10) : '');
              const { year, quarter } = periodMeta(period);
              if (activeRatioYear && year !== activeRatioYear) return false;
              if (ratioQuarter !== 'all' && quarter !== ratioQuarter) return false;
              return true;
            });

            return (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Ratio trend</CardTitle>
                    <CardDescription>
                      Displays prudential ratios computed from submitted returns over time. Filter by year/quarter, then click a chart point or a table row to view thresholds, breach status, and the source return.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-end gap-3 mb-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Year</Label>
                        <Select value={activeRatioYear || 'none'} onValueChange={(v) => setRatioYear(v === 'none' ? '' : v)}>
                          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Year" /></SelectTrigger>
                          <SelectContent>
                            {years.length === 0 && <SelectItem value="none">—</SelectItem>}
                            {years.map((y) => (
                              <SelectItem key={y} value={y}>{y === 'unassigned' ? 'Unassigned' : y}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Quarter</Label>
                        <Select value={ratioQuarter} onValueChange={setRatioQuarter}>
                          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All quarters</SelectItem>
                            <SelectItem value="Q1">Q1</SelectItem>
                            <SelectItem value="Q2">Q2</SelectItem>
                            <SelectItem value="Q3">Q3</SelectItem>
                            <SelectItem value="Q4">Q4</SelectItem>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="text-xs text-muted-foreground ml-auto">
                        Showing {filteredTrend.length} of {ratioTrend.length} periods
                        {activeRatioYear ? ` · ${activeRatioYear === 'unassigned' ? 'Unassigned' : activeRatioYear}` : ''}
                        {ratioQuarter !== 'all' ? ` · ${ratioQuarter === 'unassigned' ? 'Unassigned' : ratioQuarter}` : ''}
                      </div>
                    </div>
                    {allKeys.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setHiddenRatios(new Set())}>All</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setHiddenRatios(new Set(allKeys))}>None</Button>
                        {allKeys.map((k, i) => {
                          const active = !hiddenRatios.has(k);
                          const color = colorFor(i, allKeys.length);
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => toggleKey(k)}
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs transition ${active ? 'bg-background' : 'bg-muted text-muted-foreground opacity-60'}`}
                              style={active ? { borderColor: color } : undefined}
                            >
                              <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
                              {ratioLabels[k]?.label || k}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ height: 340 }}>
                      {filteredTrend.length && visibleKeys.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={filteredTrend}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            {visibleKeys.map((k) => {
                              const i = allKeys.indexOf(k);
                              const color = colorFor(i, allKeys.length);
                              return (
                                <Line
                                  key={k}
                                  dataKey={k}
                                  name={ratioLabels[k]?.label || k}
                                  stroke={color}
                                  strokeWidth={2}
                                  dot={{ r: 3, cursor: 'pointer' }}
                                  activeDot={{ r: 6, cursor: 'pointer', onClick: (_: any, p: any) => handleDotClick(k)(p) }}
                                />
                              );
                            })}
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="text-sm text-muted-foreground py-8 text-center">
                          {!ratioTrend.length ? 'No ratios computed.' : !visibleKeys.length ? 'No ratios selected.' : 'No ratios for selected period.'}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Card className="mt-3"><CardContent className="pt-4">
                  <Table><TableHeader><TableRow><TableHead>Ratio</TableHead><TableHead>Period</TableHead><TableHead>Value</TableHead><TableHead>Computed</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {filteredRatioRows.slice(0, 200).map((r: any) => {
                        const rf = (data.returns || []).find((x: any) => x.id === r.return_id);
                        const period = rf?.period_end_date || (r.computed_at ? String(r.computed_at).slice(0, 10) : '—');
                        return (
                          <TableRow
                            key={r.id}
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => setRatioPoint({ period, ratioKey: r.ratio_key, value: Number(r.value) })}
                          >
                            <TableCell>{r.label || r.ratio_key}</TableCell>
                            <TableCell>{period}</TableCell>
                            <TableCell className="tabular-nums">{formatRatio(r.value, r.display_format)}</TableCell>
                            <TableCell>{r.computed_at ? new Date(r.computed_at).toLocaleDateString() : '—'}</TableCell>
                          </TableRow>
                        );
                      })}
                      {!filteredRatioRows.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">{data.ratios?.length ? 'No ratios for selected period.' : 'No ratios yet.'}</TableCell></TableRow>}
                    </TableBody></Table>
                </CardContent></Card>
              </>
            );
          })()}

        </TabsContent>



        <TabsContent value="breaches">
          <Card>
            <CardHeader>
              <CardTitle>Breaches</CardTitle>
              <CardDescription>
                Lists threshold breaches detected from prudential returns. Each row shows the metric, severity, observed value, configured threshold, and detection date. Use the Create action / Escalate buttons to initiate supervisory follow-up.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Year</Label>
                  <Select value={activeYear || 'none'} onValueChange={(v) => setBreachYear(v === 'none' ? '' : v)}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Year" /></SelectTrigger>
                    <SelectContent>
                      {breachPeriodInfo.years.length === 0 && <SelectItem value="none">—</SelectItem>}
                      {breachPeriodInfo.years.map((y) => (
                        <SelectItem key={y} value={y}>{y === 'unassigned' ? 'Unassigned' : y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quarter</Label>
                  <Select value={breachQuarter} onValueChange={setBreachQuarter}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All quarters</SelectItem>
                      <SelectItem value="Q1">Q1</SelectItem>
                      <SelectItem value="Q2">Q2</SelectItem>
                      <SelectItem value="Q3">Q3</SelectItem>
                      <SelectItem value="Q4">Q4</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-xs text-muted-foreground ml-auto">
                  Showing {visibleBreaches.length} of {data.breaches.length} breaches
                  {activeYear ? ` · ${activeYear === 'unassigned' ? 'Unassigned' : activeYear}` : ''}
                  {breachQuarter !== 'all' ? ` · ${breachQuarter === 'unassigned' ? 'Unassigned' : breachQuarter}` : ''}
                </div>
              </div>
            <Table><TableHeader><TableRow><TableHead>Metric</TableHead><TableHead>Severity</TableHead><TableHead>Value</TableHead><TableHead>Threshold</TableHead><TableHead>Detected</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {visibleBreaches.map((b: any) => {
                  const sev = b.risk_level || b.severity || b.level;
                  const val = b.value ?? b.observed_value;
                  const metric = b.metric_key || b.ratio_key || '—';
                  const fmt = ratioLabels[metric]?.fmt;
                  return (
                    <TableRow key={b.id}>
                      <TableCell>{ratioLabels[metric]?.label || metric}</TableCell>
                      <TableCell><Badge variant="outline" className={severityTone(sev)}>{severityLabel(sev)}</Badge></TableCell>
                      <TableCell className="tabular-nums">{val != null ? formatRatio(val, fmt) : '—'}</TableCell>
                      <TableCell className="tabular-nums">{b.threshold_value != null ? formatRatio(b.threshold_value, fmt) : '—'}</TableCell>
                      <TableCell>{b.detected_at ? new Date(b.detected_at).toLocaleDateString() : '—'}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button data-rbac="prudential_supervision.create" size="sm" variant="ghost" onClick={() => setCreateAction({
                          entity_id: e.id, source_type: 'return_breach', source_id: b.id,
                          title: `Follow-up on breach: ${metric}`, severity: sev,
                          description: `Breach detected on ${metric} (value ${val}, threshold ${b.threshold_value}).`,
                        })}>Create action</Button>
                        {isEscalatable(sev) && (
                          <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" onClick={() => setCreateEscalation({
                            entity_id: e.id, related_type: 'return', related_id: b.return_id,
                            escalation_type: 'immediate_risk', reason: `${severityLabel(sev)} on ${metric}`,
                          })}>Escalate</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!visibleBreaches.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">{data.breaches.length ? 'No breaches for the selected period.' : 'No breaches.'}</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ewi">
          <EwiPanel
            entityId={e.id}
            availablePeriods={Array.from(new Set(
              (data.returns || [])
                .map((r: any) => r.period_end_date)
                .filter(Boolean),
            )) as string[]}
          />
        </TabsContent>

        <TabsContent value="assessments">
          <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Assessments</CardTitle>
            <Link className="text-primary text-sm underline" to={`/prudential/assessments?entity=${e.id}`}>New assessment</Link>
          </CardHeader><CardContent>
            <Table><TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Rating</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {data.assessments.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>{formatDateOnly(a.period_start)} → {formatDateOnly(a.period_end)}</TableCell>
                    <TableCell><Badge variant="outline">{a.overall_rating || 'Not rated'}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{assessmentStatusLabel(a.status)}</Badge></TableCell>
                    <TableCell className="text-right"><Link className="text-primary underline" to={`/prudential/assessments/${a.id}`}>Open</Link></TableCell>
                  </TableRow>
                ))}

                {!data.assessments.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No assessments.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="actions">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.actions.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.title}</TableCell>
                    <TableCell>{actionTypeLabel(a.action_type)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={severityTone(a.severity)}>{stressSeverityLabel(a.severity)}</Badge>
                    </TableCell>
                    <TableCell><Badge variant="outline">{actionStatusLabel(a.status)}</Badge></TableCell>
                    <TableCell>{formatDateOnly(a.due_date)}</TableCell>
                  </TableRow>
                ))}

                {!data.actions.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No actions.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="escalations">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead>Decision</TableHead><TableHead>Decided</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.escalations.map((es: any) => (
                  <TableRow key={es.id}>
                    <TableCell>{escalationTypeLabel(es.escalation_type)}</TableCell>
                    <TableCell className="max-w-md truncate">{es.reason}</TableCell>
                    <TableCell><Badge variant="outline">{escalationStatusLabel(es.status)}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate">{es.decision || '—'}</TableCell>
                    <TableCell>{formatDateTime(es.decided_at)}</TableCell>
                  </TableRow>
                ))}

                {!data.escalations.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No escalations.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="stress">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Indicator</TableHead><TableHead>Metric</TableHead><TableHead>Observed</TableHead><TableHead>Severity</TableHead><TableHead>Triggered</TableHead><TableHead>Resolved</TableHead></TableRow></TableHeader>
              <TableBody>
                {(data.stress_events || []).map((s: any) => {
                  const ind = s.prudential_stress_indicators;
                  const metricKey = ind?.metric_key || s.metric_key;
                  const metricMeta = metricKey ? ratioLabels[metricKey] : undefined;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{ind?.label || 'Stress indicator'}</TableCell>
                      <TableCell>{metricMeta?.label || (metricKey ? metricKey.replace(/_/g, ' ') : '—')}</TableCell>
                      <TableCell className="tabular-nums">
                        {s.observed_value == null
                          ? '—'
                          : metricMeta?.fmt
                            ? formatRatio(s.observed_value, metricMeta.fmt)
                            : formatObservedValue(s.observed_value)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={severityTone(ind?.severity)}>
                          {ind?.severity ? stressSeverityLabel(ind.severity) : '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(s.triggered_at)}</TableCell>
                      <TableCell>{formatDateTime(s.resolved_at)}</TableCell>
                    </TableRow>
                  );
                })}

                {!(data.stress_events || []).length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No stress events.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="peers">
          <PeerComparisonTab
            entity={e}
            ratios={data.ratios || []}
            returns={data.returns || []}
          />
        </TabsContent>

        <TabsContent value="examinations">
          <EntityExaminationsTab entityId={e.id} />
        </TabsContent>

        <TabsContent value="group">
          <GroupMembershipCard licenseeId={e.id} />
        </TabsContent>


        <TabsContent value="audit">
          <Card><CardContent className="pt-4">
            <div className="text-sm">
              {audit.data?.length ? (
                <Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Object</TableHead><TableHead>Justification</TableHead><TableHead>Actor</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {audit.data.slice(0, 200).map((a: any) => (
                      <TableRow key={a.entry_id}>
                        <TableCell className="whitespace-nowrap">{formatDateTime(a.timestamp)}</TableCell>
                        <TableCell>{auditActionLabel(a.action_type)}</TableCell>
                        <TableCell>{auditObjectLabel(a.object_type)}</TableCell>
                        <TableCell className="max-w-md truncate">{a.justification || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{actorLabel(a.user_id, auditActorNames.data, { isLoading: auditActorNames.isLoading, isError: auditActorNames.isError })}</TableCell>

                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <div className="text-muted-foreground">No audit records.</div>}
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <CreatePrudentialActionDialog open={!!createAction} onOpenChange={(o) => !o && setCreateAction(null)} defaults={createAction} />
      <CreatePrudentialEscalationDialog open={!!createEscalation} onOpenChange={(o) => !o && setCreateEscalation(null)} defaults={createEscalation} />
      <PrudentialEntityHistoryDrawer open={historyOpen} onOpenChange={setHistoryOpen} entityId={e.id} entityName={e.name} />
      <Sheet open={!!ratioPoint} onOpenChange={(o) => !o && setRatioPoint(null)}>
        <SheetContent className="w-[420px] sm:max-w-md overflow-y-auto">
          {ratioPoint && (() => {
            const meta = ratioLabels[ratioPoint.ratioKey];
            const fmt = meta?.fmt;
            const rf = (data.returns || []).find((r: any) => (r.period_end_date || '') === ratioPoint.period);
            const relatedBreaches = (data.breaches || []).filter((b: any) => {
              if ((b.metric_key || b.ratio_key) !== ratioPoint.ratioKey) return false;
              if (!rf) return false;
              return b.return_id === rf.id;
            });
            const stressEvents = (data.stress_events || []).filter((s: any) => {
              const mk = s.metric_key || s.prudential_stress_indicators?.metric_key;
              return mk === ratioPoint.ratioKey && (!rf || s.return_id === rf.id);
            });
            return (
              <>
                <SheetHeader>
                  <SheetTitle>{meta?.label || ratioPoint.ratioKey}</SheetTitle>
                  <SheetDescription>Ratio detail for {ratioPoint.period}</SheetDescription>
                </SheetHeader>
                <div className="mt-4 space-y-4 text-sm">
                  <div className="rounded-md border p-3 space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Metric key</span><span className="font-mono text-xs">{ratioPoint.ratioKey}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Period</span><span>{ratioPoint.period}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Value</span><span className="tabular-nums font-medium">{formatRatio(ratioPoint.value, fmt)}</span></div>
                    {fmt && <div className="flex justify-between"><span className="text-muted-foreground">Format</span><span>{fmt}</span></div>}
                  </div>

                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Thresholds & breach status</div>
                    {relatedBreaches.length ? (
                      <div className="space-y-2">
                        {relatedBreaches.map((b: any) => (
                          <div key={b.id} className="rounded-md border p-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <Badge className={severityTone(b.risk_level || b.level)} variant="outline">
                                {severityLabel(b.risk_level || b.level)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDateTime(b.detected_at, '')}
                              </span>
                            </div>
                            <div className="text-xs">
                              Rule: <span className="tabular-nums">{formatRatio(b.value, fmt)}</span> {b.comparator} <span className="tabular-nums">{formatRatio(b.threshold_value, fmt)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No breaches recorded for this ratio in this period.</div>
                    )}
                  </div>

                  {stressEvents.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Stress events</div>
                      <div className="space-y-1">
                        {stressEvents.map((s: any) => (
                          <div key={s.id} className="rounded-md border p-2 text-xs flex items-center justify-between">
                            <span>{s.prudential_stress_indicators?.label || s.metric_key}</span>
                            <Badge variant="outline" className={severityTone(s.prudential_stress_indicators?.severity)}>
                              {s.prudential_stress_indicators?.severity ? stressSeverityLabel(s.prudential_stress_indicators.severity) : 'Triggered'}
                            </Badge>
                          </div>

                        ))}
                      </div>
                    </div>
                  )}

                  {rf && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Source return</div>
                      <div className="rounded-md border p-2 text-xs space-y-1">
                        <div className="flex justify-between"><span>Reference</span><span className="font-mono">{rf.unique_id || rf.id.slice(0, 8)}</span></div>
                        <div className="flex justify-between"><span>Status</span><Badge variant="outline">{returnStatusLabel(rf.workflow_status || rf.status)}</Badge></div>
                        <Button asChild size="sm" variant="outline" className="w-full mt-2">
                          <Link to={objectRoute.returnFiling(rf.id)} onClick={() => setRatioPoint(null)}>Open return</Link>
                        </Button>

                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
      </div>
    </DashboardLayout>
  );
}

// --- Peer Comparison tab (uses usePeerSnapshot per ratio_key) ---
function PeerComparisonTab({ entity, ratios, returns }: { entity: any; ratios: any[]; returns: any[] }) {
  const returnsById = useMemo(() => {
    const m: Record<string, any> = {};
    (returns || []).forEach((r) => { m[r.id] = r; });
    return m;
  }, [returns]);

  const { data: minPeers } = usePeerMinPeers();

  /** Reporting periods that actually carry computed ratios, newest first. */
  const periods = useMemo(() => {
    const set = new Set<string>();
    (ratios || []).forEach((r: any) => {
      const p = returnsById[r.return_id]?.period_end_date;
      if (p) set.add(p);
    });
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [ratios, returnsById]);

  const [period, setPeriod] = useState<string | null>(null);
  const [manualPeriod, setManualPeriod] = useState(false);
  const [basis, setBasis] = useState<'sector_category' | 'sector'>('sector_category');
  const [peerFacts, setPeerFacts] = useState<Record<string, any>>({});

  const selectedPeriod = period ?? periods[0] ?? null;

  const onSnapshot = useCallback((ratioKey: string, fact: any) => {
    setPeerFacts((prev) => (JSON.stringify(prev[ratioKey]) === JSON.stringify(fact) ? prev : { ...prev, [ratioKey]: fact }));
  }, []);

  // Snapshots are period + basis specific — never mix them across selections.
  useEffect(() => { setPeerFacts({}); }, [selectedPeriod, basis]);

  /** Latest computed ratio per ratio_key inside the selected period only. */
  const rows = useMemo(() => {
    const byKey: Record<string, any> = {};
    (ratios || []).forEach((r: any) => {
      if (returnsById[r.return_id]?.period_end_date !== selectedPeriod) return;
      const cur = byKey[r.ratio_key];
      if (!cur || (r.computed_at && (!cur.computed_at || r.computed_at > cur.computed_at))) byKey[r.ratio_key] = r;
    });
    return Object.values(byKey) as any[];
  }, [ratios, returnsById, selectedPeriod]);

  const allLoaded = rows.length > 0 && rows.every((r) => peerFacts[r.ratio_key] !== undefined);
  const comparable = Object.values(peerFacts).filter((f: any) => f?.peer_comparison_available);
  const maxSampleSeen = Object.values(peerFacts).reduce(
    (acc: number, f: any) => Math.max(acc, Number(f?.peer_sample_size ?? f?.peers_reported ?? 0) || 0),
    0,
  );

  // When the newest period has no publishable peer sample, fall back to the
  // most recent period that does instead of leaving the tab empty.
  useEffect(() => {
    if (manualPeriod || !allLoaded || comparable.length > 0 || !selectedPeriod) return;
    const idx = periods.indexOf(selectedPeriod);
    const next = periods[idx + 1];
    if (next) setPeriod(next);
  }, [manualPeriod, allLoaded, comparable.length, selectedPeriod, periods]);

  if (!periods.length || !selectedPeriod) return (
    <Card><CardContent className="pt-4 text-sm text-muted-foreground">No ratios available for peer comparison.</CardContent></Card>
  );

  const disabledReason = !comparable.length
    ? allLoaded
      ? `No ratio has a publishable peer sample for ${selectedPeriod} on this basis (${maxSampleSeen} peer${maxSampleSeen === 1 ? '' : 's'} reported, minimum ${minPeers ?? 3}). Choose an earlier period or compare at sector level.`
      : 'Checking peer samples for this period…'
    : undefined;

  return (
    <div className="space-y-4">
      <Card><CardContent className="pt-4 flex flex-wrap items-end gap-4">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Reporting period</div>
          <Select
            value={selectedPeriod}
            onValueChange={(v) => { setManualPeriod(true); setPeriod(v); }}
          >
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Peer group</div>
          <Select value={basis} onValueChange={(v) => setBasis(v as any)}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sector_category">Same sector and category</SelectItem>
              <SelectItem value="sector">Same sector (wider sample)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground max-w-xl">
          Peer statistics are published only when at least {minPeers ?? 3} peers reported the same ratio for the
          selected period. Peer institutions are never identified.
        </p>
      </CardContent></Card>

      {!rows.length ? (
        <Card><CardContent className="pt-4 text-sm text-muted-foreground">No computed ratios for {selectedPeriod}.</CardContent></Card>
      ) : (
      <Card><CardContent className="pt-4">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Ratio</TableHead><TableHead>Period</TableHead>
            <TableHead className="text-right">Entity</TableHead>
            <TableHead className="text-right">Peer Median</TableHead>
            <TableHead className="text-right">Peer P90</TableHead>
            <TableHead className="text-right">Peer Range</TableHead>
            <TableHead className="text-right">Sample</TableHead>
            <TableHead className="text-right">Δ vs Median</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <PeerRow
                key={`${basis}|${selectedPeriod}|${r.ratio_key}`}
                row={r}
                entity={entity}
                period={selectedPeriod}
                basis={basis}
                onSnapshot={onSnapshot}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      )}

      <AdvisoryAiPanel
        analysisType="peer_divergence"
        scopeId={entity.id}
        periodKey={selectedPeriod}
        label={entity.name}
        facts={{
          period: selectedPeriod,
          peer_basis: basis === 'sector'
            ? 'Sector peer group, aggregate statistics only'
            : 'Sector and category peer group, aggregate statistics only',
          ratios: comparable,
        }}
        ready={comparable.length > 0}
        disabledReason={disabledReason}
        title="AI-assisted peer comparison commentary"
        description={comparable.length
          ? 'Interprets where this entity sits against published peer aggregates. Peer institutions are never identified and no peer statistic is recalculated.'
          : 'Available once at least one ratio has a publishable peer sample for the selected period.'}
      />
    </div>
  );
}


function PeerRow({ row, entity, period, basis = 'sector_category', onSnapshot }: {
  row: any;
  entity: any;
  period?: string;
  basis?: 'sector_category' | 'sector';
  onSnapshot?: (ratioKey: string, fact: any) => void;
}) {
  // Passing the entity narrows the peer group to its sector + category server-side.
  // Omitting it keeps the wider sector-only group. Either way the RPC refuses to
  // publish statistics below the configured minimum peer sample.
  const peer = usePeerSnapshot(
    row.ratio_key,
    period || null,
    entity.sector_id || null,
    basis === 'sector_category' ? entity.id : null,
  );
  const p = peer.data as any;
  const peerState = readPeerState(p);
  const resultState = deriveRatioResultState(row.value, row.null_reason);
  const entityVal = Number(row.value);
  const delta = peerState === 'OK' && p?.median != null && Number.isFinite(entityVal)
    ? entityVal - Number(p.median) : null;

  useEffect(() => {
    if (!onSnapshot || peer.isLoading) return;
    onSnapshot(row.ratio_key, {
      ratio: row.label || row.ratio_key,
      period: period ?? null,
      peer_comparison_available: peerState === 'OK',
      peers_reported: p?.peer_count ?? p?.count ?? 0,
      entity_value: resultState === 'CALCULATED' ? Number(row.value) : null,
      peer_median: peerState === 'OK' ? p?.median ?? null : null,
      peer_p90: peerState === 'OK' ? p?.p90 ?? null : null,
      peer_min: peerState === 'OK' ? p?.min ?? null : null,
      peer_max: peerState === 'OK' ? p?.max ?? null : null,
      peer_sample_size: peerState === 'OK' ? p?.peer_count ?? p?.count ?? null : null,
      entity_percentile: peerState === 'OK' ? p?.percentile ?? null : null,

      difference_vs_median: delta,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer.isLoading, peerState, resultState, p?.median, p?.p90, p?.min, p?.max, p?.peer_count, p?.percentile, delta]);


  if (peerState !== 'OK') {
    return (
      <TableRow>
        <TableCell className="font-medium">{row.ratio_key}</TableCell>
        <TableCell>{period || '—'}</TableCell>
        <TableCell className="text-right tabular-nums">
          {resultState === 'CALCULATED'
            ? formatRatio(row.value, row.display_format)
            : <span className="text-xs text-muted-foreground">{RATIO_RESULT_STATE_LABEL[resultState]}</span>}
        </TableCell>
        <TableCell colSpan={5} className="text-xs text-muted-foreground">
          {peer.isLoading
            ? 'Loading peer sample…'
            : peerState === 'INSUFFICIENT_PEER_DATA'
              ? `INSUFFICIENT_PEER_DATA — ${p?.peer_count ?? 0} peer(s) reported this ratio for the period (minimum ${p?.min_peers ?? 5}).`
              : 'Peer comparison unavailable.'}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{row.ratio_key}</TableCell>
      <TableCell>{period || '—'}</TableCell>
      <TableCell className="text-right tabular-nums">
        {resultState === 'CALCULATED'
          ? formatRatio(row.value, row.display_format)
          : <span className="text-xs text-muted-foreground">{RATIO_RESULT_STATE_LABEL[resultState]}</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{p?.median != null ? formatRatio(p.median, row.display_format) : '—'}</TableCell>
      <TableCell className="text-right tabular-nums">{p?.p90 != null ? formatRatio(p.p90, row.display_format) : '—'}</TableCell>
      <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
        {p?.min != null && p?.max != null ? `${formatRatio(p.min, row.display_format)} – ${formatRatio(p.max, row.display_format)}` : '—'}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {p?.peer_count ?? p?.count ?? '—'}
        {p?.percentile != null && <span className="block text-xs text-muted-foreground">p{p.percentile}</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {delta != null ? (
          <Badge variant="outline" className={delta >= 0 ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200' : 'bg-amber-500/10 text-amber-700 border-amber-200'}>
            {delta >= 0 ? '+' : ''}{formatRatio(delta, row.display_format)}
          </Badge>
        ) : '—'}
      </TableCell>
    </TableRow>
  );
}

/** Group membership summary with a link into the consolidated group profile. */
function GroupMembershipCard({ licenseeId }: { licenseeId: string }) {
  const { data, isLoading } = useLicenseeGroupMembership(licenseeId);
  if (isLoading) return <Card><CardContent className="pt-4 text-sm text-muted-foreground">Loading group membership…</CardContent></Card>;
  if (!data?.is_member) {
    return <Card><CardContent className="pt-4 text-sm text-muted-foreground">This entity is not part of a supervised financial group.</CardContent></Card>;
  }
  if (data.authorised === false) {
    return <Card><CardContent className="pt-4 text-sm text-muted-foreground">This entity belongs to a financial group you are not authorised to view.</CardContent></Card>;
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{data.group_name}</CardTitle>
        <CardDescription className="font-mono text-xs">{data.group_code}</CardDescription></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Relationship: {groupMemberRoleLabel(data.member_role)}</Badge>
          {data.ownership_percentage != null && (
            <Badge variant="outline">Ownership: {Number(data.ownership_percentage).toFixed(2)}%</Badge>
          )}
          <Badge variant="outline">Treatment: {consolidationTreatmentLabel(data.consolidation_treatment)}</Badge>

        </div>
        <Link className="text-primary underline" to={`/prudential/groups/${data.group_id}`}>
          Open consolidated group risk profile
        </Link>
      </CardContent>
    </Card>
  );
}
