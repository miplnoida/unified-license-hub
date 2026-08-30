/**
 * Workflow template snapshot (V2).
 *
 * V1 templates only carried `{ name, approver_role, sla_hours, allowed_actions }`
 * per step, which silently dropped the modern config (approver_type, approver_config,
 * auto_approve_on_timeout, per-action routing rows, step-entry / action notifications).
 *
 * V2 captures every field needed to recreate an identical workflow. Routing
 * references inside `actions` use a `next_step_local_id` that points at another
 * step's `local_id` inside the same snapshot — applying the snapshot remaps it
 * to the newly-created step id.
 */
import { supabase } from '@/integrations/supabase/client';
import type { WorkflowStep, WorkflowActionType } from '@/hooks/useWorkflowEngine';
import type { StepAction, NextStepMode, EndState } from '@/hooks/useStepActions';
import type { StepEntryNotification } from '@/hooks/useStepEntryNotifications';
import type { ActionNotification } from '@/hooks/useActionNotifications';
import { approvalStepConfigWrite } from '@/lib/applicationLifecycleGovernedOps';
import { uuidList } from '@/lib/idFilters';

export const TEMPLATE_SNAPSHOT_VERSION = 2 as const;

export interface TemplateActionV2 {
  action_type: WorkflowActionType;
  label: string | null;
  require_comments: boolean;
  result_status_override: string | null;
  next_step_mode: NextStepMode;
  /** Local id of the target step inside this snapshot (specific_step only). */
  next_step_local_id: string | null;
  end_state: EndState | null;
  sort_order: number;
  is_enabled: boolean;
  require_digital_signature?: boolean;
  signature_data_url?: string | null;
}

export interface TemplateNotificationV2 {
  event_key: string;
  recipient_type: string;
  recipient_config: Record<string, unknown>;
  template_id: string | null;
  is_enabled: boolean;
  /** Only set for action notifications. */
  action_type?: WorkflowActionType;
}

export interface TemplateStepV2 {
  local_id: string;
  step_order: number;
  name: string;
  description: string | null;
  approver_role: string;
  approver_role_id: string | null;
  approver_type: 'role_based_user' | 'specific_users';
  approver_config: Record<string, unknown>;
  sla_hours: number | null;
  auto_approve_on_timeout: boolean;
  require_digital_signature?: boolean;
  allowed_actions: WorkflowActionType[];
  actions: TemplateActionV2[];
  entry_notifications: TemplateNotificationV2[];
  action_notifications: TemplateNotificationV2[];
}

export interface TemplateSnapshotV2 {
  version: 2;
  steps: TemplateStepV2[];
}

export interface BuildSnapshotInput {
  steps: WorkflowStep[];
  actionsByStepId: Record<string, StepAction[]>;
  entryNotificationsByStepId: Record<string, StepEntryNotification[]>;
  actionNotificationsByStepId: Record<string, ActionNotification[]>;
}

/** Pure: turn live rows into a v2 snapshot. No DB calls. */
export function buildSnapshotFromRows(input: BuildSnapshotInput): TemplateSnapshotV2 {
  const sortedSteps = [...input.steps].sort((a, b) => a.step_order - b.step_order);
  const stepIdToLocal = new Map<string, string>();
  for (const s of sortedSteps) stepIdToLocal.set(s.id, s.id);

  const steps: TemplateStepV2[] = sortedSteps.map(s => {
    const actions = (input.actionsByStepId[s.id] ?? []).map<TemplateActionV2>(a => ({
      action_type: a.action_type,
      label: a.label,
      require_comments: a.require_comments,
      result_status_override: a.result_status_override,
      next_step_mode: a.next_step_mode,
      next_step_local_id:
        a.next_step_mode === 'specific_step' && a.next_step_id
          ? stepIdToLocal.get(a.next_step_id) ?? null
          : null,
      end_state: a.end_state,
      sort_order: a.sort_order,
      is_enabled: a.is_enabled,
      require_digital_signature: !!a.require_digital_signature,
      signature_data_url: a.signature_data_url ?? null,
    }));
    const entry = (input.entryNotificationsByStepId[s.id] ?? []).map<TemplateNotificationV2>(n => ({
      event_key: n.event_key,
      recipient_type: n.recipient_type,
      recipient_config: n.recipient_config ?? {},
      template_id: n.template_id,
      is_enabled: n.is_enabled,
    }));
    const actionNotifs = (input.actionNotificationsByStepId[s.id] ?? []).map<TemplateNotificationV2>(n => ({
      action_type: n.action_type,
      event_key: n.event_key,
      recipient_type: n.recipient_type,
      recipient_config: n.recipient_config ?? {},
      template_id: n.template_id,
      is_enabled: n.is_enabled,
    }));
    return {
      local_id: s.id,
      step_order: s.step_order,
      name: s.name,
      description: s.description,
      approver_role: s.approver_role,
      approver_role_id: s.approver_role_id,
      approver_type: s.approver_type,
      approver_config: (s.approver_config ?? {}) as Record<string, unknown>,
      sla_hours: s.sla_hours,
      auto_approve_on_timeout: !!s.auto_approve_on_timeout,
      require_digital_signature: !!(s as any).require_digital_signature,
      allowed_actions: Array.isArray(s.allowed_actions) ? s.allowed_actions : [],
      actions,
      entry_notifications: entry,
      action_notifications: actionNotifs,
    };
  });

  return { version: TEMPLATE_SNAPSHOT_VERSION, steps };
}

