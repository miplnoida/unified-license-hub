/**
 * PCOMP-R2A — evidence policy of the governing policy profile (read + govern).
 *
 * Nothing in this module evaluates evidence. Sufficiency, the applicable rules,
 * the reasons a requirement is outstanding, whether an exception is available
 * and who may decide one are all decided by the platform from the exact evidence
 * policy version pinned in the assessment's immutable policy basis. This module
 * only reads that contract and calls the governed exception operations.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type EvidencePolicyDecisionState =
  | 'SATISFIED'
  | 'UNSATISFIED'
  | 'NOT_REQUIRED'
  | 'EXCEPTION_REQUIRED'
  | 'EXCEPTION_APPROVED';

export interface EvidencePolicyReason {
  code: string;
  message: string;
}

export interface EvidencePolicyDecision {
  rule_code: string;
  rule_label: string | null;
  scope_type: 'ASSESSMENT' | 'DIMENSION' | 'QUESTION' | string;
  scope_reference: string | null;
  target_code: string | null;
  question_id: string | null;
  question_code: string | null;
  dimension_id: string | null;
  dimension_code: string | null;
  decision: EvidencePolicyDecisionState;
  blocking: boolean;
  required_items: number;
  qualifying_items: number;
  stale_items: number;
  distinct_sources: number;
  permitted_source_kinds: string[] | null;
  required_source_kinds: string[] | null;
  maximum_age_days: number | null;
  independent_sources_required?: number | null;
  rationale_required?: boolean | null;
  exception_allowed: boolean;
  exception_id: string | null;
  exception_status: string | null;
  reasons: EvidencePolicyReason[];
}

export interface EvidencePolicyEvaluation {
  assessment_id: string;
  status: 'EVALUATED' | 'NOT_GOVERNED' | 'UNAVAILABLE' | string;
  reason_code: string;
  reason: string;
  policy_profile_code?: string | null;
  policy_profile_version?: string | null;
  policy_component_id?: string | null;
  policy_component_code?: string | null;
  policy_component_version?: string | null;
  policy_content_hash?: string | null;
  reference_date?: string | null;
  rule_count?: number;
  decision_count?: number;
  satisfied_count?: number;
  exception_approved_count?: number;
  blocking_count: number;
  decisions: EvidencePolicyDecision[];
  evaluated_at: string;
}

export interface EvidencePolicyException {
  id: string;
  rule_code: string;
  scope_type: string;
  scope_reference: string | null;
  question_id: string | null;
  question_code: string | null;
  dimension_id: string | null;
  dimension_code: string | null;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | string;
  rationale: string;
  deficiency: Record<string, unknown> | null;
  policy_component_version: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_rationale: string | null;
  is_own_request: boolean;
}

export interface EvidencePolicyView {
  assessment_id: string;
  evaluation: EvidencePolicyEvaluation;
  exceptions: EvidencePolicyException[];
  capabilities: {
    can_request_exception: boolean;
    can_decide_exception: boolean;
  };
  viewer_id: string | null;
}

export function useAssessmentEvidencePolicy(assessmentId?: string) {
  return useQuery({
    queryKey: ['assessment-evidence-policy', assessmentId],
    enabled: !!assessmentId,
    queryFn: () =>
      call<EvidencePolicyView>('supervisory_assessment_evidence_policy_view', {
        _assessment_id: assessmentId,
      }),
  });
}

function useEvidencePolicyInvalidation(assessmentId?: string) {
  const qc = useQueryClient();
  return () => {
    ['assessment-evidence-policy', 'assessment-readiness', 'assessment-evidence-register'].forEach((key) =>
      qc.invalidateQueries({ queryKey: [key, assessmentId] }),
    );
    qc.invalidateQueries({ queryKey: ['aml', 'assessment-events', assessmentId ?? null] });
    qc.invalidateQueries({ queryKey: ['aml'] });
  };
}

export interface EvidenceExceptionRequestInput {
  assessmentId: string;
  ruleCode: string;
  scopeType: string;
  questionId?: string | null;
  dimensionId?: string | null;
  rationale: string;
}

export function useRequestEvidenceException(assessmentId?: string) {
  const invalidate = useEvidencePolicyInvalidation(assessmentId);
  return useMutation({
    mutationFn: (input: EvidenceExceptionRequestInput) =>
      call<{ exception_id: string; status: string }>('supervisory_assessment_evidence_exception_request', {
        _payload: {
          assessment_id: input.assessmentId,
          rule_code: input.ruleCode,
          scope_type: input.scopeType,
          question_id: input.questionId ?? null,
          dimension_id: input.dimensionId ?? null,
          rationale: input.rationale,
        },
      }),
    onSuccess: invalidate,
  });
}

export function useDecideEvidenceException(assessmentId?: string) {
  const invalidate = useEvidencePolicyInvalidation(assessmentId);
  return useMutation({
    mutationFn: (input: { exceptionId: string; decision: 'APPROVED' | 'REJECTED' | 'WITHDRAWN'; rationale: string }) =>
      call<{ exception_id: string; status: string }>('supervisory_assessment_evidence_exception_decide', {
        _exception_id: input.exceptionId,
        _decision: input.decision,
        _rationale: input.rationale,
      }),
    onSuccess: invalidate,
  });
}

/* ------------------------------------------------- authoring vocabulary -- */

export interface EvidencePolicyAuthoringOptions {
  component_id: string;
  component_code: string | null;
  component_version: string | null;
  scope_types: string[];
  evidence_requirements: string[];
  evidence_kinds: { code: string; label: string; requires_source_object: boolean }[];
  methodology_id: string | null;
  methodology_code: string | null;
  methodology_version: string | null;
  methodology_source: string | null;
  dimensions: { code: string; label: string | null }[];
  questions: {
    code: string;
    label: string | null;
    dimension_code: string | null;
    dimension_label: string | null;
    requires_evidence: boolean | null;
  }[];
  warnings: { code: string; message: string }[];
}

export function useEvidencePolicyAuthoringOptions(componentId?: string, enabled = true) {
  return useQuery({
    queryKey: ['evidence-policy-authoring-options', componentId],
    enabled: !!componentId && enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      call<EvidencePolicyAuthoringOptions>('supervisory_evidence_policy_authoring_options', {
        _component_id: componentId,
      }),
  });
}
