/**
 * PCOMP-R2C — supervisory response policy (runtime).
 *
 * The browser is a reader. The server decides, from the response policy pinned
 * to the assessment's immutable policy basis, whether each canonical supervisory
 * consequence is required, recommended, permitted or prohibited at the current
 * risk-of-record, and refuses a prohibited response when it is recorded.
 *
 * There is deliberately NO rating→action mapping, no policy interpretation and
 * no timing rule in TypeScript. The only local vocabulary is display labelling
 * for canonical codes the server returns.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export const RESPONSE_LEVEL_LABEL: Record<string, string> = {
  REQUIRED: 'Required by policy',
  RECOMMENDED: 'Recommended by policy',
  PERMITTED: 'Permitted',
  PROHIBITED: 'Prohibited by policy',
  UNAVAILABLE: 'Policy cannot be read',
};

export const RESPONSE_BASIS_LABEL: Record<string, string> = {
  EVALUATED: 'Governed by a supervisory response policy',
  NOT_GOVERNED: 'No supervisory response policy governs this record',
  UNAVAILABLE: 'The pinned response policy cannot be read',
};

export const RESPONSE_REASON_LABEL: Record<string, string> = {
  NO_ASSESSMENT_SOURCE: 'There is no authoritative assessment source for this risk record.',
  NO_POLICY_BASIS: 'This assessment carries no policy basis, so no response policy applies to it.',
  RESPONSE_POLICY_NOT_BOUND: 'The governing policy profile binds no supervisory response policy.',
  PINNED_POLICY_MISSING: 'The exact response policy version recorded in the policy basis can no longer be read.',
};

export interface ResponseExpectation {
  action: string;
  operational_action: string;
  label: string | null;
  governed: boolean;
  response_level: string;
  prohibited: boolean;
  blocked: boolean;
  rule_code: string | null;
  policy_note: string | null;
  rationale_required: boolean;
  deferral_allowed: boolean;
  advisory_timeframe_days: number | null;
  timing_authority: string;
  prerequisite: string | null;
}

export interface ResponsePolicyEvaluation {
  assessment_id: string | null;
  source_rating: string | null;
  status: string;
  governed: boolean;
  reason_code: string | null;
  reason: string | null;
  policy: {
    component_id: string; code: string; component_version: string;
    name: string; origin: string; status: string; content_hash: string | null;
  } | null;
  policy_profile: { profile_id: string; code: string; version: string; origin: string } | null;
  expectations: ResponseExpectation[];
  required_responses: Array<{ action: string; rule_code: string | null; advisory_timeframe_days: number | null }>;
  timing_ownership: string;
  automation: string;
}

export interface ResponsePolicyDecision {
  decision_id: string;
  action_type: string;
  status: string;
  recorded_at: string;
  response_policy_basis_status: string | null;
  response_policy_code: string | null;
  response_policy_version: string | null;
  response_policy_rule_code: string | null;
  response_policy_level: string | null;
  response_policy_advisory_timeframe_days: number | null;
}

export interface ResponsePolicyView {
  entity_id: string;
  domain_code: string;
  source: Record<string, unknown> | null;
  evaluation: ResponsePolicyEvaluation;
  decisions: ResponsePolicyDecision[];
}

export function useSupervisoryResponsePolicy(
  entityId?: string,
  domainCode: string = 'AML_CFT',
  assessmentId?: string | null,
) {
  return useQuery({
    queryKey: ['aml-response-policy', entityId, domainCode, assessmentId ?? null],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await db().rpc('supervisory_consequence_response_policy_view', {
        _entity_id: entityId,
        _domain_code: domainCode,
        _assessment_id: assessmentId ?? null,
      });
      if (error) throw new Error(error.message);
      return data as ResponsePolicyView;
    },
  });
}
