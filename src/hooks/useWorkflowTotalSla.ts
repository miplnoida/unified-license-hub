/**
 * useWorkflowTotalSla
 *
 * Returns the total workflow SLA (sum of `sla_hours` across every step of the
 * active approval workflow) for a set of entities.
 *
 * Read-only. Prefers live `approval_steps` rows; falls back to the
 * `version_snapshot.steps` array on the workflow instance (matches the
 * fallback behaviour used by the SLA resolver elsewhere).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WorkflowTotalSlaEntry {
  workflowId: string | null;
  totalHours: number | null; // null => some/all steps missing sla_hours
  stepCount: number;
  hasMissingSla: boolean;
}

interface Options {
  entityType: string;
  entityIds?: string[] | null;
  enabled?: boolean;
}

export function useWorkflowTotalSla({ entityType, entityIds, enabled = true }: Options) {
  const idsKey = entityIds ? [...entityIds].sort().join(',') : 'all';

  const query = useQuery({
    queryKey: ['workflow-total-sla', entityType, idsKey],
    enabled: enabled && (entityIds == null || entityIds.length > 0),
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from('workflow_instances')
        .select('id, workflow_id, entity_id, version_snapshot, status')
        .eq('entity_type', entityType)
        .in('status', ['active', 'paused', 'completed']);
      if (entityIds && entityIds.length > 0) {
        q = q.in('entity_id', entityIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      const instances = (data as any[]) || [];

      const workflowIds = Array.from(new Set(instances.map(i => i.workflow_id).filter(Boolean))) as string[];

      const totalsByWorkflow = new Map<string, { total: number; count: number; missing: boolean }>();
      if (workflowIds.length > 0) {
        const { data: steps, error: stepErr } = await supabase
          .from('approval_steps')
          .select('workflow_id, sla_hours')
          .in('workflow_id', workflowIds);
        if (stepErr) throw stepErr;
        for (const s of (steps as any[]) || []) {
          if (!s.workflow_id) continue;
          const entry = totalsByWorkflow.get(s.workflow_id) || { total: 0, count: 0, missing: false };
          entry.count += 1;
          if (s.sla_hours == null || Number.isNaN(Number(s.sla_hours))) {
            entry.missing = true;
          } else {
            entry.total += Number(s.sla_hours);
          }
          totalsByWorkflow.set(s.workflow_id, entry);
        }
      }

      // Prefer active-first when an entity has multiple instances
      const priority: Record<string, number> = { active: 3, paused: 2, completed: 1 };
      const chosen = new Map<string, any>();
      for (const wi of instances) {
        const prev = chosen.get(wi.entity_id);
        if (!prev || (priority[wi.status] || 0) > (priority[prev.status] || 0)) {
          chosen.set(wi.entity_id, wi);
        }
      }

      const result = new Map<string, WorkflowTotalSlaEntry>();
      for (const [entityId, wi] of chosen.entries()) {
        let total = 0;
        let count = 0;
        let missing = false;

        const live = wi.workflow_id ? totalsByWorkflow.get(wi.workflow_id) : null;
        if (live && live.count > 0) {
          total = live.total;
          count = live.count;
          missing = live.missing;
        } else {
          const snap = Array.isArray(wi.version_snapshot?.steps) ? wi.version_snapshot.steps : [];
          for (const s of snap) {
            count += 1;
            const v = s?.sla_hours;
            if (v == null || Number.isNaN(Number(v))) missing = true;
            else total += Number(v);
          }
        }

        result.set(entityId, {
          workflowId: wi.workflow_id ?? null,
          totalHours: count === 0 ? null : total,
          stepCount: count,
          hasMissingSla: missing,
        });
      }
      return result;
    },
  });

  const byEntityId = useMemo(
    () => query.data ?? new Map<string, WorkflowTotalSlaEntry>(),
    [query.data],
  );

  return { isLoading: query.isLoading, byEntityId };
}
