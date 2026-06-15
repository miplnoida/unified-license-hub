/**
 * Per-action configuration rows for an approval step.
 *
 * Each row in `approval_step_actions` defines ONE action on a step:
 * its display label, whether it requires comments, an optional status
 * override, what happens next (routing), and an end state when ending
 * the workflow. Backed by the same table backfilled in the workflow
 * builder migration.
 *
 * The runtime function `perform_workflow_transition` reads these rows
 * when present and falls back to the legacy hardcoded routing when no
 * config row exists for the executed action.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { WorkflowActionType } from '@/hooks/useWorkflowEngine';
import { getDefaultEventForAction, pickDefaultEmailTemplateId } from '@/hooks/useActionNotifications';

export type NextStepMode =
  | 'next'
  | 'specific_step'
  | 'previous'
  | 'return_to_applicant'
  | 'end_workflow'
  | 'keep';

export type EndState = 'approved' | 'rejected' | 'cancelled';

export interface StepAction {
  id: string;
  step_id: string;
  action_type: WorkflowActionType;
  label: string | null;
  require_comments: boolean;
  result_status_override: string | null;
  next_step_mode: NextStepMode;
  next_step_id: string | null;
  end_state: EndState | null;
  sort_order: number;
  is_enabled: boolean;
  require_digital_signature: boolean;
  signature_data_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface StepActionInput {
  id?: string;
  action_type: WorkflowActionType;
  label?: string | null;
  require_comments?: boolean;
  result_status_override?: string | null;
  next_step_mode?: NextStepMode;
  next_step_id?: string | null;
  end_state?: EndState | null;
  sort_order?: number;
  is_enabled?: boolean;
  require_digital_signature?: boolean;
  signature_data_url?: string | null;
}

const TABLE = 'approval_step_actions' as const;

/**
 * Re-sync approval_steps.allowed_actions to the union of currently enabled
 * action_types in approval_step_actions for this step. Keeps the legacy
 * runtime gate (`v_allowed_actions` in perform_workflow_transition) in lock-step
 * with per-action config so admins only have to manage one list.
 */
async function syncAllowedActions(stepId: string) {
  const { data, error } = await supabase
    .from(TABLE as any)
    .select('action_type, is_enabled')
    .eq('step_id', stepId);
  if (error) throw error;
  const allowed = Array.from(
    new Set(((data ?? []) as any[]).filter(r => r.is_enabled).map(r => r.action_type as string)),
  );
  const { error: upErr } = await supabase
    .from('approval_steps')
    .update({ allowed_actions: allowed as any })
    .eq('id', stepId);
  if (upErr) throw upErr;
}

async function ensureDefaultActionNotification(
  stepId: string,
  actionType: WorkflowActionType,
  entityType: string | null | undefined,
) {
  const eventKey = getDefaultEventForAction(actionType, entityType);
  const { data: existing, error: existingError } = await supabase
    .from('approval_action_notifications' as any)
    .select('id')
    .eq('step_id', stepId)
    .eq('action_type', actionType)
    .eq('event_key', eventKey)
    .limit(1);
  if (existingError) throw existingError;
  if ((existing ?? []).length > 0) return;

  const { data: templates, error: templateError } = await supabase
    .from('notification_templates')
    .select('id, event_type, channel, is_active')
    .eq('event_type', eventKey)
    .eq('channel', 'email')
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (templateError) throw templateError;
  const templateId = pickDefaultEmailTemplateId(eventKey, (templates ?? []) as any[]);
  if (!templateId) return;

  const { error: insertError } = await supabase
    .from('approval_action_notifications' as any)
    .insert({
      step_id: stepId,
      action_type: actionType,
      event_key: eventKey,
      recipient_type: 'applicant',
      recipient_config: {},
      template_id: templateId,
      is_enabled: true,
    } as any);
  if (insertError && (insertError as any).code !== '23505') throw insertError;
}

