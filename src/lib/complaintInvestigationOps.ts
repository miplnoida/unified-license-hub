/**
 * MC-03 — Governed complaint investigation operations.
 *
 * Direct browser DML on `complaint_investigation_plans`, `complaint_allegations`,
 * `complaint_evidence`, `complaint_evidence_allegations`,
 * `complaint_representations`, `complaint_investigation_tasks` and
 * `complaint_correspondence` is revoked. Every write below goes through a
 * SECURITY DEFINER RPC that derives the acting officer, enforces the MC-02
 * gates, validates state transitions and writes the audit row.
 *
 * Callers must never pass user ids, timestamps or audit payloads.
 */
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as any;

function unwrap<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data;
}

/* ------------------------------------------------------------ investigation */

/** Open the investigation. Blocked by `complaint_investigation_gate`. */
export async function investigationOpen(complaintId: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await sb.rpc('complaint_investigation_open', {
    _complaint_id: complaintId,
    _payload: payload,
  });
  return unwrap(data, error);
}

/* -------------------------------------------------------------------- plan */

export async function planSave(
  complaintId: string,
  payload: Record<string, unknown>,
  expectedRowVersion?: number | null,
) {
  const { data, error } = await sb.rpc('complaint_investigation_plan_save', {
    _complaint_id: complaintId,
    _payload: payload,
    _expected_row_version: expectedRowVersion ?? null,
  });
  return unwrap(data, error);
}

export async function planSubmit(planId: string, expectedRowVersion?: number | null) {
  const { data, error } = await sb.rpc('complaint_investigation_plan_submit', {
    _plan_id: planId,
    _expected_row_version: expectedRowVersion ?? null,
  });
  return unwrap(data, error);
}

export async function planApprove(planId: string, note: string | null, expectedRowVersion?: number | null) {
  const { data, error } = await sb.rpc('complaint_investigation_plan_approve', {
    _plan_id: planId,
    _note: note,
    _expected_row_version: expectedRowVersion ?? null,
  });
  return unwrap(data, error);
}

/** Supersede the approved plan and open a new draft version. */
export async function planRevise(complaintId: string, reason: string) {
  const { data, error } = await sb.rpc('complaint_investigation_plan_revise', {
    _complaint_id: complaintId,
    _reason: reason,
  });
  return unwrap(data, error);
}

/* -------------------------------------------------------------- allegations */

export async function allegationCreate(complaintId: string, payload: Record<string, unknown>) {
  const { data, error } = await sb.rpc('complaint_allegation_create', {
    _complaint_id: complaintId,
    _payload: payload,
  });
  return unwrap(data, error);
}

export async function allegationUpdate(
  allegationId: string,
  payload: Record<string, unknown>,
  expectedRowVersion?: number | null,
) {
  const { data, error } = await sb.rpc('complaint_allegation_update', {
    _allegation_id: allegationId,
    _payload: payload,
    _expected_row_version: expectedRowVersion ?? null,
  });
  return unwrap(data, error);
}

export async function allegationSetStatus(
  allegationId: string,
  status: string,
  note: string | null,
  expectedRowVersion?: number | null,
) {
  const { data, error } = await sb.rpc('complaint_allegation_set_status', {
    _allegation_id: allegationId,
    _status: status,
    _note: note,
    _expected_row_version: expectedRowVersion ?? null,
  });
  return unwrap(data, error);
}

export async function allegationRecordOutcome(
  allegationId: string,
  outcome: string,
  rationale: string,
  analysis: string | null,
  expectedRowVersion?: number | null,
) {
  const { data, error } = await sb.rpc('complaint_allegation_record_outcome', {
    _allegation_id: allegationId,
    _outcome: outcome,
    _rationale: rationale,
    _analysis: analysis,
    _expected_row_version: expectedRowVersion ?? null,
  });
  return unwrap(data, error);
}

export async function allegationReopen(
  allegationId: string,
  reason: string,
  expectedRowVersion?: number | null,
) {
  const { data, error } = await sb.rpc('complaint_allegation_reopen', {
    _allegation_id: allegationId,
    _reason: reason,
    _expected_row_version: expectedRowVersion ?? null,
  });
  return unwrap(data, error);
}

/* ----------------------------------------------------------------- evidence */

export async function evidenceRegister(complaintId: string, payload: Record<string, unknown>) {
  const { data, error } = await sb.rpc('complaint_evidence_register', {
    _complaint_id: complaintId,
    _payload: payload,
  });
  return unwrap(data, error);
}

