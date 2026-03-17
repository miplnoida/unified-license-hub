import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
} from 'recharts';
import {
  BarChart3, Download, FileBarChart, TrendingUp, Users, Plus, Play, Clock,
  FileSpreadsheet, FileText, Filter, Calendar, Search, Eye, Trash2, Mail, RefreshCw,
} from 'lucide-react';

// Types
interface Report {
  id: string;
  name: string;
  description: string | null;
  report_type: string;
  category: string;
  query_config: any;
  result_data: any;
  result_count: number;
  generated_at: string | null;
  status: string;
  created_at: string;
}

interface ReportSchedule {
  id: string;
  report_id: string;
  schedule_type: string;
  recipients: string[];
  last_run_at: string | null;
  next_run_at: string | null;
  is_active: boolean;
  export_format: string;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const CHART_COLORS = ['#1e3a5f', '#2dd4bf', '#f59e0b', '#ef4444', '#8b5cf6', '#22c55e'];

const PREDEFINED_REPORTS = [
  { id: 'app-status', name: 'Application Status Report', category: 'application_status', description: 'Applications by status, sector, and time period' },
  { id: 'revenue', name: 'Revenue Collection Report', category: 'revenue', description: 'Fee collection, payment trends, and outstanding amounts' },
  { id: 'compliance', name: 'Compliance Returns Report', category: 'compliance', description: 'Return submission rates, overdue returns, and compliance scores' },
  { id: 'license-activity', name: 'License Activity Report', category: 'general', description: 'License issuance, renewals, suspensions, and expirations' },
  { id: 'officer-performance', name: 'Officer Performance Report', category: 'general', description: 'Processing times, approval rates by officer' },
  { id: 'complaints-summary', name: 'Complaints Summary Report', category: 'general', description: 'Complaint volumes, resolution times, and outcomes' },
];

export default function ReportsDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('dashboard');
  const [reports, setReports] = useState<Report[]>([]);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Dashboard data
  const [dashData, setDashData] = useState({
    appsByStatus: [] as any[],
    appsByMonth: [] as any[],
    revenueByMonth: [] as any[],
    complianceStats: [] as any[],
    totalApps: 0, totalRevenue: 0, totalLicenses: 0, overdueReturns: 0,
  });

  // Ad-hoc builder state
  const [builderConfig, setBuilderConfig] = useState({
    name: '',
    description: '',
    category: 'application_status',
    dateFrom: '',
    dateTo: '',
    sector: 'all',
    status: 'all',
    officer: 'all',
    groupBy: 'status',
  });

  // Schedule dialog
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState({
    reportId: '',
    scheduleType: 'weekly',
    recipients: '',
    exportFormat: 'pdf',
  });

  // Sectors for filter
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load reports
      const { data: reps } = await supabase.from('reports').select('*').order('created_at', { ascending: false });
      setReports((reps || []) as any);

      // Load schedules
      const { data: scheds } = await supabase.from('report_schedules').select('*');
      setSchedules((scheds || []) as any);

      // Load sectors
      const { data: secs } = await supabase.from('sectors').select('id, name');
      setSectors(secs || []);

      // Dashboard aggregation
      const { data: apps } = await supabase.from('applications').select('status, created_at, license_type');
      const allApps = apps || [];

