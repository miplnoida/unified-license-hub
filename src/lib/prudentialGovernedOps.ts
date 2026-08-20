import { supabase } from '@/integrations/supabase/client';

/**
 * Governed Prudential / Supervisory operations.
 *
 * Every REGULATORY_DECISION and canonical prudential state change goes through
 * a database operation that derives the caller's authority server-side, checks
 * `prudential_supervision` module permission plus sector/entity scope,
 * validates lifecycle state, enforces rationale on material decisions, and
 * writes exactly ONE authoritative audit entry inside the same transaction.
 *
 * Screens and hooks must never write to the prudential canonical stores
 * (prudential_assessments, prudential_assessment_component_ratings,
 * prudential_actions, prudential_escalations, prudential_risk_taxonomy,
 * prudential_thresholds, prudential_ratios, prudential_stress_indicators,
 * prudential_stress_events, prudential_data_feed_logs,
 * return_threshold_breaches, supervisory_plans, supervisory_plan_actions)
 * directly — direct DML is revoked.
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

/* --------------------------------------------------------------- assessments */

export interface PrudentialAssessmentCreateInput {
  entityId: string;
  periodStart: string;
  periodEnd: string;
  returnFilingId?: string | null;
  returnFilingVersionId?: string | null;
  ratings?: Record<string, unknown> | null;
  rationale?: string | null;
  signalSnapshot?: Record<string, unknown> | null;
  autoSuggestedRating?: string | null;
}

export const prudentialAssessmentCreate = (i: PrudentialAssessmentCreateInput) =>
  call<any>('prudential_assessment_create', {
    _entity_id: i.entityId,
    _period_start: i.periodStart,
    _period_end: i.periodEnd,
    _return_filing_id: i.returnFilingId ?? null,
    _return_filing_version_id: i.returnFilingVersionId ?? null,
    _ratings: i.ratings ?? {},
    _rationale: i.rationale ?? null,
    _signal_snapshot: i.signalSnapshot ?? {},
    _auto_suggested_rating: i.autoSuggestedRating ?? null,
  });

export const prudentialAssessmentSaveDraft = (
  assessmentId: string,
  patch: Record<string, unknown>,
) => call<any>('prudential_assessment_save_draft', { _assessment_id: assessmentId, _patch: patch });

export type PrudentialAssessmentStatus =
  | 'submitted'
  | 'reviewed'
  | 'returned_for_revision'
  | 'approved'
  | 'closed';

export const prudentialAssessmentTransition = (
  assessmentId: string,
  toStatus: PrudentialAssessmentStatus,
  reason?: string | null,
) =>
  call('prudential_assessment_transition', {
    _assessment_id: assessmentId,
    _to_status: toStatus,
    _reason: reason ?? null,
  });

export interface PrudentialComponentRatingInput {
  assessmentId: string;
  componentCode: string;
  rating: string;
  narrative?: string | null;
  componentId?: string | null;
  evidence?: unknown[] | null;
  autoSuggestedRating?: string | null;
  suggestionSource?: Record<string, unknown> | null;
  overrideJustification?: string | null;
}

export const prudentialComponentRatingSave = (i: PrudentialComponentRatingInput) =>
  call<any>('prudential_component_rating_save', {
    _assessment_id: i.assessmentId,
    _component_code: i.componentCode,
    _rating: i.rating,
    _narrative: i.narrative ?? null,
    _component_id: i.componentId ?? null,
    _evidence: i.evidence ?? [],
    _auto_suggested_rating: i.autoSuggestedRating ?? null,
    _suggestion_source: i.suggestionSource ?? null,
    _override_justification: i.overrideJustification ?? null,
  });

/* ------------------------------------------------------------------- actions */

export interface PrudentialActionIssueInput {
  entityId: string;
  actionType: string;
  title: string;
  description?: string | null;
  severity?: string | null;
  dueDate?: string | null;
  assignedTo?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  evidenceRequired?: boolean | null;
  entityContact?: string | null;
  responseDueAt?: string | null;
  breachAfterDays?: number | null;
  entityOwnerUserId?: string | null;
}

export const prudentialActionIssue = (i: PrudentialActionIssueInput) =>
  call<any>('prudential_action_issue', {
    _entity_id: i.entityId,
    _action_type: i.actionType,
    _title: i.title,
    _description: i.description ?? null,
    _severity: i.severity ?? 'medium',
    _due_date: i.dueDate ?? null,
    _assigned_to: i.assignedTo ?? null,
    _source_type: i.sourceType ?? 'manual',
    _source_id: i.sourceId ?? null,
    _evidence_required: i.evidenceRequired ?? false,
    _entity_contact: i.entityContact ?? null,
    _response_due_at: i.responseDueAt ?? null,
    _breach_after_days: i.breachAfterDays ?? null,
    _entity_owner_user_id: i.entityOwnerUserId ?? null,
  });

export const prudentialActionUpdate = (
  actionId: string,
  patch: Record<string, unknown>,
  reason?: string | null,
) =>
  call<any>('prudential_action_update', {
    _action_id: actionId,
    _patch: patch,
    _reason: reason ?? null,
  });

/* -------------------------------------------------------------- escalations */

export interface PrudentialEscalationRaiseInput {
  entityId: string;
  escalationType: string;
  reason: string;
  relatedType?: string | null;
  relatedId?: string | null;
  priority?: string | null;
  evidence?: Record<string, unknown> | null;
}

export const prudentialEscalationRaise = (i: PrudentialEscalationRaiseInput) =>
  call<any>('prudential_escalation_raise', {
    _entity_id: i.entityId,
    _escalation_type: i.escalationType,
    _reason: i.reason,
    _related_type: i.relatedType ?? 'entity',
    _related_id: i.relatedId ?? null,
    _priority: i.priority ?? 'medium',
    _evidence: i.evidence ?? {},
  });

