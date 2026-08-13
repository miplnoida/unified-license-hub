import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, AlertTriangle, Sparkles, ArrowLeft } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { RiskBadge } from '@/components/prudential/RiskBadge';
import {
  describeEarlyWarning,
  formatRatioValue,
  peerPosition,
} from '@/lib/prudential/analysisNarrative';

type RiskLevel = 'green' | 'amber' | 'red';
interface Metric { key: string; label: string; value: number | null; unit: string | null; risk_level: RiskLevel; threshold: number | null; null_reason?: string | null; }
interface Summary { category: string; score: number; metrics: Metric[]; commentary_facts: string[]; }
interface EarlyWarning { metric_key: string; level: RiskLevel; reason: string; evidence: Record<string, unknown>[]; }
interface Recommendation { category: string; metric_key: string; level: RiskLevel; text: string; }
interface AnalysisRow {
  id: string; return_id: string; computed_at: string; health_score: number | null; ai_summary: string | null;
  capital_summary: Summary; liquidity_summary: Summary; asset_quality_summary: Summary; profitability_summary: Summary;
  concentration_risks: Metric[]; heatmap: Array<{ category: string; risk_level: RiskLevel }>;
  trend: Array<{ return_id: string; period_end: string | null; ratios: Record<string, number | null> }>;
  peer: Array<{ ratio_key: string; label: string; my_value: number | null; distribution: any }>;
  early_warnings: EarlyWarning[]; recommendations: Recommendation[]; inputs: Record<string, unknown>;
}

function ScoreGauge({ value }: { value: number | null }) {
  const v = value ?? 0;
  const tone = v >= 75 ? 'text-emerald-600' : v >= 50 ? 'text-amber-600' : 'text-destructive';
  return (
    <div className={`text-4xl font-bold tabular-nums ${tone}`}>{v.toFixed(1)}<span className="text-lg text-muted-foreground"> / 100</span></div>
  );
}