/** Pure: detect a v2 snapshot vs a legacy v1 step array. */
export function isV2Snapshot(steps: unknown): steps is TemplateStepV2[] {
  if (!Array.isArray(steps) || steps.length === 0) return false;
  const first = steps[0] as any;
  return !!first && typeof first === 'object' && 'local_id' in first && 'actions' in first;
}

/** Pure: build a local_id → real id map after inserting steps in snapshot order. */
export function buildLocalIdMap(snapshot: TemplateSnapshotV2, createdStepIds: string[]): Record<string, string> {
  if (createdStepIds.length !== snapshot.steps.length) {
    throw new Error(
      `buildLocalIdMap: createdStepIds (${createdStepIds.length}) length must match snapshot steps (${snapshot.steps.length})`,
    );
  }
  const map: Record<string, string> = {};
  snapshot.steps.forEach((s, i) => {
    map[s.local_id] = createdStepIds[i];
  });
  return map;
}

/** Fetch all the rows needed to build a v2 snapshot for an existing workflow. */
export async function fetchSnapshotForWorkflow(workflowId: string): Promise<TemplateSnapshotV2> {
  const { data: stepRows, error: stepErr } = await supabase
    .from('approval_steps')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('step_order', { ascending: true });
  if (stepErr) throw stepErr;
  const steps = (stepRows ?? []) as unknown as WorkflowStep[];
  const stepIds = steps.map(s => s.id);

  const [actionsRes, entryRes, actionNotifRes] = await Promise.all([
    supabase.from('approval_step_actions' as any).select('*').in('step_id', uuidList(stepIds)),
    supabase.from('approval_step_entry_notifications' as any).select('*').in('step_id', uuidList(stepIds)),
    supabase.from('approval_action_notifications' as any).select('*').in('step_id', uuidList(stepIds)),
  ]);
  if (actionsRes.error) throw actionsRes.error;
  if (entryRes.error) throw entryRes.error;
  if (actionNotifRes.error) throw actionNotifRes.error;

  const groupBy = <T extends { step_id: string }>(rows: T[]): Record<string, T[]> => {
    const out: Record<string, T[]> = {};
    for (const r of rows) (out[r.step_id] ||= []).push(r);
    return out;
  };

  return buildSnapshotFromRows({
    steps,
    actionsByStepId: groupBy((actionsRes.data ?? []) as any),
    entryNotificationsByStepId: groupBy((entryRes.data ?? []) as any),
    actionNotificationsByStepId: groupBy((actionNotifRes.data ?? []) as any),
  });
}

export interface ApplySnapshotParams {
  workflowId: string;
  snapshot: TemplateSnapshotV2;
  /** Used when a snapshot step references a role_id that no longer exists. */
  fallbackRoleId: string;
  fallbackSystemRole: string;
  /** Provide the list of currently valid role ids so we can sanity-check. */
  validRoleIds?: Set<string>;
  /** Optional system-role lookup so stale snapshots can resolve to the intended configured role. */
  roleIdBySystemRole?: Record<string, string>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
}

function roleConfigWithPrimary(config: Record<string, unknown> | null | undefined, roleId: string) {
  const base = config ?? {};
  const existing = stringArray((base as { role_ids?: unknown }).role_ids);
  return {
    ...base,
    role_ids: [roleId, ...existing.filter(id => id !== roleId)],
  };
}

/**
 * Apply a v2 snapshot onto a freshly-created (step-less) workflow.
 * Inserts approval_steps, approval_step_actions, approval_step_entry_notifications,
 * and approval_action_notifications, remapping local ids → real ids.
 */
