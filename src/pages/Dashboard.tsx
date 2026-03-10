import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { INTERNAL_ROLES, APPLICATION_STATUS_LABELS } from '@/types/platform';
import {
  FileText, Clock, CheckCircle, AlertTriangle, Shield, Users, DollarSign, ClipboardList,
} from 'lucide-react';

interface DashboardStats {
  totalApps: number;
  pendingApps: number;
  approvedApps: number;
  rejectedApps: number;
  totalLicenses: number;
  totalComplaints: number;
  overdueReturns: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({ totalApps: 0, pendingApps: 0, approvedApps: 0, rejectedApps: 0, totalLicenses: 0, totalComplaints: 0, overdueReturns: 0 });
  const [recentApps, setRecentApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const isInternal = user && INTERNAL_ROLES.includes(user.role);

  useEffect(() => {
    async function load() {
      const { data: apps } = await supabase.from('applications').select('*').order('created_at', { ascending: false }).limit(5);
      const allApps = (apps || []) as any[];
      setRecentApps(allApps);

      const { count: totalApps } = await supabase.from('applications').select('*', { count: 'exact', head: true });
      const { count: pendingApps } = await supabase.from('applications').select('*', { count: 'exact', head: true }).in('status', ['submitted', 'scrutiny', 'technical_review', 'pending_approval']);
      const { count: approvedApps } = await supabase.from('applications').select('*', { count: 'exact', head: true }).in('status', ['approved', 'license_issued']);
      const { count: rejectedApps } = await supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'rejected');
      const { count: totalLicenses } = await supabase.from('licenses' as any).select('*', { count: 'exact', head: true });
      const { count: totalComplaints } = await supabase.from('complaints').select('*', { count: 'exact', head: true });
      const { count: overdueReturns } = await supabase.from('compliance_returns' as any).select('*', { count: 'exact', head: true }).eq('status', 'overdue');

      setStats({
        totalApps: totalApps || 0, pendingApps: pendingApps || 0, approvedApps: approvedApps || 0,
        rejectedApps: rejectedApps || 0, totalLicenses: totalLicenses || 0, totalComplaints: totalComplaints || 0,
        overdueReturns: overdueReturns || 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  if (!user) return null;

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    draft: 'secondary', submitted: 'default', scrutiny: 'outline', query_raised: 'outline',
    resubmitted: 'outline', technical_review: 'outline', pending_approval: 'outline',
    approved: 'default', rejected: 'destructive', license_issued: 'default',
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="animate-slide-up">
          <h1 className="text-2xl font-bold text-foreground">
            {isInternal ? 'Admin Dashboard' : 'My Dashboard'}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Welcome back, {user.fullName}. Here's your overview.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title={isInternal ? 'Total Applications' : 'My Applications'} value={stats.totalApps} icon={<FileText className="h-6 w-6" />} variant="primary" />
          <StatCard title="Pending Review" value={stats.pendingApps} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Approved" value={stats.approvedApps} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          {isInternal ? (
            <StatCard title="Active Licenses" value={stats.totalLicenses} icon={<Shield className="h-6 w-6" />} variant="primary" />
          ) : (
            <StatCard title="Rejected" value={stats.rejectedApps} icon={<AlertTriangle className="h-6 w-6" />} variant="danger" />
          )}
        </div>

        {isInternal && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-up delay-200">
            <StatCard title="Complaints" value={stats.totalComplaints} icon={<AlertTriangle className="h-6 w-6" />} variant="warning" />
            <StatCard title="Overdue Returns" value={stats.overdueReturns} icon={<ClipboardList className="h-6 w-6" />} variant="danger" />
            <StatCard title="Rejected" value={stats.rejectedApps} icon={<AlertTriangle className="h-6 w-6" />} variant="danger" />
          </div>
        )}

        <Card className="animate-slide-up delay-300">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Applications</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate(isInternal ? '/applications/queue' : '/applications')}>View All</Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentApps.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No applications yet</p>
            ) : (
              <div className="space-y-3">
                {recentApps.map(app => (
                  <div key={app.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors" onClick={() => navigate(`/applications/${app.id}`)}>
                    <div>
                      <p className="font-mono text-sm font-medium">{app.application_number}</p>
                      <p className="text-sm text-muted-foreground">{app.license_type}</p>
                    </div>
                    <Badge variant={statusVariant[app.status] || 'outline'} className="capitalize">
                      {APPLICATION_STATUS_LABELS[app.status as keyof typeof APPLICATION_STATUS_LABELS] || app.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
