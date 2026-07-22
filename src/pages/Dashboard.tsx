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

  if (ctx.loading) return <AuthLoadingScreen />;
  if (!user) return null;

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[Dashboard] audience routing', {
      audience: ctx.audience,
      effectiveRole: ctx.effectiveRole,
      isInternal: ctx.isInternal,
      isLicensee: ctx.isLicensee,
      isPreLicensee: ctx.isPreLicensee,
      isApplicant: ctx.isApplicant,
      activeLicenseeId: ctx.activeLicenseeId,
    });
  }

  const { title, subtitle, content } = (() => {
    if (ctx.isInternal) {
      if (tier === 'executive') {
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
      {content}
    </DashboardLayout>
  );
}
