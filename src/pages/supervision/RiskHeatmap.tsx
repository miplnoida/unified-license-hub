import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw, AlertTriangle, Shield, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { RiskScoreDetailDrawer, type RiskScoreRow } from '@/components/prudential/RiskScoreDetailDrawer';
import { AdvisoryAiPanel } from '@/components/prudential/AdvisoryAiPanel';

type Band = 'low' | 'medium' | 'high' | 'critical';

const BAND_STYLE: Record<Band, string> = {
  low: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  medium: 'bg-amber-100 text-amber-800 border-amber-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  critical: 'bg-red-100 text-red-800 border-red-300',
};

const BAND_TILE: Record<Band, string> = {
  low: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200',
  medium: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
  high: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
  critical: 'bg-red-50 hover:bg-red-100 border-red-200',
};

export default function RiskHeatmap() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [bandFilter, setBandFilter] = useState<Band | 'all'>('all');
  const [selected, setSelected] = useState<RiskScoreRow | null>(null);

  useEffect(() => {
    const riskParam = searchParams.get('risk');
    if (riskParam === 'low' || riskParam === 'medium' || riskParam === 'high' || riskParam === 'critical') {
      setBandFilter(riskParam);
    }
  }, [searchParams]);

  const { data: scores = [], isLoading } = useQuery({
    queryKey: ['entity_risk_scores', 'current'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('entity_risk_scores') as any)
        .select('id, entity_id, period_key, score, band, components, computed_at')
        .eq('is_current', true)
        .order('score', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const entityIds = useMemo(() => scores.map((s) => s.entity_id), [scores]);
  const { data: licensees = [] } = useQuery({
    queryKey: ['licensees_by_ids', entityIds],
    enabled: entityIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('licensees').select('id, name, status').in('id', entityIds);
      if (error) throw error;
      return data as any[];
    },
  });
  const licMap = useMemo(() => {
    const m = new Map<string, any>();
    licensees.forEach((l) => m.set(l.id, l));
    return m;
  }, [licensees]);

  const recompute = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('risk-score-recompute', { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(`Recomputed ${d?.count ?? 0} entities`);
      qc.invalidateQueries({ queryKey: ['entity_risk_scores'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Recompute failed'),
  });

  const filtered = useMemo(() => {
    return scores.filter((s) => {
      if (bandFilter !== 'all' && s.band !== bandFilter) return false;
      const name = licMap.get(s.entity_id)?.name ?? '';
      if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [scores, licMap, search, bandFilter]);

  const stats = useMemo(() => {
    const s: Record<Band, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    scores.forEach((r) => { s[r.band as Band] = (s[r.band as Band] ?? 0) + 1; });
    return s;
  }, [scores]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" /> Risk Heatmap
            </h1>
            <p className="text-sm text-muted-foreground">Composite supervisory risk score per regulated entity.</p>
          </div>
          <Button data-rbac="prudential_supervision.edit" onClick={() => recompute.mutate()} disabled={recompute.isPending}>
            {recompute.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Recompute now
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['low','medium','high','critical'] as Band[]).map((b) => (
            <button key={b} onClick={() => setBandFilter(bandFilter === b ? 'all' : b)}
              className={`p-4 rounded-lg border text-left transition ${BAND_TILE[b]} ${bandFilter === b ? 'ring-2 ring-primary' : ''}`}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{b}</p>
              <p className="text-2xl font-bold mt-1 tabular-nums">{stats[b] ?? 0}</p>
            </button>
          ))}
        </div>

        <AdvisoryAiPanel
          analysisType="portfolio_summary"
          scope="portfolio"
          facts={{
            band_counts: stats,
            entities_scored: scores.length,
            highest_risk_entities: scores.slice(0, 10).map((s) => ({
              entity: licMap.get(s.entity_id)?.name ?? 'Unnamed entity',
              score: s.score,
              band: s.band,
              period: s.period_key,
              drivers: s.components ?? {},
            })),
          }}
          ready={!isLoading && scores.length > 0}
          title="AI-assisted portfolio summary"
          description="Narrative on where risk is concentrated across the portfolio. Every score, band and count shown on this page is calculated by the system."
        />



        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Entities</span>
              <Input placeholder="Search entity…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs h-8" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-50" />
                No risk scores yet. Click Recompute to run the engine.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((s) => {
                  const lic = licMap.get(s.entity_id);
                  const c = s.components || {};
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelected(s as RiskScoreRow)}
                      aria-label={`View risk detail for ${lic?.name ?? 'entity'}`}
                      className={`text-left p-3 rounded-lg border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${BAND_TILE[s.band as Band]}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{lic?.name ?? s.entity_id.slice(0, 8)}</p>
                          <p className="text-xs text-muted-foreground">{s.period_key}</p>
                        </div>
                        <Badge className={BAND_STYLE[s.band as Band]}>{s.band}</Badge>
                      </div>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-bold tabular-nums">{s.score}</span>
                        <span className="text-xs text-muted-foreground">/ 100</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                        <span title="Prudential breaches">PB {c.prudential_breaches ?? 0}</span>
                        <span title="Complaints">CX {c.open_complaints ?? 0}</span>
                        <span title="Overdue returns">OR {c.overdue_returns ?? 0}</span>
                        <span title="Enforcement">EN {c.open_enforcement ?? 0}</span>
                        <span title="Inspection findings">IF {c.inspection_findings ?? 0}</span>
                        <span title="Fit & proper alerts">FP {c.fp_alerts ?? 0}</span>
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">Click for details</p>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <RiskScoreDetailDrawer
        row={selected}
        entityName={selected ? licMap.get(selected.entity_id)?.name : undefined}
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      />
    </DashboardLayout>
  );
}
