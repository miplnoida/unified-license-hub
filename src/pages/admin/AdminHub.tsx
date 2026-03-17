import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import {
  Building2, Users, Shield, FormInput, GitBranch, DollarSign, BarChart3, Bell,
  Settings, ScrollText, Layers, FileCheck, Activity, Database, Server, Clock,
  CheckCircle, AlertTriangle, ArrowUpRight, CalendarCheck, Briefcase,
} from 'lucide-react';

interface SystemMetrics {
  totalUsers: number;
  activeUsers: number;
  totalApplications: number;
  pendingApplications: number;
  activeLicenses: number;
  totalRegulators: number;
  totalSectors: number;
  totalForms: number;
  totalWorkflows: number;
  totalFeeConfigs: number;
  totalReturns: number;
  overdueReturns: number;
  totalPayments: number;
  totalAuditLogs: number;
  totalComplaints: number;
  totalNotificationTemplates: number;
}

const initialMetrics: SystemMetrics = {
  totalUsers: 0, activeUsers: 0, totalApplications: 0, pendingApplications: 0,
  activeLicenses: 0, totalRegulators: 0, totalSectors: 0, totalForms: 0,
  totalWorkflows: 0, totalFeeConfigs: 0, totalReturns: 0, overdueReturns: 0,
  totalPayments: 0, totalAuditLogs: 0, totalComplaints: 0, totalNotificationTemplates: 0,
};