export function useStepActions(stepId: string | null | undefined) {
  return useQuery({
    enabled: !!stepId,
    queryKey: ['approval_step_actions', stepId],
    queryFn: async (): Promise<StepAction[]> => {
      const { data, error } = await supabase
        .from(TABLE as any)
        .select('*')
        .eq('step_id', stepId)
        .order('sort_order', { ascending: true })
        .order('action_type', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as StepAction[];
    },
  });
}

export function useUpsertStepAction(stepId: string, entityType?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: StepActionInput) => {
      const mode: NextStepMode = row.next_step_mode ?? 'next';
      if (mode === 'specific_step' && !row.next_step_id) {
        throw new Error('Choose the target step for "Move to Specific Step".');
      }
      if (mode === 'end_workflow' && !row.end_state) {
        throw new Error('Choose an end state (Approved / Rejected / Cancelled) for "End Workflow".');
      }

      const payload = {
        step_id: stepId,
        action_type: row.action_type,
        label: row.label ?? null,
        require_comments: row.require_comments ?? false,
        result_status_override: row.result_status_override?.trim() || null,
        next_step_mode: mode,
        next_step_id: mode === 'specific_step' ? row.next_step_id : null,
        end_state: mode === 'end_workflow' ? row.end_state ?? null : null,
        sort_order: row.sort_order ?? 0,
        is_enabled: row.is_enabled ?? true,
        require_digital_signature: row.require_digital_signature ?? false,
        signature_data_url: row.require_digital_signature ? (row.signature_data_url ?? null) : null,
      };

      const query = row.id
        ? supabase.from(TABLE as any).update(payload as any).eq('id', row.id)
        : supabase.from(TABLE as any).insert(payload as any);
      const { data, error } = await query.select().single();
      if (error) {
        if ((error as any).code === '23505') {
          throw new Error('This step already has a row for that action type. Edit the existing row.');
        }
        throw error;
      }
      await syncAllowedActions(stepId);
      if (payload.is_enabled) {
        await ensureDefaultActionNotification(stepId, payload.action_type as WorkflowActionType, entityType);
      }
      return data as unknown as StepAction;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval_step_actions', stepId] });
      qc.invalidateQueries({ queryKey: ['approval_steps'] });
      qc.invalidateQueries({ queryKey: ['action_notifications', stepId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save action'),
  });
}

export function useDeleteStepAction(stepId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE as any).delete().eq('id', id);
      if (error) throw error;
      await syncAllowedActions(stepId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval_step_actions', stepId] });
      qc.invalidateQueries({ queryKey: ['approval_steps'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete action'),
  });
}

/**
 * Action types that are supported end-to-end (UI + runtime).
 * Do NOT add `schedule_meeting`, `review`, etc. here unless the
 * `perform_workflow_transition` RPC actually handles them — the RPC
 * rejects unknown action types with BAD_ACTION.
 */
export const SUPPORTED_ACTION_TYPES: WorkflowActionType[] = [
  'approve',
  'reject',
  'send_back',
  'escalate',
  'request_resubmission',
  'return_for_correction',
  'request_more_info',
];

/**
 * Action types that admins can pick from the Workflow Builder UI.
 * Mirrors SUPPORTED_ACTION_TYPES — every runtime-supported action is
 * configurable. New steps default to approve / reject / send_back
 * (see DEFAULT_STEP_ACTION_TYPES), but admins can add any supported
 * action where not already configured.
 */
export const ALLOWED_UI_ACTION_TYPES: WorkflowActionType[] = [
  'approve',
  'reject',
  'send_back',
  'escalate',
  'request_resubmission',
  'return_for_correction',
  'request_more_info',
];

/** Default action types seeded for a brand-new step. */
export const DEFAULT_STEP_ACTION_TYPES: WorkflowActionType[] = [
  'approve',
  'reject',
  'send_back',
];

export const NEXT_STEP_MODE_LABELS: Record<NextStepMode, string> = {
  next: 'Move to Next Step',
  specific_step: 'Move to Specific Step',
  previous: 'Send Back to Previous Step',
  return_to_applicant: 'Return to Applicant',
  end_workflow: 'End Workflow',
  keep: 'Keep in Current Step',
};

export const END_STATE_LABELS: Record<EndState, string> = {
  approved: 'Mark as Approved',
  rejected: 'Mark as Rejected',
  cancelled: 'Mark as Cancelled',
};
