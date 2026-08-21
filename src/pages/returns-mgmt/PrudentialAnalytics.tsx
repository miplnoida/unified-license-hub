import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePeerSnapshot } from '@/hooks/usePrudentialConfig';
import {
  usePeerMinPeers,
  useSavePeerMinPeers,
  useCanManagePrudentialConfig,
  PEER_MIN_PEERS_DEFAULT,
  PEER_MIN_PEERS_FLOOR,
  PEER_MIN_PEERS_CEILING,
} from '@/hooks/usePeerSettings';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { formatDateOnly } from '@/lib/datetime';
import { objectRoute } from '@/lib/routes/objectRoutes';
import { AdvisoryAiPanel } from '@/components/prudential/AdvisoryAiPanel';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend, ReferenceLine } from 'recharts';

/**
 * EPR-01 — Prudential Metric Analytics (canonical truth).
 *
 * Every operational fact on this screen resolves through the canonical
 * Returns spine: `regulatory_metrics` + `return_metric_values` +
 * `return_filings` / `return_filing_versions` + `reporting_periods`, using the
 * P07 eligibility rule (accepted version, else the current version). The
 * retired `return_calculated_ratios` / `returns_filed` reads are gone.
 *
 * No ratio is recalculated in the browser and missing metric facts are never
 * shown as zero — an unavailable metric is simply absent.
 */

type MetricOption = {
  metric_code: string;
  metric_name: string;
  unit: string | null;
  entity_count: number;
  period_count: number;
  latest_period_end: string | null;
};

type MetricEntity = {
  entity_id: string;
  entity_name: string;
  sector_id: string | null;
  category_id: string | null;
  latest_available_period: string | null;
  fact_count: number;
};

type MetricPeriod = {
  reporting_period_id: string;
  period_end: string;
  period_label: string | null;
};

type TrendPoint = {
  entity_id: string;
  filing_id: string;
  filing_version_id: string;
  reporting_period_id: string;
  period_end: string;
  period_label: string | null;
  metric_code: string;
  value_numeric: number | null;
  availability: string | null;
};

/** Analytics metric selector — canonical regulatory metric configuration. */
function useAnalyticsMetrics() {
  return useQuery({
    queryKey: ['prudential_analytics_metrics'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('prudential_analytics_metrics');
      if (error) throw error;
      return (data ?? []) as MetricOption[];
    },
  });
}

/** Entities and reporting periods that actually hold a canonical fact. */
function useMetricContext(metricCode?: string) {
  return useQuery({
    queryKey: ['prudential_analytics_metric_context', metricCode],
    enabled: !!metricCode,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('prudential_analytics_metric_context', {
        _metric_code: metricCode,
      });
      if (error) throw error;
      const payload = (data ?? {}) as {
        metric?: { metric_code: string; metric_name: string; unit: string | null } | null;
        entities?: MetricEntity[];
        periods?: MetricPeriod[];
      };
      return {
        metric: payload.metric ?? null,
        entities: payload.entities ?? [],
        periods: payload.periods ?? [],
      };
    },
  });
}

/** Canonical metric series — one point per reporting period, no superseded duplicates. */
function useMetricTrend(entityId?: string, metricCode?: string) {
  return useQuery({
    queryKey: ['prudential_analytics_metric_trend', entityId, metricCode],
    enabled: !!entityId && !!metricCode,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('prudential_analytics_metric_trend', {
        _entity_id: entityId,
        _metric_code: metricCode,
        _limit: 24,
      });
      if (error) throw error;
      return ((data ?? []) as TrendPoint[])
        .filter((p) => p.value_numeric != null)
        .map((p) => ({
          ...p,
          period: p.period_end,
          label: p.period_label || formatDateOnly(p.period_end),
          value: Number(p.value_numeric),
        }));
    },
  });
}

