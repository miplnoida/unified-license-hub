import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Loader2, AlertTriangle, ShieldAlert, Users, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

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

  useEffect(() => {
    (async () => {
      const [p, c, cat, lic] = await Promise.all([
        supabase.from('conduct_products').select('id,name').eq('active', true).order('name'),
        supabase.from('conduct_channels').select('id,name').eq('active', true).order('name'),
        supabase.from('conduct_risk_categories').select('id,name,code').eq('active', true).order('name'),
        supabase.from('licensees').select('id,name').order('name').limit(500),
      ]);
      setProducts(p.data || []); setChannels(c.data || []); setCategories(cat.data || []); setLicensees(lic.data || []);
    })();
  }, []);

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
    const openAlerts = alerts.filter(a => a.status === 'open').length;
    const critical = complaints.filter(c => c.severity === 'critical').length;
    const vulnerable = complaints.filter(c => c.vulnerability_indicator).length;
    const now = Date.now();
    const slaBreached = complaints.filter(c => !c.resolved_at && c.sla_due_at && new Date(c.sla_due_at).getTime() < now).length;
    return { total, openAlerts, critical, vulnerable, slaBreached };
  }, [complaints, alerts]);

  const byProduct = useMemo(() => groupBy(complaints, c => products.find(p => p.id === c.product_id)?.name || '—'), [complaints, products]);
  const byChannel = useMemo(() => groupBy(complaints, c => channels.find(p => p.id === c.channel_id)?.name || '—'), [complaints, channels]);
  const byCategory = useMemo(() => groupBy(complaints, c => categories.find(p => p.id === c.conduct_risk_category_id)?.name || '—'), [complaints, categories]);
  const bySeverity = useMemo(() => groupBy(complaints, c => c.severity || '—'), [complaints]);
  const topLicensees = useMemo(() => {
    const arr = groupBy(complaints, c => licensees.find(l => l.id === c.licensee_id)?.name || '—');
    return arr.sort((a, b) => b.value - a.value).slice(0, 10);
  }, [complaints, licensees]);

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
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-5">
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Complaints" value={kpis.total} />
          <Kpi icon={<Bell />} label="Open Alerts" value={kpis.openAlerts} to="/conduct/alerts" />
          <Kpi icon={<ShieldAlert className="h-4 w-4" />} label="Critical" value={kpis.critical} />
          <Kpi icon={<Users className="h-4 w-4" />} label="Vulnerable" value={kpis.vulnerable} />
          <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="SLA Breached" value={kpis.slaBreached} />
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
          </>
        )}
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
function Kpi({ icon, label, value, to }: { icon: React.ReactNode; label: string; value: number; to?: string }) {
  const body = (
    <Card><CardContent className="pt-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{label}</span><span className="text-muted-foreground">{icon}</span></div><p className="text-2xl font-semibold mt-1">{value}</p></CardContent></Card>
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
