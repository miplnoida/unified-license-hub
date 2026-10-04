/**
 * AML-CLOSE-03 — per-factor applicability and materiality, as decided by the
 * platform from the assessment's pinned calculation settings. The screen only
 * displays this; the calculation engine applies the same decision server-side.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export interface FactorDecision {
  dimension_code: string;
  applicability_status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'PENDING_INFORMATION' | string;
  applicability_reason?: string | null;
  applicability_reason_code?: string | null;
  applicability_rationale?: string | null;
  materiality_status: 'MATERIAL' | 'NOT_MATERIAL' | 'PENDING_INFORMATION' | 'NOT_ASSESSED' | 'NOT_EVALUATED' | string;
  materiality_reason?: string | null;
  materiality_reason_code?: string | null;
  materiality_rationale?: string | null;
  outcome: 'INCLUDED' | 'NOT_APPLICABLE' | 'EXCLUDED_NOT_MATERIAL' | 'PENDING_INFORMATION' | string;
  calculation_effect?: string | null;
  missing_facts?: string[] | null;
  supporting_facts?: Array<{ fact_code: string; value?: unknown; source_type?: string | null }> | null;
}

export interface FactorAuthority {
  assessment_id: string;
  reference: string | null;
  policy_profile_code: string | null;
  policy_profile_version: string | null;
  methodology_code: string | null;
  methodology_version: string | null;
  pinned_calculation_config_id: string | null;
  pinned_calculation_config_version: string | null;
  evaluation: {
    status: string;
    reason_code?: string | null;
    reason?: string | null;
    config_version?: string | null;
    pending_count?: number;
    missing_facts?: string[];
    factors?: FactorDecision[];
  };
  latest_run: null | {
    run_seq: number;
    status: string;
    reason_code: string | null;
    config_version: string | null;
    engine_version: string | null;
    factor_outcomes: Record<string, string>;
    matches_current_evaluation: boolean | null;
  };
}

export function useAssessmentFactorAuthority(assessmentId?: string | null) {
  return useQuery({
    queryKey: ['supervisory_assessment_factor_authority', assessmentId],
    enabled: !!assessmentId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await rpc('supervisory_assessment_factor_authority', {
        _assessment_id: assessmentId,
      });
      if (error) throw new Error(error.message);
      return data as FactorAuthority;
    },
  });
}
