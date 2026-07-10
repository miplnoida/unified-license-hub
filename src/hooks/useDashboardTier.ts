import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { DashboardTier } from './useRoles';

/**
 * Resolves whether the current internal user should see the "executive"
 * cross-module KPI dashboard or the default "operational" SupervisoryDashboard
 * at /dashboard. Driven by roles.dashboard_tier on any of the user's assigned
 * dynamic roles (see RoleManagement.tsx) — if any assigned role is tagged
 * 'executive', the user gets the executive view. Defaults to 'operational',
 * so users with no dynamic role assignment (legacy super_admin/admin) keep
 * today's behavior unchanged.
 */
export function useDashboardTier() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-tier', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<DashboardTier> => {
      const { data: udr } = await supabase
        .from('user_dynamic_roles' as any)
        .select('role_id')
        .eq('user_id', user!.id);

      const roleIds = Array.from(new Set(((udr as any[]) || []).map((r) => r.role_id).filter(Boolean)));
      if (roleIds.length === 0) return 'operational';

      const { data: roles } = await supabase
        .from('roles' as any)
        .select('dashboard_tier')
        .in('id', roleIds);

      const hasExecutive = ((roles as any[]) || []).some((r) => r.dashboard_tier === 'executive');
      return hasExecutive ? 'executive' : 'operational';
    },
    staleTime: 60_000,
  });

  return { tier: data ?? 'operational', isLoading };
}
