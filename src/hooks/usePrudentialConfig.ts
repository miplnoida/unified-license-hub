import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ValidationRule } from '@/lib/returnsValidation';
import type { PrudentialRatio, PrudentialThreshold, ComputedRatio, DetectedBreach } from '@/lib/returnsRatios';
import type { PeerSnapshot } from '@/lib/prudentialPhase2';
import { prudentialThresholdSave, prudentialThresholdDelete, prudentialRatioSave, prudentialRatioDelete } from '@/lib/prudentialGovernedOps';

// ---------------- Validation rules ----------------
export function useValidationRules(configId?: string | null) {
  return useQuery({
    queryKey: ['return_validation_rules', configId ?? 'all'],
    queryFn: async () => {
      let q = (supabase as any).from('return_validation_rules').select('*').order('name');
      if (configId) q = q.eq('return_config_id', configId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ValidationRule[];
    },
  });
}

export function useUpsertValidationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<ValidationRule> & { return_config_id: string }) => {
      const payload = { ...row, updated_at: new Date().toISOString() };
      if (row.id) {
        const { error } = await (supabase as any).from('return_validation_rules').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('return_validation_rules').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_validation_rules'] }); toast.success('Rule saved'); },
    onError: (e: any) => toast.error(e.message || 'Failed to save rule'),
  });
}

export function useDeleteValidationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('return_validation_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_validation_rules'] }); toast.success('Rule deleted'); },
    onError: (e: any) => toast.error(e.message || 'Failed to delete rule'),
  });
}

// ---------------- Thresholds ----------------
export function useThresholds(configId?: string | null) {
  return useQuery({
    queryKey: ['prudential_thresholds', configId ?? 'all'],
    queryFn: async () => {
      let q = (supabase as any).from('prudential_thresholds').select('*').order('metric_key');
      if (configId) q = q.eq('return_config_id', configId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PrudentialThreshold[];
    },
  });
}

export function useUpsertThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PrudentialThreshold> & { return_config_id: string }) => {
      const { id, ...payload } = row as any;
      // Governed operation: authority checks and audit trail run server-side.
      await prudentialThresholdSave(payload, id ?? null, id ? 'Threshold updated' : 'Threshold created');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_thresholds'] }); toast.success('Threshold saved'); },
    onError: (e: any) => toast.error(e.message || 'Failed to save threshold'),
  });
}

export function useDeleteThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await prudentialThresholdDelete(id, 'Threshold removed by supervisor');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_thresholds'] }); toast.success('Threshold deleted'); },
    onError: (e: any) => toast.error(e.message || 'Failed to delete threshold'),
  });
}

// ---------------- Ratios ----------------
export function useRatios(configId?: string | null) {
  return useQuery({
    queryKey: ['prudential_ratios', configId ?? 'all'],
    queryFn: async () => {
      let q = (supabase as any).from('prudential_ratios').select('*').order('label');
      if (configId) q = q.eq('return_config_id', configId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PrudentialRatio[];
    },
  });
}

export function useUpsertRatio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PrudentialRatio> & { return_config_id: string }) => {
      const { id, ...payload } = row as any;
      await prudentialRatioSave(payload, id ?? null, id ? 'Ratio updated' : 'Ratio created');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_ratios'] }); toast.success('Ratio saved'); },
    onError: (e: any) => toast.error(e.message || 'Failed to save ratio'),
  });
}

export function useDeleteRatio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await prudentialRatioDelete(id, 'Ratio removed by supervisor');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_ratios'] }); toast.success('Ratio deleted'); },
    onError: (e: any) => toast.error(e.message || 'Failed to delete ratio'),
  });
}

// ---------------- Computed ratios + breaches for a return ----------------
export function useReturnComputedRatios(returnId?: string | null) {
  return useQuery({
    queryKey: ['return_calculated_ratios', returnId],
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('return_calculated_ratios').select('*')
        .eq('return_id', returnId).order('computed_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<ComputedRatio & { computed_at: string; id: string }>;
    },
  });
}

export function useReturnBreaches(returnId?: string | null) {
  return useQuery({
    queryKey: ['return_threshold_breaches', returnId],
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('return_threshold_breaches').select('*')
        .eq('return_id', returnId).order('detected_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<DetectedBreach & { detected_at: string; id: string }>;
    },
  });
}

/**
 * Peer snapshot for a ratio at a specific period end.
 *
 * The RPC enforces a minimum peer sample and returns
 * `state: 'INSUFFICIENT_PEER_DATA'` rather than misleading statistics. When
 * `minPeers` is omitted the database resolves the regulator-configured value
 * (see `usePeerMinPeers`), never below the confidentiality floor of 3.
 * Passing `entityId` narrows the peer group to the entity's sector + category
 * and returns the entity's own value and percentile.
 */
export function usePeerSnapshot(
  ratioKey?: string | null,
  periodEnd?: string | null,
  sectorId?: string | null,
  entityId?: string | null,
  minPeers?: number | null,
) {
  return useQuery({
    queryKey: ['peer_ratio_snapshot', ratioKey, periodEnd, sectorId ?? null, entityId ?? null, minPeers ?? null],
    enabled: !!ratioKey && !!periodEnd,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('peer_ratio_snapshot', {
        _period_end: periodEnd,
        _ratio_key: ratioKey,
        _sector_id: sectorId ?? null,
        _entity_id: entityId ?? null,
        _min_peers: minPeers ?? null,
      });

      if (error) throw error;
      return data as PeerSnapshot;
    },
  });
}
