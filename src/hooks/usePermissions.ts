import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook to check if the current user has a specific permission.
 * Fetches the user's role permissions from the DB and provides a check function.
 */
export function useUserDynamicPermissions() {
  const { user } = useAuth();

  const { data: permissions = [], isLoading } = useQuery({
    queryKey: ['user-permissions', user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Get user's role from user_roles table
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id);

      if (!userRoles || userRoles.length === 0) return [];

      // Get the primary role
      const primaryRole = userRoles[0].role;

      // Find the dynamic role matching this system_role
      const { data: dynRole } = await supabase
        .from('roles' as any)
        .select('id')
        .eq('system_role', primaryRole)
        .single();

      if (!dynRole) return [];

      // Get permissions for this role
      const { data: rp } = await supabase
        .from('role_permissions' as any)
        .select('permission_id')
        .eq('role_id', (dynRole as any).id);

      if (!rp) return [];

      const permIds = (rp as any[]).map(r => r.permission_id);
      if (permIds.length === 0) return [];

      const { data: perms } = await supabase
        .from('permissions' as any)
        .select('name, module')
        .in('id', permIds);

      return (perms || []) as unknown as { name: string; module: string }[];
    },
    staleTime: 60_000,
  });

  const hasPermission = (module: string, action: string): boolean => {
    // Super admin always has access
    if (user?.role === 'super_admin') return true;
    return permissions.some(p => p.module === module && p.name === action);
  };

  const hasModuleAccess = (module: string): boolean => {
    if (user?.role === 'super_admin') return true;
    return permissions.some(p => p.module === module);
  };

  return { permissions, hasPermission, hasModuleAccess, isLoading };
}
