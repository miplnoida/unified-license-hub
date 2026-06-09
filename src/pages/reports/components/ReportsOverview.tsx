import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/dashboard/StatCard';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line,
} from 'recharts';
import { FileBarChart, TrendingUp, BarChart3, Clock, AlertTriangle, MessageSquare, CheckCircle2, DollarSign } from 'lucide-react';
import { useReportMetrics } from '../hooks/useReportMetrics';
import { generateReport } from '../services/reportService';
import type { ReportRun, ReportSource } from '../types';
import { useToast } from '@/hooks/use-toast';

const CHART_COLORS = ['#1e3a5f', '#2dd4bf', '#f59e0b', '#ef4444', '#8b5cf6', '#22c55e'];

interface Props { onDrilldown?: (run: ReportRun) => void; }

export function ReportsOverview({ onDrilldown }: Props = {}) {
  const { toast } = useToast();
  const { data, isLoading } = useReportMetrics();

  const drill = async (
    name: string, slug: string, source: ReportSource, filters: Record<string, unknown> = {},
  ) => {
    if (!onDrilldown) return;
    try {
      const run = await generateReport({ name, category: 'Drilldown', source, filters: filters as any, reportSlug: slug });
      onDrilldown(run);
    } catch (e: any) {
      toast({ title: 'Drilldown failed', description: e?.message, variant: 'destructive' });
    }
  };

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button type="button" className="text-left" onClick={() => drill('All Applications', 'app-status', 'applications')}>
          <StatCard title="Total Applications" value={data.totalApplications} icon={<FileBarChart className="h-6 w-6" />} />
        </button>
        <button type="button" className="text-left" onClick={() => drill('Pending Applications', 'app-status', 'applications', { status: 'pending' })}>
          <StatCard title="Pending Applications" value={data.pendingApplications} icon={<Clock className="h-6 w-6" />} variant="warning" />
        </button>
        <button type="button" className="text-left" onClick={() => drill('Active Licenses', 'lic-distribution', 'licenses', { status: 'active' })}>
          <StatCard title="Active Licenses" value={data.activeLicenses} icon={<BarChart3 className="h-6 w-6" />} variant="primary" />
        </button>
        <StatCard title="Total Revenue" value={`$${data.totalRevenue.toLocaleString()}`} icon={<TrendingUp className="h-6 w-6" />} variant="success" />
        <button type="button" className="text-left" onClick={() => drill('Outstanding Dues', 'fee-outstanding', 'payments')}>
          <StatCard title="Outstanding Dues" value={`$${data.outstandingDues.toLocaleString()}`} icon={<DollarSign className="h-6 w-6" />} variant="warning" />
        </button>
        <button type="button" className="text-left" onClick={() => drill('Overdue Returns', 'ret-overdue', 'compliance_returns')}>
          <StatCard title="Overdue Returns" value={data.overdueReturns} icon={<AlertTriangle className="h-6 w-6" />} variant={data.overdueReturns > 0 ? 'danger' : 'default'} />
        </button>
        <StatCard title="Compliance Rate" value={`${data.complianceRate}%`} icon={<CheckCircle2 className="h-6 w-6" />} variant="success" />
        <button type="button" className="text-left" onClick={() => drill('Pending Complaints', 'cmp-pending', 'complaints')}>
          <StatCard title="Complaint Backlog" value={data.complaintBacklog} icon={<MessageSquare className="h-6 w-6" />} variant={data.complaintBacklog > 0 ? 'warning' : 'default'} />
        </button>
      </div>


      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Applications by Month</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.appsByMonth}>
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
                <Pie data={data.appsByStatus} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {data.appsByStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
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
              <AreaChart data={data.revenueByMonth}>
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
              <BarChart data={data.complianceStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs" />
                <YAxis type="category" dataKey="name" className="text-xs" width={80} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {data.complianceStats.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">License Expiry Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.licenseExpiryTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Line type="monotone" dataKey="expiring" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Complaints by Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={data.complaintsByStatus} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {data.complaintsByStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
