/**
 * Supervisory policy components — governed read/write layer.
 *
 * A policy component is one versioned configuration package for a supervisory
 * policy area (sector overlay, fact configuration, source bindings, evidence,
 * materiality, judgement/override, supervisory response, SLA, dashboard,
 * notification). Every read comes from a `supervisory_policy_component_*` read
 * model and every write from a governed RPC; the server owns validation,
 * authority, maker/checker, lifecycle and immutability. Nothing is decided here.
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

export type PolicyComponentStatus =
  | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'ACTIVE' | 'SUPERSEDED' | 'RETIRED' | string;

export interface PolicyComponentContract {
  collection: string;
  item_label: string;
  required_fields: string[];
  enums?: Record<string, string[]>;
  enum_arrays?: Record<string, string[]>;
  non_empty_arrays?: string[];
  positive_numbers?: string[];
  booleans?: string[];
  runtime?: string | null;
}

export interface PolicyComponentTypeOption {
  component_type: string;
  label: string;
  description: string | null;
  authorable: boolean;
  contract: PolicyComponentContract | null;
}

export interface PolicyComponentRow {
  id: string;
  component_type: string;
  type_label: string;
  code: string;
  component_version: string;
  name: string;
  domain_code: string;
  regulator_id: string | null;
  regulator_code: string | null;
  status: PolicyComponentStatus;
  origin: string;
  item_count: number | null;
  is_valid: boolean | null;
  effective_from: string | null;
  effective_to: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  activated_at: string | null;
  updated_at: string;
}

export interface PolicyComponentRegisterResult {
  total: number;
  rows: PolicyComponentRow[];
  types: PolicyComponentTypeOption[];
}

export interface PolicyComponentValidation {
  valid: boolean;
  item_count: number;
  errors: string[];
  contract: PolicyComponentContract | null;
}

export interface PolicyComponentDetail {
  component: {
    id: string;
    component_type: string;
    type_label: string;
    code: string;
    component_version: string;
    name: string;
    purpose: string | null;
    domain_code: string;
    regulator_id: string | null;
    sector_id: string | null;
    status: PolicyComponentStatus;
    origin: string;
    content: Record<string, unknown>;
    effective_from: string | null;
    effective_to: string | null;
    notes: string | null;
    supersedes_id: string | null;
    submitted_by: string | null;
    submitted_at: string | null;
    approved_by: string | null;
    approved_at: string | null;
    activated_at: string | null;
    retired_at: string | null;
    created_at: string;
    updated_at: string;
  };
  contract: PolicyComponentContract | null;
  validation: PolicyComponentValidation;
  capabilities: {
    can_manage: boolean;
    can_approve: boolean;
    can_edit: boolean;
    can_submit: boolean;
    can_return: boolean;
    can_approve_now: boolean;
    can_activate: boolean;
    can_retire: boolean;
    can_new_version: boolean;
  };
  history: Array<{
    id: string;
    event_type: string;
    from_status: string | null;
    to_status: string | null;
    rationale: string | null;
    actor_id: string | null;
    detail: Record<string, unknown>;
    created_at: string;
  }>;
}

export interface PolicyComponentQueueRow {
  id: string;
  component_type: string;
  type_label: string;
  code: string;
  component_version: string;
  name: string;
  domain_code: string;
  regulator_id: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  status: string;
}

export interface PolicyComponentReferenceOption { value: string; label: string }

export interface PolicyComponentReferenceField {
  source: string;
  label: string;
  multiple: boolean;
  options: PolicyComponentReferenceOption[];
}

/**
 * Canonical master-data options for the lookup fields of one component type.
 * The server publishes the permitted codes; unknown codes are refused on save.
 */
export function usePolicyComponentReferenceOptions(params: {
  componentType?: string | null;
  domainCode?: string | null;
  regulatorId?: string | null;
}) {
  return useQuery({
    queryKey: ['supervisory-policy-component-references', params],
    enabled: !!params.componentType,
    staleTime: 5 * 60 * 1000,
    queryFn: () => rpc<Record<string, PolicyComponentReferenceField>>(
      'supervisory_policy_component_reference_options', {
        _component_type: params.componentType,
        _domain_code: params.domainCode ?? null,
        _regulator_id: params.regulatorId ?? null,
      }),
  });
}

export function usePolicyComponents(params: {
  componentType?: string | null;
  domainCode?: string | null;
  status?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['supervisory-policy-components', params],
    queryFn: () => rpc<PolicyComponentRegisterResult>('supervisory_policy_component_register', {
      _component_type: params.componentType ?? null,
      _domain_code: params.domainCode ?? null,
      _status: params.status ?? null,
      _search: params.search ?? null,
      _limit: params.limit ?? 100,
      _offset: params.offset ?? 0,
    }),
  });
}

export function usePolicyComponentDetail(componentId?: string) {
  return useQuery({
    queryKey: ['supervisory-policy-component', componentId],
    enabled: !!componentId,
    queryFn: () => rpc<PolicyComponentDetail>('supervisory_policy_component_detail', {
      _component_id: componentId,
    }),
  });
}

export function usePolicyComponentApprovalQueue() {
  return useQuery({
    queryKey: ['supervisory-policy-component-queue'],
    queryFn: () => rpc<PolicyComponentQueueRow[]>('supervisory_policy_component_approval_queue'),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (componentId?: string) => {
    qc.invalidateQueries({ queryKey: ['supervisory-policy-components'] });
    qc.invalidateQueries({ queryKey: ['supervisory-policy-component-queue'] });
    if (componentId) qc.invalidateQueries({ queryKey: ['supervisory-policy-component', componentId] });
    qc.invalidateQueries({ queryKey: ['supervisory-policy-profile'] });
  };
}

export function useCreatePolicyComponent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      rpc<{ component_id: string }>('supervisory_policy_component_create', { _payload: payload }),
    onSuccess: (r) => invalidate(r.component_id),
  });
}

export function useSavePolicyComponent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ componentId, payload }: { componentId: string; payload: Record<string, unknown> }) =>
      rpc<{ component_id: string }>('supervisory_policy_component_save', {
        _component_id: componentId, _payload: payload,
      }),
    onSuccess: (r) => invalidate(r.component_id),
  });
}

export function usePolicyComponentLifecycle() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ componentId, toStatus, rationale }: {
      componentId: string; toStatus: string; rationale: string;
    }) => rpc<{ component_id: string; status: string }>('supervisory_policy_component_lifecycle', {
      _component_id: componentId, _to_status: toStatus, _rationale: rationale,
    }),
    onSuccess: (r) => invalidate(r.component_id),
  });
}

export function useNewPolicyComponentVersion() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ componentId, newVersion, rationale }: {
      componentId: string; newVersion: string; rationale: string;
    }) => rpc<{ component_id: string }>('supervisory_policy_component_new_version', {
      _component_id: componentId, _new_version: newVersion, _rationale: rationale,
    }),
    onSuccess: (r) => invalidate(r.component_id),
  });
}
