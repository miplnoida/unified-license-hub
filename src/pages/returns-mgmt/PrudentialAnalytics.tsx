import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePeerSnapshot } from '@/hooks/usePrudentialConfig';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend } from 'recharts';

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

function useLicenseesForRatio(ratioKey: string | undefined) {
  return useQuery({
    queryKey: ['prudential_licensees_for_ratio', ratioKey],
    enabled: !!ratioKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('return_calculated_ratios')
        .select('returns_filed!inner(licensee_id,licensees!inner(id,legal_name))')
        .eq('ratio_key', ratioKey)
        .limit(2000);
      if (error) throw error;
      const seen = new Map<string, string>();
      (data ?? []).forEach((r: any) => {
        const lic = r.returns_filed?.licensees;
        if (lic?.id) seen.set(lic.id, lic.legal_name || lic.id);
      });
      return Array.from(seen.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

function usePeriodEndsForRatio(ratioKey: string | undefined) {
  return useQuery({
    queryKey: ['prudential_periods_for_ratio', ratioKey],
    enabled: !!ratioKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('return_calculated_ratios')
        .select('returns_filed!inner(period_end)')
        .eq('ratio_key', ratioKey)
        .limit(2000);
      if (error) throw error;
      const seen = new Set<string>();
      (data ?? []).forEach((r: any) => { if (r.returns_filed?.period_end) seen.add(r.returns_filed.period_end); });
      return Array.from(seen).sort((a, b) => b.localeCompare(a));
    },
  });
}

function useRatioTrend(ratioKey: string | undefined, licenseeId: string | undefined) {
  return useQuery({
    queryKey: ['ratio_trend', ratioKey, licenseeId],
    enabled: !!ratioKey && !!licenseeId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('return_calculated_ratios')
        .select('value,computed_at,returns_filed!inner(licensee_id,period_end)')
        .eq('ratio_key', ratioKey)
        .eq('returns_filed.licensee_id', licenseeId)
        .order('computed_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        period: r.returns_filed?.period_end || r.computed_at,
        value: Number(r.value ?? 0),
      }));
    },
  });
}

export default function PrudentialAnalytics() {
  const [ratioKey, setRatioKey] = useState<string>();
  const [licenseeId, setLicenseeId] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');
  const { data: keys = [] } = useRatioKeys();
  const { data: licensees = [] } = useLicenseesForRatio(ratioKey);
  const { data: periods = [] } = usePeriodEndsForRatio(ratioKey);
  const trend = useRatioTrend(ratioKey, licenseeId);
  const peer = usePeerSnapshot(ratioKey, periodEnd || null);

  // Auto-select defaults
  useEffect(() => {
    if (!ratioKey && keys.length > 0) setRatioKey(keys[0].ratio_key);
  }, [keys, ratioKey]);
  useEffect(() => {
    if (licensees.length > 0 && !licensees.find((l) => l.id === licenseeId)) {
      setLicenseeId(licensees[0].id);
    }
  }, [licensees, licenseeId]);
  useEffect(() => {
    if (periods.length > 0 && !periods.includes(periodEnd)) {
      setPeriodEnd(periods[0]);
    }
  }, [periods, periodEnd]);

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
                  <XAxis dataKey="period" />
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
            <CardTitle className="text-base">Peer Comparison ({(peer.data as any)?.count ?? 0} peers)</CardTitle>
          </CardHeader>
          <CardContent style={{ height: 320 }}>
            {peer.isLoading ? (
              <p className="text-sm text-muted-foreground italic">Loading peer distribution…</p>
            ) : peerData.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={peerData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground italic">No peer data for the selected ratio and period.</p>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
