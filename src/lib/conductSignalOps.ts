/**
 * MC-05 — Governed conduct signal operations.
 *
 * A signal is a supervisory intelligence item. It is NOT an alert (an
 * attention/threshold mechanism) and NOT a complaint (a consumer case) — the
 * records may link but never merge.
 *
 * Every mutation below runs through a SECURITY DEFINER RPC that derives the
 * acting officer, enforces the Market Conduct permission and regulator scope,
 * validates the state transition and rationale length, and writes the audit
 * trail. Direct browser DML on the signal stores is revoked, so these are the
 * only write paths available to the UI.
 */
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function call<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Raise a new supervisory signal. Title min 5 chars, rationale min 10 chars. */
export const signalCreate = (payload: Record<string, unknown>) =>
  call('conduct_signal_create', { _payload: payload });

/** Assign an owner. Moves a new signal into review. */
export const signalAssign = (signalId: string, ownerId: string, note?: string | null) =>
  call('conduct_signal_assign', { _signal_id: signalId, _owner_id: ownerId, _note: note ?? null });

/** Validate the signal. Rationale min 20 chars; risk/systemic may be revised. */
export const signalValidate = (
  signalId: string,
  rationale: string,
  opts: { severity?: string | null; systemicPotential?: string | null; riskScore?: number | null } = {},
) =>
  call('conduct_signal_validate', {
    _signal_id: signalId,
    _rationale: rationale,
    _severity: opts.severity ?? null,
    _systemic_potential: opts.systemicPotential ?? null,
    _risk_score: opts.riskScore ?? null,
  });

/** Dismiss the signal. Reason min 10 chars. */
export const signalDismiss = (signalId: string, reason: string) =>
  call('conduct_signal_dismiss', { _signal_id: signalId, _reason: reason });

/** Reopen a dismissed/closed signal. Reason min 20 chars. */
export const signalReopen = (signalId: string, reason: string) =>
  call('conduct_signal_reopen', { _signal_id: signalId, _reason: reason });

/** Escalate a validated signal, raising a linked alert. Rationale min 20 chars. */
export const signalEscalateToAlert = (signalId: string, rationale: string, severity?: string | null) =>
  call('conduct_signal_escalate_to_alert', { _signal_id: signalId, _rationale: rationale, _severity: severity ?? null });

/** Link an existing alert to the signal without merging the records. */
export const signalLinkAlert = (
  signalId: string,
  alertId: string,
  rationale: string,
  linkType: 'related' | 'source' = 'related',
) =>
  call('conduct_signal_link_alert', {
    _signal_id: signalId, _alert_id: alertId, _rationale: rationale, _link_type: linkType,
  });

/** Record an originating source for the signal. */
export const signalLinkSource = (
  signalId: string,
  sourceType: string,
  sourceId: string,
  opts: { sourceTable?: string | null; note?: string | null; sourceReference?: string | null } = {},
) =>
  call('conduct_signal_link_source', {
    _signal_id: signalId,
    _source_type: sourceType,
    _source_id: sourceId,
    _source_table: opts.sourceTable ?? null,
    _note: opts.note ?? null,
    _source_reference: opts.sourceReference ?? null,
  });

/** Attach an existing conduct evidence item to the signal (no new store). */
export const signalLinkEvidence = (signalId: string, evidenceId: string, note?: string | null) =>
  call('conduct_signal_link_evidence', { _signal_id: signalId, _evidence_id: evidenceId, _note: note ?? null });
