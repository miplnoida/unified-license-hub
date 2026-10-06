/**
 * AML-07 — assessment review, approval and risk-of-record publication.
 *
 * Every lifecycle decision in this file belongs to the server. The browser only
 * reads the governed contracts (`supervisory_assessment_lifecycle_state`,
 * `supervisory_assessment_review_register`, `supervisory_entity_risk_history`,
 * `supervisory_assessment_risk_lineage`) and invokes the governed operations.
 *
 * There is deliberately NO transition table, readiness rule, maker/checker rule,
 * override-precedence rule, publication-eligibility rule or supersession rule in
 * TypeScript: the only local vocabulary is display labelling for canonical states
 * and reason codes the server itself returns.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const REVIEW_KEY = ['aml-assessment-review'] as const;
const RISK_KEY = ['aml-entity-risk-history'] as const;

/* ------------------------------------------------------------------ labels --
 * Display text for canonical states and reason codes the SERVER returns. No
 * entry here decides anything; an unknown code is shown verbatim.
 */
export const LIFECYCLE_STATE_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED_FOR_REVIEW: 'Submitted for review',
  RESUBMITTED: 'Resubmitted for review',
  UNDER_REVIEW: 'Under review',
  RETURNED_FOR_CHANGES: 'Returned for changes',
  APPROVED_NOT_PUBLISHED: 'Approved — not yet official risk-of-record',
  APPROVED: 'Approved and published',
  CLOSED_WITHOUT_APPROVAL: 'Closed without approval',
  CLOSED: 'Closed',
  SUPERSEDED: 'Superseded',
};

export const BLOCKER_LABEL: Record<string, string> = {
  READINESS_INCOMPLETE: 'Assessment work is not complete',
  CALCULATION_RUN_MISSING: 'No successful calculation run',
  CALCULATION_RUN_STALE: 'The calculation run no longer matches the assessment',
  OVERRIDE_UNRESOLVED: 'A rating override is still undecided',
  CHALLENGE_OPEN: 'Reviewer challenges are unresolved',
};

export const ACTION_REASON_LABEL: Record<string, string> = {
  OK: 'Available',
  STATE_NOT_ELIGIBLE: 'Not available in the current lifecycle state',
  PERMISSION_MISSING: 'You do not hold the required permission',
  MAKER_CHECKER: 'Independence rule: the preparer or submitter cannot decide',
  BLOCKED: 'Blocked by an outstanding condition',
  ALREADY_PUBLISHED: 'Already published',
  NO_APPROVAL_DECISION: 'No governed approval decision exists',
  NOT_CASE_OWNER: 'Only the assigned case owner may do this',
  STALE_PUBLICATION: 'A later approved assessment is already the official risk-of-record',
  EFFECTIVE_DATE_REFUSED: 'The approval is not yet effective',
  NO_FINAL_RATING: 'The approval has no valid final rating',
};

export const CHALLENGE_CATEGORIES = [
  'SCOPE', 'RESPONSE', 'EVIDENCE', 'FACT', 'CALCULATION', 'RATING', 'PROCEDURE',
] as const;

export const FINAL_RATING_SOURCE_LABEL: Record<string, string> = {
  COMPUTED: 'Calculated result',
  APPROVED_OVERRIDE: 'Approved supervisory override',
  LEGACY_OFFICER_RATING: 'Legacy officer rating (no calculation run)',
  NOT_APPLICABLE: 'Not applicable',
};

