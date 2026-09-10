/**
 * AML-11 — governed evaluation of supervisory action outcomes and effectiveness.
 *
 * The browser is a reader. The server decides:
 *   • whether a linked supervisory action may be evaluated at all,
 *   • whether the action is complete, cancelled, legacy or missing an objective,
 *   • whether the cited evidence belongs to the same supervisory context,
 *   • whether the viewer may prepare and whether they may review,
 *   • whether an approved evaluation supports a follow-up, and which,
 *   • and every outcome total published to the portfolio report.
 *
 * There is deliberately NO eligibility rule, effectiveness rule, evidence
 * sufficiency rule, maker-checker rule, follow-up rule or aggregate arithmetic
 * in TypeScript. The only local vocabulary is display labelling of canonical
 * codes the server returns.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const OUTCOME_KEY = ['aml-supervisory-outcome'] as const;

/* ------------------------------------------------------------------ labels -- */

export const OUTCOME_CONCLUSION_LABEL: Record<string, string> = {
  NOT_ASSESSED: 'Not assessed',
  EFFECTIVE: 'Effective',
  PARTIALLY_EFFECTIVE: 'Partially effective',
  INEFFECTIVE: 'Ineffective',
  INCONCLUSIVE: 'Inconclusive',
};

export const OUTCOME_REASON_LABEL: Record<string, string> = {
  OK: 'Available for evaluation',
  NO_TARGET_ACTION: 'Supervisory judgment recorded only — no action to evaluate',
  TARGET_NOT_FOUND: 'The linked supervisory action is not available to you',
  ACTION_CANCELLED: 'The action was cancelled or withdrawn',
  ACTION_NOT_COMPLETE: 'The action is still open',
  OBJECTIVE_MISSING: 'The action records no supervisory objective',
  CONSEQUENCE_WITHDRAWN: 'The consequence linkage was withdrawn',
  CONSEQUENCE_SUPERSEDED: 'The consequence linkage was superseded',
};

export const OUTCOME_REVIEW_LABEL: Record<string, string> = {
  SUBMITTED: 'Awaiting review',
  APPROVED: 'Approved',
  RETURNED: 'Returned for revision',
};

export function outcomeErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? 'The server refused the request.');
  if (/not_evaluable/.test(raw)) return `The server refused this evaluation: ${raw}`;
  if (/self_review_refused/.test(raw))
    return 'The supervisor who prepared an evaluation cannot review it.';
  if (/rationale_required/.test(raw))
    return 'A written supervisory judgment of at least 20 characters is required.';
  if (/evidence_required/.test(raw))
    return 'An effectiveness conclusion must cite governed evidence.';
  if (/evidence_not_in_context/.test(raw))
    return 'Cited evidence must belong to this entity and assessment context.';
  if (/evidence_restricted/.test(raw))
    return 'You are not authorised to cite restricted supervisory evidence.';
  if (/not_authorized/.test(raw)) return `You are not authorised for this action: ${raw}`;
  if (/not_found/.test(raw)) return 'The server found no such record within your supervisory scope.';
  if (/immutable/.test(raw)) return `The server refused the change: ${raw}`;
  return raw;
}

/* ------------------------------------------------------------------- types -- */

export interface OutcomeEvidenceRef {
  evidence_id: string;
  assessment_id: string | null;
  entity_id: string | null;
  evidence_type: string | null;
  restricted: boolean;
  title: string | null;
  source_reference: string | null;
  as_of_date: string | null;
  recorded_by: string | null;
  origin: string | null;
}

export interface OutcomeAction {
  decision_id: string;
  entity_id: string;
  domain_code: string;
  action_type: string;
  linkage_mode: string;
  consequence_status: string;
  target_kind: string | null;
  target_id: string | null;
  target_reference: string | null;
  target: Record<string, unknown> | null;
  action_status: string | null;
  action_completed: boolean;
  action_cancelled: boolean;
  action_completed_at: string | null;
  action_objective: string | null;
  source_kind: string;
  publication_id: string | null;
  risk_state_id: string | null;
  assessment_id: string | null;
  source_rating: string | null;
  rating_provenance: string;
  legacy_lineage: boolean;
  evaluable: boolean;
  reason_code: string;
  reason: string;
  active_evaluation: Record<string, unknown> | null;
  lineage: Record<string, unknown>;
}

