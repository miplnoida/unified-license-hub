import { supabase } from '@/integrations/supabase/client';

/**
 * Governed Fit & Proper operations.
 *
 * Every regulatory decision and canonical F&P state change goes through a
 * database operation that checks the caller's permission, validates the
 * business state, and writes exactly ONE authoritative audit entry inside the
 * same transaction. Screens must never write to the F&P canonical stores
 * (fp_assessments, fp_findings, fp_determinations, fp_conditions,
 * fp_condition_evidence, fp_committees, fp_committee_members,
 * fp_committee_votes, fp_monitoring_events) directly — direct DML is revoked.
 *
 * Do NOT add client-side audit calls around these helpers: the operation
 * already logged the event, and a second client write would double-count the
 * regulatory record.
 */

async function call<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/* ---------------------------------------------------------------- assessments */

export interface FpAssessmentInitiateInput {
  individualId: string;
  assessmentType: string;
  declarationData?: Record<string, unknown> | null;
  roleId?: string | null;
  licenseeId?: string | null;
  regulatorId?: string | null;
}

export const fpAssessmentInitiate = (i: FpAssessmentInitiateInput) =>
  call<{ id: string }>('fp_assessment_initiate', {
    _individual_id: i.individualId,
    _assessment_type: i.assessmentType,
    _declaration_data: i.declarationData ?? {},
    _role_id: i.roleId ?? null,
    _licensee_id: i.licenseeId ?? null,
    _regulator_id: i.regulatorId ?? null,
  });

export const fpAssessmentSetStatus = (
  assessmentId: string,
  status: string,
  note?: string | null,
) =>
  call('fp_assessment_set_status', {
    _assessment_id: assessmentId,
    _status: status,
    _note: note ?? null,
  });

export const fpAssessmentAssignCommittee = (assessmentId: string, committeeId: string) =>
  call('fp_assessment_assign_committee', {
    _assessment_id: assessmentId,
    _committee_id: committeeId,
  });

export const fpAssessmentSavePq = (
  assessmentId: string,
  declarationData: Record<string, unknown>,
  submit: boolean,
  formResponseId?: string | null,
  amendmentReason?: string | null,
) =>
  call('fp_assessment_save_pq', {
    _assessment_id: assessmentId,
    _declaration_data: declarationData,
    _submit: submit,
    _form_response_id: formResponseId ?? null,
    _amendment_reason: amendmentReason ?? null,
  });

export const fpRequestPqAmendment = (assessmentId: string, reason: string) =>
  call('fp_request_pq_amendment', { _assessment_id: assessmentId, _reason: reason });

/* ------------------------------------------------------------------- findings */

export type FpFindingDisposition =
  | 'true_positive'
  | 'false_positive'
  | 'confirmed'
  | 'cleared'
  | 'dismissed'
  | 'needs_review';

/** Formal disposition of a screening finding. 'needs_review' sends it back without resolving it. */
export const fpFindingDisposition = (
  findingId: string,
  status: FpFindingDisposition,
  reason: string,
  rawPayload?: Record<string, unknown> | null,
) =>
  call('fp_finding_disposition', {
    _finding_id: findingId,
    _resolution_status: status,
    _reason: reason,
    _raw_payload: rawPayload ?? null,
  });

/** Override the screening engine's verdict on an open finding (or restore it). */
export const fpFindingSetFalsePositive = (
  findingId: string,
  isFalsePositive: boolean,
  justification?: string | null,
) =>
  call('fp_finding_set_false_positive', {
    _finding_id: findingId,
    _is_false_positive: isFalsePositive,
    _justification: justification ?? null,
  });

export const fpFindingEscalate = (findingId: string, note: string) =>
  call('fp_finding_escalate', { _finding_id: findingId, _note: note });

export const fpFindingAssign = (findingId: string, assignee: string | null) =>
  call('fp_finding_assign', { _finding_id: findingId, _assignee: assignee });

