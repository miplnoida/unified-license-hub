/**
 * RDM-ENTITY-001 Wave C — privacy-safe onboarding tokens (§19).
 *
 * Internal canonical entity/candidate UUIDs must not be surfaced in the
 * browser where not necessary. These helpers mint an opaque, short-lived,
 * per-user token via a governed SECURITY DEFINER RPC pair backed by
 * `onboarding_resolution_tokens`, so onboarding UI can pass tokens around
 * (in state, the URL, sessionStorage) instead of raw UUIDs. The internal
 * entity_id stays the canonical backend FK and is only ever used directly for
 * the server calls that require it — never rendered.
 */
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type OnboardingTokenPurpose = 'resolution' | 'candidate' | 'membership_target';

const rpc = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (supabase as any).rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
};

export function useMintOnboardingToken() {
  return useMutation({
    mutationFn: (v: { purpose: OnboardingTokenPurpose; entityId?: string | null; candidateId?: string | null }) =>
      rpc<string>('onboarding_mint_token', {
        _purpose: v.purpose,
        _entity_id: v.entityId ?? null,
        _candidate_id: v.candidateId ?? null,
      }),
  });
}

export function useResolveOnboardingToken() {
  return useMutation({
    mutationFn: (token: string) =>
      rpc<Array<{ entity_id: string | null; candidate_id: string | null; purpose: string }>>('onboarding_resolve_token', {
        _token: token,
      }),
  });
}
