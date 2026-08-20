/**
 * Governed Market Conduct operations (A1 authority closure).
 *
 * Every material conduct mutation — alert acknowledgement/closure,
 * investigation opening/update, supervisory action issue/closure, evidence
 * upload and restriction, complaint investigation work items — must flow
 * through these SECURITY DEFINER RPCs. Direct browser DML on the canonical
 * conduct stores is revoked, so the RPCs are the only write path.
 *
 * The server derives the acting officer, verifies the Market Conduct /
 * Complaint Management permission, validates state transitions and rationale
 * length, and writes the compliance audit row. Callers must NOT pass user ids,
 * timestamps or audit payloads.
 */
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as any;

function unwrap<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data;
}

/** Acknowledge an open conduct alert. */
export async function conductAlertAcknowledge(alertId: string, note?: string) {
  const { data, error } = await sb.rpc('conduct_alert_acknowledge', {
    _alert_id: alertId,
    _note: note ?? null,
  });
  return unwrap(data, error);
}

/** Close a conduct alert. Reason is mandatory (min 5 characters). */
export async function conductAlertClose(
  alertId: string,
  reason: string,
  metadata: Record<string, unknown> = {},
) {
  const { data, error } = await sb.rpc('conduct_alert_close', {
    _alert_id: alertId,
    _reason: reason,
    _metadata: metadata,
  });
  return unwrap(data, error);
}

/** Open a conduct investigation. Allegation summary min 10 characters. */
export async function conductInvestigationOpen(payload: Record<string, unknown>) {
  const { data, error } = await sb.rpc('conduct_investigation_open', { _payload: payload });
  return unwrap(data, error);
}

/** Update an investigation. Closure requires a justification (min 10 chars). */
export async function conductInvestigationUpdate(
  investigationId: string,
  patch: Record<string, unknown>,
  justification?: string | null,
) {
  const { data, error } = await sb.rpc('conduct_investigation_update', {
    _investigation_id: investigationId,
    _patch: patch,
    _justification: justification ?? null,
  });
  return unwrap(data, error);
}

/** Issue a supervisory action. Rationale mandatory (min 10 characters). */
export async function conductActionIssue(payload: Record<string, unknown>) {
  const { data, error } = await sb.rpc('conduct_action_issue', { _payload: payload });
  return unwrap(data, error);
}

/**
 * Close a supervisory action.
 * - `completed` requires an outcome plus completion notes.
 * - `waived` / `cancelled` require a reason of at least 10 characters.
 */
export async function conductActionClose(
  actionId: string,
  disposition: 'completed' | 'waived' | 'cancelled',
  reason: string,
  outcome?: string | null,
) {
  const { data, error } = await sb.rpc('conduct_action_close', {
    _action_id: actionId,
    _disposition: disposition,
    _reason: reason,
    _outcome: outcome ?? null,
  });
  return unwrap(data, error);
}

/** Upload an evidence record into the conduct evidence repository. */
export async function conductEvidenceUpload(payload: Record<string, unknown>) {
  const { data, error } = await sb.rpc('conduct_evidence_upload', { _payload: payload });
  return unwrap(data, error);
}

/** Restrict / unrestrict evidence. Reason mandatory (min 10 characters). */
export async function conductEvidenceSetRestriction(
  evidenceId: string,
  restricted: boolean,
  reason: string,
) {
  const { data, error } = await sb.rpc('conduct_evidence_set_restriction', {
    _evidence_id: evidenceId,
    _restricted: restricted,
    _reason: reason,
  });
  return unwrap(data, error);
}

/** Create a complaint investigation work item. Never touches the complaint lifecycle. */
export async function complaintTaskCreate(args: {
  complaintId: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  ownerId?: string | null;
}) {
  const { data, error } = await sb.rpc('complaint_task_create', {
    _complaint_id: args.complaintId,
    _title: args.title,
    _description: args.description ?? null,
    _due_date: args.dueDate || null,
    _owner_id: args.ownerId ?? null,
  });
  return unwrap(data, error);
}

/** Set a complaint work-item status (pending / in_progress / completed / cancelled). */
export async function complaintTaskSetStatus(taskId: string, status: string) {
  const { data, error } = await sb.rpc('complaint_task_set_status', {
    _task_id: taskId,
    _status: status,
  });
  return unwrap(data, error);
}
