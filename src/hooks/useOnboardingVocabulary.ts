/**
 * F2 — governed onboarding vocabularies (GAP-F2-07).
 *
 * Onboarding stages and entity-membership statuses are configuration, not
 * code. They are read from the governed catalogues so adding or retiring a
 * stage/status is a configuration change, never a React change.
 *
 *  - public.onboarding_stage_catalogue          (stage keys + resume routes)
 *  - public.entity_membership_status_catalogue  (status keys + open/authority flags)
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as { from: (t: string) => any };

export interface OnboardingStage {
  key: string;
  label: string;
  description: string | null;
  resume_route: string | null;
  sort_order: number;
  is_terminal: boolean;
}

export interface MembershipStatus {
  key: string;
  label: string;
  description: string | null;
  is_open: boolean;
  is_authority_sufficient: boolean;
  sort_order: number;
}

export function useOnboardingStages() {
  return useQuery({
    queryKey: ['onboarding-stage-catalogue'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<OnboardingStage[]> => {
      const { data, error } = await db()
        .from('onboarding_stage_catalogue')
        .select('key, label, description, resume_route, sort_order, is_terminal')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw new Error(error.message);
      return (data || []) as OnboardingStage[];
    },
  });
}

export function useMembershipStatuses() {
  return useQuery({
    queryKey: ['entity-membership-status-catalogue'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MembershipStatus[]> => {
      const { data, error } = await db()
        .from('entity_membership_status_catalogue')
        .select('key, label, description, is_open, is_authority_sufficient, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw new Error(error.message);
      return (data || []) as MembershipStatus[];
    },
  });
}

/**
 * Stages that mean "authority is resolved — leave the onboarding chain".
 * Derived from the configured resume route: a stage that resumes outside
 * `/register` no longer belongs to the registration journey.
 */
export function useResolvedStageKeys(): string[] {
  const { data = [] } = useOnboardingStages();
  return data
    .filter((s) => !!s.resume_route && !s.resume_route.startsWith('/register'))
    .map((s) => s.key);
}
