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
import { FileText, Clock, CheckCircle, AlertTriangle, Shield, ClipboardList, Plus, ArrowUpRight } from 'lucide-react';

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
      const [
        { data: apps },
        { count: totalApps },
        { count: pendingApps },
        { count: approvedApps },
        { count: rejectedApps },
        { count: totalLicenses },
        { count: totalComplaints },
        { count: overdueReturns },
      ] = await Promise.all([
        supabase.from('applications').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('applications').select('*', { count: 'exact', head: true }),
        supabase.from('applications').select('*', { count: 'exact', head: true }).in('status', ['submitted', 'scrutiny', 'technical_review', 'pending_approval']),
        supabase.from('applications').select('*', { count: 'exact', head: true }).in('status', ['approved', 'license_issued']),
        supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
        supabase.from('licenses').select('*', { count: 'exact', head: true }),
        supabase.from('complaints').select('*', { count: 'exact', head: true }),
        supabase.from('compliance_returns').select('*', { count: 'exact', head: true }).eq('status', 'overdue'),
      ]);
      setRecentApps(apps || []);
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
    <DashboardLayout
      title={isInternal ? 'Admin Dashboard' : 'My Dashboard'}
      subtitle={`Welcome back, ${user.fullName}. Here's your overview.`}
    >
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title={isInternal ? 'Total Applications' : 'My Applications'} value={stats.totalApps} icon={<FileText className="h-5 w-5" />} variant="primary" />
          <StatCard title="Pending Review" value={stats.pendingApps} icon={<Clock className="h-5 w-5" />} variant="warning" />
          <StatCard title="Approved" value={stats.approvedApps} icon={<CheckCircle className="h-5 w-5" />} variant="success" />
          {isInternal ? (
            <StatCard title="Active Licenses" value={stats.totalLicenses} icon={<Shield className="h-5 w-5" />} variant="info" />
          ) : (
            <StatCard title="Rejected" value={stats.rejectedApps} icon={<AlertTriangle className="h-5 w-5" />} variant="danger" />
          )}
        </div>

        {isInternal && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-slide-up delay-200">
            <StatCard title="Complaints" value={stats.totalComplaints} icon={<AlertTriangle className="h-5 w-5" />} variant="warning" />
            <StatCard title="Overdue Returns" value={stats.overdueReturns} icon={<ClipboardList className="h-5 w-5" />} variant="danger" />
            <StatCard title="Rejected" value={stats.rejectedApps} icon={<AlertTriangle className="h-5 w-5" />} variant="danger" />
          </div>
        )}

        {/* Quick Actions + Recent */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-up delay-300">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!isInternal && (
                <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/applications')}>
                  <Plus className="h-4 w-4" /> New Application
                </Button>
              )}
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate(isInternal ? '/applications/queue' : '/applications')}>
                <FileText className="h-4 w-4" /> {isInternal ? 'View Queue' : 'My Applications'}
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/compliance/returns')}>
                <ClipboardList className="h-4 w-4" /> Compliance Returns
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/documents')}>
                <ArrowUpRight className="h-4 w-4" /> Documents
              </Button>
            </CardContent>
          </Card>

          {/* Recent Applications */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Applications</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => navigate(isInternal ? '/applications/queue' : '/applications')}>
                  View All <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentApps.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No applications yet</p>
              ) : (
                <div className="space-y-2">
                  {recentApps.map(app => (
                    <div key={app.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/40 cursor-pointer transition-colors" onClick={() => navigate(`/applications/${app.id}`)}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 text-primary">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-mono text-sm font-medium">{app.application_number}</p>
                          <p className="text-xs text-muted-foreground">{app.license_type}</p>
                        </div>
                      </div>
                      <Badge variant={statusVariant[app.status] || 'outline'} className="capitalize text-xs">
                        {APPLICATION_STATUS_LABELS[app.status as keyof typeof APPLICATION_STATUS_LABELS] || app.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
