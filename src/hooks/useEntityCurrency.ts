/**
 * F7-B / F6-X — entity reporting currency.
 *
 * Every read and write goes through the governed `entity_currency_*` RPCs; the
 * browser never touches `entity_currency_profiles` directly and never resolves
 * currency client-side. Entity 360 is the single override authority: no other
 * module keeps a parallel entity-currency preference.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export type CurrencySource = 'REGULATOR_BASE' | 'ENTITY_OVERRIDE' | 'RETURN_DEFINITION';

export const CURRENCY_SOURCE_LABELS: Record<CurrencySource, string> = {
  REGULATOR_BASE: 'Inherited from regulator base currency',
  ENTITY_OVERRIDE: 'Entity override',
  RETURN_DEFINITION: 'Return definition requirement',
};

export type CurrencyProfileStatus = 'PROPOSED' | 'ACTIVE' | 'REJECTED' | 'SUPERSEDED' | 'WITHDRAWN';

export const CURRENCY_PROFILE_STATUS_LABELS: Record<CurrencyProfileStatus, string> = {
  PROPOSED: 'Awaiting approval',
  ACTIVE: 'Active',
  REJECTED: 'Rejected',
  SUPERSEDED: 'Superseded',
  WITHDRAWN: 'Withdrawn',
};

/** Business configuration (per regulator monetary configuration), never hardcoded. */
export type CurrencyApprovalMode = 'DIRECT_AUTHORIZED' | 'MAKER_CHECKER';

export const CURRENCY_APPROVAL_MODE_LABELS: Record<CurrencyApprovalMode, string> = {
  DIRECT_AUTHORIZED: 'Direct authorised maintenance',
  MAKER_CHECKER: 'Two-person approval (maker-checker)',
};

export interface EntityCurrencyProfile {
  id: string;
  entity_id: string;
  reporting_currency_override: string;
  effective_from: string;
  effective_to: string | null;
  status: CurrencyProfileStatus;
  reason: string | null;
  source: string;
  created_by: string | null;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  superseded_by: string | null;
  superseded_at: string | null;
  proposed_by?: string | null;
  proposed_at?: string | null;
  decision_by?: string | null;
  decision_at?: string | null;
  decision_reason?: string | null;
  approval_mode?: CurrencyApprovalMode | null;
}

/**
 * One canonical regulator BODY (regulators.id) applicable to the entity, with
 * its own monetary configuration, override history and approval control. Officer
 * assignment fields are never regulator identity.
 */
export interface EntityCurrencyRegulatorBody {
  regulator_id: string;
  name: string | null;
  code: string | null;
  status: string | null;
  sources: string[] | null;
  ok?: boolean;
  error?: string | null;
  currency?: string | null;
  source?: CurrencySource | null;
  entity_currency_profile_id?: string | null;
  monetary_config_present: boolean;
  monetary_config_id: string | null;
  base_currency: string | null;
  reporting_currency: string | null;
  configuration_required: boolean;
  approval_mode: CurrencyApprovalMode | null;
  overrides: EntityCurrencyProfile[];
  pending_proposals: EntityCurrencyProfile[];
}

export interface EntityCurrencyOverview {
  ok: boolean;
  entity_id: string;
  regulator_id: string | null;
  currency: string;
  source: CurrencySource;
  as_of: string;
  entity_currency_profile_id: string | null;
  monetary_config_id: string | null;
  regulator_base_currency: string;
  regulator_reporting_currency: string;
  returns_fx_date_policy: 'PERIOD_END' | 'FILING_DATE' | 'ACCEPTANCE_DATE';
  can_manage: boolean;
  approval_mode: CurrencyApprovalMode;
  current_user_id: string | null;
  regulator_bodies: EntityCurrencyRegulatorBody[];
  multi_regulator: boolean;
  data_remediation_required: boolean;
  pending_proposals: EntityCurrencyProfile[];
  history: EntityCurrencyProfile[];
  mandated_definitions: Array<{ return_definition_id: string; code: string; name: string; currency: string }>;
}

const KEY = ['entity-currency'];

export function useEntityCurrencyOverview(entityId?: string, asOf?: string | null) {
  return useQuery({
    queryKey: [...KEY, entityId ?? null, asOf ?? null],
    enabled: !!entityId,
    queryFn: () => rpc<EntityCurrencyOverview>('entity_currency_profile_overview', {
      _entity_id: entityId,
      _as_of: asOf ?? null,
    }),
  });
}

