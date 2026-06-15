import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminMetrics } from '@/hooks/useAdminMetrics';
import { useUserDynamicPermissions, type PermissionModule } from '@/hooks/usePermissions';
import { ShieldAlert } from 'lucide-react';
import {
  Building2, Users, Shield, FormInput, GitBranch, DollarSign, BarChart3, Bell,
  Settings, ScrollText, Layers, FileCheck, AlertTriangle, ArrowUpRight, CalendarCheck, Briefcase,
  ClipboardEdit,
} from 'lucide-react';

export default function AdminHub() {
  const navigate = useNavigate();
  const { data: metrics, isLoading, isError, error } = useAdminMetrics();
  const { hasModuleAccess, enforceDynamic, isLoading: permsLoading } = useUserDynamicPermissions();

  const m = metrics;

  const healthScore = m ? Math.min(100, Math.round(
    ((m.overdueReturns === 0 ? 25 : Math.max(0, 25 - m.overdueReturns * 2)) +
    (m.pendingApplications < 10 ? 25 : Math.max(0, 25 - (m.pendingApplications - 10))) +
    (m.totalRegulators > 0 ? 25 : 0) +
    (m.totalWorkflows > 0 ? 25 : 0))
  )) : 0;

  const kpiCards = [
    { label: 'Total Users', value: m?.totalUsers, sub: m ? `${m.activeUsers} active` : '', icon: <Users className="h-5 w-5" />, color: 'text-primary' },
    { label: 'Applications', value: m?.totalApplications, sub: m ? `${m.pendingApplications} pending` : '', icon: <FileCheck className="h-5 w-5" />, color: 'text-info' },
    { label: 'Active Licenses', value: m?.activeLicenses, sub: '', icon: <Shield className="h-5 w-5" />, color: 'text-success' },
    { label: 'Complaints', value: m?.totalComplaints, sub: '', icon: <AlertTriangle className="h-5 w-5" />, color: 'text-warning' },
  ];

  const allAdminModules: Array<{
    label: string; desc: string; icon: JSX.Element; href: string; module: PermissionModule;
  }> = [
    { label: 'Regulator Management', desc: `${m?.totalRegulators ?? '—'} regulators configured`, icon: <Building2 className="h-5 w-5" />, href: '/admin/regulators', module: 'settings' },
    { label: 'Sector & Service Config', desc: `${m?.totalSectors ?? '—'} sectors`, icon: <Layers className="h-5 w-5" />, href: '/admin/masters/sectors', module: 'settings' },
    { label: 'Form Builder', desc: `${m?.totalForms ?? '—'} templates`, icon: <FormInput className="h-5 w-5" />, href: '/admin/forms/pre-license', module: 'form_management' },
    { label: 'Workflow Configuration', desc: `${m?.totalWorkflows ?? '—'} workflows`, icon: <GitBranch className="h-5 w-5" />, href: '/workflows', module: 'workflow_management' },
    { label: 'Fee Management', desc: `${m?.totalFeeConfigs ?? '—'} fee configs`, icon: <DollarSign className="h-5 w-5" />, href: '/admin/fees', module: 'fee_management' },
    { label: 'Return Configuration', desc: 'Compliance schedules & rules', icon: <CalendarCheck className="h-5 w-5" />, href: '/admin/return-config', module: 'returns_management' },
    { label: 'Reports & Analytics', desc: 'Dashboards & ad-hoc reports', icon: <BarChart3 className="h-5 w-5" />, href: '/reports', module: 'report_management' },
    { label: 'Notification Templates', desc: `${m?.totalNotificationTemplates ?? '—'} templates`, icon: <Bell className="h-5 w-5" />, href: '/admin/notification-templates', module: 'settings' },
    { label: 'Employee Management', desc: `${m?.totalUsers ?? '—'} employees`, icon: <Users className="h-5 w-5" />, href: '/admin/users', module: 'user_management' },
    { label: 'Role Management (RBAC)', desc: 'Roles & permissions', icon: <Shield className="h-5 w-5" />, href: '/admin/roles', module: 'role_management' },
    { label: 'Complaint Management', desc: `${m?.totalComplaints ?? '—'} complaints`, icon: <AlertTriangle className="h-5 w-5" />, href: '/complaints', module: 'complaint_management' },
    { label: 'Complaint Types', desc: 'Configure complaint categories', icon: <Layers className="h-5 w-5" />, href: '/admin/complaint-types', module: 'complaint_management' },
    { label: 'Audit Logs', desc: `${m?.totalAuditLogs ?? '—'} events logged`, icon: <ScrollText className="h-5 w-5" />, href: '/admin/audit-logs', module: 'settings' },
    { label: 'System Settings', desc: 'Security, branding & more', icon: <Settings className="h-5 w-5" />, href: '/settings', module: 'settings' },
    { label: 'Registration Forms', desc: 'Dynamic registration flow config', icon: <FormInput className="h-5 w-5" />, href: '/admin/registration-forms', module: 'form_management' },
  ];

  // Filter modules by dynamic permissions. Super admin / legacy admin (no dynamic
  // role mapping) → see all. Otherwise only modules they have access to.
  const adminModules = allAdminModules.filter(mod => hasModuleAccess(mod.module));
  const noAccess = !permsLoading && enforceDynamic && adminModules.length === 0;

  const platformMetrics = [
    { label: 'Regulators', val: m?.totalRegulators, icon: <Building2 className="h-4 w-4" /> },
    { label: 'Sectors', val: m?.totalSectors, icon: <Layers className="h-4 w-4" /> },
    { label: 'Workflows', val: m?.totalWorkflows, icon: <GitBranch className="h-4 w-4" /> },
    { label: 'Fee Configs', val: m?.totalFeeConfigs, icon: <DollarSign className="h-4 w-4" /> },
    { label: 'Form Templates', val: m?.totalForms, icon: <FormInput className="h-4 w-4" /> },
    { label: 'Returns', val: m?.totalReturns, icon: <CalendarCheck className="h-4 w-4" /> },
    { label: 'Payments', val: m?.totalPayments, icon: <Briefcase className="h-4 w-4" /> },
    { label: 'Audit Events', val: m?.totalAuditLogs, icon: <ScrollText className="h-4 w-4" /> },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Admin Control Panel"
          description="Centralized system administration with full control over all platform modules."
        />

        {isError && (
          <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm">
            Failed to load dashboard metrics: {error?.message || 'Unknown error'}. Some data may be unavailable.
          </div>
        )}

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
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">
                    {isLoading ? <Skeleton className="h-6 w-8" /> : healthScore}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground">System Health</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isLoading ? '...' : healthScore >= 70 ? 'All systems operational' : healthScore >= 40 ? 'Needs attention' : 'Critical issues'}
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
                    <p className="text-2xl font-bold mt-1">
                      {isLoading ? <Skeleton className="h-8 w-12" /> : (k.value ?? '—')}
                    </p>
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
          {platformMetrics.map(pm => (
            <div key={pm.label} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">{pm.icon}</div>
              <div>
                <p className="text-lg font-semibold">
                  {isLoading ? <Skeleton className="h-5 w-8" /> : (pm.val ?? '—')}
                </p>
                <p className="text-xs text-muted-foreground">{pm.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Admin Modules Grid */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Administration Modules</h2>

          {noAccess ? (
            <Card>
              <CardContent className="py-10 flex flex-col items-center text-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-medium text-foreground">No administration modules available</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    Your role does not currently grant access to any admin modules. Please contact your system
                    administrator if you believe this is a mistake.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
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
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
