import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
  const trend = useRatioTrend(ratioKey, licenseeId);
  const peer = usePeerSnapshot(ratioKey, periodEnd || null);

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
            <Label>Licensee ID (for trend)</Label>
            <Input value={licenseeId} onChange={(e) => setLicenseeId(e.target.value)} placeholder="uuid" />
          </div>
          <div>
            <Label>Period end (for peer comparison)</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Trend</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            {trend.data && trend.data.length > 0 ? (
              <ResponsiveContainer>
                <LineChart data={trend.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground italic">Select a ratio and licensee to view trend.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Peer Comparison ({(peer.data as any)?.count ?? 0} peers)</CardTitle>
          </CardHeader>
          <CardContent style={{ height: 320 }}>
            {peerData.length > 0 ? (
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
            ) : <p className="text-sm text-muted-foreground italic">Select a ratio and period end to view peer distribution.</p>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
