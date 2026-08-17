import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Global peer-comparison configuration (PRU-ANA-001 §3.6).
 *
 * The minimum peer sample required before a distribution may be published is a
 * regulator-configurable value stored in `site_settings` under
 * `prudential_peer_settings`. A hard floor of 3 is enforced in the database so
 * the confidentiality guard can never be disabled from the UI.
 */
export const PEER_MIN_PEERS_FLOOR = 3;
export const PEER_MIN_PEERS_CEILING = 50;
export const PEER_MIN_PEERS_DEFAULT = 5;

export function usePeerMinPeers() {
  return useQuery({
    queryKey: ['site_settings', 'prudential_peer_settings'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('site_settings' as any)
        .select('value')
        .eq('key', 'prudential_peer_settings')
        .maybeSingle() as any);
      if (error) throw error;
      const raw = Number((data?.value as any)?.min_peers);
      return Number.isFinite(raw) && raw > 0
        ? Math.max(raw, PEER_MIN_PEERS_FLOOR)
        : PEER_MIN_PEERS_DEFAULT;
    },
  });
}

export function useSavePeerMinPeers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: number) => {
      const { error } = await (supabase as any).rpc('set_prudential_min_peers', { _value: value });
      if (error) throw error;
      return value;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site_settings', 'prudential_peer_settings'] });
      qc.invalidateQueries({ queryKey: ['peer_ratio_snapshot'] });
    },
  });
}

/** Whether the signed-in user may change prudential configuration. */
export function useCanManagePrudentialConfig() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['can_manage_prudential_config', user?.id ?? null],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('can_manage_prudential_config', {
        _user: user!.id,
      });
      if (error) throw error;
      return !!data;
    },
  });
}
