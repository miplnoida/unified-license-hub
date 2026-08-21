/**
 * P04 A.4 / A.5 — licence term history and resolved lifecycle configuration.
 *
 * Terms are read from the append-only `license_terms` table; the renewal /
 * variation / reinstatement policy is resolved server-side by
 * `license_lifecycle_config_resolve()`. The browser never computes renewal
 * windows, grace periods or requirement sets.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LicenseTerm {
  id: string;
  license_id: string;
  term_number: number;
  term_kind: 'original' | 'renewal' | 'variation' | 'reinstatement';
  effective_from: string;
  effective_until: string | null;
  source_decision: string | null;
  source_application_id: string | null;
  renewal_id: string | null;
  matter_id: string | null;
  decision_actor: string | null;
  decision_at: string | null;
  conditions_snapshot: Array<Record<string, unknown>>;
  is_current: boolean;
  superseded_by: string | null;
  superseded_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type LifecycleMatterKind = 'renewal' | 'variation' | 'reinstatement' | 'surrender' | 'expiry';

export interface LicenseLifecycleResolvedConfig {
  config_id: string | null;
  matter_kind: string;
  source: 'license_lifecycle_configs' | 'site_settings';
  renewal_cycle?: string;
  cycle_type?: string;
  period_days: number;
  renewal_window_days: number;
  grace_period_days: number;
  reminder_days: number[];
  required_form_package_id: string | null;
  required_documents: Array<Record<string, unknown> | string>;
  verification_required: boolean;
  verification_checklist: Array<Record<string, unknown> | string>;
  fp_required: boolean;
  fee_required: boolean;
  fee_type_code: string | null;
  payment_verification_required: boolean;
  decision_authority: string | null;
  late_renewal_treatment: string;
  expiry_behavior: 'automatic' | 'officer_confirmed';
  breach_consequence: string;
  workflow_id: string | null;
}

export function useLicenseTerms(licenseId: string | null | undefined) {
  return useQuery({
    enabled: !!licenseId,
    queryKey: ['license_terms', licenseId],
    queryFn: async (): Promise<LicenseTerm[]> => {
      const { data, error } = await (supabase as any)
        .from('license_terms')
        .select('*')
        .eq('license_id', licenseId!)
        .order('term_number', { ascending: false });
      if (error) throw error;
      return (data ?? []) as LicenseTerm[];
    },
    staleTime: 30_000,
  });
}

export function useLicenseLifecycleConfig(
  licenseId: string | null | undefined,
  matterKind: LifecycleMatterKind = 'renewal',
) {
  return useQuery({
    enabled: !!licenseId,
    queryKey: ['license_lifecycle_config', licenseId, matterKind],
    queryFn: async (): Promise<LicenseLifecycleResolvedConfig> => {
      const { data, error } = await (supabase as any).rpc('license_lifecycle_config_resolve', {
        _license_id: licenseId!,
        _matter_kind: matterKind,
      });
      if (error) throw error;
      return data as LicenseLifecycleResolvedConfig;
    },
    staleTime: 60_000,
  });
}
