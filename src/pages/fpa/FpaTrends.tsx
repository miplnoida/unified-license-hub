import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, TrendingUp, ClipboardList, AlertTriangle, Users } from 'lucide-react';
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

function monthKey(d: string | Date): string {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  const dt = new Date(Number(year), Number(month) - 1, 1);
  return dt.toLocaleString('default', { month: 'short', year: '2-digit' });
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

  const isLoading = loadingFindings || loadingAssessments || loadingIndividuals;
  const isError = errorFindings || errorAssessments || errorIndividuals;
  const queryError = findingsError ?? assessmentsError ?? individualsError;

  // --- Stat computations ---
  const stats = useMemo(() => {
    const totalAssessments = (assessments ?? []).length;
    const determined = (assessments ?? []).filter(
      (a: any) => a.status === 'determined' || a.status === 'closed'
    ).length;
    const totalFindings = (findings ?? []).length;
    // A finding is confirmed (adverse) if it is not marked as a false positive via either
    // the boolean flag or a cleared resolution_status value ('false_positive', 'false_positive_draft').
    const confirmedFindings = (findings ?? []).filter(
      (f: any) => !f.is_false_positive && !CLEARED_STATUSES.has(f.resolution_status ?? '')
    ).length;
    const adverseRate =
      totalFindings > 0 ? Math.round((confirmedFindings / totalFindings) * 100) : 0;

    const uniqueIndividuals = new Set((assessments ?? []).map((a: any) => a.individual_id)).size;
    const avgPerIndividual =
      uniqueIndividuals > 0
        ? (totalAssessments / uniqueIndividuals).toFixed(1)
        : '0';

    return { totalAssessments, determined, adverseRate, avgPerIndividual };
  }, [findings, assessments]);

  // --- Findings by severity over time ---
  const findingsByMonth = useMemo(() => {
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
    return Object.values(buckets)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [findings]);

  // --- Assessment type distribution ---
  const assessmentTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assessments ?? []) {
      const t = a.assessment_type || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).map(([type, count]) => ({
      type: type.charAt(0).toUpperCase() + type.slice(1),
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

  const barColorForType = (rawType: string): string => {
    const map: Record<string, string> = {
      initial: '#2563EB',
      periodic: '#16A34A',
      triggered: '#EA580C',
      cycle: '#7C3AED',
    };
    return map[rawType] ?? '#6B7280';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Trends & History"
          description="Historical finding trends and population comparison analytics — FPA-008"
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
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Determined</p>
                      <p className="text-3xl font-bold tabular-nums mt-1">{stats.determined}</p>
                    </div>
                    <TrendingUp className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Adverse Rate</p>
                      <p className="text-3xl font-bold tabular-nums mt-1">{stats.adverseRate}%</p>
                    </div>
                    <AlertTriangle className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">confirmed / total findings</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Avg per Individual</p>
                      <p className="text-3xl font-bold tabular-nums mt-1">{stats.avgPerIndividual}</p>
                    </div>
                    <Users className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">assessments per subject</p>
                </CardContent>
              </Card>
            </div>

            {/* Findings by Severity Over Time */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Findings by Severity Over Time</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Monthly counts — last 12 months</p>
              </CardHeader>
              <CardContent>
                {findingsByMonth.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No finding data available.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
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
                )}
              </CardContent>
            </Card>

            {/* Assessment Types Distribution */}
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
                <div className="flex flex-wrap gap-3 mt-3">
                  {[
                    { label: 'Initial', color: '#2563EB' },
                    { label: 'Periodic', color: '#16A34A' },
                    { label: 'Triggered', color: '#EA580C' },
                    { label: 'Cycle', color: '#7C3AED' },
                  ].map(({ label, color }) => (
                    <span key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                      {label}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Population Comparison */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Population Comparison</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Individuals by nationality — top 20</p>
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

            {/* Finding Resolution Rate */}
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
                          <span>{total - cleared} confirmed</span>
                        </div>
                        <Separator className="mt-3" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
