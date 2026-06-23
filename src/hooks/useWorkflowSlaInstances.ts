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
 * identical everywhere. Active approval_steps are preferred over
 * version_snapshot, because backend workflow configuration is the source of
 * truth for in-flight SLA/status display.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { computeWorkflowSLA, type UseWorkflowSLAInput, type SlaStatus } from '@/hooks/useWorkflowSLA';
import {
  getWorkflowSlaStepConfig,
  resolveCurrentStepStartedAt,
  resolveSlaInputFromInstance,
  type WorkflowInstanceRow,
  type WorkflowSlaActionRecord,
  type WorkflowSlaStepConfig,
} from '@/lib/workflowSlaResolver';

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

const SELECT = 'id,workflow_id,entity_type,entity_id,status,current_step_id,current_step_key,started_at,created_at,updated_at,version_snapshot';

interface ApplicationClockRow {
  id: string;
  submitted_at: string | null;
  created_at: string | null;
}

const STEP_SELECT = 'id,workflow_id,step_order,sla_hours,sla_warning_threshold_percent,escalation_after_hours,sla_pause_on_rfi';

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
      const instances = (data as WorkflowInstanceRow[]) || [];

      const stepIds = Array.from(new Set(instances.map(wi => wi.current_step_id).filter((id): id is string => !!id)));
      const entityIdList = Array.from(new Set(instances.map(wi => wi.entity_id).filter(Boolean)));
      const workflowIds = Array.from(new Set(instances.map(wi => wi.workflow_id).filter((id): id is string => !!id)));
      const instanceIds = Array.from(new Set(instances.map(wi => wi.id).filter(Boolean)));

      const [stepsRes, workflowStepsRes, instanceActionsRes, appActionsRes, appsRes] = await Promise.all([
        stepIds.length > 0
          ? supabase.from('approval_steps').select(STEP_SELECT).in('id', stepIds)
          : Promise.resolve({ data: [] as any[], error: null } as any),
        workflowIds.length > 0
          ? supabase.from('approval_steps').select('id, workflow_id, step_order').in('workflow_id', workflowIds)
          : Promise.resolve({ data: [] as any[], error: null } as any),
        instanceIds.length > 0
          ? supabase.from('approval_actions').select('workflow_instance_id, step_id, action_type, action, created_at').in('workflow_instance_id', instanceIds)
          : Promise.resolve({ data: [] as any[], error: null } as any),
        entityType === 'application' && entityIdList.length > 0
          ? supabase.from('approval_actions').select('application_id, step_id, action_type, action, created_at').in('application_id', entityIdList)
          : Promise.resolve({ data: [] as any[], error: null } as any),
        entityType === 'application' && entityIdList.length > 0
          ? supabase.from('applications').select('id, submitted_at, created_at').in('id', entityIdList)
          : Promise.resolve({ data: [] as any[], error: null } as any),
      ]);
      if (stepsRes.error) throw stepsRes.error;
      if (workflowStepsRes.error) throw workflowStepsRes.error;
      if (instanceActionsRes.error) throw instanceActionsRes.error;
      if (appActionsRes.error) throw appActionsRes.error;
      if (appsRes.error) throw appsRes.error;

      const stepById = new Map<string, WorkflowSlaStepConfig>();
      ((stepsRes.data as WorkflowSlaStepConfig[]) || []).forEach(step => {
        if (step.id) stepById.set(step.id, step);
      });
      const workflowStepsByWorkflowId = new Map<string, WorkflowSlaStepConfig[]>();
      ((workflowStepsRes.data as WorkflowSlaStepConfig[]) || []).forEach(step => {
        if (!step.workflow_id) return;
        const list = workflowStepsByWorkflowId.get(step.workflow_id) || [];
        list.push(step);
        workflowStepsByWorkflowId.set(step.workflow_id, list);
      });

      const actionsByInstanceId = new Map<string, WorkflowSlaActionRecord[]>();
      ((instanceActionsRes.data as any[]) || []).forEach(action => {
        const instanceId = action.workflow_instance_id as string | null;
        if (!instanceId) return;
        const list = actionsByInstanceId.get(instanceId) || [];
        list.push(action);
        actionsByInstanceId.set(instanceId, list);
      });
      const actionsByAppId = new Map<string, WorkflowSlaActionRecord[]>();
      ((appActionsRes.data as any[]) || []).forEach(action => {
        const appId = action.application_id as string | null;
        if (!appId) return;
        const list = actionsByAppId.get(appId) || [];
        list.push(action);
        actionsByAppId.set(appId, list);
      });

      const appClockById = new Map<string, ApplicationClockRow>();
      ((appsRes.data as ApplicationClockRow[]) || []).forEach(app => appClockById.set(app.id, app));

      return instances.map(wi => {
        const liveCurrentStep = wi.current_step_id ? stepById.get(wi.current_step_id) ?? null : null;
        const currentStep = getWorkflowSlaStepConfig(wi, liveCurrentStep);
        const firstStepStartedAt = appClockById.get(wi.entity_id)?.submitted_at || appClockById.get(wi.entity_id)?.created_at || wi.started_at || wi.created_at || null;
        const actionHistory = actionsByInstanceId.get(wi.id) || actionsByAppId.get(wi.entity_id) || [];
        const workflowSteps = wi.workflow_id ? (workflowStepsByWorkflowId.get(wi.workflow_id) || []) : [];
        const currentStepStartedAt = resolveCurrentStepStartedAt(currentStep, workflowSteps, actionHistory, firstStepStartedAt);

        return {
          ...wi,
          __currentStep: liveCurrentStep,
          __firstStepStartedAt: firstStepStartedAt,
          __currentStepStartedAt: currentStepStartedAt,
        };
      }) as Array<WorkflowInstanceRow & { __currentStep?: WorkflowSlaStepConfig | null; __firstStepStartedAt?: string | null; __currentStepStartedAt?: string | null }>;
    },
  });

  const entries = useMemo<WorkflowSlaEntry[]>(() => {
    const list = query.data || [];
    const now = new Date();
    return list.map(wi => {
      const slaInput = resolveSlaInputFromInstance(wi, {
        currentStep: (wi as any).__currentStep ?? null,
        currentStepStartedAt: (wi as any).__currentStepStartedAt ?? null,
        firstStepStartedAt: (wi as any).__firstStepStartedAt ?? null,
      });
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
