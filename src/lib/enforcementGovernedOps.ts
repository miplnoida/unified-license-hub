/**
 * Governed Enforcement operations (A1 authority closure).
 *
 * Enforcement cases and their obligations are regulatory decisions. The
 * browser has no direct DML on `enforcement_actions` / `enforcement_obligations`;
 * these RPCs verify Enforcement Management permission, derive the acting
 * officer server-side, require rationale on closure/deletion, and write the
 * compliance audit trail.
 *
 * Case lifecycle transitions (propose → review → approve → monitor → close)
 * remain the responsibility of the existing `enforcement_lifecycle_action` RPC.
 */
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as any;

function unwrap<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data;
}

/** Create an enforcement case. Case number is mandatory. */
export async function enforcementActionCreate(payload: Record<string, unknown>) {
  const { data, error } = await sb.rpc('enforcement_action_create', { _payload: payload });
  return unwrap(data, error);
}

/** Update an enforcement case. Closing requires a rationale (min 10 chars). */
export async function enforcementActionUpdate(
  actionId: string,
  patch: Record<string, unknown>,
  rationale?: string | null,
) {
  const { data, error } = await sb.rpc('enforcement_action_update', {
    _action_id: actionId,
    _patch: patch,
    _rationale: rationale ?? null,
  });
  return unwrap(data, error);
}

/** Delete an enforcement case. Reason mandatory (min 10 characters). */
export async function enforcementActionDelete(actionId: string, reason: string) {
  const { data, error } = await sb.rpc('enforcement_action_delete', {
    _action_id: actionId,
    _reason: reason,
  });
  return unwrap(data, error);
}

/** Add a compliance obligation to an enforcement case. */
export async function enforcementObligationAdd(args: {
  caseId: string;
  obligation: string;
  detail?: string | null;
  deadline?: string | null;
}) {
  const { data, error } = await sb.rpc('enforcement_obligation_add', {
    _case_id: args.caseId,
    _obligation: args.obligation,
    _detail: args.detail ?? null,
    _deadline: args.deadline || null,
  });
  return unwrap(data, error);
}

/** Record obligation compliance monitoring outcome. */
export async function enforcementObligationSetStatus(args: {
  obligationId: string;
  status: string;
  breachNote?: string | null;
}) {
  const { data, error } = await sb.rpc('enforcement_obligation_set_status', {
    _obligation_id: args.obligationId,
    _status: args.status,
    _breach_note: args.breachNote ?? null,
  });
  return unwrap(data, error);
}
