import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { SecurityContext } from '@/lib/rbac/securityContext';

/**
 * Legacy fallback: derive the permission set from the pre-`sec_*` tables.
 * Used only when `sec_get_user_context()` is unreachable (offline RPC, test
 * harness) so authorization degrades to the previous behaviour instead of
 * locking every screen.
 */
async function legacyContext(userId: string): Promise<SecurityContext> {
  const { data: udr } = await supabase
    .from('user_dynamic_roles' as any)
    .select('role_id')
    .eq('user_id', userId);
  const roleIds = Array.from(new Set(((udr as any[]) || []).map((r) => r.role_id).filter(Boolean)));
  if (!roleIds.length) return { authenticated: true, user_id: userId, roles: [], permissions: [] };

  const { data: rp } = await supabase
    .from('role_permissions' as any)
    .select('permission_id')
    .in('role_id', roleIds);
  const permIds = Array.from(new Set(((rp as any[]) || []).map((r) => r.permission_id).filter(Boolean)));
  if (!permIds.length) {
    return {
      authenticated: true,
      user_id: userId,
      roles: roleIds.map((id) => ({ id, key: id, name: id, role_type: null, dashboard_tier: null })),
      permissions: [],
    };
  }

  const { data: perms } = await supabase
    .from('permissions' as any)
    .select('id, module, name')
    .in('id', permIds);

  return {
    authenticated: true,
    user_id: userId,
    roles: roleIds.map((id) => ({ id, key: id, name: id, role_type: null, dashboard_tier: null })),
    permissions: ((perms as any[]) || []).map((p) => ({ module: p.module, action: p.name })),
  };
}

/**
 * Single frontend fetch of the canonical security context.
 *
 * One round trip returns roles, permissions, scopes, the route registry and
 * the navigation tree, all evaluated server-side by
 * `public.sec_get_user_context()`. Every guard, gate and menu in the app reads
 * from this cache — no component queries permission tables directly.
 */
export function useSecurityContext() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['sec-context', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<SecurityContext> => {
      try {
        const { data, error } = await (supabase.rpc as any)('sec_get_user_context');
        if (error) throw error;
        const ctx = (data || null) as SecurityContext | null;
        if (ctx?.authenticated) return ctx;
      } catch {
        // fall through to the legacy derivation below
      }
      return legacyContext(user!.id);
    },
  });

  return {
    context: query.data ?? null,
    isLoading: !!user && query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
