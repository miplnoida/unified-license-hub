/**
 * GAP-F1-01 — decision authority configuration (read + governed writes).
 *
 * Every write goes through `public.decision_authority_rule_upsert` /
 * `public.decision_authority_rule_set_status`, which enforce
 * `role_management.manage_config`, validate effective-date conflicts and record
 * a before/after entry in `public.config_change_log`. The browser never writes
 * `decision_authority_rules` directly.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type EnforcementMode = 'OFF' | 'OBSERVE_ONLY' | 'ENFORCED';

export interface DecisionAuthorityRule {
  id: string;
  decision_type: string;
  enforcement_mode: EnforcementMode;
  status: 'active' | 'retired';
  required_module_key: string | null;
  required_permission_key: string | null;
  requires_maker_checker: boolean | null;
  requires_committee: boolean | null;
  committee_kind: string | null;
  minimum_quorum: number | null;
  requires_conflict_clearance: boolean | null;
  allow_delegation: boolean | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  regulator_id: string | null;
  regulatory_function_id: string | null;
  sector_id: string | null;
  sub_sector_id: string | null;
  service_id: string | null;
  regulator_name: string | null;
  regulatory_function_name: string | null;
  sector_name: string | null;
  sub_sector_name: string | null;
  service_name: string | null;
  observation_count: number;
  would_deny_count: number;
}

export interface DecisionAuthorityObservationSummary {
  decision_type: string;
  evaluated_mode: string | null;
  evaluations: number;
  would_deny: number;
  last_evaluated_at: string | null;
}

export interface DecisionAuthorityObservation {
  id: string;
  decision_type: string;
  evaluated_mode: string | null;
  would_allow: boolean | null;
  reasons: unknown;
  subject_reference: string | null;
  actor_id: string | null;
  created_at: string;
}

export interface DecisionAuthorityOverview {
  generated_at: string;
  rules: DecisionAuthorityRule[];
  observation_summary: DecisionAuthorityObservationSummary[];
  recent_observations: DecisionAuthorityObservation[];
  decision_type_census: { decision_type: string; services: number }[];
}

export interface DecisionAuthorityRuleInput {
  id?: string | null;
  decision_type: string;
  regulator_id?: string | null;
  regulatory_function_id?: string | null;
  sector_id?: string | null;
  sub_sector_id?: string | null;
  service_id?: string | null;
  required_module_key?: string | null;
  required_permission_key?: string | null;
  requires_maker_checker?: boolean;
  requires_committee?: boolean;
  committee_kind?: string | null;
  minimum_quorum?: number | null;
  requires_conflict_clearance?: boolean;
  allow_delegation?: boolean;
  enforcement_mode: EnforcementMode;
  notes?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  reason?: string | null;
}

const QUERY_KEY = ['decision-authority-overview'];

function toError(error: { message?: string } | null): Error {
  const raw = error?.message ?? '';
  if (raw.includes('not_authorised')) {
    return new Error('You do not have permission to configure decision authority.');
  }
  if (raw.includes('decision_authority_conflict')) {
    return new Error('Another active rule already covers this scope and period. Retire or re-date it first.');
  }
  if (raw.includes('enforced_rule_needs_requirement')) {
    return new Error('An enforced rule must require a permission or a committee.');
  }
  if (raw.includes('invalid_effective_window')) {
    return new Error('The end date must be after the start date.');
  }
  if (raw.includes('decision_type_required')) {
    return new Error('A decision type is required.');
  }
  return new Error(raw || 'Could not save the decision authority rule.');
}

export function useDecisionAuthorityOverview() {
  return useQuery({
    queryKey: QUERY_KEY,
    staleTime: 15_000,
    queryFn: async (): Promise<DecisionAuthorityOverview> => {
      const { data, error } = await supabase.rpc('decision_authority_overview' as never);
      if (error) throw toError(error);
      return data as unknown as DecisionAuthorityOverview;
    },
  });
}

export function useDecisionAuthorityMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QUERY_KEY });
    qc.invalidateQueries({ queryKey: ['service-configuration-completeness'] });
  };

  const save = useMutation({
    mutationFn: async (input: DecisionAuthorityRuleInput) => {
      const { data, error } = await supabase.rpc('decision_authority_rule_upsert' as never, {
        _decision_type: input.decision_type,
        _regulator_id: input.regulator_id ?? null,
        _regulatory_function_id: input.regulatory_function_id ?? null,
        _sector_id: input.sector_id ?? null,
        _sub_sector_id: input.sub_sector_id ?? null,
        _service_id: input.service_id ?? null,
        _required_module_key: input.required_module_key ?? null,
        _required_permission_key: input.required_permission_key ?? null,
        _requires_maker_checker: input.requires_maker_checker ?? true,
        _requires_committee: input.requires_committee ?? false,
        _committee_kind: input.committee_kind ?? null,
        _minimum_quorum: input.minimum_quorum ?? null,
        _requires_conflict_clearance: input.requires_conflict_clearance ?? true,
        _allow_delegation: input.allow_delegation ?? true,
        _enforcement_mode: input.enforcement_mode,
        _notes: input.notes ?? null,
        _id: input.id ?? null,
        _effective_from: input.effective_from ?? null,
        _effective_to: input.effective_to ?? null,
        _reason: input.reason ?? null,
      } as never);
      if (error) throw toError(error);
      return data as unknown as string;
    },
    onSuccess: invalidate,
  });

  const setStatus = useMutation({
    mutationFn: async (args: { id: string; status: 'active' | 'retired'; reason?: string | null }) => {
      const { error } = await supabase.rpc('decision_authority_rule_set_status' as never, {
        _id: args.id, _status: args.status, _reason: args.reason ?? null,
      } as never);
      if (error) throw toError(error);
    },
    onSuccess: invalidate,
  });

  return { save, setStatus };
}
