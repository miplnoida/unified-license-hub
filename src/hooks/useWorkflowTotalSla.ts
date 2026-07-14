/**
 * useWorkflowTotalSla
 *
 * Returns "Total SLA" — the sum of actual time spent on every workflow step
 * so far, for a set of entities. This is elapsed wall-clock time (minus pause
 * time), not the sum of configured `sla_hours`.
 *
 * Step boundaries mirror the decisive-action logic in workflowSlaResolver.ts
 * so the totals stay consistent with per-step SLA displays.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WorkflowTotalSlaEntry {
  workflowId: string | null;
  totalHours: number | null;
  stepCount: number;
  inProgress: boolean;
  /** Kept for backward compatibility with the badge component. Always false now. */
  hasMissingSla: boolean;
}

interface Options {
  entityType: string;
  entityIds?: string[] | null;
  enabled?: boolean;
}

const DECISIVE_ACTIONS = new Set([
  'approve',
  'reject',
  'send_back',
  'escalate',
  'request_resubmission',
  'return_for_correction',
  'request_more_info',
]);

const MS_PER_HOUR = 1000 * 60 * 60;

function toMs(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

export function useWorkflowTotalSla({ entityType, entityIds, enabled = true }: Options) {
  const idsKey = entityIds ? [...entityIds].sort().join(',') : 'all';

  const query = useQuery({
    queryKey: ['workflow-total-sla-elapsed', entityType, idsKey],
    enabled: enabled && (entityIds == null || entityIds.length > 0),
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from('workflow_instances')
        .select('id, workflow_id, entity_id, status, started_at, created_at, paused_at, resumed_at, total_pause_seconds, completed_at')
        .eq('entity_type', entityType)
        .in('status', ['active', 'paused', 'completed']);
      if (entityIds && entityIds.length > 0) {
        q = q.in('entity_id', entityIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      const instances = (data as any[]) || [];

      // Pick one instance per entity: active > paused > completed.
      const priority: Record<string, number> = { active: 3, paused: 2, completed: 1 };
      const chosen = new Map<string, any>();
      for (const wi of instances) {
        const prev = chosen.get(wi.entity_id);
        if (!prev || (priority[wi.status] || 0) > (priority[prev.status] || 0)) {
          chosen.set(wi.entity_id, wi);
        }
      }

      const chosenInstances = Array.from(chosen.values());
      const instanceIds = chosenInstances.map(w => w.id).filter(Boolean);
      const entityIdList = chosenInstances.map(w => w.entity_id).filter(Boolean);

      // Fetch actions by workflow_instance_id, with a fallback via application_id
      // (matches existing SLA hook behaviour for older rows).
      const [instanceActionsRes, appActionsRes, appsRes] = await Promise.all([
        instanceIds.length > 0
          ? supabase.from('approval_actions')
              .select('workflow_instance_id, step_id, action_type, action, created_at')
              .in('workflow_instance_id', instanceIds)
          : Promise.resolve({ data: [] as any[], error: null } as any),
        entityType === 'application' && entityIdList.length > 0
          ? supabase.from('approval_actions')
              .select('application_id, step_id, action_type, action, created_at')
              .in('application_id', entityIdList)
          : Promise.resolve({ data: [] as any[], error: null } as any),
        entityType === 'application' && entityIdList.length > 0
          ? supabase.from('applications').select('id, submitted_at, created_at').in('id', entityIdList)
          : Promise.resolve({ data: [] as any[], error: null } as any),
      ]);
      if (instanceActionsRes.error) throw instanceActionsRes.error;
      if (appActionsRes.error) throw appActionsRes.error;
      if (appsRes.error) throw appsRes.error;

      const actionsByInstance = new Map<string, any[]>();
      for (const a of (instanceActionsRes.data as any[]) || []) {
        const id = a.workflow_instance_id;
        if (!id) continue;
        const list = actionsByInstance.get(id) || [];
        list.push(a);
        actionsByInstance.set(id, list);
      }
      const actionsByApp = new Map<string, any[]>();
      for (const a of (appActionsRes.data as any[]) || []) {
        const id = a.application_id;
        if (!id) continue;
        const list = actionsByApp.get(id) || [];
        list.push(a);
        actionsByApp.set(id, list);
      }
      const appClockById = new Map<string, any>();
      for (const app of (appsRes.data as any[]) || []) appClockById.set(app.id, app);

      const now = Date.now();
      const result = new Map<string, WorkflowTotalSlaEntry>();

      for (const wi of chosenInstances) {
        const rawActions =
          actionsByInstance.get(wi.id) ||
          (entityType === 'application' ? actionsByApp.get(wi.entity_id) : null) ||
          [];
        const decisive = rawActions
          .filter(a => DECISIVE_ACTIONS.has((a.action_type || a.action || '') as string))
          .map(a => ({ ...a, __ts: toMs(a.created_at) }))
          .filter(a => a.__ts != null)
          .sort((a, b) => (a.__ts as number) - (b.__ts as number));

        const app = appClockById.get(wi.entity_id);
        const workflowStart =
          toMs(app?.submitted_at) ??
          toMs(app?.created_at) ??
          toMs(wi.started_at) ??
          toMs(wi.created_at) ??
          null;

        if (workflowStart == null) {
          result.set(wi.entity_id, {
            workflowId: wi.workflow_id ?? null,
            totalHours: null,
            stepCount: 0,
            inProgress: wi.status !== 'completed',
            hasMissingSla: false,
          });
          continue;
        }

        // Build step segments: [start, end] pairs. Each decisive action closes a step.
        let cursor = workflowStart;
        let totalMs = 0;
        let steps = 0;
        for (const act of decisive) {
          const end = act.__ts as number;
          if (end >= cursor) {
            totalMs += end - cursor;
            steps += 1;
            cursor = end;
          }
        }

        const isCompleted = wi.status === 'completed';
        const inProgress = !isCompleted;
        if (inProgress) {
          const end = now;
          if (end > cursor) {
            totalMs += end - cursor;
            steps += 1;
          }
        }

        // Subtract pause time.
        let pauseMs = Number(wi.total_pause_seconds || 0) * 1000;
        if (wi.status === 'paused' && wi.paused_at) {
          const p = toMs(wi.paused_at);
          if (p != null) pauseMs += Math.max(0, now - p);
        }
        totalMs = Math.max(0, totalMs - pauseMs);

        result.set(wi.entity_id, {
          workflowId: wi.workflow_id ?? null,
          totalHours: totalMs / MS_PER_HOUR,
          stepCount: steps,
          inProgress,
          hasMissingSla: false,
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