/** Server refusals shown verbatim, with a plain reading where the code is known. */
export function reviewErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? 'The server refused the request.');
  if (/not_ready/.test(raw)) return `The server refused: the assessment is not ready. ${raw}`;
  if (/stale_readiness/.test(raw)) return 'This screen is showing an obsolete result. Reload the assessment and try again.';
  if (/stale_calculation/.test(raw)) return 'A newer calculation run exists. Review the current run before submitting.';
  if (/cannot approve it/.test(raw)) return 'Independence rule: the officer who prepared or submitted this assessment cannot approve it.';
  if (/stale_publication/.test(raw)) return 'A later approved assessment is already the official risk-of-record. This older approval can no longer be published.';
  if (/effective_date_refused/.test(raw)) return 'Future-dated or backdated risk-of-record is not supported. The official risk takes effect when it is published.';
  if (/cannot publish it/.test(raw)) return 'Independence rule: the officer who prepared, owns or submitted this assessment cannot publish it.';
  if (/only an approved assessment can publish/.test(raw)) return 'Only an approved assessment can publish the entity risk-of-record.';
  if (/transition_not_permitted/.test(raw)) return `The server owns this transition and refused it: ${raw}`;
  if (/not_case_owner/.test(raw)) return 'Only the assigned case owner may work this assessment. Ask a supervisor to reassign it.';
  if (/stale_assignment/.test(raw)) return 'The assignment changed since this screen was loaded. Reload and try again.';
  if (/assignee_ineligible/.test(raw)) return `The selected person is not eligible for this assignment: ${raw}`;
  if (/not_authorized/.test(raw)) return `You are not authorised for this action: ${raw}`;
  return raw;
}

/* ------------------------------------------------------------------- types -- */

export interface LifecycleAction {
  action: string;
  label: string;
  required_permission: string;
  permitted: boolean;
  reason_code: string;
  maker_checker_required: boolean;
}

export interface LifecycleBlocker {
  code: string;
  label: string;
  detail: string;
  blocking: boolean;
  stage: string;
}

export interface LifecycleState {
  assessment_id: string;
  reference: string | null;
  raw_status: string;
  canonical_state: string;
  editing_allowed: boolean;
  calculation_allowed: boolean;
  publication_allowed: boolean;
  maker_checker_required: boolean;
  viewer_is_preparer: boolean;
  assigned_owner_id: string | null;
  assigned_team_id: string | null;
  assigned_reviewer_id: string | null;
  current_round_seq: number;
  current_round_id: string | null;
  submitted_run_id: string | null;
  approval_decision_id: string | null;
  approved_rating: string | null;
  approved_rating_source: string | null;
  risk_publication_id: string | null;
  risk_published_at: string | null;
  /** Server: viewer is the current case owner (or super administrator). */
  case_actor?: boolean;
  /** Server: OWNER_* / REVIEWER_* ineligibility codes; empty when the case is properly staffed. */
  assignment_flags?: string[];
  blockers: LifecycleBlocker[];
  actions: LifecycleAction[];
}

export const ASSIGNMENT_FLAG_LABEL: Record<string, string> = {
  OWNER_MISSING: 'No case owner',
  OWNER_INACTIVE: 'Case owner account is inactive',
  OWNER_NOT_INTERNAL_STAFF: 'Case owner is no longer internal staff',
  OWNER_LACKS_EDIT_AUTHORITY: 'Case owner no longer holds AML edit authority',
  OWNER_OUT_OF_SCOPE: 'Case owner is outside this entity’s supervisory scope',
  REVIEWER_MISSING: 'Submitted without an assigned reviewer',
  REVIEWER_INACTIVE: 'Assigned reviewer account is inactive',
  REVIEWER_NOT_INTERNAL_STAFF: 'Assigned reviewer is no longer internal staff',
  REVIEWER_LACKS_REVIEW_AUTHORITY: 'Assigned reviewer no longer holds review authority',
  REVIEWER_OUT_OF_SCOPE: 'Assigned reviewer is outside this entity’s supervisory scope',
};

export interface AssignmentCandidate { user_id: string; full_name: string | null; email: string | null }
export interface OrphanCase {
  assessment_id: string; reference: string; entity_id: string; status: string;
  owner_id: string | null; reviewer_id: string | null; flags: string[];
}

export function useAssignmentCandidates(assessmentId: string | undefined, role: 'OWNER' | 'REVIEWER', enabled: boolean) {
  return useQuery({
    queryKey: [...REVIEW_KEY, 'candidates', assessmentId, role],
    enabled: !!assessmentId && enabled,
    queryFn: () => rpc<AssignmentCandidate[]>('supervisory_assessment_assignment_candidates',
      { _assessment_id: assessmentId, _role: role }),
  });
}

export function useOrphanCases(enabled = true) {
  return useQuery({
    queryKey: [...REVIEW_KEY, 'orphans'],
    enabled,
    retry: false,
    queryFn: () => rpc<OrphanCase[]>('supervisory_assessment_orphan_cases', { _domain_code: 'AML_CFT' }),
  });
}

