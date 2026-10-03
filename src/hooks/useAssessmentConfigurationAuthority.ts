/**
 * AML-CLOSE-02 — which sector overlay, fact configuration and source binding
 * govern one assessment, as decided by the platform from the assessment's
 * pinned policy basis. The screen only displays this; the same server checks
 * refuse any fact write that the configuration does not permit.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export type GovernanceStatus = 'GOVERNED' | 'NOT_GOVERNED' | 'UNAVAILABLE';

export interface PinnedFamily {
  component_type: string;
  status: GovernanceStatus;
  reason_code: string | null;
  reason?: string | null;
  code?: string | null;
  component_version?: string | null;
  component_status?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  content_hash?: string | null;
  policy_profile_code?: string | null;
  policy_profile_version?: string | null;
}

export interface SectorOverlayDecision extends PinnedFamily {
  applies: boolean;
  applicability: string | null;
  sector_code: string | null;
  note?: string | null;
}

export interface GovernedFactRow {
  fact_code: string;
  label: string | null;
  data_type: string | null;
  permitted: boolean;
  /** Why the platform will refuse this fact for this assessment, when it will. */
  not_permitted_reason?: 'RETIRED_DEFINITION' | 'FACT_CONFIG_UNAVAILABLE' | 'NOT_IN_FACT_CONFIG' | 'OTHER_SECTOR' | null;
  definition_status?: string | null;
  required: boolean;
  sector_codes: string[] | null;
  allowed_sources: Array<{ source_kind: string; source_reference: string | null }> | null;
  recorded: boolean;
  source_type: string | null;
}

export interface ConfigurationAuthority {
  assessment_id: string;
  generated_at: string;
  sector_overlay: SectorOverlayDecision;
  fact_config: PinnedFamily;
  source_binding: PinnedFamily;
  methodology_fact_count: number;
  facts: GovernedFactRow[];
}

export function useAssessmentConfigurationAuthority(assessmentId?: string | null) {
  return useQuery({
    queryKey: ['supervisory_assessment_configuration_authority', assessmentId],
    enabled: !!assessmentId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await rpc('supervisory_assessment_configuration_authority', {
        _assessment_id: assessmentId,
      });
      if (error) throw new Error(error.message);
      return data as ConfigurationAuthority;
    },
  });
}