export default function AdminHub() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<SystemMetrics>(initialMetrics);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [
        { count: totalUsers },
        { count: activeUsers },
        { count: totalApplications },
        { count: pendingApplications },
        { count: activeLicenses },
        { count: totalRegulators },
        { count: totalSectors },
        { count: totalForms },
        { count: totalWorkflows },
        { count: totalFeeConfigs },
        { count: totalReturns },
        { count: overdueReturns },
        { count: totalPayments },
        { count: totalAuditLogs },
        { count: totalComplaints },
        { count: totalNotificationTemplates },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('applications').select('*', { count: 'exact', head: true }),
        supabase.from('applications').select('*', { count: 'exact', head: true }).in('status', ['submitted', 'scrutiny', 'technical_review', 'pending_approval']),
        supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('regulators').select('*', { count: 'exact', head: true }),
        supabase.from('sectors').select('*', { count: 'exact', head: true }),
        supabase.from('form_templates').select('*', { count: 'exact', head: true }),
        supabase.from('approval_workflows').select('*', { count: 'exact', head: true }),
        supabase.from('fee_configurations').select('*', { count: 'exact', head: true }),
        supabase.from('compliance_returns').select('*', { count: 'exact', head: true }),
        supabase.from('compliance_returns').select('*', { count: 'exact', head: true }).eq('status', 'overdue'),
        supabase.from('payments').select('*', { count: 'exact', head: true }),
        supabase.from('audit_logs').select('*', { count: 'exact', head: true }),
        supabase.from('complaints').select('*', { count: 'exact', head: true }),
        supabase.from('notification_templates').select('*', { count: 'exact', head: true }),
      ]);

      setMetrics({
        totalUsers: totalUsers || 0, activeUsers: activeUsers || 0,
        totalApplications: totalApplications || 0, pendingApplications: pendingApplications || 0,
        activeLicenses: activeLicenses || 0, totalRegulators: totalRegulators || 0,
        totalSectors: totalSectors || 0, totalForms: totalForms || 0,
        totalWorkflows: totalWorkflows || 0, totalFeeConfigs: totalFeeConfigs || 0,
        totalReturns: totalReturns || 0, overdueReturns: overdueReturns || 0,
        totalPayments: totalPayments || 0, totalAuditLogs: totalAuditLogs || 0,
        totalComplaints: totalComplaints || 0, totalNotificationTemplates: totalNotificationTemplates || 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  const healthScore = Math.min(100, Math.round(
    ((metrics.overdueReturns === 0 ? 25 : Math.max(0, 25 - metrics.overdueReturns * 2)) +
    (metrics.pendingApplications < 10 ? 25 : Math.max(0, 25 - (metrics.pendingApplications - 10))) +
    (metrics.totalRegulators > 0 ? 25 : 0) +
    (metrics.totalWorkflows > 0 ? 25 : 0))
  ));

  const kpiCards = [
    { label: 'Total Users', value: metrics.totalUsers, sub: `${metrics.activeUsers} active`, icon: <Users className="h-5 w-5" />, color: 'text-primary' },
    { label: 'Applications', value: metrics.totalApplications, sub: `${metrics.pendingApplications} pending`, icon: <FileCheck className="h-5 w-5" />, color: 'text-info' },
    { label: 'Active Licenses', value: metrics.activeLicenses, sub: '', icon: <Shield className="h-5 w-5" />, color: 'text-success' },
    { label: 'Complaints', value: metrics.totalComplaints, sub: '', icon: <AlertTriangle className="h-5 w-5" />, color: 'text-warning' },
  ];

  const adminModules = [
    { label: 'Regulator Management', desc: `${metrics.totalRegulators} regulators configured`, icon: <Building2 className="h-5 w-5" />, href: '/admin/regulators', count: metrics.totalRegulators },
    { label: 'Sector & Service Config', desc: `${metrics.totalSectors} sectors`, icon: <Layers className="h-5 w-5" />, href: '/admin/masters/sectors', count: metrics.totalSectors },
    { label: 'Form Builder', desc: `${metrics.totalForms} templates`, icon: <FormInput className="h-5 w-5" />, href: '/admin/forms/pre-license', count: metrics.totalForms },
    { label: 'Workflow Configuration', desc: `${metrics.totalWorkflows} workflows`, icon: <GitBranch className="h-5 w-5" />, href: '/workflows', count: metrics.totalWorkflows },
    { label: 'Fee Management', desc: `${metrics.totalFeeConfigs} fee configs`, icon: <DollarSign className="h-5 w-5" />, href: '/admin/fees', count: metrics.totalFeeConfigs },
    { label: 'Return Configuration', desc: 'Compliance schedules & rules', icon: <CalendarCheck className="h-5 w-5" />, href: '/admin/return-config', count: metrics.totalReturns },
    { label: 'Reports & Analytics', desc: 'Dashboards & ad-hoc reports', icon: <BarChart3 className="h-5 w-5" />, href: '/reports' },
    { label: 'Notification Templates', desc: `${metrics.totalNotificationTemplates} templates`, icon: <Bell className="h-5 w-5" />, href: '/admin/notification-templates', count: metrics.totalNotificationTemplates },
    { label: 'User Management', desc: `${metrics.totalUsers} users`, icon: <Users className="h-5 w-5" />, href: '/admin/users', count: metrics.totalUsers },
    { label: 'Role Management (RBAC)', desc: 'Roles & permissions', icon: <Shield className="h-5 w-5" />, href: '/admin/roles' },
    { label: 'Complaint Management', desc: `${metrics.totalComplaints} complaints`, icon: <AlertTriangle className="h-5 w-5" />, href: '/complaints', count: metrics.totalComplaints },
    { label: 'Audit Logs', desc: `${metrics.totalAuditLogs} events logged`, icon: <ScrollText className="h-5 w-5" />, href: '/admin/audit-logs', count: metrics.totalAuditLogs },
    { label: 'System Settings', desc: 'Security, branding & more', icon: <Settings className="h-5 w-5" />, href: '/settings' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Admin Control Panel"
          description="Centralized system administration with full control over all platform modules."
        />

        {/* System Health + KPIs */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 animate-slide-up delay-100">
          <Card className="lg:col-span-1">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative h-20 w-20 mb-3">
                  <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
                    <path d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831a15.9155 15.9155 0 0 1 0-31.831"
                      fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                    <path d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831a15.9155 15.9155 0 0 1 0-31.831"
                      fill="none" stroke={healthScore >= 70 ? 'hsl(var(--success))' : healthScore >= 40 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))'}
                      strokeWidth="3" strokeDasharray={`${healthScore}, 100`} strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">{loading ? '...' : healthScore}</span>
                </div>
                <p className="text-sm font-medium text-foreground">System Health</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {healthScore >= 70 ? 'All systems operational' : healthScore >= 40 ? 'Needs attention' : 'Critical issues'}
                </p>
              </div>
            </CardContent>
          </Card>

          {kpiCards.map(k => (
            <Card key={k.label}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{k.label}</p>
                    <p className="text-2xl font-bold mt-1">{loading ? '...' : k.value}</p>
                    {k.sub && <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>}
                  </div>
                  <div className={`p-2 rounded-lg bg-primary/10 ${k.color}`}>{k.icon}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Platform Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-slide-up delay-200">
          {[
            { label: 'Regulators', val: metrics.totalRegulators, icon: <Building2 className="h-4 w-4" /> },
            { label: 'Sectors', val: metrics.totalSectors, icon: <Layers className="h-4 w-4" /> },
            { label: 'Workflows', val: metrics.totalWorkflows, icon: <GitBranch className="h-4 w-4" /> },
            { label: 'Fee Configs', val: metrics.totalFeeConfigs, icon: <DollarSign className="h-4 w-4" /> },
            { label: 'Form Templates', val: metrics.totalForms, icon: <FormInput className="h-4 w-4" /> },
            { label: 'Returns', val: metrics.totalReturns, icon: <CalendarCheck className="h-4 w-4" /> },
            { label: 'Payments', val: metrics.totalPayments, icon: <Briefcase className="h-4 w-4" /> },
            { label: 'Audit Events', val: metrics.totalAuditLogs, icon: <ScrollText className="h-4 w-4" /> },
          ].map(m => (
            <div key={m.label} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">{m.icon}</div>
              <div>
                <p className="text-lg font-semibold">{loading ? '...' : m.val}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Admin Modules Grid */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Administration Modules</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-slide-up delay-300">
            {adminModules.map(mod => (
              <Card
                key={mod.label}
                className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group"
                onClick={() => navigate(mod.href)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      {mod.icon}
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <h3 className="font-medium mt-3 text-foreground">{mod.label}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{mod.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
