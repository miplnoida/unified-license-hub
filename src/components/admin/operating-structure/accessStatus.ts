import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Recording a responsibility NEVER grants a permission. This read-only check
 * tells the administrator whether the person's existing canonical roles already
 * support the work being recorded, or whether access needs a separate review in
 * User Management. It never changes roles and never widens RBAC.
 */
export function useAccessStatus(userId: string | null | undefined) {
  const q = useQuery({
    queryKey: ['os-access-status', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('staff_responsibility_profile', { _user_id: userId });
      if (error) throw error;
      return data as any;
    },
  });

  const roles: string[] = (q.data?.roles || []).map((r: any) => r?.name).filter(Boolean);
  const ready = roles.length > 0;

  return {
    isLoading: q.isLoading,
    roles,
    ready,
    label: ready ? 'READY' : 'NEEDS ACCESS REVIEW',
    message: ready
      ? 'This person already holds roles in User Management. Responsibility records where work applies — it never grants a permission.'
      : 'Responsibility can be recorded, but this person’s current roles may not permit all selected actions.',
  };
}