/** Draft analyst note — working paper, not supervisory state. */
export const fpFindingSaveNote = (findingId: string, note: string) =>
  call('fp_finding_save_note', { _finding_id: findingId, _note: note });

/** Replaces the finding's evidence array with `evidenceUrls` (read-modify-write in the caller). */
export const fpFindingSetEvidence = (
  findingId: string,
  evidenceUrls: unknown[],
  clearLegacy = false,
) =>
  call('fp_finding_set_evidence', {
    _finding_id: findingId,
    _evidence_urls: evidenceUrls,
    _clear_legacy: clearLegacy,
  });

/* ------------------------------------------------------------- determinations */

export interface FpDeterminationConditionInput {
  category?: string | null;
  description: string;
  due_date?: string | null;
  monitoring_owner?: string | null;
  evidence_type?: string | null;
}

export interface FpDeterminationInput {
  assessmentId: string;
  individualId: string;
  outcome: string;
  rationale: string;
  regulatorId?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isCommitteeOverride?: boolean;
  overrideReason?: string | null;
  conditions?: FpDeterminationConditionInput[];
}

export const fpDeterminationRecord = (i: FpDeterminationInput) =>
  call<{ id: string; conditions_created: number }>('fp_determination_record', {
    _assessment_id: i.assessmentId,
    _individual_id: i.individualId,
    _outcome: i.outcome,
    _rationale: i.rationale,
    _regulator_id: i.regulatorId ?? null,
    _effective_from: i.effectiveFrom ?? null,
    _effective_to: i.effectiveTo ?? null,
    _is_committee_override: i.isCommitteeOverride ?? false,
    _override_reason: i.overrideReason ?? null,
    _conditions: i.conditions ?? [],
  });

/* ------------------------------------------------------------------ committee */

export const fpCommitteeCreate = (i: {
  name: string;
  quorum: number;
  approvalThresholdPct: number;
  description?: string | null;
  regulatorId?: string | null;
}) =>
  call<{ id: string }>('fp_committee_create', {
    _name: i.name,
    _quorum: i.quorum,
    _approval_threshold_pct: i.approvalThresholdPct,
    _description: i.description ?? null,
    _regulator_id: i.regulatorId ?? null,
  });

export const fpCommitteeUpdate = (
  committeeId: string,
  patch: {
    name?: string | null;
    quorum?: number | null;
    approvalThresholdPct?: number | null;
    description?: string | null;
    isActive?: boolean | null;
    regulatorId?: string | null;
    clearRegulator?: boolean;
  },
) =>
  call('fp_committee_update', {
    _committee_id: committeeId,
    _name: patch.name ?? null,
    _quorum: patch.quorum ?? null,
    _approval_threshold_pct: patch.approvalThresholdPct ?? null,
    _description: patch.description ?? null,
    _is_active: patch.isActive ?? null,
    _regulator_id: patch.regulatorId ?? null,
    _clear_regulator: patch.clearRegulator ?? false,
  });

export const fpCommitteeMemberAdd = (i: {
  committeeId: string;
  userId: string;
  memberRole?: string | null;
  voteWeight?: number | null;
}) =>
  call<{ id: string }>('fp_committee_member_add', {
    _committee_id: i.committeeId,
    _user_id: i.userId,
    _member_role: i.memberRole ?? 'member',
    _vote_weight: i.voteWeight ?? 1,
  });

export const fpCommitteeMemberRemove = (memberId: string) =>
  call('fp_committee_member_remove', { _member_id: memberId });

export const fpCommitteeMemberSetActive = (memberId: string, isActive: boolean) =>
  call('fp_committee_member_set_active', { _member_id: memberId, _is_active: isActive });

export const fpCommitteeMemberSetWeight = (memberId: string, voteWeight: number) =>
  call('fp_committee_member_set_weight', { _member_id: memberId, _vote_weight: voteWeight });

export const fpCommitteeSetCastingVote = (committeeId: string, memberId: string | null) =>
  call('fp_committee_set_casting_vote', { _committee_id: committeeId, _member_id: memberId });

