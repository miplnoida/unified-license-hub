import { usePrudentialDashboardMetrics, useMarkOverdue, useStressEvents, useActions, useEscalations, useFeedLogs, useAssessments, usePrudentialEntities, useSectorRiskDistribution } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { RefreshCw, Play } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

function Stat({ label, value, to, tone }: { label: string; value: number | string; to?: string; tone?: 'default'|'warning'|'danger'|'success' }) {
  const color = tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-amber-600' : tone === 'success' ? 'text-emerald-600' : '';
  const body = (
    <Card className="hover:shadow transition h-full">
      <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent><div className={`text-2xl font-semibold ${color}`}>{value ?? 0}</div></CardContent>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

const PIE_COLORS = ['#dc2626','#f59e0b','#3b82f6','#10b981','#8b5cf6','#ec4899','#0ea5e9','#84cc16'];

export default function PrudentialDashboard() {
  const { data: m } = usePrudentialDashboardMetrics();
  const markOverdue = useMarkOverdue();
  const { data: events = [] } = useStressEvents();
  const { data: overdueActions = [] } = useActions({ status: 'overdue' });
  const { data: escalations = [] } = useEscalations({ status: 'open' });
  const { data: feeds = [] } = useFeedLogs();
  const { data: assessments = [] } = useAssessments();
  const { data: entities = [] } = usePrudentialEntities();
  const { data: sectorRisk = [] } = useSectorRiskDistribution();

  // Derived widgets
  const highRisk = entities.filter((e: any) => ['critical','high'].includes(e.worst_breach)).length;
  const critical = entities.filter((e: any) => e.worst_breach === 'critical').length;
  const amber = entities.filter((e: any) => e.worst_breach === 'high' || e.worst_breach === 'medium').length;
  const topRisk = [...entities]
    .sort((a: any, b: any) => (b.breach_count || 0) - (a.breach_count || 0))
    .slice(0, 10);
  const recentAssessments = assessments.slice(0, 5);
  const recentFailedFeeds = feeds.filter((f: any) => f.status === 'failed').slice(0, 5);

  return (
    <DashboardLayout>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Prudential Supervision</h1>
          <p className="text-sm text-muted-foreground">Consolidated prudential oversight</p>
        </div>
        <div className="flex gap-2">
          <RunSweepButton />
          <Button variant="outline" size="sm" onClick={() => markOverdue.mutate()}>
            <RefreshCw className="h-4 w-4 mr-2" />Sweep overdue actions
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Supervised entities" value={entities.length || m?.total_entities || 0} to="/prudential/entities" />
        <Stat label="High-risk entities" value={highRisk} tone="warning" to="/prudential/entities?risk=high" />
        <Stat label="Critical breaches" value={critical} tone="danger" to="/prudential/entities?risk=critical" />
        <Stat label="Amber/High breaches" value={amber} tone="warning" to="/prudential/entities?risk=high" />
        <Stat label="Open actions" value={m?.open_actions ?? 0} to="/prudential/actions" />
        <Stat label="Overdue actions" value={m?.overdue_actions ?? 0} tone="danger" to="/prudential/actions" />
        <Stat label="Open escalations" value={m?.open_escalations ?? 0} tone="warning" to="/prudential/escalations" />
        <Stat label="Stress events (30d)" value={m?.stress_events_30d ?? 0} to="/prudential/stress-indicators" />
        <Stat label="Recent breaches (30d)" value={m?.recent_breaches ?? 0} />
        <Stat label="Draft assessments" value={m?.assessments_draft ?? 0} to="/prudential/assessments" />
        <Stat label="Approved (30d)" value={m?.assessments_approved_30d ?? 0} tone="success" to="/prudential/assessments" />
        <Stat label="Data-feed failures" value={recentFailedFeeds.length} tone={recentFailedFeeds.length ? 'danger' : 'default'} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Sector risk distribution</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            {sectorRisk.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorRisk}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="sector_name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="entity_count" fill="#3b82f6" name="Entities" />
                  <Bar dataKey="breach_count" fill="#dc2626" name="Breaches" />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="text-sm text-muted-foreground">No data.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top 10 entities by breach count</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {topRisk.map((e: any) => (
              <Link key={e.id} to={`/prudential/entities/${e.id}`} className="flex justify-between py-1 border-b hover:bg-muted/50">
                <span className="truncate">{e.name}</span>
                <span className="text-muted-foreground">{e.breach_count} · <span className="capitalize">{e.worst_breach || '—'}</span></span>
              </Link>
            ))}
            {!topRisk.length && <div className="text-muted-foreground">No entities with breaches.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent stress events</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {events.slice(0, 10).map((e: any) => (
              <div key={e.id} className="flex justify-between border-b pb-1">
                <span>{e.prudential_stress_indicators?.label || e.indicator_id}</span>
                <span className="text-muted-foreground">{new Date(e.triggered_at).toLocaleDateString()}</span>
              </div>
            ))}
            {!events.length && <div className="text-muted-foreground">No events yet.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Overdue actions</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {overdueActions.slice(0, 10).map((a: any) => (
              <Link key={a.id} to="/prudential/actions" className="flex justify-between border-b pb-1 hover:bg-muted/50">
                <span>{a.title}</span>
                <span className="text-muted-foreground">{a.due_date}</span>
              </Link>
            ))}
            {!overdueActions.length && <div className="text-muted-foreground">No overdue actions.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Open escalations</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {escalations.slice(0, 10).map((e: any) => (
              <Link key={e.id} to="/prudential/escalations" className="flex justify-between border-b pb-1 hover:bg-muted/50">
                <span>{e.escalation_type}</span>
                <span className="text-muted-foreground">{e.licensees?.name}</span>
              </Link>
            ))}
            {!escalations.length && <div className="text-muted-foreground">No open escalations.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent assessments</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {recentAssessments.map((a: any) => (
              <Link key={a.id} to={`/prudential/assessments/${a.id}`} className="flex justify-between border-b pb-1 hover:bg-muted/50">
                <span>{a.licensees?.name || a.entity_id}</span>
                <span className="text-muted-foreground">{a.status} · {a.overall_rating || '—'}</span>
              </Link>
            ))}
            {!recentAssessments.length && <div className="text-muted-foreground">No assessments.</div>}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Recent data feed activity</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {feeds.slice(0, 10).map((f) => (
              <div key={f.id} className="flex justify-between border-b pb-1">
                <span>{f.source} / {f.feed_type} <span className="text-xs text-muted-foreground">{new Date(f.started_at).toLocaleString()}</span></span>
                <span className={f.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{f.status}</span>
              </div>
            ))}
            {!feeds.length && <div className="text-muted-foreground">No feeds logged.</div>}
          </CardContent>
        </Card>
      </div>
      </div>
    </DashboardLayout>
  );
}

function RunSweepButton() {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const run = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('prudential-monitoring-sweep', { body: {} });
      if (error) throw error;
      const evaluated = (data as any)?.returns_evaluated ?? 0;
      const failed = (data as any)?.failed ?? 0;
      toast.success(`Sweep complete: ${evaluated} return(s) re-evaluated${failed ? `, ${failed} failed` : ''}`);
      qc.invalidateQueries({ queryKey: ['prudential_feed_logs'] });
      qc.invalidateQueries({ queryKey: ['prudential_dashboard_metrics'] });
      qc.invalidateQueries({ queryKey: ['prudential_entities'] });
    } catch (e: any) {
      toast.error(e.message || 'Sweep failed');
    } finally { setBusy(false); }
  };
  return (
    <Button variant="default" size="sm" disabled={busy} onClick={run}>
      <Play className="h-4 w-4 mr-2" />{busy ? 'Sweeping…' : 'Run monitoring sweep'}
    </Button>
  );
}
