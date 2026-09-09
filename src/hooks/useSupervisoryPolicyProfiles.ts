/**
 * Supervisory Policy Profile administration — governed read/action layer.
 *
 * The Policy Profile is a generic supervisory-platform capability: it is the
 * governed container that binds the exact versions of the policy components a
 * regulator applies in a supervisory domain. AML/CFT is the first consumer; no
 * domain is hardcoded anywhere in this layer.
 *
 * EVERY read goes through a `supervisory_policy_profile_*` read model and every
 * write through a governed RPC. Nothing here decides authority — the server
 * does, and `supervisory_policy_profile_action_capabilities` is the only source
 * of what the signed-in officer may do.
 *
 * Deliberate boundary: policy profiles govern CONFIGURATION only in this wave.
 * Operational assessment resolution still runs through
 * `supervisory_methodology_resolve` and is untouched.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

/* --------------------------------------------------------------- types */

export type PolicyProfileStatus =
  | 'DRAFT' | 'REVIEW' | 'APPROVED' | 'ACTIVE' | 'SUPERSEDED' | 'RETIRED' | string;
export type PolicyProfileOrigin =
  | 'MIPL_REFERENCE' | 'REGULATOR_ADOPTED' | 'REGULATOR_AUTHORED' | string;
export type ComponentRequirement = 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE';

export interface PolicyProfileRow {
  id: string;
  code: string;
  profile_version: string;
  domain_code: string;
  regulator_id: string | null;
  regulator_code: string | null;
  regulator_name: string | null;
  sector_id: string | null;
  name: string;
  title: string | null;
  status: PolicyProfileStatus;
  origin: PolicyProfileOrigin;
  origin_label: string | null;
  adopted_from_id: string | null;
  supersedes_id: string | null;
  effective_from: string | null;
  effective_to: string | null;
  required_components: number;
  bound_components: number;
  created_at: string;
  updated_at: string;
}

