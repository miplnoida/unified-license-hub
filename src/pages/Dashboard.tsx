import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { SupervisoryDashboard } from '@/components/dashboard/SupervisoryDashboard';
import { LicenseeDashboard } from '@/components/dashboard/LicenseeDashboard';
import { ApplicantDashboard } from '@/components/dashboard/ApplicantDashboard';

/**
 * Audience-aware dashboard router.
 *
 * Mounts one of three audience dashboards based on `EffectivePortalContext`:
 *   - internal  → SupervisoryDashboard (gated per-module via dynamic permissions)
 *   - licensee  → LicenseeDashboard (scoped by activeLicenseeId; refreshes on PPOC switch)
 *   - applicant/pre-licensee → ApplicantDashboard
 *
 * All data comes from real Supabase queries (count + small priority lists),
 * relying on existing RLS for tenant/role scoping. No mock data.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const ctx = useEffectivePortalContext();

  if (ctx.loading) return <AuthLoadingScreen />;
  if (!user) return null;

  const { title, subtitle, content } = (() => {
    if (ctx.isInternal) {
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
