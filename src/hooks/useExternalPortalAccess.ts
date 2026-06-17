import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ExternalPortalAccessRow, PortalArea, PortalCapability } from '@/lib/portalAccess';
import { hasCapability } from '@/lib/portalAccess';

/**
 * Loads the current user's active external portal access rows.
 * RLS restricts results to `user_id = auth.uid()` for external users.
 */
export function useExternalPortalAccess() {
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ['external_portal_access', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ExternalPortalAccessRow[]> => {
      const { data, error } = await (supabase as any)
        .from('external_portal_access')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active');
      if (error) throw error;
      return (data || []) as ExternalPortalAccessRow[];
    },
  });

  const rows = query.data ?? [];

  const findRow = (area: PortalArea, entityId?: string | null) =>
    rows.find(r => r.portal_area === area && (entityId ? r.entity_id === entityId : true)) || null;

  const can = (area: PortalArea, capability: PortalCapability, entityId?: string | null) =>
    hasCapability(findRow(area, entityId), capability);

  const hasAreaAccess = (area: PortalArea, entityId?: string | null) => !!findRow(area, entityId);

  return { ...query, rows, can, hasAreaAccess, findRow };
}
