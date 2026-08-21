/**
 * Registration & Entity Onboarding Convergence — audit-aware read hooks.
 *
 * All reads go through governed SECURITY DEFINER RPCs that enforce the
 * onboarding audit permission server-side; the browser never queries the
 * audit ledger tables directly.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const rpc = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (supabase as any).rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
};

export interface IdentificationActivityRow {
  id: string;
  event_reference: string;
  occurred_at: string;
  user_id: string | null;
  user_email: string | null;
  journey_type: string | null;
  source_channel: string | null;
  searched_legal_name: string | null;
  identifier_type: string | null;
  identifier_value_masked: string | null;
  licence_number_masked: string | null;
  resolution_outcome: string;
  matched_entity_id: string | null;
  matched_entity_name: string | null;
  candidate_count: number | null;
  highest_match_score: number | null;
  match_basis: string | null;
  follow_up_action: string | null;
  follow_up_at: string | null;
  resolution_case_id: string | null;
  resolution_case_number: string | null;
  failure_reason: string | null;
}

export interface IdentificationFilters {
  user?: string;
  organisation?: string;
  journey_type?: string;
  outcome?: string;
  follow_up_action?: string;
  from?: string;
  to?: string;
  resolution_case_id?: string;
}

const clean = (f: IdentificationFilters) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== '' && v !== 'all'));

export function useIdentificationActivity(filters: IdentificationFilters, page = 0, pageSize = 50) {
  return useQuery({
    queryKey: ['onboarding-identification-activity', filters, page, pageSize],
    queryFn: () =>
      rpc<IdentificationActivityRow[]>('onboarding_identification_activity', {
        _filters: clean(filters),
        _limit: pageSize,
        _offset: page * pageSize,
      }),
  });
}

export interface IdentificationCounts {
  total: number;
  exact_match: number;
  possible_match: number;
  no_match: number;
  failures: number;
  open_signals: number;
}

export function useIdentificationCounts(filters: IdentificationFilters) {
  return useQuery({
    queryKey: ['onboarding-identification-counts', filters],
    queryFn: () => rpc<IdentificationCounts>('onboarding_identification_activity_counts', { _filters: clean(filters) }),
  });
}

export interface JourneyRegisterRow {
  user_id: string;
  user_email: string | null;
  journey_type: string | null;
  stage: string;
  entity_id: string | null;
  entity_name: string | null;
  membership_status: string | null;
  last_event_at: string;
  event_count: number;
  latest_stage: string | null;
}

export function useJourneyRegister(filters: { user?: string; stage?: string; journey_type?: string }) {
  return useQuery({
    queryKey: ['onboarding-journey-register', filters],
    queryFn: () => rpc<JourneyRegisterRow[]>('registration_journey_register', { _filters: clean(filters), _limit: 200, _offset: 0 }),
  });
}

export interface JourneyEventRow {
  event_reference: string;
  occurred_at: string;
  stage: string | null;
  journey_type: string | null;
  entity_id: string | null;
  detail: Record<string, unknown> | null;
}

export function useUserJourneyEvents(userId: string | null) {
  return useQuery({
    queryKey: ['onboarding-user-journey-events', userId],
    enabled: !!userId,
    queryFn: () => rpc<JourneyEventRow[]>('onboarding_user_journey_events', { _user_id: userId }),
  });
}

export interface OnboardingOverview {
  journeys_active: number;
  identification_events_7d: number;
  resolution_cases_open: number;
  access_requests_pending: number;
  open_signals: number;
}

export function useOnboardingOverview() {
  return useQuery({
    queryKey: ['onboarding-overview'],
    queryFn: () => rpc<OnboardingOverview>('onboarding_overview'),
  });
}

export interface EntityOnboardingActivity {
  identity_matches: Array<{
    event_reference: string; occurred_at: string; searched_legal_name: string | null;
    outcome: string; match_basis: string | null; journey_type: string | null;
    user_email: string | null; follow_up_action: string | null;
  }>;
  membership_requests: Array<{
    id: string; status: string; requested_at: string; approved_at: string | null;
    user_email: string | null; role: string | null;
  }>;
  resolution_cases: Array<{
    id: string; case_number: string; status: string; outcome: string | null;
    subject_name: string | null; created_at: string;
  }>;
}

export function useEntityOnboardingActivity(entityId: string | null | undefined) {
  return useQuery({
    queryKey: ['entity-onboarding-activity', entityId],
    enabled: !!entityId,
    queryFn: () => rpc<EntityOnboardingActivity>('entity_onboarding_activity', { _entity_id: entityId }),
  });
}

/** FORM_FIRST journey: resolve a submitted registration against the canonical entity register. */
export function useFormFirstResolve() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) =>
      rpc<{ outcome: string; binding_status: string; entity_bound: boolean; case_reference?: string | null; event_reference?: string }>(
        'onboarding_form_first_resolve',
        { _registration_id: registrationId },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-identification-activity'] });
      qc.invalidateQueries({ queryKey: ['onboarding-overview'] });
    },
  });
}