export function useEntityCurrencyMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ['entity360'] });
  };

  return {
    setOverride: useMutation({
      mutationFn: (v: { entityId: string; currency: string; effectiveFrom: string; reason: string; effectiveTo?: string | null; regulatorId?: string | null }) =>
        rpc<{ ok: boolean; entity_currency_profile_id: string; currency: string; status: CurrencyProfileStatus }>('entity_currency_override_set', {
          _entity_id: v.entityId,
          _currency: v.currency,
          _effective_from: v.effectiveFrom,
          _reason: v.reason,
          _effective_to: v.effectiveTo ?? null,
          _regulator_id: v.regulatorId ?? null,
        }),
      onSuccess: invalidate,
    }),
    /** Independent decision on a proposed override (maker-checker mode). */
    decideOverride: useMutation({
      mutationFn: (v: { profileId: string; decision: 'APPROVE' | 'REJECT'; reason: string }) =>
        rpc<{ ok: boolean; status: CurrencyProfileStatus }>('entity_currency_override_decide', {
          _profile_id: v.profileId,
          _decision: v.decision,
          _reason: v.reason,
        }),
      onSuccess: invalidate,
    }),
    withdrawProposal: useMutation({
      mutationFn: (v: { profileId: string; reason: string }) =>
        rpc<{ ok: boolean }>('entity_currency_override_withdraw', {
          _profile_id: v.profileId,
          _reason: v.reason,
        }),
      onSuccess: invalidate,
    }),
    supersedeOverride: useMutation({
      mutationFn: (v: { profileId: string; reason: string }) =>
        rpc<{ ok: boolean }>('entity_currency_override_supersede', {
          _profile_id: v.profileId,
          _reason: v.reason,
        }),
      onSuccess: invalidate,
    }),
    rebaseFilingCurrency: useMutation({
      mutationFn: (v: { filingId: string; reason: string }) =>
        rpc<Record<string, unknown>>('returns_rebase_filing_currency', {
          _filing_id: v.filingId,
          _reason: v.reason,
        }),
      onSuccess: () => {
        invalidate();
        qc.invalidateQueries({ queryKey: ['entity-returns'] });
        qc.invalidateQueries({ queryKey: ['wave-c'] });
      },
    }),
  };
}

/**
 * Monetary display modes for a filing (F7-B item 8). The equivalents come from
 * the canonical F6-X FX engine server-side; unlike currencies are never summed
 * and unavailable conversions are reported as UNCONVERTED, never as zero.
 */
export type MonetaryDisplayMode = 'AS_REPORTED' | 'REGULATOR_BASE' | 'CONSOLIDATED_REPORTING';

export const MONETARY_DISPLAY_MODE_LABELS: Record<MonetaryDisplayMode, string> = {
  AS_REPORTED: 'As reported',
  REGULATOR_BASE: 'Regulator base equivalent',
  CONSOLIDATED_REPORTING: 'Consolidated reporting equivalent',
};

export interface FilingMetricsDisplay {
  ok: boolean;
  mode: MonetaryDisplayMode;
  filing_currency: string | null;
  display_currency: string | null;
  fx_as_of: string | null;
  mixed_currency: boolean;
  incomplete_count: number;
  summable: boolean;
  metrics: Array<{
    code: string; name: string; unit: string | null;
    as_reported: number | null; as_reported_currency: string | null;
    display_currency: string | null; display_value: number | null;
    status: 'OK' | 'UNCONVERTED' | 'NOT_REPORTED';
  }>;
}

export function useFilingMetricsDisplay(filingId?: string | null, mode: MonetaryDisplayMode = 'AS_REPORTED') {
  return useQuery({
    queryKey: ['returns', 'metrics-display', filingId ?? null, mode],
    enabled: !!filingId,
    queryFn: () => rpc<FilingMetricsDisplay>('returns_filing_metrics_display', {
      _filing_id: filingId, _mode: mode,
    }),
  });
}


/** Active currency master, used only to offer valid ISO codes for an override. */
export function useCurrencyMaster() {
  return useQuery({
    queryKey: ['currency-master'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('currencies')
        .select('code, name, display_symbol, is_active')
        .eq('is_active', true)
        .order('code');
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ code: string; name: string; display_symbol: string | null }>;
    },
    staleTime: 300_000,
  });
}
