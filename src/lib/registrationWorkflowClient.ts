import { supabase } from '@/integrations/supabase/client';

export type RegistrationWorkflowAction =
  | 'approve'
  | 'reject'
  | 'send_back'
  | 'escalate'
  | 'request_resubmission'
  | 'return_for_correction'
  | 'request_more_info';

export interface PerformRegistrationWorkflowActionInput {
  registration_id: string;
  action_type: RegistrationWorkflowAction;
  comments?: string;
  instance_id?: string | null;
  step_id?: string | null;
}

export interface PerformRegistrationWorkflowActionResult {
  ok: boolean;
  code?: string;
  error?: string;
  data?: unknown;
}

/**
 * Thin client helper that invokes the shared registration workflow
 * edge function (`perform-registration-workflow-action`). Centralised so the
 * frontend always uses the same approval engine entry point and never
 * builds a bespoke approval bypass for registrations.
 */
export async function invokePerformRegistrationWorkflowAction(
  input: PerformRegistrationWorkflowActionInput,
): Promise<PerformRegistrationWorkflowActionResult> {
  const { data, error } = await supabase.functions.invoke(
    'perform-registration-workflow-action',
    {
      body: {
        registration_id: input.registration_id,
        action_type: input.action_type,
        comments: input.comments ?? '',
        instance_id: input.instance_id ?? null,
        step_id: input.step_id ?? null,
      },
    },
  );

  if (error) {
    return { ok: false, error: error.message, data };
  }
  const payload = (data || {}) as Record<string, unknown>;
  if (payload.error) {
    return {
      ok: false,
      error: String(payload.error),
      code: typeof payload.code === 'string' ? payload.code : undefined,
      data,
    };
  }
  return { ok: true, data };
}
