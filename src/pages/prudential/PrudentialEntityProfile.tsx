import { useParams, Link } from 'react-router-dom';
import { useEntityHistoricalProfile, useEvaluateStressForReturn, useEntityAuditHistory } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { History, Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useMemo, useState } from 'react';
import { CreatePrudentialActionDialog } from '@/components/prudential/CreatePrudentialActionDialog';
import { CreatePrudentialEscalationDialog } from '@/components/prudential/CreatePrudentialEscalationDialog';
import { PrudentialEntityHistoryDrawer } from '@/components/prudential/PrudentialEntityHistoryDrawer';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

const RISK_TONE: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  red: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-amber-500/10 text-amber-700 border-amber-200',
  amber: 'bg-amber-500/10 text-amber-700 border-amber-200',
  medium: 'bg-amber-500/10 text-amber-700 border-amber-200',
  warn: 'bg-amber-500/10 text-amber-700 border-amber-200',
  breach: 'bg-destructive/10 text-destructive border-destructive/30',
  low: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
};

function formatRatio(value: any, fmt?: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  switch ((fmt || '').toLowerCase()) {
    case 'percent':
    case 'percentage':
      return `${(n * 100).toFixed(2)}%`;
    case 'multiple':
    case 'ratio':
      return `${n.toFixed(2)}x`;
    case 'currency':
      return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    default:
      return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
}

function toCsv(rows: Array<Record<string, any>>): string {
  if (!rows.length) return '';
  const headers = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>()));
  const esc = (v: any) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

