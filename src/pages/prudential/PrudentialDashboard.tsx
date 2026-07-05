import { usePrudentialDashboardMetrics, useMarkOverdue, useStressEvents, useActions, useEscalations, useFeedLogs } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

function Stat({ label, value, to }: { label: string; value: number | string; to?: string }) {
  const body = (
    <Card className="hover:shadow transition">
      <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent><div className="text-2xl font-semibold">{value ?? 0}</div></CardContent>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function PrudentialDashboard() {
  const { data: m } = usePrudentialDashboardMetrics();
  const markOverdue = useMarkOverdue();
  const { data: events = [] } = useStressEvents();
  const { data: actions = [] } = useActions({ status: 'overdue' });
  const { data: escalations = [] } = useEscalations({ status: 'open' });
  const { data: feeds = [] } = useFeedLogs();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Prudential Supervision</h1>
          <p className="text-sm text-muted-foreground">Consolidated prudential oversight</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => markOverdue.mutate()}>
          <RefreshCw className="h-4 w-4 mr-2" />Sweep overdue actions
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Supervised entities" value={m?.total_entities ?? 0} to="/prudential/entities" />
        <Stat label="Open actions" value={m?.open_actions ?? 0} to="/prudential/actions" />
        <Stat label="Overdue actions" value={m?.overdue_actions ?? 0} to="/prudential/actions" />
        <Stat label="Recent breaches (30d)" value={m?.recent_breaches ?? 0} />
        <Stat label="Stress events (30d)" value={m?.stress_events_30d ?? 0} to="/prudential/stress-indicators" />
        <Stat label="Open escalations" value={m?.open_escalations ?? 0} to="/prudential/escalations" />
        <Stat label="Draft assessments" value={m?.assessments_draft ?? 0} to="/prudential/assessments" />
        <Stat label="Approved (30d)" value={m?.assessments_approved_30d ?? 0} to="/prudential/assessments" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
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
            {actions.slice(0, 10).map((a: any) => (
              <div key={a.id} className="flex justify-between border-b pb-1">
                <span>{a.title}</span>
                <span className="text-muted-foreground">{a.due_date}</span>
              </div>
            ))}
            {!actions.length && <div className="text-muted-foreground">No overdue actions.</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Open escalations</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {escalations.slice(0, 10).map((e: any) => (
              <div key={e.id} className="flex justify-between border-b pb-1">
                <span>{e.escalation_type}</span>
                <span className="text-muted-foreground">{e.licensees?.name}</span>
              </div>
            ))}
            {!escalations.length && <div className="text-muted-foreground">No open escalations.</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent data feed activity</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {feeds.slice(0, 10).map((f) => (
              <div key={f.id} className="flex justify-between border-b pb-1">
                <span>{f.source} / {f.feed_type}</span>
                <span className={f.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{f.status}</span>
              </div>
            ))}
            {!feeds.length && <div className="text-muted-foreground">No feeds logged.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
