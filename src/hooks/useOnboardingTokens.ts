/**
 * RDM-ENTITY-001 Wave C — privacy-safe onboarding via opaque tokens (§19, §20).
 *
 * Internal canonical entity/candidate UUIDs must never be surfaced in the
 * browser. All onboarding steps after resolution pass around the opaque
 * tokens returned by these governed SECURITY DEFINER RPCs; the client never
 * sees or holds a raw entity/candidate UUID.
 *
 * Backend RPCs (already exist — do not re-implement):
 *  - onboarding_resolve_entity(_payload)              → resolution outcome + tokens
 *  - onboarding_provision_from_token(_resolution_token) → membership_target_token
 *  - onboarding_request_membership_by_token(_token, _role_key, _evidence_ref)
 *  - onboarding_journey_context()                      → resumable journey/authority state
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const rpc = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (supabase as any).rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
};

export type ResolveOutcomeKind = 'EXACT_MATCH' | 'POSSIBLE_MATCH' | 'NO_MATCH';

export interface OnboardingCandidate {
  candidate_token: string;
  legal_name: string;
  match_score: number | null;
  match_basis: string | null;
}

export interface OnboardingResolveResult {
  outcome: ResolveOutcomeKind;
  match_basis?: string | null;
  /** Present for EXACT_MATCH — hand straight to onboarding_request_membership_by_token. */
  membership_target_token?: string;
  /** Present for POSSIBLE_MATCH / NO_MATCH — hand to onboarding_provision_from_token. */
  resolution_token?: string;
  case_reference?: string | null;
  entity_display?: { legal_name: string; status?: string | null };
  candidates: OnboardingCandidate[];
}

export interface OnboardingProvisionResult {
  membership_target_token: string;
  entity_display: { legal_name: string };
}

export interface OnboardingMembershipResult {
  membership_status: string;
  authority_sufficient: boolean;
  stage: string;
  resume_route: string;
}

export interface OnboardingJourneyContext {
  stage: 'USER_ACCOUNT' | 'ENTITY_IDENTIFICATION' | 'AUTHORITY_PENDING' | 'AUTHORITY_GRANTED' | 'APPLICATION' | 'COMPLETE' | string;
  membership_status?: string | null;
  entity_display_name?: string | null;
  intended_journey?: string | null;
  resume_route: string;
  updated_at?: string;
}

export function useResolveEntity() {
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      rpc<OnboardingResolveResult>('onboarding_resolve_entity', { _payload: payload }),
  });
}

export function useProvisionFromToken() {
  return useMutation({
    mutationFn: (resolutionToken: string) =>
      rpc<OnboardingProvisionResult>('onboarding_provision_from_token', { _resolution_token: resolutionToken }),
  });
}

export function useRequestMembershipByToken() {
  return useMutation({
    mutationFn: (v: { token: string; roleKey: string; evidenceRef?: string }) =>
      rpc<OnboardingMembershipResult>('onboarding_request_membership_by_token', {
        _token: v.token,
        _membership_role_key: v.roleKey,
        _authority_evidence_reference: v.evidenceRef ?? null,
      }),
  });
}

/** Resumable journey/membership authority state — drives §20 routing decisions. */
export function useJourneyContext() {
  return useQuery({
    queryKey: ['onboarding-journey-context'],
    queryFn: () => rpc<OnboardingJourneyContext>('onboarding_journey_context'),
    staleTime: 0,
  });
}
