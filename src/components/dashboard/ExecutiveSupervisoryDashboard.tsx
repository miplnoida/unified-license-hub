/**
 * Executive Supervisory Dashboard.
 *
 * Order is deliberate and must not be rearranged casually:
 *   1. Header and snapshot controls
 *   2. Authoritative KPI cards           (recorded facts — neutral / blue)
 *   3. Portfolio charts + deterministic supervisory attention (amber)
 *   4. AI-assisted Executive Briefing    (advisory narrative — purple)
 *   5. Quick actions
 *
 * Every figure comes from ONE canonical, permission-aware server snapshot
 * (`executive_dashboard_snapshot_capture`). The AI workspace re-reads the same
 * snapshot server-side; it never receives a browser-computed count as truth and
 * it never produces a fact, rule outcome, priority or decision.
 */
import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Loader2,
  FileText,
  Award,
  AlertTriangle,
  Gavel,
  ClipboardCheck,
  MessageSquare,
  Shield,
  UserCheck,
  Landmark,
  Megaphone,
  RefreshCw,
  Download,
  Presentation,
  Clock,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { formatBaseMoney } from '@/lib/money';
import { formatDateTime } from '@/lib/datetime';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { useExecutiveSnapshot } from '@/hooks/useExecutiveSnapshot';
import { describeSnapshotScope } from '@/lib/dashboard/executiveSnapshot';
import {
  ExecutiveAiWorkspace,
  type ReviewState,
} from '@/components/dashboard/executive/ExecutiveAiWorkspace';
import {
  CONFIDENTIALITY,
  exportExecutiveBriefing,
  type BriefingExportMode,
  type BriefingNarrative,
} from '@/lib/dashboard/executiveBriefingPdf';
import { ConductExecutivePanel } from '@/components/dashboard/executive/ConductExecutivePanel';
import { SystemicRiskHeatmap, TwinPeaksExecutivePanel } from '@/components/dashboard/executive/SystemicRiskPanels';
import { EnterpriseSupervisoryPosition } from '@/components/dashboard/executive/EnterpriseSupervisoryPosition';

const BAND_COLOR: Record<string, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
  unrated: '#94a3b8',
};

