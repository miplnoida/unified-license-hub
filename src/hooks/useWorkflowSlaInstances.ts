/**
 * Centralized SLA aggregation hook.
 *
 * Fetches active/paused workflow_instances and produces:
 *   - `byEntityId`: Map<entityId, { slaInput, status, instance }>
 *   - `overview`: { healthy, warning, breached, total } counts
 *
 * Used by:
 *   - Applications list (per-row SLA badge)
 *   - Dashboard Workflow SLA Overview widget
 *
 * All consumers go through this hook so the breach calculation is
 * identical everywhere.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { computeWorkflowSLA, type UseWorkflowSLAInput, type SlaStatus } from './useWorkflowSLA';
import { resolveSlaInputFromInstance, type WorkflowInstanceRow } from '@/lib/workflowSlaResolver';

export interface WorkflowSlaEntry {
  entityId: string;
  entityType: string;
  instance: WorkflowInstanceRow;
  slaInput: UseWorkflowSLAInput;
  status: SlaStatus;
  percentConsumed: number;
  remainingHours: number;
}

export interface WorkflowSlaOverview {
  total: number;
  healthy: number;
  warning: number;
  breached: number;
  unknown: number;
}

interface Options {
  entityType?: string;
  entityIds?: string[] | null;
  enabled?: boolean;
}

const SELECT = 'id,entity_type,entity_id,status,current_step_id,current_step_key,started_at,updated_at,version_snapshot';

export function useWorkflowSlaInstances({ entityType = 'application', entityIds, enabled = true }: Options = {}) {
  const idsKey = entityIds ? [...entityIds].sort().join(',') : 'all';

  const query = useQuery({
    queryKey: ['workflow-sla-instances', entityType, idsKey],
    enabled: enabled && (entityIds == null || entityIds.length > 0),
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('workflow_instances')
        .select(SELECT)
        .eq('entity_type', entityType)
        .in('status', ['active', 'paused']);
      if (entityIds && entityIds.length > 0) {
        q = q.in('entity_id', entityIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as WorkflowInstanceRow[]) || [];
    },
  });

  const entries = useMemo<WorkflowSlaEntry[]>(() => {
    const list = query.data || [];
    const now = new Date();
    return list.map(wi => {
      const slaInput = resolveSlaInputFromInstance(wi);
      const r = computeWorkflowSLA(slaInput, now);
      return {
        entityId: wi.entity_id,
        entityType: wi.entity_type,
        instance: wi,
        slaInput,
        status: r.status,
        percentConsumed: r.percentConsumed,
        remainingHours: r.remainingHours,
      };
    });
  }, [query.data]);

  const byEntityId = useMemo(() => {
    const m = new Map<string, WorkflowSlaEntry>();
    // If the same entity has multiple instances, keep active over paused.
    for (const e of entries) {
      const existing = m.get(e.entityId);
      if (!existing) { m.set(e.entityId, e); continue; }
      if (existing.instance.status !== 'active' && e.instance.status === 'active') {
        m.set(e.entityId, e);
      }
    }
    return m;
  }, [entries]);

  const overview = useMemo<WorkflowSlaOverview>(() => {
    const o: WorkflowSlaOverview = { total: 0, healthy: 0, warning: 0, breached: 0, unknown: 0 };
    for (const e of byEntityId.values()) {
      o.total += 1;
      o[e.status] += 1;
    }
    return o;
  }, [byEntityId]);

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    entries,
    byEntityId,
    overview,
  };
}