export interface OutcomeEvaluation {
  id: string;
  consequence_decision_id: string;
  action_type: string;
  target_kind: string;
  target_id: string;
  target_reference: string | null;
  action_objective: string;
  action_status: string | null;
  action_completed_at: string | null;
  conclusion: string;
  rationale: string;
  limitations: string | null;
  recommended_next_step: string | null;
  review_status: string;
  review_note: string | null;
  version: number;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  legacy_lineage: boolean;
  source_kind: string;
  publication_id: string | null;
  assessment_id: string | null;
  source_rating: string | null;
  rating_provenance: string;
  prepared_by: string | null;
  prepared_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  followups: Array<Record<string, unknown>>;
  lineage: Record<string, unknown>;
  evidence: OutcomeEvidenceRef[];
  evidence_snapshot_present: boolean;
  may_review: boolean;
  self_review_blocked: boolean;
  follow_up_available: boolean;
}

export interface OutcomeView {
  entity_id: string;
  domain_code: string;
  conclusions: string[];
  actions: OutcomeAction[];
  evaluations: OutcomeEvaluation[];
  follow_up_actions: Array<Record<string, unknown>>;
  viewer: { user_id: string; may_prepare: boolean; may_review: boolean };
  notes: string[];
}

export interface OutcomeSummary {
  source: string;
  linked_actions_total: number;
  completed_actions_total: number;
  open_actions_total: number;
  cancelled_actions_total: number;
  evaluations_pending_total: number;
  evaluations_awaiting_review_total: number;
  effective_total: number;
  partially_effective_total: number;
  ineffective_total: number;
  inconclusive_total: number;
  not_assessed_total: number;
  unevaluated_actions_total: number;
  legacy_lineage_actions_total: number;
  evaluated_total: number;
  note: string;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

/* -------------------------------------------------------------- read model -- */

export function useSupervisoryOutcomeView(entityId: string | undefined, domainCode = 'AML_CFT') {
  return useQuery({
    queryKey: [...OUTCOME_KEY, entityId, domainCode],
    enabled: !!entityId,
    queryFn: () =>
      rpc<OutcomeView>('supervisory_outcome_view', {
        _entity_id: entityId,
        _domain_code: domainCode,
      }),
  });
}

/* -------------------------------------------------------------- operations -- */

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: OUTCOME_KEY });
    void qc.invalidateQueries({ queryKey: ['aml-supervisory-consequence'] });
    void qc.invalidateQueries({ queryKey: ['aml-portfolio'] });
    void qc.invalidateQueries({ queryKey: ['aml-entity-panel'] });
  };
}

export interface EvaluateOutcomeInput {
  consequenceDecisionId: string;
  conclusion: string;
  rationale: string;
  limitations?: string | null;
  recommendedNextStep?: string | null;
  evidence?: Array<{ evidence_id: string; note?: string | null }>;
  amendsId?: string | null;
}

export function useEvaluateSupervisoryOutcome() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: EvaluateOutcomeInput) =>
      rpc<Record<string, unknown>>('supervisory_outcome_evaluate', {
        _payload: {
          consequence_decision_id: input.consequenceDecisionId,
          conclusion: input.conclusion,
          rationale: input.rationale,
          limitations: input.limitations ?? null,
          recommended_next_step: input.recommendedNextStep ?? null,
          evidence: input.evidence ?? [],
          amends_id: input.amendsId ?? null,
        },
      }),
    onSuccess: invalidate,
  });
}

export function useReviewSupervisoryOutcome() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (a: { evaluationId: string; decision: 'APPROVE' | 'RETURN'; note: string }) =>
      rpc<Record<string, unknown>>('supervisory_outcome_review', {
        _payload: { evaluation_id: a.evaluationId, decision: a.decision, note: a.note },
      }),
    onSuccess: invalidate,
  });
}

export function useSupervisoryOutcomeFollowup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (a: {
      evaluationId: string;
      actionType: string;
      linkageMode: 'CREATE' | 'LINK' | 'RECORD_ONLY';
      rationale: string;
      targetId?: string | null;
      supervisoryObjective?: string | null;
    }) =>
      rpc<Record<string, unknown>>('supervisory_outcome_followup', {
        _payload: {
          evaluation_id: a.evaluationId,
          action_type: a.actionType,
          linkage_mode: a.linkageMode,
          rationale: a.rationale,
          target_id: a.targetId ?? null,
          supervisory_objective: a.supervisoryObjective ?? null,
        },
      }),
    onSuccess: invalidate,
  });
}

/** Convenience reader: the server's own verdict for one linked action, or null. */
export function outcomeActionOf(view: OutcomeView | undefined, decisionId: string): OutcomeAction | null {
  return view?.actions?.find((a) => a.decision_id === decisionId) ?? null;
}
