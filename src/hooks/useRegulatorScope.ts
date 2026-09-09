/**
 * Canonical effective-regulator contract for the supervisory platform.
 *
 * Three concepts are deliberately distinct and must never be conflated:
 *
 *   1. Regulator master/history  — every regulator row ever recorded, including
 *      inactive and retired ones. Only Administration → Regulator Management
 *      reads this (see `useRegulatorMaster`).
 *   2. Authorised active scope   — the regulators the signed-in officer may
 *      actually configure or adopt for. This is server-owned and read here.
 *   3. Platform/MIPL reference   — content with `regulator_id = NULL`. That is
 *      "MIPL Reference / Not regulator-owned"; it is never "All regulators".
 *
 * Operational and configuration screens (methodology, policy profiles,
 * adoption, future programmes) must consume this contract and never query the
 * regulators table directly. `localStorage` may remember a preference; the
 * server decides scope on every read and write.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuthorisedRegulatorOption {
  id: string;
  code: string;
  name: string;
  status: string;
  selectable: boolean;
  reason: string | null;
}

export interface AuthorisedRegulatorScope {
  selectable_count: number;
  /** True only for explicit cross-regulator oversight authority with 2+ regulators in scope. */
  cross_regulator_allowed: boolean;
  /** Present only when exactly one regulator is selectable — resolve it automatically. */
  active_regulator: AuthorisedRegulatorOption | null;
  regulators: AuthorisedRegulatorOption[];
  reason: string | null;
}

export const EMPTY_REGULATOR_SCOPE: AuthorisedRegulatorScope = {
  selectable_count: 0,
  cross_regulator_allowed: false,
  active_regulator: null,
  regulators: [],
  reason: 'No active regulator is available in your authorised scope.',
};

/**
 * Server-authoritative options for a supervisory domain. Only active regulators
 * inside the caller's authority are returned; inactive and retired regulators
 * are never offered as targets for new work.
 */
export function useAuthorisedRegulatorOptions(domainCode: string | null, enabled = true) {
  return useQuery({
    queryKey: ['supervisory-authorised-regulators', domainCode],
    enabled,
    queryFn: async (): Promise<AuthorisedRegulatorScope> => {
      const { data, error } = await (supabase.rpc as any)('supervisory_authorised_regulator_options', {
        _domain_code: domainCode, _capability: null,
      });
      if (error) throw error;
      return (data ?? EMPTY_REGULATOR_SCOPE) as AuthorisedRegulatorScope;
    },
  });
}

/** Shape shared by register option payloads that embed the same contract. */
export interface EmbeddedRegulatorScope {
  regulators: Array<{ id: string; code: string; name: string; status?: string }>;
  selectable_regulator_count?: number;
  cross_regulator_allowed?: boolean;
  active_regulator?: { id: string; code: string; name: string } | null;
  regulator_scope_reason?: string | null;
}

/** Normalises an embedded register-options scope into the canonical shape. */
export function readEmbeddedScope(o?: EmbeddedRegulatorScope | null) {
  const regulators = o?.regulators ?? [];
  const count = o?.selectable_regulator_count ?? regulators.length;
  return {
    regulators,
    count,
    crossRegulatorAllowed: Boolean(o?.cross_regulator_allowed) && count > 1,
    activeRegulator: o?.active_regulator ?? (count === 1 ? regulators[0] ?? null : null),
    reason: o?.regulator_scope_reason ?? null,
  };
}