export async function applyV2SnapshotToWorkflow(params: ApplySnapshotParams): Promise<void> {
  const { workflowId, snapshot, fallbackRoleId, fallbackSystemRole, validRoleIds, roleIdBySystemRole } = params;
  if (snapshot.steps.length === 0) return;

  const sorted = [...snapshot.steps].sort((a, b) => a.step_order - b.step_order);

  const stepPayload = sorted.map(s => {
    const isRoleBased = (s.approver_type ?? 'role_based_user') !== 'specific_users';
    const mappedRoleId = s.approver_role ? roleIdBySystemRole?.[s.approver_role] : undefined;
    const roleId = isRoleBased
      ? (s.approver_role_id && (!validRoleIds || validRoleIds.has(s.approver_role_id))
          ? s.approver_role_id
          : (mappedRoleId ?? fallbackRoleId))
      : null;
    const sysRole = s.approver_role || fallbackSystemRole;
    return {
      workflow_id: workflowId,
      step_order: s.step_order,
      name: s.name,
      description: s.description,
      approver_role: sysRole,
      approver_role_id: roleId,
      approver_type: s.approver_type ?? 'role_based_user',
      approver_config: isRoleBased && roleId
        ? roleConfigWithPrimary(s.approver_config, roleId)
        : (s.approver_config ?? {}),
      auto_approve_on_timeout: !!s.auto_approve_on_timeout,
      require_digital_signature: !!s.require_digital_signature,
      sla_hours: s.sla_hours ?? 48,
      // allowed_actions is intentionally omitted: it is derived server-side from
      // the approval_step_actions rows inserted below.
    };
  });

  // Direct DML on approval_steps is revoked; the governed RPC performs the insert.
  const { data: snapshotResult, error: stepErr } = await supabase.rpc(
    'approval_steps_snapshot_insert' as any,
    { _payload: { steps: stepPayload } as any },
  );
  if (stepErr) throw stepErr;
  const insertedSteps = (((snapshotResult as any)?.steps ?? []) as any[]);

  // Sort by step_order so we can pair to the (also sorted) snapshot steps.
  const insertedSorted = [...insertedSteps].sort((a, b) => a.step_order - b.step_order);

  const localIdMap = buildLocalIdMap({ version: 2, steps: sorted }, insertedSorted.map(r => r.id as string));

  // Build child-row payloads.
  const actionRows: any[] = [];
  const entryRows: any[] = [];
  const actionNotifRows: any[] = [];

  for (const s of sorted) {
    const realStepId = localIdMap[s.local_id];
    for (const a of s.actions ?? []) {
      const nextStepId =
        a.next_step_mode === 'specific_step' && a.next_step_local_id
          ? localIdMap[a.next_step_local_id] ?? null
          : null;
      actionRows.push({
        step_id: realStepId,
        action_type: a.action_type,
        label: a.label,
        require_comments: !!a.require_comments,
        result_status_override: a.result_status_override,
        next_step_mode: a.next_step_mode,
        next_step_id: nextStepId,
        end_state: a.next_step_mode === 'end_workflow' ? a.end_state : null,
        sort_order: a.sort_order ?? 0,
        is_enabled: a.is_enabled !== false,
        require_digital_signature: !!a.require_digital_signature,
        signature_data_url: a.require_digital_signature ? (a.signature_data_url ?? null) : null,
      });
    }
    for (const n of s.entry_notifications ?? []) {
      entryRows.push({
        step_id: realStepId,
        event_key: n.event_key,
        recipient_type: n.recipient_type,
        recipient_config: n.recipient_config ?? {},
        template_id: n.template_id,
        is_enabled: n.is_enabled !== false,
      });
    }
    for (const n of s.action_notifications ?? []) {
      if (!n.action_type) continue;
      actionNotifRows.push({
        step_id: realStepId,
        action_type: n.action_type,
        event_key: n.event_key,
        recipient_type: n.recipient_type,
        recipient_config: n.recipient_config ?? {},
        template_id: n.template_id,
        is_enabled: n.is_enabled !== false,
      });
    }
  }

  if (actionRows.length || entryRows.length || actionNotifRows.length) {
    // Governed: step configuration is written server-side under workflow
    // configuration permission, with an audit entry.
    await approvalStepConfigWrite({
      step_actions: actionRows as any,
      entry_notifications: entryRows as any,
      action_notifications: actionNotifRows as any,
    });
  }

}
