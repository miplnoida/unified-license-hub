import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function ComplaintsAnalytics() {
  const { data, isLoading } = useQuery({
    queryKey: ['complaints_analytics'],
    queryFn: async () => {
      const [{ data: complaints }, { data: types }] = await Promise.all([
        supabase.from('complaints').select('id, status, severity, complaint_type_id, created_at, resolved_at'),
        supabase.from('complaint_types').select('id, name, sla_days'),
      ]);
      return { complaints: complaints ?? [], types: types ?? [] };
    },
  });

  if (isLoading) return <DashboardLayout><div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div></DashboardLayout>;

  const c = data?.complaints ?? [];
  const types = data?.types ?? [];
  const typeMap = new Map(types.map((t: any) => [t.id, t]));

  const total = c.length;
  const open = c.filter((x: any) => x.status !== 'closed' && x.status !== 'resolved').length;
  const resolved = c.filter((x: any) => x.status === 'resolved' || x.status === 'closed').length;

  const bySeverity = c.reduce<Record<string, number>>((acc, x: any) => {
    acc[x.severity || 'low'] = (acc[x.severity || 'low'] || 0) + 1;
    return acc;
  }, {});

  const byType = c.reduce<Record<string, number>>((acc, x: any) => {
    const name = x.complaint_type_id ? (typeMap.get(x.complaint_type_id) as any)?.name || 'Unknown' : 'Untyped';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  const withResolved = c.filter((x: any) => x.resolved_at);
  const avgResolveDays = withResolved.length
    ? Math.round(withResolved.reduce((s: number, x: any) => s + (new Date(x.resolved_at).getTime() - new Date(x.created_at).getTime()) / (1000 * 60 * 60 * 24), 0) / withResolved.length)
    : 0;

  const slaBreached = c.filter((x: any) => {
    if (x.resolved_at) return false;
    const days = (Date.now() - new Date(x.created_at).getTime()) / (1000 * 60 * 60 * 24);
    const sla = x.complaint_type_id ? (typeMap.get(x.complaint_type_id) as any)?.sla_days || 30 : 30;
    return days > sla;
  }).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Complaints Analytics"
          description="Trends and SLA compliance across complaints"
          actions={<Button variant="outline" asChild><Link to="/complaints">Back to List</Link></Button>}
        />

        <div className="grid gap-4 md:grid-cols-5">
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-semibold">{total}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Open</p><p className="text-2xl font-semibold">{open}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Resolved/Closed</p><p className="text-2xl font-semibold">{resolved}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Avg Resolve (days)</p><p className="text-2xl font-semibold">{avgResolveDays}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">SLA Breached</p><p className="text-2xl font-semibold text-destructive">{slaBreached}</p></CardContent></Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">By Severity</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(bySeverity).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <Badge variant="outline" className="capitalize">{k}</Badge>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
              {Object.keys(bySeverity).length === 0 && <p className="text-sm text-muted-foreground">No data.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">By Type</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span>{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
              {Object.keys(byType).length === 0 && <p className="text-sm text-muted-foreground">No data.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
