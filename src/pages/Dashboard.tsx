import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { INTERNAL_ROLES, APPLICATION_STATUS_LABELS, LICENSEE_ROLES } from '@/types/platform';
import { FileText, Clock, CheckCircle, AlertTriangle, Shield, ClipboardList, Plus, ArrowUpRight, Edit } from 'lucide-react';

interface DashboardStats {
  totalApps: number;
  pendingApps: number;
  approvedApps: number;
  rejectedApps: number;
  totalLicenses: number;
  totalComplaints: number;
  overdueReturns: number;
}

interface DraftApp {
  id: string;
  application_number: string;
  license_type: string;
  updated_at: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({ totalApps: 0, pendingApps: 0, approvedApps: 0, rejectedApps: 0, totalLicenses: 0, totalComplaints: 0, overdueReturns: 0 });
  const [recentApps, setRecentApps] = useState<any[]>([]);
  const [draftApps, setDraftApps] = useState<DraftApp[]>([]);
  const [loading, setLoading] = useState(true);

  const isInternal = user && INTERNAL_ROLES.includes(user.role);
  const isLicensee = user && LICENSEE_ROLES.includes(user.role);
  const isPreLicensee = user?.isPreLicensee;

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
        { data: drafts },
      ] = await Promise.all([
        supabase.from('applications').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('applications').select('*', { count: 'exact', head: true }),
        supabase.from('applications').select('*', { count: 'exact', head: true }).in('status', ['submitted', 'in_progress']),
        supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
        supabase.from('licenses').select('*', { count: 'exact', head: true }),
        supabase.from('complaints').select('*', { count: 'exact', head: true }),
        supabase.from('compliance_returns').select('*', { count: 'exact', head: true }).eq('status', 'overdue'),
        supabase.from('applications').select('id, application_number, license_type, updated_at').eq('status', 'draft').order('updated_at', { ascending: false }).limit(5),
      ]);
      setRecentApps(apps || []);
      setDraftApps((drafts || []) as DraftApp[]);
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
    draft: 'secondary', submitted: 'default', in_progress: 'outline',
    approved: 'default', rejected: 'destructive',
  };

  // ─── Pre-Licensee Dashboard ───
  if (isPreLicensee) {
    return (
      <DashboardLayout
        title="Pre-License Portal"
        subtitle={`Welcome, ${user.fullName}. Track your pre-license applications below.`}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-slide-up delay-100">
            <StatCard title="My Applications" value={stats.totalApps} icon={<FileText className="h-5 w-5" />} variant="primary" />
            <StatCard title="Pending Review" value={stats.pendingApps} icon={<Clock className="h-5 w-5" />} variant="warning" />
            <StatCard title="Approved" value={stats.approvedApps} icon={<CheckCircle className="h-5 w-5" />} variant="success" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-up delay-200">
            <Card>
              <CardHeader><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="default" className="w-full justify-start gap-2" onClick={() => navigate('/applications/new')}>
                  <Plus className="h-4 w-4" /> New Application
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/applications')}>
                  <FileText className="h-4 w-4" /> My Applications
                </Button>
              </CardContent>
            </Card>

            {/* Draft Applications */}
            {draftApps.length > 0 && (
              <Card className="lg:col-span-2 border-amber-200 dark:border-amber-800">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Edit className="h-4 w-4 text-amber-600" /> Draft Applications
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {draftApps.map(draft => (
                      <div key={draft.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/40 cursor-pointer transition-colors" onClick={() => navigate(`/applications/${draft.id}`)}>
                        <div>
                          <p className="font-mono text-sm font-medium">{draft.application_number}</p>
                          <p className="text-xs text-muted-foreground">Last modified: {new Date(draft.updated_at).toLocaleDateString()}</p>
                        </div>
                        <Button size="sm" variant="outline" className="gap-1">
                          <Edit className="h-3 w-3" /> Continue
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Recent Applications</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/applications')}>
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

          {/* Restriction notice */}
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-300">Pre-License Account</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                    You are registered as a pre-license applicant. Access to post-license modules (returns, payments, license management)
                    will be available after your license is approved and a web user account is created by the regulator.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Licensee Dashboard ───
  const dashboardTitle = isInternal ? 'Admin Dashboard' : isLicensee ? 'Licensee Dashboard' : 'My Dashboard';
  const dashboardSubtitle = `Welcome back, ${user.fullName}. Here's your overview.`;

  return (
    <DashboardLayout title={dashboardTitle} subtitle={dashboardSubtitle}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title={isInternal ? 'Total Applications' : 'My Applications'} value={stats.totalApps} icon={<FileText className="h-5 w-5" />} variant="primary" />
          <StatCard title="Pending Review" value={stats.pendingApps} icon={<Clock className="h-5 w-5" />} variant="warning" />
          <StatCard title="Approved" value={stats.approvedApps} icon={<CheckCircle className="h-5 w-5" />} variant="success" />
          {isInternal ? (
            <StatCard title="Active Licenses" value={stats.totalLicenses} icon={<Shield className="h-5 w-5" />} variant="primary" />
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

        {/* Draft Applications Section */}
        {!isInternal && draftApps.length > 0 && (
          <Card className="border-amber-200 dark:border-amber-800 animate-slide-up delay-250">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Edit className="h-4 w-4 text-amber-600" /> Draft Applications
                </CardTitle>
                <Badge variant="outline" className="text-xs">{draftApps.length} draft{draftApps.length > 1 ? 's' : ''}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {draftApps.map(draft => (
                  <div key={draft.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/40 cursor-pointer transition-colors" onClick={() => navigate(`/applications/${draft.id}`)}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600">
                        <Edit className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-mono text-sm font-medium">{draft.application_number}</p>
                        <p className="text-xs text-muted-foreground">{draft.license_type} · Modified {new Date(draft.updated_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1">
                      <Edit className="h-3 w-3" /> Continue
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-up delay-300">
          <Card>
            <CardHeader><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(isLicensee || (!isInternal && !isPreLicensee)) && (
                <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/applications')}>
                  <Plus className="h-4 w-4" /> New Application
                </Button>
              )}
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate(isInternal ? '/applications/queue' : '/applications')}>
                <FileText className="h-4 w-4" /> {isInternal ? 'View Queue' : 'My Applications'}
              </Button>
              {(isLicensee || isInternal) && (
                <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/compliance/returns')}>
                  <ClipboardList className="h-4 w-4" /> Compliance Returns
                </Button>
              )}
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/documents')}>
                <ArrowUpRight className="h-4 w-4" /> Documents
              </Button>
            </CardContent>
          </Card>

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
