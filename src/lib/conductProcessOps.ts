/**
 * Phase B / P08 — governed Market Conduct process operations.
 *
 * These RPCs are the ONLY lifecycle mutation paths for conduct work:
 *  - `conduct_investigation_step` for investigations
 *  - `conduct_action_step` for remediation requirements
 *  - `conduct_finding_step` / `conduct_finding_raise` for findings
 *  - `conduct_alert_dispose` / `conduct_alert_promote_to_investigation` for alerts
 *
 * In every case the server re-derives availability from its own
 * `*_available_actions` authority, re-validates each payload field, enforces the
 * blockers and writes the compliance audit row. Closure and discontinuation of
 * an investigation remain with the existing closure approval gate.
 */
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

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
  return call('conduct_investigation_step', {
    _investigation_id: investigationId,
    _action_code: actionCode,
    _payload: payload,
  });
}

/** Remediation requirement lifecycle: assign, start, evidence, review, close. */
export async function conductActionStep(
  actionId: string,
  actionCode: string,
  payload: Record<string, unknown> = {},
) {
  return call('conduct_action_step', {
    _action_id: actionId,
    _action_code: actionCode,
    _payload: payload,
  });
}

/** Finding lifecycle (analysis, confirmation, dismissal, remediation, referral). */
export async function conductFindingStep(
  findingId: string,
  actionCode: string,
  payload: Record<string, unknown> = {},
) {
  return call('conduct_finding_step', {
    _finding_id: findingId,
    _action_code: actionCode,
    _payload: payload,
  });
}

/** Raise a new conduct finding against a genuine source record. */
export async function conductFindingRaise(payload: Record<string, unknown>) {
  return call('conduct_finding_raise', { _payload: payload });
}

/** Alert disposition: dismissal or linkage to an existing complaint/investigation. */
export async function conductAlertDispose(
  alertId: string,
  disposition: 'DISMISS' | 'LINK_TO_EXISTING_COMPLAINT' | 'LINK_TO_EXISTING_INVESTIGATION',
  reason: string,
  targetId?: string | null,
) {
  return call('conduct_alert_dispose', {
    _alert_id: alertId,
    _disposition: disposition,
    _reason: reason,
    _target_id: targetId ?? null,
  });
}

/** Promote an alert to an investigation, carrying the full signal lineage. */
export async function conductAlertPromoteToInvestigation(args: {
  alertId: string;
  rationale: string;
  allegation?: string | null;
  dueDate?: string | null;
}) {
  return call('conduct_alert_promote_to_investigation', {
    _alert_id: args.alertId,
    _rationale: args.rationale,
    _allegation: args.allegation ?? null,
    _due_date: args.dueDate || null,
  });
}
