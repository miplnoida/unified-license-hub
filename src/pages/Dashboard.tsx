import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { useDashboardTier } from '@/hooks/useDashboardTier';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { SupervisoryDashboard } from '@/components/dashboard/SupervisoryDashboard';
import { ExecutiveSupervisoryDashboard } from '@/components/dashboard/ExecutiveSupervisoryDashboard';
import { LicenseeDashboard } from '@/components/dashboard/LicenseeDashboard';
import { ApplicantDashboard } from '@/components/dashboard/ApplicantDashboard';
import { AdminOnlyDashboard } from '@/components/dashboard/AdminOnlyDashboard';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';


/**
 * Audience-aware dashboard router.
 *
 * Mounts one of three audience dashboards based on `EffectivePortalContext`:
 *   - internal  → SupervisoryDashboard (operational tier, gated per-module via
 *     dynamic permissions) or ExecutiveSupervisoryDashboard (executive tier —
 *     see useDashboardTier/RoleManagement.tsx's Dashboard Tier field)
 *   - licensee  → LicenseeDashboard (scoped by activeLicenseeId; refreshes on PPOC switch)
 *   - applicant/pre-licensee → ApplicantDashboard
 *
 * All data comes from real Supabase queries (count + small priority lists),
 * relying on existing RLS for tenant/role scoping. No mock data.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const ctx = useEffectivePortalContext();
  const { tier } = useDashboardTier();
  const { hasModuleAccess, isBypassRole } = useUserDynamicPermissions();
  const [view, setView] = useState<'operational' | 'executive' | 'admin' | null>(null);

  if (ctx.loading) return <AuthLoadingScreen />;
  if (!user) return null;

  // Supervisory modules the SupervisoryDashboard actually renders data for.
  // If an internal user has NONE of these but does have admin_dashboard
  // access, they get an administrative landing page instead of the
  // misleading "All clear — no supervisory issues" empty state.
  const SUPERVISORY_MODULES = [
    'application_management', 'license_management', 'returns_management',
    'complaint_management', 'market_conduct', 'fit_and_proper',
    'prudential_supervision', 'coordination', 'report_management',
  ];
  const hasSupervisoryAccess = isBypassRole
    || SUPERVISORY_MODULES.some((m) => hasModuleAccess(m));
  const hasAdminOnlyAccess = ctx.isInternal
    && !hasSupervisoryAccess
    && hasModuleAccess('admin_dashboard');

  // Which internal views this user may switch between. Super admins (bypass)
  // and executive-tier roles can reach the executive view even when their
  // default landing dashboard is the operational one.
  const canSeeExecutive = ctx.isInternal
    && (isBypassRole || tier === 'executive' || hasModuleAccess('report_management'));
  const canSeeAdmin = ctx.isInternal && (isBypassRole || hasModuleAccess('admin_dashboard'));
  const defaultView: 'operational' | 'executive' | 'admin' = hasAdminOnlyAccess
    ? 'admin'
    : tier === 'executive'
      ? 'executive'
      : 'operational';
  const activeView = view ?? defaultView;
  const availableViews = ctx.isInternal
    ? ([
      hasSupervisoryAccess ? 'operational' : null,
      canSeeExecutive ? 'executive' : null,
      canSeeAdmin ? 'admin' : null,
    ].filter(Boolean) as Array<'operational' | 'executive' | 'admin'>)
    : [];

  const { title, subtitle, content } = (() => {
    if (ctx.isInternal) {
      if (activeView === 'admin') {
        return {
          title: 'Administration',
          subtitle: `Welcome back, ${user.fullName}. Administrative tools available to you.`,
          content: <AdminOnlyDashboard />,
        };
      }
      if (activeView === 'executive') {
        return {
          title: 'Executive Dashboard',
          subtitle: `Welcome back, ${user.fullName}. Cross-module supervisory intelligence.`,
          content: <ExecutiveSupervisoryDashboard />,
        };
      }
      return {
        title: 'Supervisory Dashboard',
        subtitle: `Welcome back, ${user.fullName}. Platform-wide regulatory intelligence.`,
        content: <SupervisoryDashboard />,
      };
    }
    if (ctx.isLicensee) {
      return {
        title: 'Licensee Dashboard',
        subtitle: `Welcome, ${user.fullName}. Your entity-scoped supervisory view.`,
        content: <LicenseeDashboard />,
      };
    }
    return {
      title: ctx.isPreLicensee ? 'Pre-License Portal' : 'My Dashboard',
      subtitle: `Welcome, ${user.fullName}. Track your applications and pending actions.`,
      content: <ApplicantDashboard />,
    };
  })();

  return (
    <DashboardLayout title={title} subtitle={subtitle}>
      {availableViews.length > 1 && (
        <Tabs
          value={activeView}
          onValueChange={(v) => setView(v as 'operational' | 'executive' | 'admin')}
          className="mb-6"
        >
          <TabsList>
            {availableViews.includes('operational') && (
              <TabsTrigger value="operational">Supervisory</TabsTrigger>
            )}
            {availableViews.includes('executive') && (
              <TabsTrigger value="executive">Executive</TabsTrigger>
            )}
            {availableViews.includes('admin') && (
              <TabsTrigger value="admin">Administration</TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      )}
      {content}
    </DashboardLayout>
  );

}
