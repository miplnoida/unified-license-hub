import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Loader2, AlertTriangle, ShieldAlert, Users, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { ConductTrendsPanel } from '@/components/conduct/analytics/ConductTrendsPanel';
import { ConductDrillthroughPanel } from '@/components/conduct/analytics/ConductDrillthroughPanel';
import { ConductPeerComparisonPanel } from '@/components/conduct/analytics/ConductPeerComparisonPanel';
import { SavedViewsBar } from '@/components/conduct/analytics/SavedViewsBar';
import { useConductSavedViews } from '@/hooks/useConductSavedViews';
import { SupervisoryAiPanel } from '@/components/ai/SupervisoryAiPanel';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--info))', 'hsl(var(--success))', '#8b5cf6', '#ec4899'];

export default function ConductDashboard() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [licensees, setLicensees] = useState<any[]>([]);
  const [f, setF] = useState({ product_id: 'all', channel_id: 'all', category_id: 'all', licensee_id: 'all', days: '90', severity: 'all', priority: 'all', customer_type: 'all', vulnerable: 'all', alert_status: 'all' });
  const [complaints, setComplaints] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [tab, setTab] = useState('overview');
  const [peerEntityId, setPeerEntityId] = useState('');
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [defaultApplied, setDefaultApplied] = useState(false);

  const { data: savedViews } = useConductSavedViews();

  // Default saved view auto-applies once; explicit URL params still win.
  useEffect(() => {
    if (defaultApplied || !savedViews) return;
    setDefaultApplied(true);
    if (window.location.search) return;
    const def = savedViews.find((v) => v.is_default);
    if (!def) return;
    setActiveViewId(def.id);
    if (def.config?.filters) setF((prev) => ({ ...prev, ...def.config.filters }));
    if (def.config?.tab) setTab(def.config.tab);
    if (typeof def.config?.peerEntityId === 'string') setPeerEntityId(def.config.peerEntityId);
  }, [savedViews, defaultApplied]);

  useEffect(() => {
    (async () => {
      const [p, c, cat, lic] = await Promise.all([
        supabase.from('conduct_products').select('id,name').eq('active', true).order('name'),
        supabase.from('conduct_channels').select('id,name').eq('active', true).order('name'),
        supabase.from('conduct_risk_categories').select('id,name,code').eq('active', true).order('name'),
        supabase.from('licensees').select('id,name,sector_id,sub_sector_id').order('name').limit(500),
      ]);
      setProducts(p.data || []); setChannels(c.data || []); setCategories(cat.data || []); setLicensees(lic.data || []);
    })();
  }, []);

  const labels = useMemo(() => ({
    product: (id?: string | null) => products.find(p => p.id === id)?.name || '—',
    channel: (id?: string | null) => channels.find(p => p.id === id)?.name || '—',
    category: (id?: string | null) => categories.find(p => p.id === id)?.name || '—',
    licensee: (id?: string | null) => licensees.find(p => p.id === id)?.name || '—',
  }), [products, channels, categories, licensees]);


  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - Number(f.days) * 24 * 3600 * 1000).toISOString();
    let cq = supabase.from('complaints')
      .select('id, complaint_number, subject, severity, status, priority, product_id, channel_id, conduct_risk_category_id, licensee_id, created_at, sla_due_at, resolved_at, vulnerability_indicator, customer_type, repeat_complaint_count')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(1000);
    if (f.product_id !== 'all') cq = cq.eq('product_id', f.product_id);
    if (f.channel_id !== 'all') cq = cq.eq('channel_id', f.channel_id);
    if (f.category_id !== 'all') cq = cq.eq('conduct_risk_category_id', f.category_id);
    if (f.licensee_id !== 'all') cq = cq.eq('licensee_id', f.licensee_id);
    if (f.severity !== 'all') cq = cq.eq('severity', f.severity);
    if (f.priority !== 'all') cq = cq.eq('priority', f.priority);
    if (f.customer_type !== 'all') cq = cq.eq('customer_type', f.customer_type);
    if (f.vulnerable === 'yes') cq = cq.eq('vulnerability_indicator', true);
    if (f.vulnerable === 'no') cq = cq.eq('vulnerability_indicator', false);
    const { data: cData, error: cErr } = await cq;
    if (cErr) toast.error(cErr.message);

    let aq = supabase.from('conduct_alerts').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(500);
    if (f.product_id !== 'all') aq = aq.eq('product_id', f.product_id);
    if (f.channel_id !== 'all') aq = aq.eq('channel_id', f.channel_id);
    if (f.category_id !== 'all') aq = aq.eq('conduct_risk_category_id', f.category_id);
    if (f.licensee_id !== 'all') aq = aq.eq('licensee_id', f.licensee_id);
    if (f.alert_status !== 'all') aq = aq.eq('status', f.alert_status);
    const { data: aData } = await aq;

    setComplaints(cData || []); setAlerts(aData || []); setLoading(false);
  };
  useEffect(() => { load(); }, [f.product_id, f.channel_id, f.category_id, f.licensee_id, f.days, f.severity, f.priority, f.customer_type, f.vulnerable, f.alert_status]);

  const kpis = useMemo(() => {
    const total = complaints.length;
    const openComplaints = complaints.filter(c => c.status !== 'closed' && c.status !== 'resolved').length;
    const openAlerts = alerts.filter(a => a.status === 'open').length;
    const critical = complaints.filter(c => c.severity === 'critical').length;
    const vulnerable = complaints.filter(c => c.vulnerability_indicator).length;
    const now = Date.now();
    const slaBreached = complaints.filter(c => !c.resolved_at && c.sla_due_at && new Date(c.sla_due_at).getTime() < now).length;
    const slaAtRisk = complaints.filter(c => !c.resolved_at && c.sla_due_at && new Date(c.sla_due_at).getTime() >= now && new Date(c.sla_due_at).getTime() - now < 24 * 3600 * 1000).length;
    const repeat = complaints.filter(c => (c.repeat_complaint_count ?? 0) >= 3).length;
    return { total, openComplaints, openAlerts, critical, vulnerable, slaBreached, slaAtRisk, repeat };
  }, [complaints, alerts]);

  const byProduct = useMemo(() => groupBy(complaints, c => products.find(p => p.id === c.product_id)?.name || '—'), [complaints, products]);
  const byChannel = useMemo(() => groupBy(complaints, c => channels.find(p => p.id === c.channel_id)?.name || '—'), [complaints, channels]);
  const byCategory = useMemo(() => groupBy(complaints, c => categories.find(p => p.id === c.conduct_risk_category_id)?.name || '—'), [complaints, categories]);
  const bySeverity = useMemo(() => groupBy(complaints, c => c.severity || '—'), [complaints]);
  const topLicensees = useMemo(() => {
    const arr = groupBy(complaints, c => licensees.find(l => l.id === c.licensee_id)?.name || '—');
    return arr.sort((a, b) => b.value - a.value).slice(0, 10);
  }, [complaints, licensees]);

  // Deterministic marker of what is on screen (staleness only) and the display
  // context handed to the advisory layer. No complainant identity is included.
  const aiStaleness = useMemo(
    () => ({ filters: f, counts: kpis, complaint_ids: complaints.length, alert_ids: alerts.length }),
    [f, kpis, complaints.length, alerts.length],
  );
  const aiContext = useMemo(
    () => ({
      filters: f,
      days: Number(f.days),
      labels: {
        products: Object.fromEntries(products.map((p) => [p.id, p.name])),
        channels: Object.fromEntries(channels.map((c) => [c.id, c.name])),
        categories: Object.fromEntries(categories.map((c) => [c.id, c.name])),
        licensees: Object.fromEntries(licensees.map((l) => [l.id, l.name])),
      },
      on_screen_aggregates: {
        kpis,
        by_product: byProduct,
        by_channel: byChannel,
        by_risk_category: byCategory,
        by_severity: bySeverity,
        top_licensees: topLicensees,
      },
    }),
    [f, products, channels, categories, licensees, kpis, byProduct, byChannel, byCategory, bySeverity, topLicensees],
  );


  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Market Conduct Dashboard" description="Complaints, conduct alerts, and thematic risk across products, channels, and entities." />

        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <Filter label="Window" value={f.days} onChange={v => setF({ ...f, days: v })} options={[['30', '30 d'], ['90', '90 d'], ['180', '180 d'], ['365', '1 yr']]} />
            <Filter label="Product" value={f.product_id} onChange={v => setF({ ...f, product_id: v })} options={[['all', 'All'], ...products.map(p => [p.id, p.name] as [string, string])]} />
            <Filter label="Channel" value={f.channel_id} onChange={v => setF({ ...f, channel_id: v })} options={[['all', 'All'], ...channels.map(p => [p.id, p.name] as [string, string])]} />
            <Filter label="Risk Category" value={f.category_id} onChange={v => setF({ ...f, category_id: v })} options={[['all', 'All'], ...categories.map(p => [p.id, p.name] as [string, string])]} />
            <Filter label="Licensee" value={f.licensee_id} onChange={v => setF({ ...f, licensee_id: v })} options={[['all', 'All'], ...licensees.slice(0, 100).map(p => [p.id, p.name] as [string, string])]} />
            <Filter label="Severity" value={f.severity} onChange={v => setF({ ...f, severity: v })} options={[['all', 'All'], ['low','Low'], ['medium','Medium'], ['high','High'], ['critical','Critical']]} />
            <Filter label="Priority" value={f.priority} onChange={v => setF({ ...f, priority: v })} options={[['all','All'], ['p1','P1'], ['p2','P2'], ['p3','P3'], ['p4','P4']]} />
            <Filter label="Customer type" value={f.customer_type} onChange={v => setF({ ...f, customer_type: v })} options={[['all','All'], ['retail','Retail'], ['sme','SME'], ['corporate','Corporate'], ['vulnerable','Vulnerable'], ['other','Other']]} />
            <Filter label="Vulnerable" value={f.vulnerable} onChange={v => setF({ ...f, vulnerable: v })} options={[['all','All'], ['yes','Yes'], ['no','No']]} />
            <Filter label="Alert status" value={f.alert_status} onChange={v => setF({ ...f, alert_status: v })} options={[['all','All'], ['open','Open'], ['acknowledged','Acknowledged'], ['closed','Closed']]} />
          </CardContent>
        </Card>

        <SavedViewsBar
          currentConfig={{ filters: f, tab, peerEntityId }}
          activeViewId={activeViewId}
          onLoad={(v) => {
            setActiveViewId(v.id);
            if (v.config?.filters) setF((prev) => ({ ...prev, ...v.config.filters }));
            if (v.config?.tab) setTab(v.config.tab);
            if (typeof v.config?.peerEntityId === 'string') setPeerEntityId(v.config.peerEntityId);
          }}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="trends">Trends &amp; patterns</TabsTrigger>
            <TabsTrigger value="drillthrough">Drill-through</TabsTrigger>
            <TabsTrigger value="peers">Peer comparison</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-4">
            {(kpis.critical > 0 || kpis.slaBreached > 0 || kpis.openAlerts > 0) && (
              <Card className="border-destructive/60 bg-destructive/5">
                <CardContent className="p-4 flex flex-wrap items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <span className="font-semibold text-destructive">Attention required</span>
                  {kpis.critical > 0 && (
                    <Link to="/complaints?severity=critical" className="text-sm underline">
                      {kpis.critical} critical complaint{kpis.critical > 1 ? 's' : ''}
                    </Link>
                  )}
                  {kpis.slaBreached > 0 && (
                    <Link to="/complaints?sla=breached" className="text-sm underline">
                      {kpis.slaBreached} SLA breached
                    </Link>
                  )}
                  {kpis.openAlerts > 0 && (
                    <Link to="/conduct/alerts?status=open" className="text-sm underline">
                      {kpis.openAlerts} open alert{kpis.openAlerts > 1 ? 's' : ''}
                    </Link>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-8">
              <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Complaints" value={kpis.total} />
              <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Open" value={kpis.openComplaints} />
              <Kpi icon={<Bell />} label="Open Alerts" value={kpis.openAlerts} to="/conduct/alerts" tone={kpis.openAlerts > 0 ? 'warn' : undefined} />
              <Kpi icon={<ShieldAlert className="h-4 w-4" />} label="Critical" value={kpis.critical} tone={kpis.critical > 0 ? 'danger' : undefined} />
              <Kpi icon={<Users className="h-4 w-4" />} label="Vulnerable" value={kpis.vulnerable} tone={kpis.vulnerable > 0 ? 'warn' : undefined} />
              <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="SLA Breached" value={kpis.slaBreached} tone={kpis.slaBreached > 0 ? 'danger' : undefined} />
              <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="SLA At Risk" value={kpis.slaAtRisk} tone={kpis.slaAtRisk > 0 ? 'warn' : undefined} />
              <Kpi icon={<Users className="h-4 w-4" />} label="Repeat (≥3/12m)" value={kpis.repeat} tone={kpis.repeat > 0 ? 'warn' : undefined} />
            </div>

            {loading ? <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <ChartCard title="By Product"><BarChart data={byProduct}>{barLayout()}</BarChart></ChartCard>
                  <ChartCard title="By Channel"><BarChart data={byChannel}>{barLayout()}</BarChart></ChartCard>
                  <ChartCard title="By Risk Category"><BarChart data={byCategory}>{barLayout()}</BarChart></ChartCard>
                  <PieCard title="By Severity" data={bySeverity} />
                </div>

                <Card>
                  <CardHeader><CardTitle className="text-base">Top licensees (by complaint volume in window)</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader><TableRow><TableHead>Licensee</TableHead><TableHead className="text-right">Complaints</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {topLicensees.map(r => (
                          <TableRow key={r.name}><TableCell className="font-medium">{r.name}</TableCell><TableCell className="text-right"><Badge>{r.value}</Badge></TableCell></TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Recent complaints in scope</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Subject</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Priority</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {complaints.slice(0, 25).map(c => (
                          <TableRow key={c.id}>
                            <TableCell className="font-mono text-xs"><Link className="text-primary hover:underline" to={`/complaints/${c.id}`}>{c.complaint_number}</Link></TableCell>
                            <TableCell className="max-w-xs truncate">{c.subject}</TableCell>
                            <TableCell><Badge variant="outline" className="capitalize">{c.severity}</Badge></TableCell>
                            <TableCell><Badge variant="secondary" className="capitalize">{c.status?.replace('_', ' ')}</Badge></TableCell>
                            <TableCell className="uppercase">{c.priority || '—'}</TableCell>
                            <TableCell className="text-xs">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Recent conduct alerts in scope</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Kind</TableHead><TableHead>Severity</TableHead><TableHead>Title</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {alerts.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No alerts in scope.</TableCell></TableRow> :
                          alerts.slice(0, 25).map(a => (
                            <TableRow key={a.id}>
                              <TableCell className="text-xs">{new Date(a.created_at).toLocaleString()}</TableCell>
                              <TableCell><Badge variant="outline" className="capitalize">{a.kind?.replace('_', ' ')}</Badge></TableCell>
                              <TableCell><Badge variant={a.severity === 'critical' ? 'destructive' : 'outline'} className="capitalize">{a.severity}</Badge></TableCell>
                              <TableCell className="max-w-md truncate">{a.complaint_id ? <Link className="text-primary hover:underline" to={`/complaints/${a.complaint_id}`}>{a.title}</Link> : a.title}</TableCell>
                              <TableCell><Badge variant="secondary" className="capitalize">{a.status}</Badge></TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="trends" className="mt-4 space-y-6">
            {loading ? <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : (
              <ConductTrendsPanel complaints={complaints} alerts={alerts} days={Number(f.days)} labels={labels} />
            )}
            <SupervisoryAiPanel
              module="conduct"
              analysisType="conduct_recurrence"
              scope="portfolio"
              periodKey={`${f.days}d`}
              ready={!loading}
              label={`Market conduct — last ${f.days} days`}
              title="AI recurring conduct pattern observations"
              description="Optional interpretation of the conduct data currently filtered on this page. The charts and figures above remain the record."
              actionLabel="Generate pattern observations"
              stalenessFacts={aiStaleness}
              context={aiContext}
            />
          </TabsContent>


          <TabsContent value="drillthrough" className="mt-4">
            {loading ? <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : (
              <ConductDrillthroughPanel
                complaints={complaints}
                labels={labels}
                onApplyFilters={(patch) => setF(prev => ({ ...prev, ...patch }))}
              />
            )}
          </TabsContent>

          <TabsContent value="peers" className="mt-4">
            {loading ? <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : (
              <ConductPeerComparisonPanel
                complaints={complaints}
                alerts={alerts}
                licensees={licensees}
                entityId={peerEntityId}
                onEntityChange={setPeerEntityId}
              />
            )}
          </TabsContent>
        </Tabs>

      </div>
    </DashboardLayout>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div><div className="text-xs text-muted-foreground mb-1">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
function Kpi({ icon, label, value, to, tone }: { icon: React.ReactNode; label: string; value: number; to?: string; tone?: 'danger' | 'warn' }) {
  const toneClass = tone === 'danger' ? 'border-destructive/60 bg-destructive/5' : tone === 'warn' ? 'border-amber-500/60 bg-amber-500/5' : '';
  const body = (
    <Card className={toneClass}><CardContent className="pt-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{label}</span><span className="text-muted-foreground">{icon}</span></div><p className="text-2xl font-semibold mt-1">{value}</p></CardContent></Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
function ChartCard({ title, children }: any) {
  return (
    <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="h-64"><ResponsiveContainer>{children}</ResponsiveContainer></CardContent></Card>
  );
}
function PieCard({ title, data }: { title: string; data: any[] }) {
  return (
    <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="h-64"><ResponsiveContainer>
        <PieChart><Pie data={data} dataKey="value" nameKey="name" outerRadius={80} label>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Legend /><Tooltip /></PieChart>
      </ResponsiveContainer></CardContent></Card>
  );
}
function barLayout() {
  return [
    <XAxis key="x" dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />,
    <YAxis key="y" tick={{ fontSize: 11 }} />,
    <Tooltip key="t" />,
    <Bar key="b" dataKey="value" fill="hsl(var(--primary))" />,
  ];
}
function groupBy<T>(rows: T[], keyFn: (r: T) => string) {
  const m = new Map<string, number>();
  for (const r of rows) { const k = keyFn(r); m.set(k, (m.get(k) || 0) + 1); }
  return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
}
function Bell({ className = 'h-4 w-4' }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></svg>; }
