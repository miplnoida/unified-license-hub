import { useEffect, useMemo, useState } from 'react';
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
import { AdvisoryAiPanel } from '@/components/prudential/AdvisoryAiPanel';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend, ReferenceLine } from 'recharts';


function useRatioKeys() {
  return useQuery({
    queryKey: ['prudential_ratio_keys'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('prudential_ratios').select('ratio_key,label').eq('is_active', true);
      if (error) throw error;
      const seen = new Map<string, string>();
      (data ?? []).forEach((r: any) => seen.set(r.ratio_key, r.label));
      return Array.from(seen.entries()).map(([ratio_key, label]) => ({ ratio_key, label }));
    },
  });
}

async function fetchReturnIdsForRatio(ratioKey: string): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from('return_calculated_ratios')
    .select('return_id')
    .eq('ratio_key', ratioKey)
    .limit(5000);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r: any) => r.return_id).filter(Boolean)));
}

function useLicenseesForRatio(ratioKey: string | undefined) {
  return useQuery({
    queryKey: ['prudential_licensees_for_ratio', ratioKey],
    enabled: !!ratioKey,
    queryFn: async () => {
      const returnIds = await fetchReturnIdsForRatio(ratioKey as string);
      if (returnIds.length === 0) return [];
      const { data: rf, error: rfErr } = await (supabase as any)
        .from('returns_filed')
        .select('entity_id')
        .in('id', returnIds);
      if (rfErr) throw rfErr;
      const entityIds = Array.from(new Set((rf ?? []).map((r: any) => r.entity_id).filter(Boolean)));
      if (entityIds.length === 0) return [];
      const { data: lics, error: licErr } = await (supabase as any)
        .from('licensees')
        .select('id, name')
        .in('id', entityIds);
      if (licErr) throw licErr;
      return (lics ?? [])
        .map((l: any) => ({ id: l.id, name: l.name || `Licensee ${String(l.id).slice(0, 8)}` }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
    },
  });
}

function usePeriodEndsForRatio(ratioKey: string | undefined) {
  return useQuery({
    queryKey: ['prudential_periods_for_ratio', ratioKey],
    enabled: !!ratioKey,
    queryFn: async () => {
      const returnIds = await fetchReturnIdsForRatio(ratioKey as string);
      if (returnIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('returns_filed')
        .select('period_end_date')
        .in('id', returnIds);
      if (error) throw error;
      const seen = new Set<string>();
      (data ?? []).forEach((r: any) => { if (r.period_end_date) seen.add(r.period_end_date); });
      return Array.from(seen).sort((a, b) => b.localeCompare(a));
    },
  });
}

function useRatioTrend(ratioKey: string | undefined, licenseeId: string | undefined) {
  return useQuery({
    queryKey: ['ratio_trend', ratioKey, licenseeId],
    enabled: !!ratioKey && !!licenseeId,
    queryFn: async () => {
      const { data: rcr, error: rcrErr } = await (supabase as any)
        .from('return_calculated_ratios')
        .select('return_id, value, computed_at')
        .eq('ratio_key', ratioKey)
        .limit(5000);
      if (rcrErr) throw rcrErr;
      const returnIds = Array.from(new Set((rcr ?? []).map((r: any) => r.return_id).filter(Boolean)));
      if (returnIds.length === 0) return [];
      const { data: rf, error: rfErr } = await (supabase as any)
        .from('returns_filed')
        .select('id, entity_id, period_end_date')
        .in('id', returnIds)
        .eq('entity_id', licenseeId);
      if (rfErr) throw rfErr;
      const byId = new Map<string, { period_end_date: string | null }>();
      (rf ?? []).forEach((r: any) => byId.set(r.id, { period_end_date: r.period_end_date }));
      // Keep only the most recent computation per reporting period so repeated
      // recomputations do not plot duplicate points for the same period.
      const latest = new Map<string, { period: string; value: number; computed_at: string }>();
      (rcr ?? [])
        .filter((r: any) => byId.has(r.return_id))
        .forEach((r: any) => {
          const period = String(byId.get(r.return_id)?.period_end_date || r.computed_at);
          const prev = latest.get(period);
          if (!prev || String(r.computed_at ?? '') >= prev.computed_at) {
            latest.set(period, { period, value: Number(r.value ?? 0), computed_at: String(r.computed_at ?? '') });
          }
        });
      return Array.from(latest.values())
        .map((r) => ({ period: r.period, label: formatDateOnly(r.period), value: r.value }))
        .sort((a, b) => a.period.localeCompare(b.period));
    },
  });
}


export default function PrudentialAnalytics() {
  const [ratioKey, setRatioKey] = useState<string>();
  const [licenseeId, setLicenseeId] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');
  const { data: keys = [] } = useRatioKeys();
  const licenseesQuery = useLicenseesForRatio(ratioKey);
  const periodsQuery = usePeriodEndsForRatio(ratioKey);
  const licensees = licenseesQuery.data ?? [];
  const periods = periodsQuery.data ?? [];
  const trend = useRatioTrend(ratioKey, licenseeId);
  const peer = usePeerSnapshot(ratioKey, periodEnd || null);
  const minPeersQuery = usePeerMinPeers();
  const canManageConfig = useCanManagePrudentialConfig().data ?? false;
  const savePeerMin = useSavePeerMinPeers();
  const [minPeersDraft, setMinPeersDraft] = useState<string>('');
  useEffect(() => {
    if (minPeersQuery.data != null) setMinPeersDraft(String(minPeersQuery.data));
  }, [minPeersQuery.data]);


  // Auto-select defaults
  useEffect(() => {
    if (!ratioKey && keys.length > 0) setRatioKey(keys[0].ratio_key);
  }, [keys, ratioKey]);
  useEffect(() => {
    if (!ratioKey) {
      if (licenseeId) setLicenseeId('');
      return;
    }
    if (!licenseesQuery.isFetched) return;
    if (licensees.length === 0) {
      if (licenseeId) setLicenseeId('');
      return;
    }
    if (!licensees.find((l) => l.id === licenseeId)) {
      setLicenseeId(licensees[0].id);
    }
  }, [ratioKey, licensees, licenseeId, licenseesQuery.isFetched]);
  useEffect(() => {
    if (!ratioKey) {
      if (periodEnd) setPeriodEnd('');
      return;
    }
    if (!periodsQuery.isFetched) return;
    if (periods.length === 0) {
      if (periodEnd) setPeriodEnd('');
      return;
    }
    if (!periods.includes(periodEnd)) {
      setPeriodEnd(periods[0]);
    }
  }, [ratioKey, periods, periodEnd, periodsQuery.isFetched]);

  const MIN_PEERS = minPeersQuery.data ?? PEER_MIN_PEERS_DEFAULT;
  const peerCount = Number((peer.data as any)?.count ?? 0);
  const entityValue = useMemo(() => {
    if (!periodEnd || !trend.data) return null;
    const point = (trend.data as any[]).find((d) => d.period === periodEnd);
    return point ? Number(point.value) : null;
  }, [trend.data, periodEnd]);

  const peerData = useMemo(() => {
    if (!peer.data || (peer.data as any).count === 0) return [];
    const p = peer.data as any;
    return [
      { label: 'Min', value: p.min ?? 0 },
      { label: 'Median', value: p.median ?? 0 },
      { label: 'P90', value: p.p90 ?? 0 },
      { label: 'Max', value: p.max ?? 0 },
    ];
  }, [peer.data]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Prudential Analytics" description="Trend and peer comparison for computed prudential ratios." />

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Ratio</Label>
            <Select value={ratioKey} onValueChange={setRatioKey}>
              <SelectTrigger><SelectValue placeholder="Select ratio" /></SelectTrigger>
              <SelectContent>{keys.map((k) => <SelectItem key={k.ratio_key} value={k.ratio_key}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Licensee (for trend)</Label>
            <Select value={licenseeId || undefined} onValueChange={setLicenseeId} disabled={!ratioKey || licensees.length === 0}>
              <SelectTrigger><SelectValue placeholder={ratioKey ? (licensees.length ? 'Select licensee' : 'No data') : 'Select ratio first'} /></SelectTrigger>
              <SelectContent>
                {licensees.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Period end (for peer comparison)</Label>
            <Select value={periodEnd || undefined} onValueChange={setPeriodEnd} disabled={!ratioKey || periods.length === 0}>
              <SelectTrigger><SelectValue placeholder={ratioKey ? (periods.length ? 'Select period' : 'No data') : 'Select ratio first'} /></SelectTrigger>
              <SelectContent>
                {periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Trend</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            {trend.isLoading ? (
              <p className="text-sm text-muted-foreground italic">Loading trend…</p>
            ) : trend.data && trend.data.length > 0 ? (
              <ResponsiveContainer>
                <LineChart data={trend.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground italic">No trend data for the selected ratio and licensee.</p>}
          </CardContent>
        </Card>






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
              Peer distributions are withheld until at least this many entities have filed the ratio for the selected
              period. The floor of {PEER_MIN_PEERS_FLOOR} protects peer confidentiality and cannot be lowered.
              {!canManageConfig && ' You do not have permission to change this setting.'}
            </p>
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle className="text-base">Peer Comparison ({(peer.data as any)?.count ?? 0} peers)</CardTitle>
          </CardHeader>
          <CardContent style={{ height: 320 }}>
            {peer.isLoading ? (
              <p className="text-sm text-muted-foreground italic">Loading peer distribution…</p>
            ) : peerCount > 0 && peerCount < MIN_PEERS ? (
              <p className="text-sm text-muted-foreground italic">
                Insufficient peer data — {peerCount} peer{peerCount === 1 ? '' : 's'} filed this ratio for the selected period; at least {MIN_PEERS} are required to publish a peer distribution.
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
                      label={{ value: `Selected licensee: ${entityValue}`, position: 'insideTopRight', fontSize: 11 }}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground italic">No peer data for the selected ratio and period.</p>}
          </CardContent>
        </Card>

        {/* Advisory AI commentary sits after the deterministic trend and peer
            comparison it interprets — data first, interpretation second. */}
        <AdvisoryAiPanel
          analysisType="peer_divergence"
          scopeId={licenseeId || null}
          periodKey={periodEnd || null}
          facts={{
            ratio: keys.find((k) => k.ratio_key === ratioKey)?.label ?? ratioKey ?? null,
            selected_period: periodEnd || null,
            entity_value_for_period: entityValue,
            trend: (trend.data as any[] | undefined)?.slice(-12).map((d) => ({ period: d.period, value: d.value })) ?? [],
            peer_statistics: peerCount >= MIN_PEERS
              ? { sample_size: peerCount, min: (peer.data as any)?.min ?? null, median: (peer.data as any)?.median ?? null, p90: (peer.data as any)?.p90 ?? null, max: (peer.data as any)?.max ?? null }
              : { publishable: false, minimum_sample_required: MIN_PEERS, sample_size: peerCount },
          }}
          ready={!!ratioKey && !!licenseeId && !trend.isLoading}
          title="AI-assisted trend and peer commentary"
          description="Interprets the trend and peer statistics shown on this page. Peer institutions are never identified and no value is recalculated."
        />
      </div>
    </DashboardLayout>
  );
}