function KpiCard({
  label,
  value,
  sub,
  icon,
  href,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  href?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-red-200 bg-red-50'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50'
        : tone === 'success'
          ? 'border-emerald-200 bg-emerald-50'
          : 'bg-card';
  const inner = (
    <Card className={`${toneClass} transition hover:shadow-md`}>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
  return href ? <Link to={href}>{inner}</Link> : inner;
}

export function ExecutiveSupervisoryDashboard() {
  const { hasPermission } = useUserDynamicPermissions() as any;
  const canExport = !!hasPermission?.('report_management', 'export');

  const [windowDays, setWindowDays] = useState(30);
  const [presentation, setPresentation] = useState(false);
  const [slide, setSlide] = useState(0);
  const [narrative, setNarrative] = useState<BriefingNarrative | null>(null);
  const [exporting, setExporting] = useState(false);

  const {
    snapshot,
    comparison,
    comparisonAvailable,
    movements,
    isLoading,
    isFetching,
    refetch,
    error,
  } = useExecutiveSnapshot({ windowDays, refetchInterval: presentation ? false : 60_000 });

  const bandData = useMemo(
    () =>
      Object.entries(snapshot?.charts?.risk_bands ?? {}).map(([band, count]) => ({
        band: band.charAt(0).toUpperCase() + band.slice(1),
        count: Number(count),
        color: BAND_COLOR[band] ?? BAND_COLOR.unrated,
      })),
    [snapshot],
  );

  const pipelineData = useMemo(
    () =>
      Object.entries(snapshot?.charts?.application_pipeline ?? {})
        .map(([stage, count]) => ({ stage: stage.replace(/_/g, ' ').toLowerCase(), count: Number(count) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    [snapshot],
  );

  const runExport = useCallback(
    async (mode: BriefingExportMode) => {
      if (!snapshot) return;
      setExporting(true);
      try {
        const result = await exportExecutiveBriefing({
          mode,
          snapshot,
          comparison,
          movements,
          narrative,
        });
        toast.success(`${result.filename} — ${result.classification}`);
      } catch (e: any) {
        toast.error(e?.message || 'The export was not authorised');
      } finally {
        setExporting(false);
      }
    },
    [snapshot, comparison, movements, narrative],
  );

  if (isLoading || !snapshot) {
    return (
      <div className="flex items-center justify-center p-8">
        {error ? (
          <p className="text-sm text-muted-foreground">
            The executive snapshot could not be produced: {(error as any)?.message ?? 'unknown error'}
          </p>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin" />
        )}
      </div>
    );
  }

  const k = snapshot.kpis;
  const currency = (v: number) => formatBaseMoney(v);
  const scopeLine = describeSnapshotScope(snapshot);

  /* --------------------------------------------------------------- sections */

  const kpiSection = (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
      <KpiCard label="Open Applications" value={k.open_applications} sub={`${k.total_applications} recorded`} icon={<FileText className="h-4 w-4" />} href="/admin/applications" />
      <KpiCard label="Active Licences" value={k.active_licences} sub={`${k.issued_licences} issued`} icon={<Award className="h-4 w-4" />} href="/licenses" tone="success" />
      <KpiCard label="Unacknowledged Breaches" value={k.open_breaches} sub={`${k.current_breaches} current`} icon={<AlertTriangle className="h-4 w-4" />} href="/supervision/breaches" tone={k.open_breaches > 0 ? 'warning' : 'default'} />
      <KpiCard label="Open Enforcement" value={k.open_enforcement} sub={`${currency(k.penalty_collected)} / ${currency(k.penalty_total)}`} icon={<Gavel className="h-4 w-4" />} href="/enforcement" tone={k.open_enforcement > 0 ? 'danger' : 'default'} />
      <KpiCard label="Critical Risk" value={k.critical_risk_entities} sub={`${k.high_risk_entities} high risk`} icon={<Shield className="h-4 w-4" />} href="/supervision/risk" tone={k.critical_risk_entities > 0 ? 'danger' : 'default'} />
      <KpiCard label="Upcoming Inspections" value={k.upcoming_inspections} icon={<ClipboardCheck className="h-4 w-4" />} href="/inspections" />
      <KpiCard label="Open Complaints" value={k.open_complaints} icon={<MessageSquare className="h-4 w-4" />} href="/complaints" tone={k.open_complaints > 0 ? 'warning' : 'default'} />
      <KpiCard label="F&P Active" value={k.fp_active} icon={<UserCheck className="h-4 w-4" />} href="/fpa/individuals" />
      <KpiCard label="Prudential Actions" value={k.open_prudential_actions} sub={`${k.open_prudential_escalations} escalations open`} icon={<Landmark className="h-4 w-4" />} href="/prudential/actions" tone={k.open_prudential_escalations > 0 ? 'danger' : k.open_prudential_actions > 0 ? 'warning' : 'default'} />
      <KpiCard label="Conduct Alerts" value={k.open_conduct_alerts} icon={<Megaphone className="h-4 w-4" />} href="/conduct/alerts" tone={k.open_conduct_alerts > 0 ? 'warning' : 'default'} />
      <KpiCard label="Return Filings" value={k.return_filings} sub={`${k.returns_pending_review} awaiting review · ${k.returns_overdue} overdue`} icon={<FileText className="h-4 w-4" />} href="/returns/queue" />
      <KpiCard
        label="Penalty Recovery"
        value={k.penalty_total > 0 ? `${Math.round((k.penalty_collected / k.penalty_total) * 100)}%` : '—'}
        sub={`${currency(k.penalty_outstanding)} outstanding`}
        icon={<Gavel className="h-4 w-4" />}
        href="/billing/penalties"
      />
    </div>
  );

  const chartsSection = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Risk Band Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {bandData.every((b) => b.count === 0) ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No current risk ratings.
                <Link className="ml-1 text-primary underline" to="/supervision/risk">
                  Recompute
                </Link>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={bandData} dataKey="count" nameKey="band" cx="50%" cy="50%" outerRadius={90} label>
                    {bandData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Application Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No open applications.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={pipelineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1E3A8A" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deterministic supervisory attention — threshold/rule outcomes, amber. */}
      <Card className="border-amber-300 bg-amber-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            Deterministic supervisory attention
            <Badge variant="outline" className="border-amber-400 bg-white text-[10px] uppercase text-amber-800">
              Rule outcome
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Applications past SLA', value: snapshot.charts.application_sla.breached, href: '/applications/queue' },
            { label: 'Applications due soon', value: snapshot.charts.application_sla.due_soon, href: '/applications/queue' },
            { label: 'Applications unassigned', value: snapshot.charts.application_sla.unassigned, href: '/applications/queue' },
            { label: 'Returns past SLA', value: snapshot.charts.returns.sla_breached, href: '/returns/queue' },
            { label: 'Returns overdue', value: snapshot.charts.returns.overdue, href: '/returns/queue' },
            { label: 'Returns awaiting review', value: snapshot.charts.returns.pending_review, href: '/returns/queue' },
            { label: 'Unacknowledged breaches', value: k.open_breaches, href: '/supervision/breaches' },
            { label: 'Open prudential escalations', value: k.open_prudential_escalations, href: '/prudential/actions' },
          ].map((item) => (
            <Link
              key={item.label}
              to={item.href}
              className="rounded-md border border-amber-200 bg-white p-3 transition hover:shadow-sm"
            >
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className="font-mono text-xl font-semibold text-amber-900">{item.value}</div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <ConductExecutivePanel />
      <div className="grid gap-4 lg:grid-cols-2">
        <SystemicRiskHeatmap />
        <TwinPeaksExecutivePanel />
      </div>
    </div>
  );

  const aiSection = (
    <ExecutiveAiWorkspace
      snapshot={snapshot}
      comparison={comparison}
      comparisonAvailable={comparisonAvailable}
      movements={movements}
      presentation={presentation}
      onNarrativeChange={(info) =>
        setNarrative({
          analysisType: info.analysisType,
          insightId: info.insightId,
          payload: info.payload,
          humanPayload: info.humanPayload,
          reviewState: info.reviewState as ReviewState,
          reviewerId: info.reviewerId,
          reviewedAt: info.reviewedAt,
          generatedAt: info.generatedAt,
        })
      }
    />
  );

  const quickActions = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {[
          ['/supervision/breaches', 'Breach Inbox'],
          ['/enforcement', 'Enforcement Queue'],
          ['/supervision/risk', 'Risk Heatmap'],
          ['/supervision/plans', 'Supervisory Plans'],
          ['/inspections', 'Inspections'],
          ['/prudential/actions', 'Prudential Actions'],
          ['/conduct/alerts', 'Conduct Alerts'],
          ['/complaints/analytics', 'Complaints Analytics'],
        ].map(([href, label]) => (
          <Button key={href} data-rbac="prudential_supervision.view" asChild variant="outline" size="sm">
            <Link to={href}>{label}</Link>
          </Button>
        ))}
        <Button data-rbac="report_management.view" asChild variant="outline" size="sm">
          <Link to="/analytics/ai-insights">AI Insights Hub</Link>
        </Button>
      </CardContent>
    </Card>
  );

  /* ------------------------------------------------------- presentation mode */

  if (presentation) {
    const slides: Array<{ title: string; body: React.ReactNode }> = [
      { title: 'Authoritative position', body: kpiSection },
      { title: 'Portfolio and deterministic attention', body: chartsSection },
      { title: 'AI-assisted Executive Briefing', body: aiSection },
    ];
    const current = slides[Math.min(slide, slides.length - 1)];
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-background p-8 print:static print:p-0">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Executive Supervisory Briefing</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Figures as of {formatDateTime(snapshot.as_of)} · {scopeLine}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {CONFIDENTIALITY}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPresentation(false)} className="print:hidden">
              <X className="mr-2 h-4 w-4" /> Exit presentation mode
            </Button>
          </div>

          <h2 className="text-2xl font-semibold">
            {current.title}
            {current.title.startsWith('AI') && (
              <Badge variant="outline" className="ml-3 border-purple-400 bg-purple-50 align-middle text-[11px] uppercase text-purple-800">
                AI-assisted — advisory only
              </Badge>
            )}
          </h2>
          <div className="text-base">{current.body}</div>

          <div className="flex items-center justify-between border-t pt-4 print:hidden">
            <Button variant="outline" size="sm" disabled={slide === 0} onClick={() => setSlide((s) => s - 1)}>
              Previous section
            </Button>
            <span className="text-xs text-muted-foreground">
              Section {Math.min(slide, slides.length - 1) + 1} of {slides.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={slide >= slides.length - 1}
              onClick={() => setSlide((s) => s + 1)}
            >
              Next section
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ normal view */

  return (
    <div className="space-y-6">
      {/* 1. Header and snapshot controls */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1 border-blue-300 bg-blue-50 text-blue-900">
                <Clock className="h-3 w-3" /> As of {formatDateTime(snapshot.as_of)}
              </Badge>
              <Badge variant="outline">{scopeLine}</Badge>
              <Badge variant="outline" className="font-mono text-[10px]">
                {snapshot.fingerprint.slice(0, 12)}
              </Badge>
              {!comparisonAvailable && <Badge variant="outline">Comparison unavailable</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              All figures are calculated by the platform from its canonical sources.
              {snapshot.unavailable_sources?.length
                ? ` Not visible to you: ${snapshot.unavailable_sources.join(', ')}.`
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setSlide(0); setPresentation(true); }}>
              <Presentation className="mr-2 h-4 w-4" /> Presentation mode
            </Button>
            {canExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={exporting}>
                    <Download className="mr-2 h-4 w-4" /> Export briefing
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Governed PDF export</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => runExport('facts')}>Facts only</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => runExport('draft')}>Draft AI-assisted briefing</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => runExport('approved')}>Approved executive pack</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. Authoritative KPI cards */}
      {kpiSection}

      {/* 2b. Enterprise supervisory position (canonical supervisory spine) */}
      <EnterpriseSupervisoryPosition windowDays={windowDays} />

      {/* 3. Portfolio charts and deterministic supervisory attention */}
      {chartsSection}

      {/* 4. AI-assisted Executive Briefing */}
      {aiSection}

      {/* 5. Quick actions */}
      {quickActions}
    </div>
  );
}