      const statusCounts: Record<string, number> = {};
      const monthCounts: Record<string, number> = {};
      allApps.forEach((a: any) => {
        statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
        const m = new Date(a.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        monthCounts[m] = (monthCounts[m] || 0) + 1;
      });

      // Payments
      const { data: payments } = await supabase.from('payments').select('amount, status, created_at');
      const allPayments = payments || [];
      let totalRev = 0;
      const revByMonth: Record<string, number> = {};
      allPayments.forEach((p: any) => {
        if (p.status === 'completed') {
          totalRev += Number(p.amount);
          const m = new Date(p.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
          revByMonth[m] = (revByMonth[m] || 0) + Number(p.amount);
        }
      });

      // Licenses
      const { count: licCount } = await supabase.from('licenses').select('*', { count: 'exact', head: true });

      // Compliance returns
      const { data: returns } = await supabase.from('compliance_returns').select('status, due_date');
      const allReturns = returns || [];
      const overdue = allReturns.filter((r: any) => r.status === 'pending' && new Date(r.due_date) < new Date()).length;

      const compStats = [
        { name: 'Submitted', value: allReturns.filter((r: any) => r.status === 'submitted').length },
        { name: 'Pending', value: allReturns.filter((r: any) => r.status === 'pending').length },
        { name: 'Approved', value: allReturns.filter((r: any) => r.status === 'approved').length },
        { name: 'Overdue', value: overdue },
      ];

      setDashData({
        appsByStatus: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
        appsByMonth: Object.entries(monthCounts).slice(-12).map(([month, count]) => ({ month, count })),
        revenueByMonth: Object.entries(revByMonth).slice(-12).map(([month, amount]) => ({ month, amount })),
        complianceStats: compStats,
        totalApps: allApps.length,
        totalRevenue: totalRev,
        totalLicenses: licCount || 0,
        overdueReturns: overdue,
      });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const generateReport = async (category: string, name: string, queryConfig: any = {}) => {
    if (!user) return;
    setGenerating(true);
    try {
      let resultData: any = null;
      let resultCount = 0;

      // Execute query based on category
      if (category === 'application_status') {
        const query = supabase.from('applications').select('*');
        if (queryConfig.dateFrom) query.gte('created_at', queryConfig.dateFrom);
        if (queryConfig.dateTo) query.lte('created_at', queryConfig.dateTo);
        if (queryConfig.status && queryConfig.status !== 'all') query.eq('status', queryConfig.status);
        const { data, count } = await query;
        resultData = data;
        resultCount = data?.length || 0;
      } else if (category === 'revenue') {
        const query = supabase.from('payments').select('*');
        if (queryConfig.dateFrom) query.gte('created_at', queryConfig.dateFrom);
        if (queryConfig.dateTo) query.lte('created_at', queryConfig.dateTo);
        const { data } = await query;
        resultData = data;
        resultCount = data?.length || 0;
      } else if (category === 'compliance') {
        const query = supabase.from('compliance_returns').select('*');
        if (queryConfig.dateFrom) query.gte('created_at', queryConfig.dateFrom);
        if (queryConfig.dateTo) query.lte('created_at', queryConfig.dateTo);
        const { data } = await query;
        resultData = data;
        resultCount = data?.length || 0;
      } else {
        const { data } = await supabase.from('applications').select('*');
        resultData = data;
        resultCount = data?.length || 0;
      }

      const { error } = await supabase.from('reports').insert({
        name,
        description: queryConfig.description || null,
        report_type: queryConfig.report_type || 'predefined',
        category,
        query_config: queryConfig,
        result_data: resultData,
        result_count: resultCount,
        generated_at: new Date().toISOString(),
        status: 'ready',
        created_by: user.id,
      });

      if (error) throw error;

      // Log it
      await supabase.from('report_logs').insert({
        action: 'generated',
        executed_by: user.id,
        record_count: resultCount,
      });

      toast({ title: 'Report Generated', description: `${name} is ready with ${resultCount} records.` });
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setGenerating(false);
  };

  const handleAdHocGenerate = () => {
    if (!builderConfig.name) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    generateReport(builderConfig.category, builderConfig.name, {
      ...builderConfig,
      report_type: 'ad_hoc',
    });
  };

  const exportReport = (report: Report, format: string) => {
    const data = report.result_data;
    if (!data || !Array.isArray(data)) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }

    if (format === 'csv') {
      const headers = Object.keys(data[0] || {});
      const csv = [headers.join(','), ...data.map((r: any) => headers.map(h => `"${r[h] ?? ''}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.name.replace(/\s+/g, '_')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.name.replace(/\s+/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    toast({ title: 'Exported', description: `${report.name} exported as ${format.toUpperCase()}` });
  };

  const deleteReport = async (id: string) => {
    await supabase.from('reports').delete().eq('id', id);
    toast({ title: 'Report deleted' });
    loadData();
  };

  const createSchedule = async () => {
    if (!user || !scheduleConfig.reportId) return;
    const recipients = scheduleConfig.recipients.split(',').map(e => e.trim()).filter(Boolean);
    if (!recipients.length) {
      toast({ title: 'Add at least one recipient', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('report_schedules').insert({
      report_id: scheduleConfig.reportId,
      schedule_type: scheduleConfig.scheduleType,
      recipients,
      export_format: scheduleConfig.exportFormat,
      is_active: true,
      created_by: user.id,
      next_run_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Schedule created' });
      setScheduleOpen(false);
      loadData();
    }
  };

  const statusBadge = (status: string) => {
    const v = status === 'ready' ? 'default' : status === 'generating' ? 'secondary' : 'outline';
    return <Badge variant={v as any} className="capitalize">{status}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Reports & Analytics"
          description="Generate, schedule, and export reports across all modules."
          actions={
            <div className="flex gap-2">
              <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline"><Mail className="h-4 w-4 mr-2" />Schedule Report</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Schedule a Report</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Report</Label>
                      <Select value={scheduleConfig.reportId} onValueChange={v => setScheduleConfig(p => ({ ...p, reportId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select report..." /></SelectTrigger>
                        <SelectContent>
                          {reports.filter(r => r.status === 'ready').map(r => (
                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Frequency</Label>
                      <Select value={scheduleConfig.scheduleType} onValueChange={v => setScheduleConfig(p => ({ ...p, scheduleType: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Recipients (comma-separated emails)</Label>
                      <Input value={scheduleConfig.recipients} onChange={e => setScheduleConfig(p => ({ ...p, recipients: e.target.value }))} placeholder="admin@org.com, officer@org.com" />
                    </div>
                    <div className="space-y-2">
                      <Label>Export Format</Label>
                      <Select value={scheduleConfig.exportFormat} onValueChange={v => setScheduleConfig(p => ({ ...p, exportFormat: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pdf">PDF</SelectItem>
                          <SelectItem value="excel">Excel</SelectItem>
                          <SelectItem value="csv">CSV</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button className="w-full" onClick={createSchedule}><Mail className="h-4 w-4 mr-2" />Create Schedule</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button onClick={() => setTab('builder')}><Plus className="h-4 w-4 mr-2" />New Report</Button>
            </div>
          }
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="predefined">Predefined Reports</TabsTrigger>
            <TabsTrigger value="builder">Ad-Hoc Builder</TabsTrigger>
            <TabsTrigger value="history">Report History</TabsTrigger>
            <TabsTrigger value="schedules">Schedules</TabsTrigger>
          </TabsList>

          {/* ===== DASHBOARD TAB ===== */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard title="Total Applications" value={dashData.totalApps} icon={<FileBarChart className="h-6 w-6" />} />
              <StatCard title="Total Revenue" value={`$${dashData.totalRevenue.toLocaleString()}`} icon={<TrendingUp className="h-6 w-6" />} variant="success" />
              <StatCard title="Active Licenses" value={dashData.totalLicenses} icon={<BarChart3 className="h-6 w-6" />} variant="primary" />
              <StatCard title="Overdue Returns" value={dashData.overdueReturns} icon={<Clock className="h-6 w-6" />} variant={dashData.overdueReturns > 0 ? 'danger' : 'default'} />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Applications by Month</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dashData.appsByMonth}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Applications by Status</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={dashData.appsByStatus} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {dashData.appsByStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Revenue Trend</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={dashData.revenueByMonth}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                      <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Compliance Returns</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dashData.complianceStats} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis type="category" dataKey="name" className="text-xs" width={80} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {dashData.complianceStats.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ===== PREDEFINED REPORTS ===== */}
          <TabsContent value="predefined" className="space-y-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PREDEFINED_REPORTS.map(pr => (
                <Card key={pr.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{pr.name}</CardTitle>
                    <CardDescription className="text-sm">{pr.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="capitalize">{pr.category.replace('_', ' ')}</Badge>
                      <Button size="sm" onClick={() => generateReport(pr.category, pr.name)} disabled={generating}>
                        <Play className="h-3 w-3 mr-1" />Generate
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ===== AD-HOC BUILDER ===== */}
          <TabsContent value="builder" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ad-Hoc Report Builder</CardTitle>
                <CardDescription>Configure filters and generate custom reports on demand.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Report Name *</Label>
                    <Input value={builderConfig.name} onChange={e => setBuilderConfig(p => ({ ...p, name: e.target.value }))} placeholder="My Custom Report" />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={builderConfig.category} onValueChange={v => setBuilderConfig(p => ({ ...p, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="application_status">Application Status</SelectItem>
                        <SelectItem value="revenue">Revenue</SelectItem>
                        <SelectItem value="compliance">Compliance</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={builderConfig.description} onChange={e => setBuilderConfig(p => ({ ...p, description: e.target.value }))} placeholder="Describe this report..." rows={2} />
                </div>

                <div className="grid md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Date From</Label>
                    <Input type="date" value={builderConfig.dateFrom} onChange={e => setBuilderConfig(p => ({ ...p, dateFrom: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Date To</Label>
                    <Input type="date" value={builderConfig.dateTo} onChange={e => setBuilderConfig(p => ({ ...p, dateTo: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Sector</Label>
                    <Select value={builderConfig.sector} onValueChange={v => setBuilderConfig(p => ({ ...p, sector: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sectors</SelectItem>
                        {sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={builderConfig.status} onValueChange={v => setBuilderConfig(p => ({ ...p, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Group By</Label>
                    <Select value={builderConfig.groupBy} onValueChange={v => setBuilderConfig(p => ({ ...p, groupBy: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="status">Status</SelectItem>
                        <SelectItem value="license_type">License Type</SelectItem>
                        <SelectItem value="month">Month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setBuilderConfig({ name: '', description: '', category: 'application_status', dateFrom: '', dateTo: '', sector: 'all', status: 'all', officer: 'all', groupBy: 'status' })}>
                    Reset
                  </Button>
                  <Button onClick={handleAdHocGenerate} disabled={generating}>
                    {generating ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                    Generate Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== REPORT HISTORY ===== */}
          <TabsContent value="history" className="space-y-4">
            {reports.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <FileBarChart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No reports generated yet. Use the builder or predefined reports to get started.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {reports.map(r => (
                  <Card key={r.id}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <FileBarChart className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{r.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {r.category.replace('_', ' ')} · {r.result_count} records · {new Date(r.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {statusBadge(r.status)}
                          {r.status === 'ready' && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => exportReport(r, 'csv')}>
                                <FileSpreadsheet className="h-3 w-3 mr-1" />CSV
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => exportReport(r, 'json')}>
                                <FileText className="h-3 w-3 mr-1" />JSON
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => deleteReport(r.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ===== SCHEDULES ===== */}
          <TabsContent value="schedules" className="space-y-4">
            {schedules.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No scheduled reports. Click "Schedule Report" to set up automated delivery.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {schedules.map(s => {
                  const rep = reports.find(r => r.id === s.report_id);
                  return (
                    <Card key={s.id}>
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground">{rep?.name || 'Unknown Report'}</p>
                            <p className="text-sm text-muted-foreground">
                              {s.schedule_type} · {s.export_format.toUpperCase()} · {(s.recipients as string[]).length} recipients
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={s.is_active ? 'default' : 'secondary'}>{s.is_active ? 'Active' : 'Paused'}</Badge>
                            {s.next_run_at && <span className="text-xs text-muted-foreground">Next: {new Date(s.next_run_at).toLocaleDateString()}</span>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
