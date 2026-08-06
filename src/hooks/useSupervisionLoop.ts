/**
 * Supervision Loop Dashboard (MCS-MON-002) data hooks.
 *
 * Every read goes through a conduct_supervision_* SECURITY DEFINER RPC so
 * authorisation and aggregation stay server-side.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  LoopSummary, LoopCase, TimelineEvent, UnresolvedRisk, LearningItem,
} from '@/lib/conduct/supervisionLoop';
import { EMPTY_SUMMARY } from '@/lib/conduct/supervisionLoop';

const sb = supabase as any;
const KEY = ['conduct-supervision-loop'] as const;

export interface LoopFilters {
  entityId: string | null;
  sectorId: string | null;
  from: string;
  to: string;
}

export function useSupervisionLoopSummary(f: LoopFilters) {
  return useQuery({
    queryKey: [...KEY, 'summary', f],
    queryFn: async (): Promise<LoopSummary> => {
      const { data, error } = await sb.rpc('conduct_supervision_loop_summary', {
        _entity_id: f.entityId, _from: f.from, _to: f.to, _sector_id: f.sectorId,
      });
      if (error) throw error;
      return (data as LoopSummary) ?? EMPTY_SUMMARY;
    },
    staleTime: 60_000,
  });
}

export function useSupervisionLoopCases(stage: string | null, f: LoopFilters) {
  return useQuery({
    enabled: !!stage,
    queryKey: [...KEY, 'cases', stage, f],
    queryFn: async (): Promise<LoopCase[]> => {
      const { data, error } = await sb.rpc('conduct_supervision_loop_cases', {
        _stage: stage, _entity_id: f.entityId, _from: f.from, _to: f.to, _sector_id: f.sectorId,
      });
      if (error) throw error;
      return (data as LoopCase[]) ?? [];
    },
  });
}

export function useSupervisionTimeline(entityId: string | null, from: string, to: string) {
  return useQuery({
    enabled: !!entityId,
    queryKey: [...KEY, 'timeline', entityId, from, to],
    queryFn: async (): Promise<TimelineEvent[]> => {
      const { data, error } = await sb.rpc('conduct_supervision_timeline', {
        _entity_id: entityId, _from: from, _to: to,
      });
      if (error) throw error;
      return (data as TimelineEvent[]) ?? [];
    },
  });
}

export function useUnresolvedRisks(entityId: string | null, sectorId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'risks', entityId, sectorId],
    queryFn: async (): Promise<UnresolvedRisk[]> => {
      const { data, error } = await sb.rpc('conduct_supervision_unresolved_risks', {
        _entity_id: entityId, _sector_id: sectorId,
      });
      if (error) throw error;
      return (data as UnresolvedRisk[]) ?? [];
    },
    staleTime: 60_000,
  });
}

export function useRegulatoryLearning(limit = 25) {
  return useQuery({
    queryKey: [...KEY, 'learning', limit],
    queryFn: async (): Promise<LearningItem[]> => {
      const { data, error } = await sb.rpc('conduct_supervision_learning', { _limit: limit });
      if (error) throw error;
      return (data as LearningItem[]) ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export interface AnnotationRow {
  id: string;
  licensee_id: string;
  event_date: string;
  event_ref_type: string | null;
  event_ref_id: string | null;
  label: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export function useSupervisionAnnotations(entityId: string | null) {
  return useQuery({
    enabled: !!entityId,
    queryKey: [...KEY, 'annotations', entityId],
    queryFn: async (): Promise<AnnotationRow[]> => {
      const { data, error } = await sb.from('conduct_supervision_annotations')
        .select('*').eq('licensee_id', entityId).order('event_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AnnotationRow[];
    },
  });
}

export function useSaveAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      licensee_id: string; event_date: string; label: string; note?: string | null;
      event_ref_type?: string | null; event_ref_id?: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await sb.from('conduct_supervision_annotations').insert({
        ...input, created_by: auth?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });
}

export function useDeleteAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('conduct_supervision_annotations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });
}

export function useLogSupervisionEvent() {
  return {
    logView: async (scope: Record<string, unknown>) => {
      await sb.rpc('conduct_supervision_log_view', { _scope: scope }).then(() => {}, () => {});
    },
    logExport: async (scope: Record<string, unknown>) => {
      await sb.rpc('conduct_supervision_log_export', { _scope: scope }).then(() => {}, () => {});
    },
  };
}

/** Entity list for the dashboard filter (respects licensee RLS). */
export function useConductEntityOptions() {
  return useQuery({
    queryKey: [...KEY, 'entity-options'],
    queryFn: async () => {
      const { data, error } = await sb.from('licensees')
        .select('id, name, sector_id').order('name').limit(1000);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; sector_id: string | null }[];
    },
    staleTime: 5 * 60_000,
  });
}