export interface ReviewChallenge {
  id: string;
  challenge_code: string;
  category: string;
  narrative: string;
  question_code: string | null;
  dimension_code: string | null;
  fact_code: string | null;
  calculation_run_id: string | null;
  status: string;
  raised_by: string | null;
  raised_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
}

export interface ReviewRound {
  id: string;
  round_seq: number;
  submitted_by: string | null;
  submitted_at: string;
  submission_rationale: string | null;
  change_summary: string | null;
  calculation_basis: string;
  calculation_run_id: string | null;
  calculation_run_seq: number | null;
  calculation_result_hash: string | null;
  computed_rating: string | null;
  reviewer_id: string | null;
  outcome: string;
  outcome_by: string | null;
  outcome_at: string | null;
  outcome_reason: string | null;
  readiness_snapshot: Record<string, unknown>;
  submission_snapshot: Record<string, unknown>;
  challenges: ReviewChallenge[];
}

export interface ApprovalDecision {
  id: string;
  decision: string;
  round_seq: number | null;
  computed_rating: string | null;
  override_rating: string | null;
  final_rating: string | null;
  final_rating_source: string;
  calculation_basis: string;
  calculation_run_id: string | null;
  calculation_run_seq: number | null;
  calculation_result_hash: string | null;
  methodology_id: string | null;
  methodology_version: string | null;
  programme_id: string | null;
  programme_version: string | null;
  rationale: string;
  effective_date: string;
  decided_by: string | null;
  decided_at: string;
  review_history: Array<Record<string, unknown>>;
}

export interface RiskPublication {
  id: string;
  approval_decision_id: string;
  previous_rating: string | null;
  published_rating: string | null;
  effective_from: string;
  movement_id: string | null;
  reason: string;
  published_by: string | null;
  published_at: string;
}

export interface RiskLineage {
  complete: boolean;
  legacy_state: string | null;
  risk_of_record: Record<string, unknown> | null;
  approval_decision: Record<string, unknown> | null;
  review_round: Record<string, unknown> | null;
  calculation_run: Record<string, unknown> | null;
  calculation_policy: Record<string, unknown> | null;
  methodology: Record<string, unknown>;
  programme: Record<string, unknown>;
  question_plan: { rows: number };
  responses: { count: number };
  facts: { count: number };
  evidence: { accessible_count: number; items: Array<Record<string, unknown>> };
}

export interface EntityRiskHistory {
  current: Record<string, any> | null;
  movements: Array<Record<string, any>>;
}

export interface ReviewRegister {
  lifecycle: LifecycleState;
  rounds: ReviewRound[];
  decisions: ApprovalDecision[];
  publications: RiskPublication[];
  risk_history: EntityRiskHistory;
  lineage: RiskLineage;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

/* -------------------------------------------------------------- read models -- */

export function useAssessmentLifecycle(assessmentId: string | undefined) {
  return useQuery({
    queryKey: [...REVIEW_KEY, 'lifecycle', assessmentId],
    enabled: !!assessmentId,
    queryFn: () => rpc<LifecycleState>('supervisory_assessment_lifecycle_state', { _assessment_id: assessmentId }),
  });
}

export function useAssessmentReviewRegister(assessmentId: string | undefined) {
  return useQuery({
    queryKey: [...REVIEW_KEY, 'register', assessmentId],
    enabled: !!assessmentId,
    queryFn: () => rpc<ReviewRegister>('supervisory_assessment_review_register', { _assessment_id: assessmentId }),
  });
}

export function useAssessmentRiskLineage(assessmentId: string | undefined) {
  return useQuery({
    queryKey: [...REVIEW_KEY, 'lineage', assessmentId],
    enabled: !!assessmentId,
    queryFn: () => rpc<RiskLineage>('supervisory_assessment_risk_lineage', { _assessment_id: assessmentId }),
  });
}

export function useEntityRiskHistory(entityId: string | undefined, domainCode = 'AML_CFT') {
  return useQuery({
    queryKey: [...RISK_KEY, entityId, domainCode],
    enabled: !!entityId,
    queryFn: () => rpc<EntityRiskHistory>('supervisory_entity_risk_history', {
      _entity_id: entityId, _domain_code: domainCode,
    }),
  });
}

/* ------------------------------------------------------------- operations -- */

function useGovernedAction<TArgs>(fn: string, build: (a: TArgs) => Record<string, unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: TArgs) => rpc<Record<string, unknown>>(fn, build(args)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: REVIEW_KEY });
      void qc.invalidateQueries({ queryKey: RISK_KEY });
      void qc.invalidateQueries({ queryKey: ['aml-assessment'] });
      void qc.invalidateQueries({ queryKey: ['aml-entity-panel'] });
      void qc.invalidateQueries({ queryKey: ['aml-calculation-run'] });
    },
  });
}

