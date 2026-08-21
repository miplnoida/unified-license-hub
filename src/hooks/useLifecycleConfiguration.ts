/**
 * P04 configuration closure — read-only access to the fee and verification
 * configuration model, the fee simulator and the process preview.
 *
 * Every value shown in the configuration workspace is resolved by the server
 * (`license_fee_configuration_overview`, `license_fee_simulate`,
 * `process_preview`). The browser never writes fee or verification
 * configuration directly.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as unknown as T;
}

export interface FeeTypeCatalogueRow {
  code: string | null;
  name: string | null;
  status: string | null;
}

export interface FeeBindingRow {
  id: string;
  binding_key: string | null;
  purpose: 'PRODUCTION' | 'CERTIFICATION' | 'TEMPLATE';
  matter_kind: string | null;
  action_key: string | null;
  fee_type_code: string | null;
  description: string | null;
  amount_override: number | null;
  currency: string | null;
  trigger_event: string | null;
  trigger_timing: string | null;
  workflow_step_key: string | null;
  gate_policy: string | null;
  charge_basis: string | null;
  quantity: number | null;
  blocking: boolean | null;
  payment_verification_required: boolean | null;
  due_days: number | null;
  is_active: boolean;
  license_type: string | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
}

export interface FeeScheduleRow {
  id: string;
  name: string | null;
  fee_type: string | null;
  amount: number | null;
  currency: string | null;
  is_active: boolean | null;
}

export interface FeeProcessSettingRow {
  id: string;
  regulator_id: string | null;
  matter_kind: string;
  fees_enabled: boolean;
  purpose: string;
  notes: string | null;
}

export interface VerificationTemplateRow {
  id: string;
  template_key: string | null;
  version: number;
  name: string;
  matter_kind: string;
  purpose: string;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  total_items: number;
  mandatory_items: number;
  blocking_semantics: Record<string, unknown>;
}

export interface ProcessTemplateRow {
  id: string;
  template_key: string;
  version: number;
  name: string;
  process_code: string;
  purpose: string;
  is_active: boolean;
  step_count: number;
}

export interface LifecycleConfigurationOverview {
  fee_types: FeeTypeCatalogueRow[];
  bindings: FeeBindingRow[];
  schedules: FeeScheduleRow[];
  process_settings: FeeProcessSettingRow[];
  verification_templates: VerificationTemplateRow[];
  process_templates: ProcessTemplateRow[];
}

export function useLifecycleConfigurationOverview() {
  return useQuery({
    queryKey: ['lifecycle-configuration-overview'],
    staleTime: 30_000,
    queryFn: () => rpc<LifecycleConfigurationOverview>('license_fee_configuration_overview'),
  });
}

export interface FeeSimulationCandidate {
  binding_id: string;
  binding_key: string | null;
  purpose: string;
  fee_type_code: string | null;
  description: string | null;
  schedule_name: string | null;
  schedule_active: boolean | null;
  catalogue_state: 'AVAILABLE' | 'NOT_IN_CATALOGUE';
  binding_enabled: boolean;
  unit_amount: number;
  quantity: number;
  total: number;
  currency: string;
  charge_basis: string | null;
  trigger_event: string | null;
  trigger_timing: string | null;
  workflow_step_key: string | null;
  gate_policy: string | null;
  payment_verification_required: boolean | null;
  effective_from: string;
  effective_to: string | null;
  specificity: number;
  would_assess: boolean;
  reason: string;
}

export interface FeeSimulationResult {
  simulated_at: string;
  creates_obligation: false;
  matter_kind: string;
  process_fees_enabled: boolean;
  process_fees_setting_present: boolean;
  candidates: FeeSimulationCandidate[];
}

export function useFeeSimulator() {
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      rpc<FeeSimulationResult>('license_fee_simulate', { _payload: payload }),
  });
}

export interface ProcessPreviewStep {
  order: number;
  key: string;
  name: string;
  kind: string;
  role: string | null;
  sla_days: number | null;
  verification: boolean;
  forms: boolean;
  documents: boolean;
  rfi: boolean;
  maker_checker: boolean;
  notifications: string[];
  entry_blockers: string[];
  exit_blockers: string[];
  conditional: boolean;
  fee: { fee_type_code?: string; optional?: boolean; gate_policy?: string } | null;
  fee_state: 'not_applicable' | 'not_configured' | 'enabled' | 'disabled';
  resolved_fee: FeeSimulationCandidate | null;
  resolved_verification: {
    template_key: string | null;
    version: number;
    active: boolean;
    purpose: string;
    mandatory_items: number;
    total_items: number;
  } | null;
}

export interface ProcessPreviewResult {
  resolved: boolean;
  reason?: string;
  process_code?: string;
  template_key?: string;
  template_version?: number;
  template_name?: string;
  template_active?: boolean;
  purpose?: string;
  matter_kind?: string;
  steps?: ProcessPreviewStep[];
}

export function useProcessPreview() {
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      rpc<ProcessPreviewResult>('process_preview', { _payload: payload }),
  });
}