export const fpCommitteeCastVote = (
  assessmentId: string,
  vote: string,
  justification?: string | null,
) =>
  call('fp_committee_cast_vote', {
    _assessment_id: assessmentId,
    _vote: vote,
    _justification: justification ?? null,
  });

/* ----------------------------------------------------------------- conditions */

export const fpConditionCreate = (i: {
  determinationId: string;
  individualId: string;
  category?: string | null;
  description: string;
  dueDate?: string | null;
  monitoringOwner?: string | null;
  evidenceType?: string | null;
}) =>
  call<{ id: string }>('fp_condition_create', {
    _determination_id: i.determinationId,
    _individual_id: i.individualId,
    _category: i.category ?? 'other',
    _description: i.description,
    _due_date: i.dueDate ?? null,
    _monitoring_owner: i.monitoringOwner ?? null,
    _evidence_type: i.evidenceType ?? null,
  });

/** status: open | satisfied | waived | breached */
export const fpConditionSetStatus = (
  conditionId: string,
  status: string,
  note?: string | null,
) =>
  call('fp_condition_set_status', {
    _condition_id: conditionId,
    _status: status,
    _note: note ?? null,
  });

export const fpConditionRecordReminder = (conditionId: string) =>
  call('fp_condition_record_reminder', { _condition_id: conditionId });

export const fpConditionEvidenceSubmit = (i: {
  conditionId: string;
  filePath: string;
  fileName: string;
  fileSize?: number | null;
  description?: string | null;
}) =>
  call<{ id: string }>('fp_condition_evidence_submit', {
    _condition_id: i.conditionId,
    _file_path: i.filePath,
    _file_name: i.fileName,
    _file_size: i.fileSize ?? null,
    _description: i.description ?? null,
  });

/** reviewState: accepted | rejected */
export const fpConditionEvidenceReview = (
  evidenceId: string,
  reviewState: 'accepted' | 'rejected',
  reviewNote?: string | null,
) =>
  call('fp_condition_evidence_review', {
    _evidence_id: evidenceId,
    _review_state: reviewState,
    _review_note: reviewNote ?? null,
  });

/* ----------------------------------------------------------------- monitoring */

export const fpMonitoringEventRaise = (i: {
  individualId: string;
  eventType: string;
  summary: string;
  severity?: string | null;
  determinationId?: string | null;
  detail?: Record<string, unknown> | null;
}) =>
  call<{ id: string }>('fp_monitoring_event_raise', {
    _individual_id: i.individualId,
    _event_type: i.eventType,
    _summary: i.summary,
    _severity: i.severity ?? 'low',
    _determination_id: i.determinationId ?? null,
    _detail: i.detail ?? null,
  });

export const fpMonitoringEventAcknowledge = (eventId: string, note?: string | null) =>
  call('fp_monitoring_event_acknowledge', { _event_id: eventId, _note: note ?? null });

/* -------------------------------------------------------------------- appeals */

export const fpAppealFile = (i: {
  determinationId: string;
  individualId: string;
  grounds: string;
  licenseId?: string | null;
}) =>
  call<{ id: string }>('fp_appeal_file', {
    _individual_id: i.individualId,
    _determination_id: i.determinationId,
    _grounds: i.grounds,
    _license_id: i.licenseId ?? null,
  });

export const fpAppealAssignCommittee = (appealId: string, committeeId: string) =>
  call('fp_appeal_assign_committee', { _appeal_id: appealId, _committee_id: committeeId });

export const fpAppealStartReview = (appealId: string) =>
  call('fp_appeal_start_review', { _appeal_id: appealId });

export const fpAppealDecide = (appealId: string, decision: string, rationale: string) =>
  call('fp_appeal_decide', { _appeal_id: appealId, _decision: decision, _rationale: rationale });

export const fpAppealWithdraw = (appealId: string, reason: string) =>
  call('fp_appeal_withdraw', { _appeal_id: appealId, _reason: reason });