export const useSubmitAssessmentForReview = () =>
  useGovernedAction<{ assessmentId: string; rationale: string; runId?: string | null;
    expectedResultHash?: string | null; changeSummary?: string | null }>(
    'supervisory_assessment_submit_for_review',
    (a) => ({
      _assessment_id: a.assessmentId, _rationale: a.rationale,
      _run_id: a.runId ?? null, _expected_result_hash: a.expectedResultHash ?? null,
      _change_summary: a.changeSummary ?? null,
    }));

export const useAssignAssessmentReviewer = () =>
  useGovernedAction<{ assessmentId: string; reviewerId: string; rationale: string }>(
    'supervisory_assessment_review_assign',
    (a) => ({ _assessment_id: a.assessmentId, _reviewer_id: a.reviewerId, _rationale: a.rationale }));

export const useRaiseReviewChallenge = () =>
  useGovernedAction<{ assessmentId: string; challengeCode: string; category: string; narrative: string;
    refs?: Record<string, unknown> }>(
    'supervisory_assessment_challenge_raise',
    (a) => ({
      _assessment_id: a.assessmentId, _challenge_code: a.challengeCode,
      _category: a.category, _narrative: a.narrative, _refs: a.refs ?? {},
    }));

export const useResolveReviewChallenge = () =>
  useGovernedAction<{ challengeId: string; resolutionNote: string; outcome?: 'RESOLVED' | 'WITHDRAWN' }>(
    'supervisory_assessment_challenge_resolve',
    (a) => ({ _challenge_id: a.challengeId, _resolution_note: a.resolutionNote, _outcome: a.outcome ?? 'RESOLVED' }));

export const useReturnAssessmentForChanges = () =>
  useGovernedAction<{ assessmentId: string; reason: string }>(
    'supervisory_assessment_review_return',
    (a) => ({ _assessment_id: a.assessmentId, _reason: a.reason }));

export const useRejectAssessment = () =>
  useGovernedAction<{ assessmentId: string; reason: string }>(
    'supervisory_assessment_review_reject',
    (a) => ({ _assessment_id: a.assessmentId, _reason: a.reason }));

export const useApproveAssessment = () =>
  useGovernedAction<{ assessmentId: string; rationale: string; effectiveDate?: string | null;
    nextReviewDate?: string | null; publish?: boolean }>(
    'supervisory_assessment_approve',
    (a) => ({
      _assessment_id: a.assessmentId, _rationale: a.rationale,
      _effective_date: a.effectiveDate ?? null, _next_review_date: a.nextReviewDate ?? null,
      _publish: a.publish ?? true,
    }));

export const usePublishRiskOfRecord = () =>
  useGovernedAction<{ assessmentId: string; reason: string }>(
    'supervisory_assessment_publish_risk_of_record',
    (a) => ({ _assessment_id: a.assessmentId, _reason: a.reason }));

/** Convenience reader: the server's own decision for one action, or null. */
export function actionOf(state: LifecycleState | undefined, action: string): LifecycleAction | null {
  return state?.actions?.find((a) => a.action === action) ?? null;
}

export const useReassignAssessment = () =>
  useGovernedAction<{ assessmentId: string; role: 'OWNER' | 'REVIEWER'; toUserId: string;
    expectedCurrentId: string | null; reason: string }>(
    'supervisory_assessment_reassign',
    (a) => ({
      _assessment_id: a.assessmentId, _role: a.role, _to_user_id: a.toUserId,
      _expected_current_id: a.expectedCurrentId, _reason: a.reason,
    }));
