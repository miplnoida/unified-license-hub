import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { FileText, CheckCircle, XCircle, Clock, Shield, AlertTriangle, DollarSign, Users } from 'lucide-react';

interface Stats {
  totalApps: number;
  pendingApps: number;
  approvedApps: number;
  rejectedApps: number;
  totalLicenses: number;
  totalComplaints: number;
  totalPayments: number;
  totalReturns: number;
}

const COLORS = ['hsl(222, 65%, 22%)', 'hsl(174, 62%, 47%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)', 'hsl(262, 83%, 58%)', 'hsl(142, 71%, 45%)'];

export default function AnalyticsDashboard() {
  const [stats, setStats] = useState<Stats>({ totalApps: 0, pendingApps: 0, approvedApps: 0, rejectedApps: 0, totalLicenses: 0, totalComplaints: 0, totalPayments: 0, totalReturns: 0 });
  const [appsByStatus, setAppsByStatus] = useState<{ name: string; value: number }[]>([]);
  const [appsByMonth, setAppsByMonth] = useState<{ month: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Applications
      const { data: apps } = await supabase.from('applications').select('status, created_at');
      const allApps = (apps || []) as any[];
      
      const statusCounts: Record<string, number> = {};
      const monthCounts: Record<string, number> = {};
      let pending = 0, approved = 0, rejected = 0;

      allApps.forEach(a => {
        statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
        const month = new Date(a.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        monthCounts[month] = (monthCounts[month] || 0) + 1;
        if (['submitted', 'scrutiny', 'technical_review', 'pending_approval'].includes(a.status)) pending++;
        if (a.status === 'approved' || a.status === 'license_issued') approved++;
        if (a.status === 'rejected') rejected++;
      });

      setAppsByStatus(Object.entries(statusCounts).map(([name, value]) => ({ name, value })));
      setAppsByMonth(Object.entries(monthCounts).slice(-12).map(([month, count]) => ({ month, count })));

      // Licenses
      const { count: licCount } = await supabase.from('licenses' as any).select('*', { count: 'exact', head: true });
      // Complaints
      const { count: compCount } = await supabase.from('complaints').select('*', { count: 'exact', head: true });
      // Payments
      const { count: payCount } = await supabase.from('payments' as any).select('*', { count: 'exact', head: true });
      // Returns
      const { count: retCount } = await supabase.from('compliance_returns' as any).select('*', { count: 'exact', head: true });

      setStats({
        totalApps: allApps.length, pendingApps: pending, approvedApps: approved, rejectedApps: rejected,
        totalLicenses: licCount || 0, totalComplaints: compCount || 0, totalPayments: payCount || 0, totalReturns: retCount || 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  const statCards = [
    { title: 'Total Applications', value: stats.totalApps, icon: <FileText className="h-5 w-5" />, color: 'text-primary' },
    { title: 'Pending Review', value: stats.pendingApps, icon: <Clock className="h-5 w-5" />, color: 'text-warning' },
    { title: 'Approved', value: stats.approvedApps, icon: <CheckCircle className="h-5 w-5" />, color: 'text-success' },
    { title: 'Rejected', value: stats.rejectedApps, icon: <XCircle className="h-5 w-5" />, color: 'text-destructive' },
    { title: 'Active Licenses', value: stats.totalLicenses, icon: <Shield className="h-5 w-5" />, color: 'text-primary' },
    { title: 'Complaints', value: stats.totalComplaints, icon: <AlertTriangle className="h-5 w-5" />, color: 'text-warning' },
    { title: 'Payments', value: stats.totalPayments, icon: <DollarSign className="h-5 w-5" />, color: 'text-success' },
    { title: 'Returns', value: stats.totalReturns, icon: <Users className="h-5 w-5" />, color: 'text-info' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Analytics Dashboard" description="Real-time platform metrics and insights" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(s => (
            <Card key={s.title}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{s.title}</p>
                    <p className="text-2xl font-bold mt-1">{loading ? '...' : s.value}</p>
                  </div>
                  <div className={s.color}>{s.icon}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Applications by Month</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={appsByMonth}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(222, 65%, 22%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Applications by Status</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={appsByStatus} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {appsByStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