function downloadCsv(name: string, rows: Array<Record<string, any>>) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PrudentialEntityProfile() {
  const { id } = useParams();
  const { data, isLoading, refetch } = useEntityHistoricalProfile(id);
  const evalStress = useEvaluateStressForReturn();
  const audit = useEntityAuditHistory(id);
  const [createAction, setCreateAction] = useState<any>(null);
  const [createEscalation, setCreateEscalation] = useState<any>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const ratioLabels = useMemo(() => {
    const m: Record<string, { label: string; fmt?: string }> = {};
    (data?.ratios || []).forEach((r: any) => {
      if (!m[r.ratio_key]) m[r.ratio_key] = { label: r.label || r.ratio_key, fmt: r.display_format };
    });
    return m;
  }, [data?.ratios]);

  const ratioTrend = useMemo(() => {
    if (!data?.ratios) return [] as any[];
    const byPeriod: Record<string, any> = {};
    const returnsById: Record<string, any> = Object.fromEntries((data.returns || []).map((r: any) => [r.id, r]));
    (data.ratios || []).forEach((r: any) => {
      const rf = returnsById[r.return_id];
      const key = rf?.period_end_date || r.computed_at;
      byPeriod[key] = { period: key, ...(byPeriod[key] || {}), [r.ratio_key]: Number(r.value) };
    });
    return Object.values(byPeriod).sort((a: any, b: any) => String(a.period).localeCompare(String(b.period)));
  }, [data]);

  if (isLoading || !data?.entity) return <DashboardLayout><div>Loading…</div></DashboardLayout>;
  const e: any = data.entity;
  const latestAssess = data.assessments?.[0];
  const openActions = (data.actions || []).filter((a: any) => ['open','in_progress','overdue'].includes(a.status));
  const overdueActions = openActions.filter((a: any) => a.status === 'overdue');
  const openEsc = (data.escalations || []).filter((es: any) => ['open','under_review'].includes(es.status));
  const worstBreachSev = (() => {
    const order = ['red','breach','critical','amber','warn','high','medium','low'];
    let worst: string | null = null;
    (data.breaches || []).forEach((b: any) => {
      const s = b.risk_level || b.severity || b.level;
      if (!s) return;
      if (!worst || order.indexOf(s) < order.indexOf(worst)) worst = s;
    });
    return worst;
  })();

  const exportProfile = () => {
    const returnsById: Record<string, any> = Object.fromEntries((data.returns || []).map((r: any) => [r.id, r]));
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`${e.name}-ratios-${stamp}.csv`, (data.ratios || []).map((r: any) => {
      const rf = returnsById[r.return_id];
      return {
        ratio_key: r.ratio_key,
        label: r.label || r.ratio_key,
        period_end: rf?.period_end_date ?? '',
        value_raw: r.value,
        value_formatted: formatRatio(r.value, r.display_format),
        display_format: r.display_format ?? '',
        computed_at: r.computed_at ?? '',
      };
    }));
    downloadCsv(`${e.name}-breaches-${stamp}.csv`, (data.breaches || []).map((b: any) => {
      const rf = returnsById[b.return_id];
      return {
        metric_key: b.metric_key || b.ratio_key || '',
        level: b.level || '',
        risk_level: b.risk_level || b.severity || '',
        value: b.value ?? b.observed_value ?? '',
        threshold_value: b.threshold_value ?? '',
        comparator: b.comparator ?? '',
        period_end: rf?.period_end_date ?? '',
        detected_at: b.detected_at ?? '',
      };
    }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{e.name}</h1>
          <p className="text-sm text-muted-foreground">
            License: <Badge variant="outline">{e.status || '—'}</Badge>{' '}
            {e.systemic_importance && <>· Systemic: <Badge>{e.systemic_importance}</Badge></>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setCreateAction({ entity_id: e.id, source_type: 'manual' })}>New action</Button>
          <Button size="sm" variant="outline" onClick={() => setCreateEscalation({ entity_id: e.id, related_type: 'entity' })}>New escalation</Button>
          <HistoryButton entityType="licensee" entityId={e.id} title={`${e.name} history`} />
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="returns">Historical Returns</TabsTrigger>
          <TabsTrigger value="ratios">Ratios & Trends</TabsTrigger>
          <TabsTrigger value="breaches">Breaches</TabsTrigger>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="escalations">Escalations</TabsTrigger>
          <TabsTrigger value="stress">Stress Events</TabsTrigger>
          <TabsTrigger value="audit">Audit History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid md:grid-cols-4 gap-3">
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Latest return</CardTitle></CardHeader>
              <CardContent className="text-sm">{data.returns[0]?.period_end_date || '—'}<br /><Badge variant="outline">{data.returns[0]?.workflow_status || data.returns[0]?.status || '—'}</Badge></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Latest rating</CardTitle></CardHeader>
              <CardContent className="text-sm">{latestAssess?.overall_rating || '—'}<br /><span className="text-xs text-muted-foreground">{latestAssess?.status || 'no assessment'}</span></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Worst breach</CardTitle></CardHeader>
              <CardContent className="text-sm">{worstBreachSev ? <Badge className={RISK_TONE[worstBreachSev]}>{worstBreachSev}</Badge> : '—'}</CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Open actions</CardTitle></CardHeader>
              <CardContent className="text-sm">{openActions.length} <span className="text-destructive">({overdueActions.length} overdue)</span></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Open escalations</CardTitle></CardHeader>
              <CardContent className="text-sm">{openEsc.length}</CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Recent stress events</CardTitle></CardHeader>
              <CardContent className="text-sm">{(data.stress_events || []).filter((s: any) => !s.resolved_at).length}</CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="returns">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Return</TableHead><TableHead>Period end</TableHead><TableHead>Submitted</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {data.returns.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell><Link className="text-primary underline" to={`/returns-management/${r.id}`}>{r.unique_id || r.id.slice(0,8)}</Link></TableCell>
                    <TableCell>{r.period_end_date}</TableCell>
                    <TableCell>{r.submit_date ? new Date(r.submit_date).toLocaleDateString() : '—'}</TableCell>
                    <TableCell><Badge variant="outline">{r.workflow_status || r.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={async () => { await evalStress.mutateAsync(r.id); refetch(); }}>Evaluate stress</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!data.returns.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No returns.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ratios">
          <Card>
            <CardHeader><CardTitle>Ratio trend</CardTitle></CardHeader>
            <CardContent style={{ height: 300 }}>
              {ratioTrend.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ratioTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {Object.keys(ratioTrend[0] as any).filter(k => k !== 'period').slice(0, 6).map((k, i) => (
                      <Line key={k} dataKey={k} stroke={['#3b82f6','#dc2626','#10b981','#f59e0b','#8b5cf6','#ec4899'][i]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="text-sm text-muted-foreground">No ratios computed.</div>}
            </CardContent>
          </Card>
          <Card className="mt-3"><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Ratio</TableHead><TableHead>Value</TableHead><TableHead>Computed</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.ratios.slice(0, 100).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.label || r.ratio_key}</TableCell>
                    <TableCell className="tabular-nums">{r.value}</TableCell>
                    <TableCell>{r.computed_at ? new Date(r.computed_at).toLocaleDateString() : '—'}</TableCell>
                  </TableRow>
                ))}
                {!data.ratios.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No ratios yet.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="breaches">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Metric</TableHead><TableHead>Severity</TableHead><TableHead>Value</TableHead><TableHead>Threshold</TableHead><TableHead>Detected</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {data.breaches.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell>{b.metric_key || b.ratio_key || '—'}</TableCell>
                    <TableCell><Badge className={RISK_TONE[b.severity] || ''}>{b.severity || '—'}</Badge></TableCell>
                    <TableCell className="tabular-nums">{b.observed_value ?? b.value ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{b.threshold_value ?? '—'}</TableCell>
                    <TableCell>{b.detected_at ? new Date(b.detected_at).toLocaleDateString() : '—'}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => setCreateAction({
                        entity_id: e.id, source_type: 'return_breach', source_id: b.id,
                        title: `Follow-up on breach: ${b.metric_key || b.ratio_key}`, severity: b.severity,
                        description: `Breach detected on ${b.metric_key || b.ratio_key} (value ${b.observed_value ?? b.value}, threshold ${b.threshold_value}).`,
                      })}>Create action</Button>
                      {['critical','high'].includes(b.severity) && (
                        <Button size="sm" variant="ghost" onClick={() => setCreateEscalation({
                          entity_id: e.id, related_type: 'return', related_id: b.return_id,
                          escalation_type: 'immediate_risk', reason: `${b.severity} breach on ${b.metric_key || b.ratio_key}`,
                        })}>Escalate</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!data.breaches.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No breaches.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="assessments">
          <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Assessments</CardTitle>
            <Link className="text-primary text-sm underline" to={`/prudential/assessments?entity=${e.id}`}>New assessment</Link>
          </CardHeader><CardContent>
            <Table><TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Rating</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {data.assessments.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.period_start} → {a.period_end}</TableCell>
                    <TableCell><Badge>{a.overall_rating || '—'}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{a.status}</Badge></TableCell>
                    <TableCell className="text-right"><Link className="text-primary underline" to={`/prudential/assessments/${a.id}`}>Open</Link></TableCell>
                  </TableRow>
                ))}
                {!data.assessments.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No assessments.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="actions">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.actions.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.title}</TableCell>
                    <TableCell>{a.action_type}</TableCell>
                    <TableCell><Badge className={RISK_TONE[a.severity] || ''}>{a.severity}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{a.status}</Badge></TableCell>
                    <TableCell>{a.due_date || '—'}</TableCell>
                  </TableRow>
                ))}
                {!data.actions.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No actions.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="escalations">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead>Decision</TableHead><TableHead>Decided</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.escalations.map((es: any) => (
                  <TableRow key={es.id}>
                    <TableCell>{es.escalation_type}</TableCell>
                    <TableCell className="max-w-md truncate">{es.reason}</TableCell>
                    <TableCell><Badge variant="outline">{es.status}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate">{es.decision || '—'}</TableCell>
                    <TableCell>{es.decided_at ? new Date(es.decided_at).toLocaleDateString() : '—'}</TableCell>
                  </TableRow>
                ))}
                {!data.escalations.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No escalations.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="stress">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Indicator</TableHead><TableHead>Metric</TableHead><TableHead>Observed</TableHead><TableHead>Severity</TableHead><TableHead>Triggered</TableHead><TableHead>Resolved</TableHead></TableRow></TableHeader>
              <TableBody>
                {(data.stress_events || []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.prudential_stress_indicators?.label || s.indicator_id}</TableCell>
                    <TableCell>{s.prudential_stress_indicators?.metric_key || '—'}</TableCell>
                    <TableCell className="tabular-nums">{s.observed_value ?? '—'}</TableCell>
                    <TableCell><Badge className={RISK_TONE[s.prudential_stress_indicators?.severity] || ''}>{s.prudential_stress_indicators?.severity || '—'}</Badge></TableCell>
                    <TableCell>{new Date(s.triggered_at).toLocaleDateString()}</TableCell>
                    <TableCell>{s.resolved_at ? new Date(s.resolved_at).toLocaleDateString() : '—'}</TableCell>
                  </TableRow>
                ))}
                {!(data.stress_events || []).length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No stress events.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card><CardContent className="pt-4">
            <div className="text-sm">
              {audit.data?.length ? (
                <Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Object</TableHead><TableHead>Justification</TableHead><TableHead>Actor</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {audit.data.slice(0, 200).map((a: any) => (
                      <TableRow key={a.entry_id}>
                        <TableCell className="whitespace-nowrap">{new Date(a.timestamp).toLocaleString()}</TableCell>
                        <TableCell>{a.action_type}</TableCell>
                        <TableCell>{a.object_type}</TableCell>
                        <TableCell className="max-w-md truncate">{a.justification || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{a.user_id?.slice(0,8) || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <div className="text-muted-foreground">No audit records.</div>}
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <CreatePrudentialActionDialog open={!!createAction} onOpenChange={(o) => !o && setCreateAction(null)} defaults={createAction} />
      <CreatePrudentialEscalationDialog open={!!createEscalation} onOpenChange={(o) => !o && setCreateEscalation(null)} defaults={createEscalation} />
      </div>
    </DashboardLayout>
  );
}
