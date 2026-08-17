import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { authorizedExport } from '@/lib/rbac/authorizedExport';
import {
  Loader2,
  ClipboardList,
  AlertTriangle,
  GitBranch,
  ShieldAlert,
  CheckCircle2,
  Activity,
  Download,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// Resolution statuses that represent a cleared / non-adverse outcome.
// Includes both the fully resolved 'false_positive' and the draft 'false_positive_draft'
// so that in-progress cleared findings are not counted as confirmed adverse findings.
const CLEARED_STATUSES = new Set(['false_positive', 'false_positive_draft']);

// A finding's review is only truly finished once a supervisor has recorded a
// final decision — see FpaManualTaskDetail.tsx's isResolved check. Draft
// statuses (auto-assigned by confidence score) are still backlog, not outcomes.
const FINALIZED_STATUSES = new Set(['confirmed', 'false_positive']);

// Assessment stages that represent the case still being actively worked —
// everything before a final determination or exit. Mirrors FP_ASSESSMENT_STATUS
// in src/lib/fpaAssessmentStatus.ts.
const OPEN_ASSESSMENT_STATUSES = new Set(['draft', 'submitted', 'screening', 'awaiting_committee']);

const ASSESSMENT_STAGES: { key: string; label: string; color: string }[] = [
  { key: 'draft', label: 'Draft', color: '#94A3B8' },
  { key: 'submitted', label: 'Submitted', color: '#2563EB' },
  { key: 'screening', label: 'Screening', color: '#D97706' },
  { key: 'awaiting_committee', label: 'Awaiting Committee', color: '#7C3AED' },
  { key: 'determined', label: 'Determined', color: '#16A34A' },
  { key: 'closed', label: 'Closed', color: '#475569' },
  { key: 'withdrawn', label: 'Withdrawn', color: '#DC2626' },
];

const RESOLUTION_STAGES: { key: string; label: string; color: string }[] = [
  { key: 'pending', label: 'Pending', color: '#94A3B8' },
  { key: 'needs_review', label: 'Needs Review', color: '#D97706' },
  { key: 'under_review', label: 'Under Review', color: '#2563EB' },
  { key: 'true_positive_draft', label: 'True Positive (draft)', color: '#EA580C' },
  { key: 'false_positive_draft', label: 'False Positive (draft)', color: '#0D9488' },
  { key: 'confirmed', label: 'Confirmed', color: '#DC2626' },
  { key: 'false_positive', label: 'False Positive', color: '#16A34A' },
];

function monthKey(d: string | Date): string {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  const dt = new Date(Number(year), Number(month) - 1, 1);
  return dt.toLocaleString('default', { month: 'short', year: '2-digit' });
}

function formatCheckType(checkType: string): string {
  if (checkType.toLowerCase() === 'pep') return 'PEP';
  return checkType.replace(/\b\w/g, (c) => c.toUpperCase());
}

// A compact "how is the backlog composed" visual — a single segmented bar plus
// a count legend. Shared by the assessment-pipeline and review-status sections
// so both read the same way at a glance.
function SegmentedBreakdown({
  stages,
  otherCount,
  otherLabel = 'Other',
}: {
  stages: { key: string; label: string; color: string; count: number }[];
  otherCount: number;
  otherLabel?: string;
}) {
  const total = stages.reduce((s, x) => s + x.count, 0) + otherCount;
  const visible = stages.filter((s) => s.count > 0);

  if (total === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No data available.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {visible.map((s) => (
          <div
            key={s.key}
            style={{ width: `${(s.count / total) * 100}%`, backgroundColor: s.color }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
        {otherCount > 0 && (
          <div
            style={{ width: `${(otherCount / total) * 100}%`, backgroundColor: '#CBD5E1' }}
            title={`${otherLabel}: ${otherCount}`}
          />
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
        {stages.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground truncate">{s.label}</span>
            <span className="font-semibold tabular-nums ml-auto">{s.count}</span>
          </div>
        ))}
        {otherCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full shrink-0 bg-slate-300" />
            <span className="text-muted-foreground truncate">{otherLabel}</span>
            <span className="font-semibold tabular-nums ml-auto">{otherCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FpaTrends() {
  const { data: findings, isLoading: loadingFindings, isError: errorFindings, error: findingsError } = useQuery({
    queryKey: ['fpa_trends_findings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_findings')
        .select('id, assessment_id, individual_id, severity, check_type, resolution_status, is_false_positive, created_at')
        .order('created_at', { ascending: true })
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: assessments, isLoading: loadingAssessments, isError: errorAssessments, error: assessmentsError } = useQuery({
    queryKey: ['fpa_trends_assessments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('id, individual_id, assessment_type, status, created_at')
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: individuals, isLoading: loadingIndividuals, isError: errorIndividuals, error: individualsError } = useQuery({
    queryKey: ['fpa_trends_individuals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individuals')
        .select('id, nationality')
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: screeningRuns, isLoading: loadingRuns, isError: errorRuns, error: runsError } = useQuery({
    queryKey: ['fpa_trends_screening_runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_screening_runs')
        .select('id, run_type, status, total_checks, total_hits, started_at')
        .order('started_at', { ascending: true })
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const isLoading = loadingFindings || loadingAssessments || loadingIndividuals || loadingRuns;
  const isError = errorFindings || errorAssessments || errorIndividuals || errorRuns;
  const queryError = findingsError ?? assessmentsError ?? individualsError ?? runsError;

  // --- Stat computations ---
  const stats = useMemo(() => {
    const totalAssessments = (assessments ?? []).length;
    const activePipeline = (assessments ?? []).filter((a: any) =>
      OPEN_ASSESSMENT_STATUSES.has(a.status ?? 'draft'),
    ).length;

    const totalFindings = (findings ?? []).length;
    const highSeverityOpen = (findings ?? []).filter(
      (f: any) => (f.severity ?? '').toLowerCase() === 'high' && !FINALIZED_STATUSES.has(f.resolution_status ?? ''),
    ).length;
    const finalizedFindings = (findings ?? []).filter((f: any) =>
      FINALIZED_STATUSES.has(f.resolution_status ?? ''),
    ).length;
    const finalizedRate = totalFindings > 0 ? Math.round((finalizedFindings / totalFindings) * 100) : 0;

    return { totalAssessments, activePipeline, highSeverityOpen, finalizedFindings, totalFindings, finalizedRate };
  }, [findings, assessments]);

  // --- Assessment pipeline (status funnel) ---
  const pipelineData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assessments ?? []) {
      const s = a.status || 'draft';
      counts[s] = (counts[s] || 0) + 1;
    }
    const total = (assessments ?? []).length;
    const stages = ASSESSMENT_STAGES.map((stage) => ({ ...stage, count: counts[stage.key] || 0 }));
    const otherCount = total - stages.reduce((s, x) => s + x.count, 0);
    return { stages, otherCount };
  }, [assessments]);

  // --- Review status breakdown (finding backlog composition) ---
  const reviewStatusData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of findings ?? []) {
      const s = f.resolution_status || 'pending';
      counts[s] = (counts[s] || 0) + 1;
    }
    const total = (findings ?? []).length;
    const stages = RESOLUTION_STAGES.map((stage) => ({ ...stage, count: counts[stage.key] || 0 }));
    const otherCount = total - stages.reduce((s, x) => s + x.count, 0);
    return { stages, otherCount };
  }, [findings]);

  // --- Findings by severity over time ---
  // Built once over the full history (not just the last 12 months) so the
  // month picker below can still jump to older months even once the chart
  // itself only displays a rolling 12-month window.
  const monthlySeverityBuckets = useMemo(() => {
    const buckets: Record<string, { month: string; label: string; HIGH: number; MEDIUM: number; LOW: number }> = {};
    for (const f of findings ?? []) {
      if (!f.created_at) continue;
      const key = monthKey(f.created_at);
      if (!buckets[key]) {
        buckets[key] = { month: key, label: monthLabel(key), HIGH: 0, MEDIUM: 0, LOW: 0 };
      }
      const sev = (f.severity ?? '').toUpperCase();
      if (sev === 'HIGH') buckets[key].HIGH++;
      else if (sev === 'MEDIUM') buckets[key].MEDIUM++;
      else if (sev === 'LOW') buckets[key].LOW++;
    }
    return buckets;
  }, [findings]);

  const findingsByMonth = useMemo(
    () => Object.values(monthlySeverityBuckets).sort((a, b) => a.month.localeCompare(b.month)).slice(-12),
    [monthlySeverityBuckets],
  );

  // Newest-first, for the month picker.
  const monthOptions = useMemo(
    () => Object.values(monthlySeverityBuckets).sort((a, b) => b.month.localeCompare(a.month)),
    [monthlySeverityBuckets],
  );

  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const selectedMonthSummary = selectedMonth !== 'all' ? monthlySeverityBuckets[selectedMonth] : null;

  // Check-type breakdown scoped to just the selected month — the drill-down
  // a flat trend line can't show on its own.
  const selectedMonthCheckTypeData = useMemo(() => {
    if (selectedMonth === 'all') return [];
    const buckets: Record<string, { checkType: string; HIGH: number; MEDIUM: number; LOW: number }> = {};
    for (const f of findings ?? []) {
      if (!f.created_at || monthKey(f.created_at) !== selectedMonth) continue;
      const ct = f.check_type || 'unknown';
      if (!buckets[ct]) buckets[ct] = { checkType: ct.replace(/_/g, ' '), HIGH: 0, MEDIUM: 0, LOW: 0 };
      const sev = (f.severity ?? '').toUpperCase();
      if (sev === 'HIGH') buckets[ct].HIGH++;
      else if (sev === 'MEDIUM') buckets[ct].MEDIUM++;
      else if (sev === 'LOW') buckets[ct].LOW++;
    }
    return Object.values(buckets).sort((a, b) => b.HIGH + b.MEDIUM + b.LOW - (a.HIGH + a.MEDIUM + a.LOW));
  }, [findings, selectedMonth]);

  // --- Findings by check type & severity (richer than a flat clearance rate — shows
  // the actual severity mix per check right now, not just how much has been triaged) ---
  const checkTypeSeverityData = useMemo(() => {
    const buckets: Record<string, { checkType: string; HIGH: number; MEDIUM: number; LOW: number }> = {};
    for (const f of findings ?? []) {
      const ct = f.check_type || 'unknown';
      if (!buckets[ct]) buckets[ct] = { checkType: ct.replace(/_/g, ' '), HIGH: 0, MEDIUM: 0, LOW: 0 };
      const sev = (f.severity ?? '').toUpperCase();
      if (sev === 'HIGH') buckets[ct].HIGH++;
      else if (sev === 'MEDIUM') buckets[ct].MEDIUM++;
      else if (sev === 'LOW') buckets[ct].LOW++;
    }
    return Object.values(buckets).sort((a, b) => b.HIGH + b.MEDIUM + b.LOW - (a.HIGH + a.MEDIUM + a.LOW));
  }, [findings]);

  // --- Assessment type distribution ---
  const assessmentTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assessments ?? []) {
      const t = a.assessment_type || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).map(([type, count]) => ({
      type: type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' '),
      count,
      rawType: type,
    }));
  }, [assessments]);

  // --- Population comparison by nationality ---
  const nationalityData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ind of individuals ?? []) {
      const nat = ind.nationality?.trim() || 'Unknown';
      counts[nat] = (counts[nat] || 0) + 1;
    }
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    return Object.entries(counts)
      .map(([nationality, count]) => ({
        nationality,
        count,
        pct: total > 0 ? ((count / total) * 100).toFixed(1) : '0.0',
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [individuals]);

  // --- Finding resolution / clearance rate by check_type ---
  const clearanceByCheckType = useMemo(() => {
    const totals: Record<string, { total: number; cleared: number }> = {};
    for (const f of findings ?? []) {
      const ct = f.check_type || 'unknown';
      if (!totals[ct]) totals[ct] = { total: 0, cleared: 0 };
      totals[ct].total++;
      if (f.is_false_positive || CLEARED_STATUSES.has(f.resolution_status ?? '')) {
        totals[ct].cleared++;
      }
    }
    return Object.entries(totals)
      .map(([checkType, { total, cleared }]) => ({
        checkType,
        total,
        cleared,
        rate: total > 0 ? Math.round((cleared / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [findings]);

  // --- Screening activity (fp_screening_runs is fully populated but wasn't surfaced anywhere on this page) ---
  const runsSummary = useMemo(() => {
    const rows = screeningRuns ?? [];
    const total = rows.length;
    const completed = rows.filter((r: any) => r.status === 'completed').length;
    const withHits = rows.filter((r: any) => (r.total_hits ?? 0) > 0).length;
    const hitRate = completed > 0 ? Math.round((withHits / completed) * 100) : 0;
    const byType: Record<string, number> = {};
    for (const r of rows) {
      const t = r.run_type || 'manual';
      byType[t] = (byType[t] || 0) + 1;
    }
    return {
      total,
      completed,
      withHits,
      hitRate,
      byType: Object.entries(byType).sort((a, b) => b[1] - a[1]),
    };
  }, [screeningRuns]);

  const barColorForType = (rawType: string): string => {
    const map: Record<string, string> = {
      initial: '#2563EB',
      periodic: '#16A34A',
      renewal: '#16A34A',
      triggered: '#EA580C',
      change_of_role: '#7C3AED',
      cycle: '#7C3AED',
      adverse_event: '#DC2626',
    };
    return map[rawType] ?? '#6B7280';
  };

  // Step 16 (Reporting & MI) — a downloadable regulator-facing summary of the
  // same figures shown on this page, rather than a live-only dashboard.
  async function handleExportMiSummary() {
    try {
      await authorizedExport('fit_and_proper', 'export', { kind: 'mi_summary' });
    } catch (e: any) {
      toast.error(e?.message ?? 'Not authorized');
      return;
    }
    const lines: string[] = [];
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const row = (...cells: unknown[]) => lines.push(cells.map(esc).join(','));

    lines.push(`Fit & Proper — MI Summary,Generated ${new Date().toISOString()}`);
    lines.push('');
    row('Metric', 'Value');
    row('Total Assessments', stats.totalAssessments);
    row('Active Pipeline', stats.activePipeline);
    row('High-Severity Open Findings', stats.highSeverityOpen);
    row('Findings Finalized', `${stats.finalizedFindings} / ${stats.totalFindings} (${stats.finalizedRate}%)`);
    lines.push('');

    row('Assessment Pipeline Stage', 'Count');
    for (const s of pipelineData.stages) row(s.label, s.count);
    if (pipelineData.otherCount > 0) row('Other', pipelineData.otherCount);
    lines.push('');

    row('Review Status', 'Count');
    for (const s of reviewStatusData.stages) row(s.label, s.count);
    if (reviewStatusData.otherCount > 0) row('Other', reviewStatusData.otherCount);
    lines.push('');

    row('Check Type', 'Total Findings', 'Cleared', 'Clearance Rate %');
    for (const c of clearanceByCheckType) row(c.checkType.replace(/_/g, ' '), c.total, c.cleared, c.rate);
    lines.push('');

    row('Nationality', 'Count', '% of Total');
    for (const n of nationalityData) row(n.nationality, n.count, n.pct);
    lines.push('');

    row('Screening Runs', 'Completed', 'With Hits', 'Hit Rate %');
    row(runsSummary.total, runsSummary.completed, runsSummary.withHits, runsSummary.hitRate);

    const csv = lines.join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `fp-mi-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Trends & History"
          description="Pipeline health, review backlog, and population analytics — FPA-008"
          actions={
            <Button data-rbac="fit_and_proper.export" size="sm" variant="outline" onClick={handleExportMiSummary} disabled={isLoading || !!isError}>
              <Download className="h-4 w-4 mr-2" />
              Export MI Summary
            </Button>
          }
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading analytics data…
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-destructive">
            <AlertTriangle className="h-6 w-6" />
            <p className="text-sm font-medium">Failed to load analytics data. Please try again.</p>
            {queryError instanceof Error && (
              <p className="text-xs text-muted-foreground">{queryError.message}</p>
            )}
          </div>
        ) : (
          <>
            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Assessments</p>
                      <p className="text-3xl font-bold tabular-nums mt-1">{stats.totalAssessments}</p>
                    </div>
                    <ClipboardList className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Active Pipeline</p>
                      <p className="text-3xl font-bold tabular-nums mt-1">{stats.activePipeline}</p>
                    </div>
                    <GitBranch className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">not yet determined, closed, or withdrawn</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">High-Severity Open</p>
                      <p className="text-3xl font-bold tabular-nums mt-1 text-destructive">{stats.highSeverityOpen}</p>
                    </div>
                    <ShieldAlert className="h-5 w-5 text-destructive mt-1 shrink-0" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">high-severity, awaiting a final decision</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Findings Finalized</p>
                      <p className="text-3xl font-bold tabular-nums mt-1">{stats.finalizedRate}%</p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {stats.finalizedFindings} of {stats.totalFindings} findings decided
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Pipeline + Review backlog */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Assessment Pipeline</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Where all {stats.totalAssessments} assessments currently sit
                  </p>
                </CardHeader>
                <CardContent>
                  <SegmentedBreakdown stages={pipelineData.stages} otherCount={pipelineData.otherCount} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Review Backlog</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Composition of all {stats.totalFindings} findings by review outcome
                  </p>
                </CardHeader>
                <CardContent>
                  <SegmentedBreakdown stages={reviewStatusData.stages} otherCount={reviewStatusData.otherCount} />
                </CardContent>
              </Card>
            </div>

            {/* Findings by Severity Over Time */}
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base">Findings by Severity Over Time</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedMonth === 'all'
                      ? 'Monthly counts — last 12 months'
                      : `Breakdown for ${monthlySeverityBuckets[selectedMonth]?.label ?? selectedMonth}`}
                  </p>
                </div>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="h-8 w-40 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All months</SelectItem>
                    {monthOptions.map((m) => (
                      <SelectItem key={m.month} value={m.month}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                {selectedMonth === 'all' ? (
                  findingsByMonth.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No finding data available.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={findingsByMonth} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis allowDecimals={false} fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 6 }}
                          labelStyle={{ fontWeight: 600 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line
                          type="monotone"
                          dataKey="HIGH"
                          stroke="#DC2626"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="MEDIUM"
                          stroke="#D97706"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="LOW"
                          stroke="#16A34A"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )
                ) : !selectedMonthSummary ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No finding data for this month.</p>
                ) : (
                  <div className="space-y-5">
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total</p>
                        <p className="text-2xl font-bold tabular-nums mt-0.5">
                          {selectedMonthSummary.HIGH + selectedMonthSummary.MEDIUM + selectedMonthSummary.LOW}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide" style={{ color: '#DC2626' }}>High</p>
                        <p className="text-2xl font-bold tabular-nums mt-0.5">{selectedMonthSummary.HIGH}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide" style={{ color: '#D97706' }}>Medium</p>
                        <p className="text-2xl font-bold tabular-nums mt-0.5">{selectedMonthSummary.MEDIUM}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide" style={{ color: '#16A34A' }}>Low</p>
                        <p className="text-2xl font-bold tabular-nums mt-0.5">{selectedMonthSummary.LOW}</p>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                        By check type
                      </p>
                      {selectedMonthCheckTypeData.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">No finding data available.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart
                            data={selectedMonthCheckTypeData}
                            margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                            barGap={4}
                            barCategoryGap={selectedMonthCheckTypeData.length <= 4 ? '30%' : '18%'}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis
                              dataKey="checkType"
                              tickFormatter={formatCheckType}
                              fontSize={11}
                              tickLine={false}
                              axisLine={false}
                              tick={{ fill: 'hsl(var(--foreground))' }}
                            />
                            <YAxis
                              allowDecimals={false}
                              fontSize={11}
                              tickLine={false}
                              axisLine={false}
                              tick={{ fill: 'hsl(var(--muted-foreground))' }}
                            />
                            <Tooltip
                              contentStyle={{ fontSize: 12, borderRadius: 8 }}
                              labelStyle={{ fontWeight: 600 }}
                              labelFormatter={(v) => formatCheckType(String(v))}
                              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="HIGH" name="High" fill="#DC2626" radius={[4, 4, 0, 0]} maxBarSize={36} />
                            <Bar dataKey="MEDIUM" name="Medium" fill="#D97706" radius={[4, 4, 0, 0]} maxBarSize={36} />
                            <Bar dataKey="LOW" name="Low" fill="#16A34A" radius={[4, 4, 0, 0]} maxBarSize={36} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Check Type severity mix + Assessment Types Distribution */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Findings by Check Type & Severity</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Severity mix of every finding raised, by screening check</p>
                </CardHeader>
                <CardContent>
                  {checkTypeSeverityData.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No finding data available.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={checkTypeSeverityData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="checkType" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis allowDecimals={false} fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} labelStyle={{ fontWeight: 600 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="HIGH" stackId="sev" fill="#DC2626" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="MEDIUM" stackId="sev" fill="#D97706" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="LOW" stackId="sev" fill="#16A34A" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Assessment Types Distribution</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Count of assessments by type</p>
                </CardHeader>
                <CardContent>
                  {assessmentTypeData.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No assessment data available.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={assessmentTypeData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="type" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis allowDecimals={false} fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 6 }}
                          labelStyle={{ fontWeight: 600 }}
                        />
                        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                          {assessmentTypeData.map((entry, idx) => (
                            <Cell key={idx} fill={barColorForType(entry.rawType)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Finding Clearance Rate by Check Type */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Finding Clearance Rate by Check Type</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Percentage of findings cleared as false positives per screening check
                </p>
              </CardHeader>
              <CardContent>
                {clearanceByCheckType.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No finding data available.</p>
                ) : (
                  <div className="space-y-4">
                    {clearanceByCheckType.map(({ checkType, total, cleared, rate }) => (
                      <div key={checkType}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{checkType.replace(/_/g, ' ')}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                              {total} findings
                            </Badge>
                          </div>
                          <span className="text-sm tabular-nums font-semibold text-muted-foreground">
                            {rate}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${rate}%`,
                              backgroundColor: rate >= 70 ? '#16A34A' : rate >= 40 ? '#D97706' : '#2563EB',
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                          <span>{cleared} cleared</span>
                          <span>{total - cleared} still open</span>
                        </div>
                        <Separator className="mt-3" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Population Comparison + Screening Activity */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Population Comparison</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Individuals by nationality (as recorded — free text) — top 20</p>
                </CardHeader>
                <CardContent className="p-0">
                  {nationalityData.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center px-6">No individual data available.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nationality</TableHead>
                            <TableHead className="text-right tabular-nums">Count</TableHead>
                            <TableHead className="text-right tabular-nums">% of Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {nationalityData.map((row) => (
                            <TableRow key={row.nationality}>
                              <TableCell className="font-medium">{row.nationality}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{row.pct}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    Screening Activity
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Run volume and hit rate across all screening executions</p>
                </CardHeader>
                <CardContent>
                  {runsSummary.total === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No screening runs recorded yet.</p>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Runs</p>
                          <p className="text-2xl font-bold tabular-nums mt-0.5">{runsSummary.total}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Completed</p>
                          <p className="text-2xl font-bold tabular-nums mt-0.5">{runsSummary.completed}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Hit Rate</p>
                          <p className="text-2xl font-bold tabular-nums mt-0.5">{runsSummary.hitRate}%</p>
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                          By trigger type
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {runsSummary.byType.map(([type, count]) => (
                            <Badge key={type} variant="outline" className="text-xs font-normal">
                              {type.replace(/_/g, ' ')}
                              <span className="ml-1.5 font-semibold tabular-nums">{count}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
