/**
 * Governed operations for the final A1 authority clusters:
 * legacy Returns (COMPATIBILITY_ONLY), Licence Appeals, Inspections,
 * Examinations and Thematic Review authority.
 *
 * The browser holds no direct DML on the underlying stores; each RPC derives
 * the acting officer server-side, enforces domain permission, validates the
 * state transition and writes the compliance audit trail.
 */
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as any;

async function call<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/* ── Legacy Returns (compatibility surface) ── */
export const legacyReturnCreate = (payload: Record<string, unknown>) =>
  call('legacy_return_create', { _payload: payload });
export const legacyReturnSaveDraft = (returnId: string, patch: Record<string, unknown> = {}) =>
  call('legacy_return_save_draft', { _return_id: returnId, _patch: patch });
export const legacyReturnSubmit = (returnId: string, ontime?: string | null) =>
  call('legacy_return_submit', { _return_id: returnId, _ontime: ontime ?? null });
export const legacyReturnDeleteDraft = (returnId: string, reason?: string | null) =>
  call('legacy_return_delete_draft', { _return_id: returnId, _reason: reason ?? null });
export const legacyReturnReviewDecision = (
  returnId: string,
  decision: 'approve' | 'request_edit' | 'reject',
  comments?: string | null,
) => call('legacy_return_review_decision', { _return_id: returnId, _decision: decision, _comments: comments ?? null });

/* ── Licence Appeals ── */
export const licenseAppealFile = (payload: Record<string, unknown>) =>
  call('license_appeal_file', { _payload: payload });
export const licenseAppealAcknowledge = (appealId: string) =>
  call('license_appeal_acknowledge', { _appeal_id: appealId });
export const licenseAppealWithdraw = (appealId: string, reason?: string | null) =>
  call('license_appeal_withdraw', { _appeal_id: appealId, _reason: reason ?? null });

/* ── Inspections ── */
export const inspectionCreate = (payload: Record<string, unknown>) =>
  call('inspection_create', { _payload: payload });
export const inspectionLifecycleSave = (
  inspectionId: string,
  patch: Record<string, unknown>,
  rationale?: string | null,
) => call('inspection_lifecycle_save', { _inspection_id: inspectionId, _patch: patch, _rationale: rationale ?? null });

/* ── Examinations ── */
export const examinationCreate = (payload: Record<string, unknown>) =>
  call('examination_create', { _payload: payload });
export const examinationUpdate = (
  examinationId: string,
  patch: Record<string, unknown>,
  rationale?: string | null,
) => call('examination_update', { _examination_id: examinationId, _patch: patch, _rationale: rationale ?? null });

/* ── Thematic Review authority ── */
export const thematicReviewCreate = (payload: Record<string, unknown>) =>
  call('thematic_review_create', { _payload: payload });
export const thematicReviewSetStatus = (
  reviewId: string,
  status: string,
  reason?: string | null,
  overrideId?: string | null,
) => call('thematic_review_set_status', {
  _review_id: reviewId, _status: status, _reason: reason ?? null, _override_id: overrideId ?? null,
});
export const thematicReviewFindingSave = (payload: Record<string, unknown>) =>
  call('thematic_review_finding_save', { _payload: payload });
export const thematicReviewFindingIssue = (findingId: string, rationale?: string | null) =>
  call('thematic_review_finding_issue', { _finding_id: findingId, _rationale: rationale ?? null });
export const thematicReviewActionSave = (payload: Record<string, unknown>) =>
  call('thematic_review_action_save', { _payload: payload });
export const thematicReviewActionComplete = (actionId: string, evidence?: string | null) =>
  call('thematic_review_action_complete', { _action_id: actionId, _evidence: evidence ?? null });
export const thematicReviewActionWaive = (actionId: string, overrideId: string, reason?: string | null) =>
  call('thematic_review_action_waive', { _action_id: actionId, _override_id: overrideId, _reason: reason ?? null });
export const thematicReviewLetterMarkDispatched = (letterId: string, recipientEmail?: string | null) =>
  call('thematic_review_letter_mark_dispatched', { _letter_id: letterId, _recipient_email: recipientEmail ?? null });
