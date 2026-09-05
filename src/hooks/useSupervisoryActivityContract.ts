/**
 * Governed read of what may actually be done with a supervisory intervention.
 *
 * The server owns the answer (`supervisory_intervention_execution_capabilities`)
 * so no screen has to guess which intervention types open an examination, which
 * engagement types are valid, or why an action is refused. No role names or
 * permission strings are evaluated here.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CanonicalEngagementType, EngagementTypeOption, ExecutionKind } from '@/lib/supervisoryEngagement';

const sb = supabase as any;

export interface InterventionExecutionCapabilities {
  intervention_id: string;
  intervention_type: string;
  status: string | null;
  domain_code: string | null;
  execution_kind: ExecutionKind;
  can_open_examination: boolean;
  allowed_engagement_types: CanonicalEngagementType[];
  default_engagement_type: CanonicalEngagementType | null;
  requires_explicit_engagement: boolean;
  block_reason: string | null;
  existing_activity_id: string | null;
  existing_activity_kind: string | null;
  existing_activity_route: string | null;
  engagement_vocabulary: EngagementTypeOption[];
}

export function useInterventionExecutionCapabilities(interventionId?: string | null) {
  return useQuery({
    queryKey: ['supervisory', 'intervention-capabilities', interventionId],
    enabled: !!interventionId,
    staleTime: 30_000,
    queryFn: async (): Promise<InterventionExecutionCapabilities> => {
      const { data, error } = await sb.rpc('supervisory_intervention_execution_capabilities', {
        _intervention_id: interventionId,
      });
      if (error) throw error;
      return data as InterventionExecutionCapabilities;
    },
  });
}

/** Canonical engagement vocabulary straight from the server. */
export function useSupervisoryEngagementTypes() {
  return useQuery({
    queryKey: ['supervisory', 'engagement-types'],
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<EngagementTypeOption[]> => {
      const { data, error } = await sb.rpc('supervisory_engagement_types');
      if (error) throw error;
      return (data ?? []) as EngagementTypeOption[];
    },
  });
}
