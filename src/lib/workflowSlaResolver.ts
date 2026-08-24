/**
 * Resolves a UseWorkflowSLAInput from a workflow_instances row.
 *
 * Centralized so every screen (Applications list, Dashboard SLA widget,
 * Registration review, WorkflowPanel) computes SLA from the same shape.
 *
 * Step "started_at" approximation:
 *   - For list contexts we use `workflow_instances.updated_at` because the
 *     workflow service updates that row whenever the current step advances.
 *   - For the first step, callers may pass the application submitted timestamp
 *     so backfilled/repair-created workflow instances do not reset the SLA
 *     clock.
 *   - WorkflowPanel intentionally keeps a more precise per-step start time
 *     derived from approval_actions for its detail view.
 *
 * Important: active workflow configuration is the runtime source of truth.
 * `version_snapshot` is only a fallback for legacy or historical rows. This
 * avoids stale snapshots showing old SLA values after admins update the step
 * configuration in the backend.
 */
import type { UseWorkflowSLAInput } from '@/hooks/useWorkflowSLA';

export interface WorkflowInstanceRow {
  id: string;
  workflow_id?: string | null;
  entity_type: string;
  entity_id: string;
  status: string;
  current_step_id: string | null;
  current_step_key: string | null;
  created_at?: string | null;
  started_at: string | null;
  updated_at: string | null;
  version_snapshot: any;
  paused_at?: string | null;
  resumed_at?: string | null;
  paused_reason?: string | null;
  total_pause_seconds?: number | null;
}

export interface WorkflowSlaStepConfig {
  local_id?: string;
  id?: string;
  workflow_id?: string | null;
  name?: string | null;
  step_order?: number | null;
  sla_hours?: number | null;
  sla_warning_threshold_percent?: number | null;
  escalation_after_hours?: number | null;
  sla_pause_on_rfi?: boolean | null;
}

export interface WorkflowSlaActionRecord {
  step_id: string | null;
  action_type: string | null;
  action?: string | null;
  created_at: string | null;
}

/**
 * Phase 1A: persisted per-stage SLA record (`public.sla_stage_instances`).
 * When present it is the authoritative clock, because its `sla_hours` /
 * `due_at` were resolved server-side from the SLA Manager configuration
 * (including business-calendar working days) with the workflow step SLA as
 * fallback.
 */
export interface SlaStageInstanceRow {
  id: string;
  process_type: string;
  entity_type: string;
  entity_id: string;
  workflow_instance_id: string | null;
  step_id: string | null;
  stage_name: string | null;
  sla_hours: number | null;
  sla_source: string | null;
  started_at: string;
  due_at: string | null;
  paused_at: string | null;
  pause_seconds: number | null;
  state: 'active' | 'paused' | 'breached' | 'completed' | string;
  breached_at: string | null;
}

export function resolveSlaInputFromStage(
  stage: SlaStageInstanceRow,
  warningThresholdPercent?: number | null,
): UseWorkflowSLAInput {
  const paused = stage.state === 'paused';
  return {
    startedAt: stage.started_at,
    slaHours: stage.sla_hours ?? null,
    warningThresholdPercent: warningThresholdPercent ?? 80,
    escalationAfterHours: null,
    paused,
    pauseSeconds: stage.pause_seconds ?? 0,
    pausedSince: paused ? stage.paused_at : null,
  };
}


const STEP_ADVANCE_ACTIONS = new Set([
  'approve',
  'reject',
  'send_back',
  'escalate',
  'request_resubmission',
  'return_for_correction',
  'request_more_info',
]);

interface ResolveSlaOptions {
  /** Live approval_steps row for the current step. Preferred over snapshots. */
  currentStep?: WorkflowSlaStepConfig | null;
  /** Precise current-step start, when the caller has action-history context. */
  currentStepStartedAt?: string | null;
  /** Application submitted/created timestamp used for first-step SLA. */
  firstStepStartedAt?: string | null;
}

function findCurrentSnapshotStep(wi: WorkflowInstanceRow): WorkflowSlaStepConfig | null {
  const steps: WorkflowSlaStepConfig[] = wi.version_snapshot?.steps || [];
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const key = wi.current_step_key || wi.current_step_id;
  if (!key) return null;
  return (
    steps.find(s => s.local_id === key || s.id === key) ?? null
  );
}

export function isFirstWorkflowStep(step: WorkflowSlaStepConfig | null): boolean {
  if (!step) return false;
  const order = Number(step.step_order);
  return Number.isFinite(order) && order <= 1;
}

export function getWorkflowSlaStepConfig(
  wi: WorkflowInstanceRow,
  currentStep?: WorkflowSlaStepConfig | null,
): WorkflowSlaStepConfig | null {
  return currentStep || (wi as any).__currentStep || findCurrentSnapshotStep(wi);
}

export function resolveCurrentStepStartedAt(
  step: WorkflowSlaStepConfig | null,
  workflowSteps: WorkflowSlaStepConfig[],
  actions: WorkflowSlaActionRecord[],
  firstStepStartedAt?: string | null,
): string | null {
  if (!step) return null;
  if (isFirstWorkflowStep(step)) return firstStepStartedAt || null;

  const currentOrder = Number(step.step_order);
  if (!Number.isFinite(currentOrder)) return null;

  const previousStepIds = new Set(
    workflowSteps
      .filter((s) => {
        const order = Number(s.step_order);
        return s.id && Number.isFinite(order) && order < currentOrder;
      })
      .map((s) => s.id as string),
  );
  if (previousStepIds.size === 0) return null;

  const decisive = actions
    .filter((a) => {
      const type = a.action_type || a.action || '';
      return !!a.step_id && previousStepIds.has(a.step_id) && STEP_ADVANCE_ACTIONS.has(type);
    })
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

  return decisive?.created_at || null;
}

export function resolveSlaInputFromInstance(
  wi: WorkflowInstanceRow,
  options: ResolveSlaOptions = {},
): UseWorkflowSLAInput {
  const step = getWorkflowSlaStepConfig(wi, options.currentStep);
  const isFirst = isFirstWorkflowStep(step);
  // Step 1 clocks from submission; every later step clocks from the instance's
  // last advance (`updated_at`) so its SLA is never measured from submission.
  const startedAt =
    options.currentStepStartedAt ||
    (isFirst
      ? options.firstStepStartedAt || wi.started_at || wi.created_at || null
      : wi.updated_at || wi.started_at || wi.created_at || null) ||
    null;
  const paused = wi.status === 'paused' || (!!wi.paused_at && !wi.resumed_at);

  return {
    startedAt,
    slaHours: step?.sla_hours ?? null,
    warningThresholdPercent: step?.sla_warning_threshold_percent ?? 80,
    escalationAfterHours: step?.escalation_after_hours ?? null,
    paused,
    pauseSeconds: wi.total_pause_seconds ?? 0,
    pausedSince: paused ? (wi.paused_at ?? null) : null,
  };
}
