import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ExecutiveSupervisoryDashboard } from '@/components/dashboard/ExecutiveSupervisoryDashboard';

/**
 * Thin alias for bookmarked links. The executive dashboard now lives at
 * /dashboard itself (see Dashboard.tsx + useDashboardTier) for any internal
 * user whose dynamic role has dashboard_tier='executive' — this route just
 * renders the same content directly so old links keep working.
 */
export default function ExecutiveDashboard() {
  return (
    <DashboardLayout
      title="Executive Dashboard"
      subtitle="Cross-module supervisory intelligence — also available at /dashboard for executive-tier roles."
    >
      <ExecutiveSupervisoryDashboard />
    </DashboardLayout>
  );
}