export const prudentialEscalationDecide = (
  escalationId: string,
  status: string,
  decision?: string | null,
  outcome?: string | null,
  priority?: string | null,
) =>
  call('prudential_escalation_decide', {
    _escalation_id: escalationId,
    _status: status,
    _decision: decision ?? null,
    _outcome: outcome ?? null,
    _priority: priority ?? null,
  });

/* --------------------------------------------------------- supervisory plans */

export const supervisoryPlanCreate = (i: {
  entityId: string;
  licenseId?: string | null;
  riskRatingId?: string | null;
  createdFrom?: string | null;
  notes?: string | null;
}) =>
  call<any>('supervisory_plan_create', {
    _entity_id: i.entityId,
    _license_id: i.licenseId ?? null,
    _risk_rating_id: i.riskRatingId ?? null,
    _created_from: i.createdFrom ?? 'manual',
    _notes: i.notes ?? null,
  });

export const supervisoryPlanDecision = (
  planId: string,
  decision: string,
  reason?: string | null,
) =>
  call('supervisory_plan_decision', {
    _plan_id: planId,
    _decision: decision,
    _reason: reason ?? null,
  });

export const supervisoryPlanActionCreate = (i: {
  planId: string;
  title: string;
  description?: string | null;
  ownerRole?: string | null;
  dueDate?: string | null;
  source?: string | null;
}) =>
  call<any>('supervisory_plan_action_create', {
    _plan_id: i.planId,
    _title: i.title,
    _description: i.description ?? null,
    _owner_role: i.ownerRole ?? null,
    _due_date: i.dueDate ?? null,
    _source: i.source ?? 'manual',
  });

export const supervisoryPlanActionTransition = (i: {
  actionId: string;
  toStatus: string;
  reason?: string | null;
  ownerRole?: string | null;
  dueDate?: string | null;
}) =>
  call('supervisory_plan_action_transition', {
    _action_id: i.actionId,
    _to_status: i.toStatus,
    _reason: i.reason ?? null,
    _owner_role: i.ownerRole ?? null,
    _due_date: i.dueDate ?? null,
  });

/* ------------------------------------------------------ configuration stores */

export const prudentialThresholdSave = (
  payload: Record<string, unknown>,
  thresholdId?: string | null,
  reason?: string | null,
) =>
  call<any>('prudential_threshold_save', {
    _payload: payload,
    _threshold_id: thresholdId ?? null,
    _reason: reason ?? null,
  });

export const prudentialThresholdDelete = (thresholdId: string, reason: string) =>
  call('prudential_threshold_delete', { _threshold_id: thresholdId, _reason: reason });

export const prudentialRatioSave = (
  payload: Record<string, unknown>,
  ratioId?: string | null,
  reason?: string | null,
) =>
  call<any>('prudential_ratio_save', {
    _payload: payload,
    _ratio_id: ratioId ?? null,
    _reason: reason ?? null,
  });

export const prudentialRatioDelete = (ratioId: string, reason: string) =>
  call('prudential_ratio_delete', { _ratio_id: ratioId, _reason: reason });

export const prudentialTaxonomySave = (
  payload: Record<string, unknown>,
  taxonomyId?: string | null,
  reason?: string | null,
) =>
  call<any>('prudential_taxonomy_save', {
    _payload: payload,
    _taxonomy_id: taxonomyId ?? null,
    _reason: reason ?? null,
  });

export const prudentialStressIndicatorSave = (
  payload: Record<string, unknown>,
  indicatorId?: string | null,
  reason?: string | null,
) =>
  call<any>('prudential_stress_indicator_save', {
    _payload: payload,
    _indicator_id: indicatorId ?? null,
    _reason: reason ?? null,
  });

export const prudentialStressIndicatorDelete = (indicatorId: string, reason: string) =>
  call('prudential_stress_indicator_delete', { _indicator_id: indicatorId, _reason: reason });

/* ----------------------------------------------------- events, feeds, breach */

export const prudentialStressEventAcknowledge = (eventId: string) =>
  call('prudential_stress_event_acknowledge', { _event_id: eventId });

export const prudentialFeedLogRecord = (i: {
  source: string;
  feedType: string;
  status: string;
  rowCount?: number | null;
  error?: string | null;
  relatedFilingId?: string | null;
  completedAt?: string | null;
  metadata?: Record<string, unknown> | null;
}) =>
  call<any>('prudential_feed_log_record', {
    _source: i.source,
    _feed_type: i.feedType,
    _status: i.status,
    _row_count: i.rowCount ?? null,
    _error: i.error ?? null,
    _related_filing_id: i.relatedFilingId ?? null,
    _completed_at: i.completedAt ?? null,
    _metadata: i.metadata ?? {},
  });

export const prudentialBreachAcknowledge = (breachId: string, note: string) =>
  call('prudential_breach_acknowledge', { _breach_id: breachId, _note: note });

export const prudentialBreachLinkEnforcement = (
  breachId: string,
  enforcementId: string,
  reason?: string | null,
) =>
  call('prudential_breach_link_enforcement', {
    _breach_id: breachId,
    _enforcement_id: enforcementId,
    _reason: reason ?? null,
  });

export const supervisoryBreachIssueEnforcement = (i: {
  entityId: string;
  breachIds: string[];
  enforcementType: string;
  rationale: string;
}) =>
  call<any>('supervisory_breach_issue_enforcement', {
    _entity_id: i.entityId,
    _breach_ids: i.breachIds,
    _enforcement_type: i.enforcementType,
    _rationale: i.rationale,
  });
