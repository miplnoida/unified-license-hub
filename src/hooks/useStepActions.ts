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

export function useUpsertStepAction(stepId: string) {
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
      return data as unknown as StepAction;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval_step_actions', stepId] });
      qc.invalidateQueries({ queryKey: ['approval_steps'] });
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
 * Restricted to the three primary approval outcomes per product requirement.
 * Legacy rows in approval_step_actions with other action_type values continue
 * to load and execute at runtime — they only disappear from the picker.
 */
export const ALLOWED_UI_ACTION_TYPES: WorkflowActionType[] = [
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
