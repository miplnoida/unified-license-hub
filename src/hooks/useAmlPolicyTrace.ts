/**
 * PCOMP-R2E — integrated policy trace (read-only).
 *
 * One server read model, `supervisory_assessment_policy_trace`, composes the
 * whole governed chain for a single assessment: the pinned policy basis, the
 * four runtime policy stages (evidence, judgement, response, SLA), the rating
 * chain from calculation through approval and publication to the operative
 * risk-of-record, and the downstream counts.
 *
 * There is deliberately NO policy interpretation, status derivation, version
 * reconciliation or rating logic in TypeScript. The only local vocabulary is
 * display labelling for canonical codes the server returns.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export const TRACE_STAGE_LABEL: Record<string, string> = {
  EVIDENCE: 'Evidence policy',
  JUDGEMENT: 'Judgement and override policy',
  RESPONSE: 'Supervisory response policy',
  SLA: 'Response deadline policy',
};

export const TRACE_STATUS_LABEL: Record<string, string> = {
  EVALUATED: 'Governed',
  NOT_GOVERNED: 'Not governed',
  UNAVAILABLE: 'Cannot be read',
};

export interface PolicyTraceLink {
  stage: string;
  component_type: string;
  status: string;
  reason_code: string | null;
  reason: string | null;
  policy_component_code: string | null;
  policy_component_version: string | null;
  policy_content_hash: string | null;
  policy_profile_version: string | null;
  blocking_count: number;
  measure: string | null;
}

export interface PolicyTraceRating {
  calculation_run_id: string | null;
  calculation_status: string | null;
  calculated_rating: string | null;
  calculated_at: string | null;
  result_hash: string | null;
  approved_rating: string | null;
  approved_rating_source: string | null;
  approved_at: string | null;
  published_rating: string | null;
  published_at: string | null;
  operative_rating: string | null;
  operative_inherent_rating: string | null;
  operative_control_rating: string | null;
}

export interface PolicyTrace {
  assessment_id: string;
  assessment_reference: string | null;
  assessment_status: string | null;
  entity_id: string;
  domain_code: string;
  policy_basis: Record<string, unknown> | null;
  links: PolicyTraceLink[];
  rating: PolicyTraceRating;
  downstream: { consequence_decisions: number; sla_obligations: number };
  authority: string;
  generated_at: string;
}

export function useAmlPolicyTrace(assessmentId?: string) {
  return useQuery({
    queryKey: ['aml-policy-trace', assessmentId],
    enabled: !!assessmentId,
    queryFn: async () => {
      const { data, error } = await db().rpc('supervisory_assessment_policy_trace', {
        _assessment_id: assessmentId,
      });
      if (error) throw new Error(error.message);
      return data as PolicyTrace;
    },
  });
}