export interface PolicyProfileRegisterResult {
  rows: PolicyProfileRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface PolicyProfileRegisterOptions {
  domains: Array<{ domain_code: string; policy_approval_permission: string | null }>;
  statuses: string[];
  origins: string[];
  component_types: Array<{
    component_type: string;
    label: string;
    description: string | null;
    is_available: boolean;
    default_requirement: ComponentRequirement;
  }>;
  regulators: Array<{ id: string; code: string; name: string; status?: string }>;
  /** Canonical effective-regulator contract (active + authorised only). */
  selectable_regulator_count?: number;
  cross_regulator_allowed?: boolean;
  active_regulator?: { id: string; code: string; name: string } | null;
  regulator_scope_reason?: string | null;
}

export interface PolicyComponentReadiness {
  component_type: string;
  label: string;
  is_available: boolean;
  /** Effective requirement resolved server-side (domain floor + profile request). */
  requirement: ComponentRequirement;
  profile_requirement: ComponentRequirement | null;
  domain_requirement: ComponentRequirement | null;
  domain_requirement_locked: boolean;
  domain_requirement_reason: string | null;
  requirement_editable: boolean;
  required_for_approval: boolean;
  required_for_activation: boolean;
  requirement_rationale: string | null;
  state: string;
  detail: string | null;
  bound_component_id: string | null;
  bound_component_code: string | null;
  bound_component_version: string | null;
  bound_component_table: string | null;
  bound_status_at_binding: string | null;
  bound_status_now: string | null;
  bound_at: string | null;
}

export interface PolicyProfileReadiness {
  profile_id: string;
  status: PolicyProfileStatus;
  origin: PolicyProfileOrigin;
  is_ready_for_approval: boolean;
  is_ready_for_activation: boolean;
  blockers: string[];
  activation_blockers: string[];
  required_count: number;
  satisfied_count: number;
  components: PolicyComponentReadiness[];
}


export interface PolicyProfileDetail {
  id: string;
  code: string;
  profile_version: string;
  domain_code: string;
  regulator_id: string | null;
  regulator_code: string | null;
  regulator_name: string | null;
  sector_id: string | null;
  name: string;
  title: string | null;
  purpose: string | null;
  notes: string | null;
  status: PolicyProfileStatus;
  origin: PolicyProfileOrigin;
  origin_label: string | null;
  adopted_from: { id: string; code: string; profile_version: string; status: string; origin: string } | null;
  supersedes: { id: string; code: string; profile_version: string; status: string } | null;
  effective_from: string | null;
  effective_to: string | null;
  created_by: string | null;
  created_by_name: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  activated_at: string | null;
  superseded_at: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
  sibling_versions: Array<{ id: string; profile_version: string; status: string; origin: string; updated_at: string }>;
  readiness: PolicyProfileReadiness;
  event_count: number;
}

export interface PolicyCapability {
  allowed: boolean;
  reason: string | null;
  requires_rationale?: boolean;
  target_count?: number;
  note?: string;
}

export interface PolicyProfileCapabilities {
  profile_id: string;
  status: PolicyProfileStatus;
  origin: PolicyProfileOrigin;
  domain_code: string;
  is_platform_administrator: boolean;
  can_edit: PolicyCapability;
  can_bind_components: PolicyCapability;
  can_adopt: PolicyCapability;
  can_submit_review: PolicyCapability;
  can_return_to_draft: PolicyCapability;
  can_approve: PolicyCapability;
  can_activate: PolicyCapability;
  can_retire: PolicyCapability;
  can_new_version: PolicyCapability;
  maker_checker: {
    author_id: string | null;
    author_name: string | null;
    submitted_by: string | null;
    submitted_by_name: string | null;
    submitted_at: string | null;
    actor_is_author: boolean;
    actor_is_submitter: boolean;
  };
}

export interface PolicyComponentCandidates {
  component_type: string;
  is_available: boolean;
  candidates: Array<{
    component_id: string;
    component_code: string;
    component_version: string;
    component_status: string;
    origin: string;
    name: string | null;
    label: string;
  }>;
}

export interface PolicyProfileEventRow {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  rationale: string | null;
  actor_id: string | null;
  actor_name: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface PolicyProfileCompare {
  subject: { id: string; code: string; profile_version: string; status: string };
  baseline: { id: string; code: string; profile_version: string; status: string };
  changed_count: number;
  components: Array<{
    component_type: string;
    label: string;
    subject_requirement: ComponentRequirement;
    baseline_requirement: ComponentRequirement;
    requirement_changed: boolean;
    subject_component: { component_id: string; component_code: string; component_version: string } | null;
    baseline_component: { component_id: string; component_code: string; component_version: string } | null;
    binding_changed: boolean;
  }>;
}

/* --------------------------------------------------------------- keys */

export const policyProfileKeys = {
  all: ['supervisory-policy-profile'] as const,
  register: (a: unknown) => ['supervisory-policy-profile', 'register', a] as const,
  options: () => ['supervisory-policy-profile', 'options'] as const,
  detail: (id?: string) => ['supervisory-policy-profile', 'detail', id] as const,
  readiness: (id?: string) => ['supervisory-policy-profile', 'readiness', id] as const,
  capabilities: (id?: string) => ['supervisory-policy-profile', 'capabilities', id] as const,
  candidates: (id?: string, t?: string) => ['supervisory-policy-profile', 'candidates', id, t] as const,
  events: (id?: string) => ['supervisory-policy-profile', 'events', id] as const,
  compare: (id?: string, b?: string) => ['supervisory-policy-profile', 'compare', id, b] as const,
  resolve: (a: unknown) => ['supervisory-policy-profile', 'resolve', a] as const,
};

/* --------------------------------------------------------------- reads */

export function useSupervisoryPolicyProfiles(args: {
  search?: string | null;
  domainCode?: string | null;
  origin?: string | null;
  status?: string | null;
  regulatorId?: string | null;
  sortKey?: string;
  sortDirection?: string;
  page: number;
  pageSize: number;
}) {
  return useQuery({
    queryKey: policyProfileKeys.register(args),
    queryFn: () => rpc<PolicyProfileRegisterResult>('supervisory_policy_profile_register', {
      _search: args.search ?? null,
      _domain_code: args.domainCode ?? null,
      _origin: args.origin ?? null,
      _status: args.status ?? null,
      _regulator_id: args.regulatorId ?? null,
      _sort: args.sortKey ?? 'updated_at',
      _dir: args.sortDirection ?? 'desc',
      _limit: args.pageSize,
      _offset: Math.max(0, (args.page - 1) * args.pageSize),
    }),
    staleTime: 30_000,
  });
}

export function useSupervisoryPolicyProfileOptions() {
  return useQuery({
    queryKey: policyProfileKeys.options(),
    queryFn: () => rpc<PolicyProfileRegisterOptions>('supervisory_policy_profile_register_options'),
    staleTime: 300_000,
  });
}

export function useSupervisoryPolicyProfile(profileId?: string) {
  return useQuery({
    queryKey: policyProfileKeys.detail(profileId),
    queryFn: () => rpc<PolicyProfileDetail>('supervisory_policy_profile_detail', { _profile_id: profileId }),
    enabled: !!profileId,
    staleTime: 15_000,
  });
}

export function useSupervisoryPolicyProfileGovernance(profileId?: string) {
  const readiness = useQuery({
    queryKey: policyProfileKeys.readiness(profileId),
    queryFn: () => rpc<PolicyProfileReadiness>('supervisory_policy_profile_readiness', { _profile_id: profileId }),
    enabled: !!profileId,
    staleTime: 15_000,
  });
  const capabilities = useQuery({
    queryKey: policyProfileKeys.capabilities(profileId),
    queryFn: () => rpc<PolicyProfileCapabilities>('supervisory_policy_profile_action_capabilities', { _profile_id: profileId }),
    enabled: !!profileId,
    staleTime: 15_000,
  });
  return { readiness, capabilities };
}

export function useSupervisoryPolicyComponentCandidates(profileId?: string, componentType?: string, enabled = true) {
  return useQuery({
    queryKey: policyProfileKeys.candidates(profileId, componentType),
    queryFn: () => rpc<PolicyComponentCandidates>('supervisory_policy_profile_component_candidates', {
      _profile_id: profileId, _component_type: componentType,
    }),
    enabled: !!profileId && !!componentType && enabled,
    staleTime: 30_000,
  });
}

export function useSupervisoryPolicyProfileEvents(profileId?: string) {
  return useQuery({
    queryKey: policyProfileKeys.events(profileId),
    queryFn: () => rpc<{ rows: PolicyProfileEventRow[]; total: number }>(
      'supervisory_policy_profile_event_register', { _profile_id: profileId, _limit: 100, _offset: 0 }),
    enabled: !!profileId,
    staleTime: 15_000,
  });
}

export function useSupervisoryPolicyProfileCompare(profileId?: string, baselineId?: string) {
  return useQuery({
    queryKey: policyProfileKeys.compare(profileId, baselineId),
    queryFn: () => rpc<PolicyProfileCompare>('supervisory_policy_profile_compare', {
      _profile_id: profileId, _baseline_id: baselineId,
    }),
    enabled: !!profileId && !!baselineId,
    staleTime: 30_000,
  });
}

export function useSupervisoryPolicyProfileResolution(args: {
  domainCode?: string | null;
  regulatorId?: string | null;
  sectorId?: string | null;
  asOf?: string | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: policyProfileKeys.resolve(args),
    queryFn: () => rpc<Record<string, unknown>>('supervisory_policy_profile_resolve', {
      _domain_code: args.domainCode,
      _regulator_id: args.regulatorId ?? null,
      _sector_id: args.sectorId ?? null,
      _as_of: args.asOf ?? null,
    }),
    enabled: !!args.domainCode && args.enabled !== false,
    staleTime: 60_000,
  });
}

/* ----------------------------------------------------------- mutations */

function useProfileInvalidation() {
  const qc = useQueryClient();
  return (profileId?: string) => {
    qc.invalidateQueries({ queryKey: policyProfileKeys.all });
    if (profileId) {
      qc.invalidateQueries({ queryKey: policyProfileKeys.detail(profileId) });
      qc.invalidateQueries({ queryKey: policyProfileKeys.readiness(profileId) });
      qc.invalidateQueries({ queryKey: policyProfileKeys.capabilities(profileId) });
      qc.invalidateQueries({ queryKey: policyProfileKeys.events(profileId) });
    }
  };
}

export function useCreatePolicyProfile() {
  const invalidate = useProfileInvalidation();
  return useMutation({
    mutationFn: (payload: {
      code: string; profile_version: string; domain_code: string; regulator_id?: string | null;
      name: string; title?: string | null; purpose?: string | null; rationale?: string | null;
    }) => rpc<string>('supervisory_policy_profile_create', { _payload: payload }),
    onSuccess: (id) => invalidate(id),
  });
}

export function useSavePolicyProfile() {
  const invalidate = useProfileInvalidation();
  return useMutation({
    mutationFn: (v: { profileId: string; payload: Record<string, unknown> }) =>
      rpc<string>('supervisory_policy_profile_save', { _profile_id: v.profileId, _payload: v.payload }),
    onSuccess: (_d, v) => invalidate(v.profileId),
  });
}

export function useAdoptPolicyProfileReference() {
  const invalidate = useProfileInvalidation();
  return useMutation({
    mutationFn: (v: { referenceId: string; regulatorId: string; rationale: string }) =>
      rpc<string>('supervisory_policy_profile_adopt_reference', {
        _reference_profile_id: v.referenceId, _regulator_id: v.regulatorId, _rationale: v.rationale,
      }),
    onSuccess: (id, v) => { invalidate(v.referenceId); invalidate(id); },
  });
}

export function useNewPolicyProfileVersion() {
  const invalidate = useProfileInvalidation();
  return useMutation({
    mutationFn: (v: { profileId: string; newVersion: string; rationale: string }) =>
      rpc<string>('supervisory_policy_profile_new_version', {
        _profile_id: v.profileId, _new_version: v.newVersion, _rationale: v.rationale,
      }),
    onSuccess: (id, v) => { invalidate(v.profileId); invalidate(id); },
  });
}

export function useSetPolicyComponentBinding() {
  const invalidate = useProfileInvalidation();
  return useMutation({
    mutationFn: (v: { profileId: string; componentType: string; componentId: string; rationale?: string }) =>
      rpc<string>('supervisory_policy_profile_binding_set', {
        _profile_id: v.profileId,
        _payload: { component_type: v.componentType, component_id: v.componentId, rationale: v.rationale ?? null },
      }),
    onSuccess: (_d, v) => invalidate(v.profileId),
  });
}

export function useClearPolicyComponentBinding() {
  const invalidate = useProfileInvalidation();
  return useMutation({
    mutationFn: (v: { profileId: string; componentType: string; rationale: string }) =>
      rpc<boolean>('supervisory_policy_profile_binding_clear', {
        _profile_id: v.profileId, _component_type: v.componentType, _rationale: v.rationale,
      }),
    onSuccess: (_d, v) => invalidate(v.profileId),
  });
}

export function useSetPolicyComponentRequirement() {
  const invalidate = useProfileInvalidation();
  return useMutation({
    mutationFn: (v: { profileId: string; componentType: string; requirement: ComponentRequirement; rationale?: string }) =>
      rpc<string>('supervisory_policy_profile_requirement_set', {
        _profile_id: v.profileId,
        _payload: { component_type: v.componentType, requirement: v.requirement, rationale: v.rationale ?? null },
      }),
    onSuccess: (_d, v) => invalidate(v.profileId),
  });
}

export function usePolicyProfileLifecycleTransition() {
  const invalidate = useProfileInvalidation();
  return useMutation({
    mutationFn: (v: { profileId: string; toStatus: string; rationale?: string }) =>
      rpc<{ id: string; status: string; superseded_profiles: number }>('supervisory_policy_profile_lifecycle', {
        _profile_id: v.profileId, _to_status: v.toStatus, _rationale: v.rationale ?? null,
      }),
    onSuccess: (_d, v) => invalidate(v.profileId),
  });
}