export async function evidenceAssess(
  evidenceId: string,
  reliability: string,
  relevance: string,
  rationale: string | null,
  expectedRowVersion?: number | null,
) {
  const { data, error } = await sb.rpc('complaint_evidence_assess', {
    _evidence_id: evidenceId,
    _reliability: reliability,
    _relevance: relevance,
    _rationale: rationale,
    _expected_row_version: expectedRowVersion ?? null,
  });
  return unwrap(data, error);
}

export async function evidenceLinkAllegation(
  evidenceId: string,
  allegationId: string,
  relationshipType: string,
  note: string | null,
) {
  const { data, error } = await sb.rpc('complaint_evidence_link_allegation', {
    _evidence_id: evidenceId,
    _allegation_id: allegationId,
    _relationship_type: relationshipType,
    _note: note,
  });
  return unwrap(data, error);
}

export async function evidenceUnlinkAllegation(evidenceId: string, allegationId: string, reason: string) {
  const { data, error } = await sb.rpc('complaint_evidence_unlink_allegation', {
    _evidence_id: evidenceId,
    _allegation_id: allegationId,
    _reason: reason,
  });
  return unwrap(data, error);
}

export async function evidenceWithdraw(evidenceId: string, reason: string) {
  const { data, error } = await sb.rpc('complaint_evidence_withdraw', {
    _evidence_id: evidenceId,
    _reason: reason,
  });
  return unwrap(data, error);
}

export async function evidenceSupersede(
  evidenceId: string,
  payload: Record<string, unknown>,
  reason: string,
) {
  const { data, error } = await sb.rpc('complaint_evidence_supersede', {
    _evidence_id: evidenceId,
    _payload: payload,
    _reason: reason,
  });
  return unwrap(data, error);
}

/* ---------------------------------------------------------- representations */

export async function representationOpen(complaintId: string, payload: Record<string, unknown>) {
  const { data, error } = await sb.rpc('complaint_representation_open', {
    _complaint_id: complaintId,
    _payload: payload,
  });
  return unwrap(data, error);
}

export async function representationReview(
  representationId: string,
  decision: 'UNDER_REVIEW' | 'ACCEPT_FOR_CONSIDERATION',
  note: string | null,
  expectedRowVersion?: number | null,
) {
  const { data, error } = await sb.rpc('complaint_representation_review', {
    _representation_id: representationId,
    _decision: decision,
    _note: note,
    _expected_row_version: expectedRowVersion ?? null,
  });
  return unwrap(data, error);
}

export async function representationExtend(
  representationId: string,
  newDueAt: string,
  reason: string,
  expectedRowVersion?: number | null,
) {
  const { data, error } = await sb.rpc('complaint_representation_extend', {
    _representation_id: representationId,
    _new_due_at: newDueAt,
    _reason: reason,
    _expected_row_version: expectedRowVersion ?? null,
  });
  return unwrap(data, error);
}

export async function representationLateDecision(
  representationId: string,
  decision: 'ACCEPTED' | 'REJECTED',
  reason: string,
) {
  const { data, error } = await sb.rpc('complaint_representation_late_decision', {
    _representation_id: representationId,
    _decision: decision,
    _reason: reason,
  });
  return unwrap(data, error);
}

export async function representationClose(representationId: string, note: string | null) {
  const { data, error } = await sb.rpc('complaint_representation_close', {
    _representation_id: representationId,
    _note: note,
  });
  return unwrap(data, error);
}

export async function representationWithdraw(representationId: string, reason: string) {
  const { data, error } = await sb.rpc('complaint_representation_withdraw', {
    _representation_id: representationId,
    _reason: reason,
  });
  return unwrap(data, error);
}

/* -------------------------------------------------------------------- tasks */

export async function investigationTaskSave(payload: Record<string, unknown>) {
  const { data, error } = await sb.rpc('complaint_investigation_task_save', { _payload: payload });
  return unwrap(data, error);
}

/* -------------------------------------------------------------------- notes */

/** Internal case note. Replaces the retired direct insert into complaint_correspondence. */
export async function complaintNoteAdd(complaintId: string, body: string, subject?: string | null) {
  const { data, error } = await sb.rpc('complaint_note_add', {
    _complaint_id: complaintId,
    _body: body,
    _subject: subject ?? null,
  });
  return unwrap(data, error);
}
