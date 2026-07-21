import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PlayCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend, PieChart, Pie, Cell,
} from 'recharts';

const COLORS = ['#1E3A8A', '#16A34A', '#DC2626', '#F59E0B', '#7C3AED'];

function monthKey(d: string | Date) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

export default function FpPopulationTrends() {
  const { data: findings, isLoading: lf } = useQuery({
    queryKey: ['fp_trend_findings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_findings')
        .select('id, individual_id, severity, check_type, source, confidence_score, resolution_status, is_false_positive, created_at')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: assessments } = useQuery({
    queryKey: ['fp_trend_assessments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_assessments')
        .select('id, status, assessment_type, created_at')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: appeals } = useQuery({
    queryKey: ['fp_trend_appeals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_appeals')
        .select('id, status, decision, filed_at')
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: determinations } = useQuery({
    queryKey: ['fp_trend_determinations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_determinations')
        .select('id, outcome, determined_at')
        .order('determined_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const findingsByMonth = useMemo(() => {
    const buckets: Record<string, { month: string; adverse: number; total: number; high: number }> = {};
    for (const f of findings ?? []) {
      const m = monthKey(f.created_at);
      const b = buckets[m] ?? (buckets[m] = { month: m, adverse: 0, total: 0, high: 0 });
      b.total++;
      if (!f.is_false_positive && f.resolution_status !== 'false_positive') b.adverse++;
      if (f.severity === 'high') b.high++;
    }
    return Object.values(buckets).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [findings]);

  const byCheckType = useMemo(() => {
    const b: Record<string, number> = {};
    for (const f of findings ?? []) b[f.check_type] = (b[f.check_type] || 0) + 1;
    return Object.entries(b).map(([name, value]) => ({ name, value }));
  }, [findings]);

  const resolutionMix = useMemo(() => {
    const b: Record<string, number> = {};
    for (const f of findings ?? []) {
      const k = f.resolution_status || 'pending';
      b[k] = (b[k] || 0) + 1;
    }
    return Object.entries(b).map(([name, value]) => ({ name, value }));
  }, [findings]);

  const assessmentThroughput = useMemo(() => {
    const buckets: Record<string, { month: string; total: number; approved: number; refused: number; conditional: number }> = {};
    for (const a of assessments ?? []) {
      const m = monthKey(a.created_at);
      const b = buckets[m] ?? (buckets[m] = { month: m, total: 0, approved: 0, refused: 0, conditional: 0 });
      b.total++;
    }
    for (const d of determinations ?? []) {
      const m = monthKey(d.determined_at);
      const b = buckets[m] ?? (buckets[m] = { month: m, total: 0, approved: 0, refused: 0, conditional: 0 });
      if (d.outcome === 'approved') b.approved++;
      if (d.outcome === 'rejected') b.refused++;
      if (d.outcome === 'conditional') b.conditional++;
    }
    return Object.values(buckets).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [assessments, determinations]);

  const appealStats = useMemo(() => {
    const total = (appeals ?? []).length;
    const upheld = (appeals ?? []).filter((a: any) => a.decision === 'upheld' || a.decision === 'partially_upheld' || a.decision === 'overturned_to_approved' || a.decision === 'overturned_to_conditional').length;
    const dismissed = (appeals ?? []).filter((a: any) => a.decision === 'dismissed' || a.decision === 'upheld_original').length;
    const pending = total - upheld - dismissed;
    return { total, upheld, dismissed, pending };
  }, [appeals]);

  const runScheduler = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fp-cycle-scheduler', { body: {} });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Scheduler failed');
      toast.success(`Cycle scheduler ran — ${data.opened} assessment(s) opened, ${data.due} due, ${data.evaluated} evaluated`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="F&P Population Trends"
          description="Adverse-finding rates, screening mix, and appeal outcomes across the fit-and-proper population."
          backHref="/fit-and-proper"
          backLabel="Register"
          actions={
            <Button data-rbac="fit_and_proper.configure" size="sm" variant="outline" onClick={runScheduler}>
              <PlayCircle className="h-4 w-4 mr-2" /> Run cycle scheduler now
            </Button>
          }
        />

        {lf ? (
          <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Findings by month (last 12)</CardTitle></CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={findingsByMonth}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="total" stroke="#1E3A8A" />
                      <Line type="monotone" dataKey="adverse" stroke="#DC2626" />
                      <Line type="monotone" dataKey="high" stroke="#F59E0B" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Assessment throughput</CardTitle></CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={assessmentThroughput}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="total" fill="#1E3A8A" />
                      <Bar dataKey="approved" fill="#16A34A" />
                      <Bar dataKey="conditional" fill="#F59E0B" />
                      <Bar dataKey="refused" fill="#DC2626" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Findings by check type</CardTitle></CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byCheckType} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" fontSize={11} />
                      <YAxis type="category" dataKey="name" fontSize={11} width={140} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#7C3AED" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Resolution mix</CardTitle></CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={resolutionMix} dataKey="value" nameKey="name" outerRadius={100} label>
                        {resolutionMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-sm">Appeals</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div><div className="text-2xl font-bold">{appealStats.total}</div><div className="text-xs text-muted-foreground">Total</div></div>
                  <div><div className="text-2xl font-bold text-green-700">{appealStats.upheld}</div><div className="text-xs text-muted-foreground">Upheld</div></div>
                  <div><div className="text-2xl font-bold text-red-700">{appealStats.dismissed}</div><div className="text-xs text-muted-foreground">Dismissed</div></div>
                  <div><div className="text-2xl font-bold text-amber-700">{appealStats.pending}</div><div className="text-xs text-muted-foreground">Pending</div></div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
