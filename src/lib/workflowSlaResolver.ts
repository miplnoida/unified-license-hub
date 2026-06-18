/**
 * Resolves a UseWorkflowSLAInput from a workflow_instances row.
 *
 * Centralized so every screen (Applications list, Dashboard SLA widget,
 * Registration review, WorkflowPanel) computes SLA from the same shape.
 *
 * Step "started_at" approximation:
 *   - We use `workflow_instances.updated_at` because the workflow service
 *     updates that row whenever the current step advances. This avoids an
 *     N+1 lookup of the latest approval_action per instance for list
 *     contexts.
 *   - WorkflowPanel intentionally keeps a more precise per-step start time
 *     derived from approval_actions for its detail view.
 */
import type { UseWorkflowSLAInput } from '@/hooks/useWorkflowSLA';

export interface WorkflowInstanceRow {
  id: string;
  entity_type: string;
  entity_id: string;
  status: string;
  current_step_id: string | null;
  current_step_key: string | null;
  started_at: string | null;
  updated_at: string | null;
  version_snapshot: any;
}

interface SnapshotStep {
  local_id?: string;
  id?: string;
  sla_hours?: number | null;
  sla_warning_threshold_percent?: number | null;
  escalation_after_hours?: number | null;
  sla_pause_on_rfi?: boolean | null;
}

function findCurrentSnapshotStep(wi: WorkflowInstanceRow): SnapshotStep | null {
  const steps: SnapshotStep[] = wi.version_snapshot?.steps || [];
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const key = wi.current_step_key || wi.current_step_id;
  if (!key) return null;
  return (
    steps.find(s => s.local_id === key || s.id === key) ?? null
  );
}

export function resolveSlaInputFromInstance(
  wi: WorkflowInstanceRow,
): UseWorkflowSLAInput {
  const step = findCurrentSnapshotStep(wi);
  const startedAt = wi.updated_at || wi.started_at;
  const paused = wi.status === 'paused';

  return {
    startedAt,
    slaHours: step?.sla_hours ?? null,
    warningThresholdPercent: step?.sla_warning_threshold_percent ?? 80,
    escalationAfterHours: step?.escalation_after_hours ?? null,
    paused,
  };
}
