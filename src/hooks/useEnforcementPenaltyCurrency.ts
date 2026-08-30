/**
 * P11 / F6-X — enforcement penalty currency.
 *
 * A monetary sanction's currency is server-authoritative: it is the applicable
 * regulator body's configured base currency unless that regulator's business
 * configuration explicitly permits another currency. The browser never chooses
 * a default and never accepts free-text currency input.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type PenaltyCurrencyPolicy = 'REGULATOR_BASE' | 'EXPLICIT_ALLOWED_CURRENCIES';

export const PENALTY_CURRENCY_POLICY_LABELS: Record<PenaltyCurrencyPolicy, string> = {
  REGULATOR_BASE: 'Regulator base currency',
  EXPLICIT_ALLOWED_CURRENCIES: 'Regulator-approved penalty currencies',
};

export interface PenaltyCurrencyResolution {
  ok: boolean;
  currency: string;
  source: 'REGULATOR_BASE' | 'REGULATOR_APPROVED_CURRENCY';
  regulator_id: string;
  regulator_source: string;
  monetary_config_id: string;
  policy: PenaltyCurrencyPolicy;
  base_currency: string;
  allowed_currencies: string[];
}

/** Resolved penalty currency for an entity; `error` means fail-closed configuration. */
export function useEnforcementPenaltyCurrency(entityId: string | null | undefined) {
  return useQuery<PenaltyCurrencyResolution>({
    queryKey: ['enforcement-penalty-currency', entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await db().rpc('enforcement_penalty_currency_resolve', { _entity_id: entityId });
      if (error) throw new Error(error.message);
      return data as PenaltyCurrencyResolution;
    },
  });
}

/** Governed non-base denomination; requires enforcement decide authority + reason. */
export function usePenaltyCurrencyOverride(caseId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { currency: string; reason: string }) => {
      const { data, error } = await db().rpc('enforcement_penalty_currency_override', {
        _case_id: caseId, _currency: input.currency, _reason: input.reason,
      });
      if (error) throw new Error(error.message);
      return data as PenaltyCurrencyResolution;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enforcement-case', caseId] });
      qc.invalidateQueries({ queryKey: ['enforcement-penalty-currency'] });
    },
  });
}
