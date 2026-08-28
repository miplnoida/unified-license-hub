/**
 * GAP-F1-04 — service configuration completeness.
 *
 * `public.service_configuration_completeness_report()` classifies every active
 * regulatory service across five configuration dimensions (workflow, fee,
 * forms/documents, SLA, decision authority) as SATISFIED,
 * SATISFIED_BY_FALLBACK, NOT_APPLICABLE or MISSING_REQUIRED, using the operator
 * dispositions held in `public.service_config_expectations`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CompletenessState =
  | 'SATISFIED'
  | 'SATISFIED_BY_FALLBACK'
  | 'NOT_APPLICABLE'
  | 'MISSING_REQUIRED';

export interface DimensionSummary {
  dimension: string;
  evaluated: number;
  satisfied: number;
  satisfied_by_fallback: number;
  not_applicable: number;
  missing_required: number;
}

export interface IncompleteRow {
  service_id: string;
  service_name: string;
  service_code: string | null;
  lifecycle_stage: string | null;
  decision_type: string | null;
  dimension: string;
  disposition: string;
}

export interface ServiceCompletenessReport {
  generated_at: string;
  services: number;
  totals: Partial<Record<CompletenessState, number>>;
  by_dimension: DimensionSummary[];
  incomplete_services: number;
  incomplete: IncompleteRow[];
}

export interface ServiceExpectation {
  id: string;
  service_id: string | null;
  lifecycle_stage: string | null;
  decision_type: string | null;
  dimension: string;
  disposition: 'REQUIRED' | 'NOT_APPLICABLE' | 'SHARED_FALLBACK';
  justification: string | null;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
}

export function useServiceCompletenessReport() {
  return useQuery({
    queryKey: ['service-configuration-completeness'],
    staleTime: 30_000,
    queryFn: async (): Promise<ServiceCompletenessReport> => {
      const { data, error } = await supabase.rpc('service_configuration_completeness_report' as never);
      if (error) throw new Error(error.message);
      return data as unknown as ServiceCompletenessReport;
    },
  });
}

export function useServiceExpectations() {
  return useQuery({
    queryKey: ['service-config-expectations'],
    staleTime: 30_000,
    queryFn: async (): Promise<ServiceExpectation[]> => {
      const { data, error } = await supabase
        .from('service_config_expectations')
        .select('*')
        .order('dimension', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ServiceExpectation[];
    },
  });
}
