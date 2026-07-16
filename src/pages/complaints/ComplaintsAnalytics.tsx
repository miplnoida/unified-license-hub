import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface AnalyticsResult {
  total: number;
  open: number;
  resolved_or_closed: number;
  avg_resolve_hours: number;
  breached: number;
  at_risk: number;
  on_track: number;
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
  by_type: { type_id: string | null; name: string | null; count: number }[];
  trend: { day: string; count: number }[];
}

export default function ComplaintsAnalytics() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['complaints_analytics_rpc'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('complaints_analytics', { _filters: {} });
      if (error) throw error;
      return data as AnalyticsResult;
    },
  });

  if (isLoading) return <DashboardLayout><div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div></DashboardLayout>;
  if (error) return <DashboardLayout><div className="p-8 text-center text-destructive">{(error as Error).message}</div></DashboardLayout>;

  const d = data!;
  const avgResolveDays = Math.round((d.avg_resolve_hours || 0) / 24);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Complaints Analytics"
          description="Trends and SLA compliance across complaints"
          actions={<Button variant="outline" asChild><Link to="/complaints">Back to List</Link></Button>}
        />

        <div className="grid gap-4 md:grid-cols-5">
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-semibold">{d.total}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Open</p><p className="text-2xl font-semibold">{d.open}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Resolved/Closed</p><p className="text-2xl font-semibold">{d.resolved_or_closed}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Avg Resolve (days)</p><p className="text-2xl font-semibold">{avgResolveDays}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">SLA Breached</p><p className="text-2xl font-semibold text-destructive">{d.breached}</p></CardContent></Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader><CardTitle className="text-base">SLA Compliance</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><Badge>On track</Badge><span className="font-medium">{d.on_track}</span></div>
              <div className="flex items-center justify-between"><Badge variant="outline">At risk</Badge><span className="font-medium">{d.at_risk}</span></div>
              <div className="flex items-center justify-between"><Badge variant="destructive">Breached</Badge><span className="font-medium">{d.breached}</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">By Severity</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(d.by_severity || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <Badge variant="outline" className="capitalize">{k}</Badge>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
              {Object.keys(d.by_severity || {}).length === 0 && <p className="text-sm text-muted-foreground">No data.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">By Status</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(d.by_status || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
              {Object.keys(d.by_status || {}).length === 0 && <p className="text-sm text-muted-foreground">No data.</p>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">By Type</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(d.by_type || []).map((t) => (
              <div key={String(t.type_id) + t.name} className="flex items-center justify-between text-sm">
                <span>{t.name || 'Untyped'}</span>
                <span className="font-medium">{t.count}</span>
              </div>
            ))}
            {(d.by_type || []).length === 0 && <p className="text-sm text-muted-foreground">No data.</p>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