export default function PrudentialAnalytics() {
  const [metricCode, setMetricCode] = useState<string>();
  const [entityId, setEntityId] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');

  const metricsQuery = useAnalyticsMetrics();
  const metrics = metricsQuery.data ?? [];
  const contextQuery = useMetricContext(metricCode);
  const entities = contextQuery.data?.entities ?? [];
  const periods = contextQuery.data?.periods ?? [];
  const selectedMetric = metrics.find((m) => m.metric_code === metricCode);

  const trend = useMetricTrend(entityId || undefined, metricCode);
  const selectedEntity = entities.find((e) => e.entity_id === entityId);
  const peer = usePeerSnapshot(
    metricCode,
    periodEnd || null,
    selectedEntity?.sector_id ?? null,
    entityId || null,
  );

  const minPeersQuery = usePeerMinPeers();
  const canManageConfig = useCanManagePrudentialConfig().data ?? false;
  const savePeerMin = useSavePeerMinPeers();
  const [minPeersDraft, setMinPeersDraft] = useState<string>('');
  useEffect(() => {
    if (minPeersQuery.data != null) setMinPeersDraft(String(minPeersQuery.data));
  }, [minPeersQuery.data]);

  // Auto-select defaults
  useEffect(() => {
    if (!metricCode && metrics.length > 0) setMetricCode(metrics[0].metric_code);
  }, [metrics, metricCode]);

  useEffect(() => {
    if (!metricCode) {
      if (entityId) setEntityId('');
      return;
    }
    if (!contextQuery.isFetched) return;
    if (entities.length === 0) {
      if (entityId) setEntityId('');
      return;
    }
    if (!entities.find((e) => e.entity_id === entityId)) {
      setEntityId(entities[0].entity_id);
    }
  }, [metricCode, entities, entityId, contextQuery.isFetched]);

  useEffect(() => {
    if (!metricCode) {
      if (periodEnd) setPeriodEnd('');
      return;
    }
    if (!contextQuery.isFetched) return;
    if (periods.length === 0) {
      if (periodEnd) setPeriodEnd('');
      return;
    }
    if (!periods.find((p) => p.period_end === periodEnd)) {
      setPeriodEnd(periods[0].period_end);
    }
  }, [metricCode, periods, periodEnd, contextQuery.isFetched]);

  const MIN_PEERS = minPeersQuery.data ?? PEER_MIN_PEERS_DEFAULT;
  const peerCount = Number((peer.data as any)?.peer_count ?? (peer.data as any)?.count ?? 0);

  // The selected entity's own value for the peer period, taken from the
  // canonical series. Absent data stays absent — it is never coerced to zero.
  const selectedPoint = useMemo(() => {
    if (!periodEnd || !trend.data) return null;
    return (trend.data as any[]).find((d) => d.period === periodEnd) ?? null;
  }, [trend.data, periodEnd]);
  const entityValue = selectedPoint ? Number(selectedPoint.value) : null;

  const peerData = useMemo(() => {
    const p = peer.data as any;
    if (!p || (p.peer_count ?? p.count ?? 0) === 0) return [];
    return [
      { label: 'Min', value: p.min },
      { label: 'Median', value: p.median },
      { label: 'P90', value: p.p90 },
      { label: 'Max', value: p.max },
    ].filter((d) => d.value != null);
  }, [peer.data]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Prudential Metric Analytics"
          description="Metric trend and peer comparison for a regulated entity, resolved from canonical accepted return filings."
        />

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Prudential metric</Label>
            <Select value={metricCode} onValueChange={setMetricCode}>
              <SelectTrigger><SelectValue placeholder="Select metric" /></SelectTrigger>
              <SelectContent>
                {metrics.map((m) => (
                  <SelectItem key={m.metric_code} value={m.metric_code}>
                    {m.metric_name}{m.unit ? ` (${m.unit})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Regulated entity (for metric trend)</Label>
            <Select value={entityId || undefined} onValueChange={setEntityId} disabled={!metricCode || entities.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={metricCode ? (entities.length ? 'Select entity' : 'No reported facts') : 'Select metric first'} />
              </SelectTrigger>
              <SelectContent>
                {entities.map((e) => <SelectItem key={e.entity_id} value={e.entity_id}>{e.entity_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reporting period (for peer comparison)</Label>
            <Select value={periodEnd || undefined} onValueChange={setPeriodEnd} disabled={!metricCode || periods.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={metricCode ? (periods.length ? 'Select period' : 'No reported facts') : 'Select metric first'} />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.reporting_period_id} value={p.period_end}>
                    {p.period_label || formatDateOnly(p.period_end)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Metric Trend{selectedMetric ? ` — ${selectedMetric.metric_name}` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent style={{ height: 320 }}>
            {trend.isLoading ? (
              <p className="text-sm text-muted-foreground italic">Loading metric trend…</p>
            ) : trend.data && trend.data.length > 0 ? (
              <ResponsiveContainer>
                <LineChart data={trend.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No canonical metric facts reported for the selected metric and entity.
              </p>
            )}
          </CardContent>
        </Card>

        {selectedPoint && (
          <p className="text-xs text-muted-foreground">
            Selected period value sourced from filing{' '}
            <Link className="underline" to={objectRoute.returnFiling(selectedPoint.filing_id)}>
              {String(selectedPoint.filing_id).slice(0, 8)}
            </Link>{' '}
            (canonical accepted/current version).
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Peer comparison settings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <Label htmlFor="min-peers">Minimum peers required to publish a distribution</Label>
              <Input
                id="min-peers"
                type="number"
                min={PEER_MIN_PEERS_FLOOR}
                max={PEER_MIN_PEERS_CEILING}
                value={minPeersDraft}
                disabled={!canManageConfig || minPeersQuery.isLoading}
                onChange={(e) => setMinPeersDraft(e.target.value)}
              />
            </div>
            <Button
              disabled={
                !canManageConfig ||
                savePeerMin.isPending ||
                Number(minPeersDraft) === (minPeersQuery.data ?? PEER_MIN_PEERS_DEFAULT)
              }
              onClick={() => {
                const value = Number(minPeersDraft);
                if (!Number.isInteger(value) || value < PEER_MIN_PEERS_FLOOR || value > PEER_MIN_PEERS_CEILING) {
                  toast.error(`Enter a whole number between ${PEER_MIN_PEERS_FLOOR} and ${PEER_MIN_PEERS_CEILING}.`);
                  return;
                }
                savePeerMin.mutate(value, {
                  onSuccess: () => toast.success(`Minimum peer count set to ${value}.`),
                  onError: (e: any) => toast.error(e?.message || 'Could not save the minimum peer count.'),
                });
              }}
            >
              {savePeerMin.isPending ? 'Saving…' : 'Save'}
            </Button>
            <p className="text-xs text-muted-foreground max-w-md">
              Peer distributions are withheld until at least this many entities have reported the metric for the
              selected period. The floor of {PEER_MIN_PEERS_FLOOR} protects peer confidentiality and cannot be lowered.
              {!canManageConfig && ' You do not have permission to change this setting.'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Peer Comparison ({peerCount} peers)</CardTitle>
          </CardHeader>
          <CardContent style={{ height: 320 }}>
            {peer.isLoading ? (
              <p className="text-sm text-muted-foreground italic">Loading peer distribution…</p>
            ) : peerCount > 0 && peerCount < MIN_PEERS ? (
              <p className="text-sm text-muted-foreground italic">
                Insufficient peer data — {peerCount} peer{peerCount === 1 ? '' : 's'} reported this metric for the
                selected period; at least {MIN_PEERS} are required to publish a peer distribution.
              </p>
            ) : peerData.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={peerData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="hsl(var(--primary))" />
                  {entityValue !== null && (
                    <ReferenceLine
                      y={entityValue}
                      stroke="hsl(var(--destructive))"
                      strokeDasharray="4 4"
                      label={{ value: `Selected entity: ${entityValue}`, position: 'insideTopRight', fontSize: 11 }}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No peer facts reported for the selected metric and reporting period.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Advisory AI commentary sits after the deterministic trend and peer
            comparison it interprets — data first, interpretation second. */}
        <AdvisoryAiPanel
          analysisType="peer_divergence"
          scopeId={entityId || null}
          periodKey={periodEnd || null}
          facts={{
            metric: selectedMetric?.metric_name ?? metricCode ?? null,
            metric_code: metricCode ?? null,
            selected_period: periodEnd || null,
            entity_value_for_period: entityValue,
            trend: (trend.data as any[] | undefined)?.slice(-12).map((d) => ({ period: d.period, value: d.value })) ?? [],
            peer_statistics: peerCount >= MIN_PEERS
              ? {
                  sample_size: peerCount,
                  min: (peer.data as any)?.min ?? null,
                  median: (peer.data as any)?.median ?? null,
                  p90: (peer.data as any)?.p90 ?? null,
                  max: (peer.data as any)?.max ?? null,
                }
              : { publishable: false, minimum_sample_required: MIN_PEERS, sample_size: peerCount },
          }}
          ready={!!metricCode && !!entityId && !trend.isLoading}
          title="AI-assisted trend and peer commentary"
          description="Interprets the trend and peer statistics shown on this page. Peer institutions are never identified and no value is recalculated."
        />
      </div>
    </DashboardLayout>
  );
}