function CategoryCard({ title, s }: { title: string; s: Summary | undefined }) {
  if (!s) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{title}</span>
          <Badge variant="outline" className="tabular-nums">{s.score?.toFixed?.(1) ?? '—'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(!s.metrics || s.metrics.length === 0) ? (
          <p className="text-xs text-muted-foreground italic">No ratios configured for this category.</p>
        ) : s.metrics.map((m) => (
          <div key={m.key} className="flex items-center justify-between text-xs border-b pb-1 last:border-b-0">
            <span className="font-medium">{m.label}</span>
            <div className="flex items-center gap-2">
              <span className="tabular-nums">{m.value == null ? (m.null_reason ?? '—') : m.value.toFixed(2)}</span>
              <RiskBadge level={m.risk_level} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function useLatestAnalysis(returnId: string | undefined) {
  return useQuery({
    queryKey: ['return_consolidated_analysis', returnId],
    enabled: !!returnId,
    queryFn: async (): Promise<AnalysisRow[]> => {
      const { data, error } = await (supabase as any)
        .from('return_consolidated_analysis')
        .select('*')
        .eq('return_id', returnId!)
        .order('computed_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as AnalysisRow[];
    },
  });
}

export default function ReturnAnalysis() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useLatestAnalysis(id);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? rows[0],
    [rows, selectedId],
  );

  /** Configured ratio labels by key, so warnings never show a database key. */
  const ratioLabels = useMemo(() => {
    const map: Record<string, string> = {};
    const add = (list?: Metric[]) => list?.forEach((m) => { if (m?.key && m.label) map[m.key] = m.label; });
    add(selected?.capital_summary?.metrics);
    add(selected?.liquidity_summary?.metrics);
    add(selected?.asset_quality_summary?.metrics);
    add(selected?.profitability_summary?.metrics);
    add(selected?.concentration_risks);
    selected?.peer?.forEach((p) => { if (p.ratio_key && p.label) map[p.ratio_key] = p.label; });
    return map;
  }, [selected]);

  const regenerate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-return-analysis', {
        body: { return_id: id, compute_ai_summary: true },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('Analysis regenerated');
      qc.invalidateQueries({ queryKey: ['return_consolidated_analysis', id] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to regenerate analysis'),
  });

  const trendData = useMemo(() => {
    if (!selected?.trend) return [];
    return selected.trend.map((t) => ({
      period: t.period_end ?? '—',
      ...t.ratios,
    }));
  }, [selected]);
  const trendKeys = useMemo(() => {
    const s = new Set<string>();
    selected?.trend?.forEach((t) => Object.keys(t.ratios ?? {}).forEach((k) => s.add(k)));
    return Array.from(s).slice(0, 6);
  }, [selected]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title="Return Analysis"
          description="Consolidated prudential analysis generated from persisted ratios and threshold breaches."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
              {selected?.id && <HistoryButton entityType="return_analysis" entityId={selected.id} title="Return analysis history" />}
              {!selected?.id && id && <HistoryButton entityType="return_filed" entityId={id} title="Return history" />}
              <Button data-rbac="report_management.view" onClick={() => regenerate.mutate()} disabled={regenerate.isPending}>
                {regenerate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Regenerate
              </Button>
            </div>
          }
        />

        {isLoading ? (
          <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading analysis…
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No analysis has been generated for this return yet.</p>
              <Button data-rbac="report_management.view" onClick={() => regenerate.mutate()} disabled={regenerate.isPending}>
                {regenerate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generate Analysis
              </Button>
            </CardContent>
          </Card>
        ) : selected ? (
          <>
            {/* Header row: gauge + history */}
            <Card>
              <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Overall Health</p>
                  <ScoreGauge value={selected.health_score} />
                  <p className="text-xs text-muted-foreground mt-1">Computed {new Date(selected.computed_at).toLocaleString()}</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {selected.heatmap?.map((h) => (
                    <div key={h.category} className="text-xs flex flex-col items-center gap-1 border rounded px-3 py-2">
                      <span className="capitalize text-muted-foreground">{h.category.replace('_', ' ')}</span>
                      <RiskBadge level={h.risk_level} />
                    </div>
                  ))}
                </div>
                <div className="min-w-[180px]">
                  <Select value={selected.id} onValueChange={setSelectedId}>
                    <SelectTrigger><SelectValue placeholder="History" /></SelectTrigger>
                    <SelectContent>
                      {rows.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {new Date(r.computed_at).toLocaleString()} — {r.health_score?.toFixed(1) ?? '—'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Category cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <CategoryCard title="Capital" s={selected.capital_summary} />
              <CategoryCard title="Liquidity" s={selected.liquidity_summary} />
              <CategoryCard title="Asset Quality" s={selected.asset_quality_summary} />
              <CategoryCard title="Profitability" s={selected.profitability_summary} />
            </div>

            {/* AI summary */}
            {(selected.ai_summary || (selected.inputs as any)?.ai_error) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4" /> AI Supervisor Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selected.ai_summary ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{selected.ai_summary}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">AI summary unavailable ({String((selected.inputs as any)?.ai_error)}).</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Early warnings + recommendations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Early Warnings</CardTitle></CardHeader>
                <CardContent>
                  {selected.early_warnings?.length ? (
                    <ul className="space-y-3 text-sm">
                      {selected.early_warnings.map((w, i) => {
                        const n = describeEarlyWarning(w, ratioLabels);
                        return (
                          <li key={i} className="flex items-start gap-2 border-b pb-3 last:border-b-0">
                            <RiskBadge level={w.level} />
                            <div className="min-w-0 space-y-1">
                              <div className="font-medium">{n.headline}</div>
                              <p className="text-sm text-muted-foreground">{n.sentence}</p>
                              {!!n.details.length && (
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                  {n.details.map((d) => (
                                    <span
                                      key={d.label}
                                      className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                                    >
                                      {d.label}: <span className="tabular-nums text-foreground">{d.value}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground italic">No early warnings detected.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Recommendations</CardTitle></CardHeader>
                <CardContent>
                  {selected.recommendations?.length ? (
                    <ul className="space-y-2 text-sm">
                      {selected.recommendations.map((r, i) => (
                        <li key={i} className="border-b pb-2 last:border-b-0">
                          <div className="flex items-center gap-2 text-xs">
                            <Badge variant="outline" className="capitalize">{r.category.replace('_', ' ')}</Badge>
                            <RiskBadge level={r.level} />
                            <span className="text-muted-foreground">{r.metric_key}</span>
                          </div>
                          <p className="mt-1">{r.text}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground italic">No configured recommendation templates were triggered.</p>}
                </CardContent>
              </Card>
            </div>

            {/* Concentration + trend */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Concentration Risks</CardTitle></CardHeader>
                <CardContent>
                  {selected.concentration_risks?.length ? (
                    <ul className="space-y-1 text-sm">
                      {selected.concentration_risks.map((m) => (
                        <li key={m.key} className="flex items-center justify-between border-b pb-1 last:border-b-0">
                          <span>{m.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums">{m.value == null ? '—' : m.value.toFixed(2)}</span>
                            <RiskBadge level={m.risk_level} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground italic">No concentration risks flagged.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Trend (last 6 filings)</CardTitle></CardHeader>
                <CardContent>
                  {trendData.length >= 2 && trendKeys.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" fontSize={10} />
                        <YAxis fontSize={10} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {trendKeys.map((k, i) => (
                          <Line key={k} type="monotone" dataKey={k}
                                stroke={`hsl(${(i * 60) % 360}, 70%, 45%)`} strokeWidth={2} dot={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <p className="text-xs text-muted-foreground italic">Not enough historical filings to plot a trend yet.</p>}
                </CardContent>
              </Card>
            </div>

            {/* Peer */}
            {selected.peer?.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Peer Snapshot</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-3 text-sm">
                    {selected.peer.map((p) => {
                      const pos = peerPosition(p.my_value, p.distribution?.median);
                      const hasRange = p.distribution?.p25 != null && p.distribution?.p75 != null;
                      return (
                        <li key={p.ratio_key} className="space-y-1 border-b pb-3 last:border-b-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{p.label}</span>
                            {pos && (
                              <Badge variant="outline" className="text-[11px] font-normal">
                                {pos.label}
                                {pos.gap ? ` (by ${pos.gap})` : ''}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              This entity:{' '}
                              <span className="tabular-nums text-foreground">{formatRatioValue(p.my_value)}</span>
                            </span>
                            <span>
                              Peer median:{' '}
                              <span className="tabular-nums text-foreground">
                                {formatRatioValue(p.distribution?.median)}
                              </span>
                            </span>
                            {hasRange && (
                              <span>
                                Typical peer range:{' '}
                                <span className="tabular-nums text-foreground">
                                  {formatRatioValue(p.distribution.p25)} – {formatRatioValue(p.distribution.p75)}
                                </span>
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
