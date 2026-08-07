/**
 * Phase 1A — SLA stage evidence.
 *
 * Reads the persisted per-stage SLA record (`sla_stage_instances`) and its
 * append-only event history (`sla_stage_events`) for one entity. Read-only:
 * all state transitions happen server-side through SECURITY DEFINER routines.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SlaStageInstanceRow } from '@/lib/workflowSlaResolver';

export interface SlaStageEventRow {
  id: string;
  stage_instance_id: string;
  event_type: 'started' | 'paused' | 'resumed' | 'breached' | 'escalated' | 'completed' | string;
  actor_id: string | null;
  actor_kind: string;
  from_state: string | null;
  to_state: string | null;
  reason: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
}

const STAGE_SELECT =
  'id,process_type,entity_type,entity_id,workflow_instance_id,step_id,stage_name,sla_hours,sla_source,started_at,due_at,paused_at,pause_seconds,state,breached_at';

export function useSlaStageHistory(entityType: string, entityId?: string | null) {
  return useQuery({
    queryKey: ['sla-stage-history', entityType, entityId],
    enabled: !!entityId,
    staleTime: 30_000,
    queryFn: async (): Promise<{ stages: SlaStageInstanceRow[]; events: SlaStageEventRow[] }> => {
      const { data: stages, error } = await (supabase as any)
        .from('sla_stage_instances')
        .select(STAGE_SELECT)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('started_at', { ascending: false });
      if (error) throw error;

      const stageList = (stages as SlaStageInstanceRow[]) || [];
      if (stageList.length === 0) return { stages: [], events: [] };

      const { data: events, error: evErr } = await (supabase as any)
        .from('sla_stage_events')
        .select('id,stage_instance_id,event_type,actor_id,actor_kind,from_state,to_state,reason,occurred_at,metadata')
        .in('stage_instance_id', stageList.map(s => s.id))
        .order('occurred_at', { ascending: false });
      if (evErr) throw evErr;

      return { stages: stageList, events: (events as SlaStageEventRow[]) || [] };
    },
  });
}
