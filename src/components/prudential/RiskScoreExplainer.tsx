import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDateTime } from '@/lib/datetime';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { AdvisoryAiPanel } from '@/components/prudential/AdvisoryAiPanel';

export type Band = 'low' | 'medium' | 'high' | 'critical';

export const BAND_STYLE: Record<Band, string> = {
  low: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  medium: 'bg-amber-100 text-amber-800 border-amber-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  critical: 'bg-red-100 text-red-800 border-red-300',
};

/** Mirrors the caps + default weights used by the risk-score-recompute function. */
export const COMPONENTS: Array<{
  key: string;
  label: string;
  description: string;
  cap: number;
  defaultWeight: number;
  link?: string;
}> = [
  { key: 'prudential_breaches', label: 'Prudential breaches', description: 'Unacknowledged threshold breaches on filed returns', cap: 5, defaultWeight: 25, link: '/prudential/breaches' },
  { key: 'open_enforcement', label: 'Open enforcement', description: 'Enforcement actions still open against the entity', cap: 3, defaultWeight: 20, link: '/enforcement' },
  { key: 'open_complaints', label: 'Open complaints', description: 'Complaints against the entity that are not resolved', cap: 10, defaultWeight: 15, link: '/complaints' },
  { key: 'overdue_returns', label: 'Overdue returns', description: 'Returns filed late or still outstanding', cap: 5, defaultWeight: 15, link: '/returns-mgmt/returns' },
  { key: 'inspection_findings', label: 'Inspection findings', description: 'Open findings raised during inspections', cap: 5, defaultWeight: 15, link: '/inspections' },
  { key: 'fp_alerts', label: 'Fit & proper alerts', description: 'Adverse fit-and-proper signals on current officers', cap: 3, defaultWeight: 10 },
];

export interface RiskScoreRow {
  id: string;
  entity_id: string;
  period_key: string;
  score: number;
  band: string;
  components?: Record<string, number> | null;
  weights?: Record<string, number> | null;
  computed_at?: string | null;
}

interface Props {
  row: RiskScoreRow;
  entityName?: string;
  /** Show the "Open supervisory profile" shortcut (hidden when already on the profile). */
  showProfileLink?: boolean;
  /** Query enablement — pass false to defer the history read (e.g. closed drawer). */
  active?: boolean;
}

/**
 * Plain-language explanation of a single entity's composite risk score:
 * headline, drivers, score history, advisory AI commentary and next steps.
 * Read-only; shared by the portfolio heatmap drawer and the entity profile tab.
 */
export function RiskScoreExplainer({ row, entityName, showProfileLink = true, active = true }: Props) {
  const navigate = useNavigate();

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['entity_risk_scores', 'history', row.entity_id],
    enabled: active && !!row.entity_id,
    queryFn: async () => {
      const { data, error } = await (supabase.from('entity_risk_scores') as any)
        .select('id, period_key, score, band, computed_at')
        .eq('entity_id', row.entity_id)
        .order('period_key', { ascending: false })
        .limit(12);
      if (error) throw error;
      return data as Array<{ id: string; period_key: string; score: number; band: string; computed_at: string | null }>;
    },
  });

  const counts = row.components ?? {};
  const weights = row.weights ?? {};
  const totalWeight = COMPONENTS.reduce((sum, c) => sum + (Number(weights[c.key]) || c.defaultWeight), 0);

  const rows = COMPONENTS.map((c) => {
    const count = Number(counts[c.key]) || 0;
    const weight = Number(weights[c.key]) || c.defaultWeight;
    const normalised = Math.min(1, count / (c.cap || 1));
    const contribution = totalWeight > 0 ? (weight * normalised) / totalWeight * 100 : 0;
    return { ...c, count, weight, contribution };
  }).sort((a, b) => b.contribution - a.contribution);

  const priorPeriods = history.filter((h) => h.period_key !== row.period_key);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold tabular-nums">{row.score}</span>
          <span className="text-sm text-muted-foreground">out of 100</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Scoring period <span className="font-medium text-foreground">{row.period_key}</span>
          {' · '}last calculated {formatDateTime(row.computed_at)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          A higher score means higher supervisory risk. The score combines the six signals below,
          each capped so a single very large count cannot dominate the result.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">What drives this score</h3>
        {rows.map((c) => (
          <div key={c.key} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.description}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold tabular-nums">
                  {c.count === 0 ? 'No issues recorded' : c.count}
                </p>
                <p className="text-[11px] text-muted-foreground">weight {c.weight}</p>
              </div>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full', c.count === 0 ? 'bg-muted' : 'bg-primary')}
                style={{ width: `${Math.min(100, c.contribution)}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Adds {c.contribution.toFixed(1)} points to the score
              {c.count > c.cap ? ` (counted up to a maximum of ${c.cap})` : ''}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Score history</h3>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : priorPeriods.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            This is the first scoring period recorded for this entity, so there is nothing to compare against yet.
          </p>
        ) : (
          <div className="rounded-lg border divide-y">
            {priorPeriods.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm">{h.period_key}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">{h.score}</span>
                  <Badge variant="outline" className={cn('text-[11px]', BAND_STYLE[(h.band as Band) ?? 'low'])}>
                    {h.band}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <AdvisoryAiPanel
        analysisType="heatmap_movement"
        scopeId={row.entity_id}
        periodKey={row.period_key}
        label={entityName}
        facts={{
          score: row.score,
          band: row.band,
          period: row.period_key,
          last_calculated: row.computed_at ?? null,
          drivers: rows.map((c) => ({
            driver: c.label,
            count: c.count,
            weight: c.weight,
            points_added: Number(c.contribution.toFixed(1)),
          })),
          previous_periods: priorPeriods.map((h) => ({ period: h.period_key, score: h.score, band: h.band })),
        }}
        ready={!isLoading}
        title="AI-assisted explanation of this score"
        description="Explains the movement and the drivers shown above. The score, band and driver counts are calculated by the system and are not changed here."
      />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Where to go next</h3>
        {showProfileLink && (
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={() => navigate(`/prudential/entities/${row.entity_id}`)}
          >
            Open supervisory profile <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        {rows.filter((c) => c.count > 0 && c.link).map((c) => (
          <Button
            key={c.key}
            variant="ghost"
            className="w-full justify-between"
            onClick={() => navigate(c.link!)}
          >
            Review {c.label.toLowerCase()} ({c.count}) <ArrowRight className="h-4 w-4" />
          </Button>
        ))}
      </section>
    </div>
  );
}

export default RiskScoreExplainer;
