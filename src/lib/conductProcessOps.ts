/**
 * Phase B / P08 — governed Market Conduct process operations.
 *
 * `conduct_investigation_step` is the ONLY lifecycle mutation path for a
 * conduct investigation. The server re-derives availability from
 * `conduct_investigation_available_actions`, re-validates every payload field,
 * enforces the blockers and writes the compliance audit row. Closure and
 * discontinuation remain with the existing closure approval gate.
 */
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type ConductStepAction =
  | 'ASSIGN_OWNER'
  | 'RECORD_PLAN'
  | 'BEGIN_EVIDENCE'
  | 'BEGIN_ANALYSIS'
  | 'PROPOSE_OUTCOME'
  | 'RETURN_TO_ANALYSIS';

export async function conductInvestigationStep(
  investigationId: string,
  actionCode: ConductStepAction | string,
  payload: Record<string, unknown> = {},
) {
  const { data, error } = await sb.rpc('conduct_investigation_step', {
    _investigation_id: investigationId,
    _action_code: actionCode,
    _payload: payload,
  });
  if (error) throw new Error(error.message);
  return data;
}
