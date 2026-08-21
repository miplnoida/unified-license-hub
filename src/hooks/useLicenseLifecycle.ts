/**
 * P04 Licence Lifecycle — canonical read-model hooks.
 *
 * Every regulatory value (stage, priority, SLA, waiting-on, blockers, next
 * action, renewal window) comes from the server read models
 * (`license_case`, `license_register_page`, `license_lifecycle_work_queue`).
 * The browser renders; it never derives licence lifecycle meaning.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Server-owned licence lifecycle action availability. Computed by
 * `license_lifecycle_available_actions()` — the same authority the governed
 * `license_lifecycle_action()` RPC re-validates against. The browser MUST NOT
 * infer eligibility.
 */
export interface LicenseAvailableAction {
  key: string;
  label: string;
  permission: string;
  adverse: boolean;
  requires_reason: boolean;
  blockers: Array<{ key: string; label: string; href?: string }>;
  section?: string | null;
  href?: string | null;
}

export interface LicenseCaseHeaderModel {
  license_id: string;
  reference: string;
  subject: string;
  entity_id: string | null;
  case_type: string | null;
  stage: string;
  status: string;
  owner_id: string | null;
  owner_name: string | null;
  team: string | null;
  priority: string;
  priority_reason: string | null;
  sla_due_at: string | null;
  sla_state: string;
  waiting_on: string;
  blockers: Array<{ key: string; label: string; href?: string }>;
  next_action: { key: string; label: string; href?: string; permission?: string } | null;
  available_actions: LicenseAvailableAction[];
  last_activity_at: string | null;
  issued_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  application_id: string | null;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
}

export interface LicenseLifecycleMatter {
  id: string;
  license_id: string;
  matter_kind: string;
  status: string;
  title: string | null;
  reason: string | null;
  decision: string | null;
  renewal_id: string | null;
  due_at: string | null;
  waiting_on: string;
  opened_at: string;
  closed_at: string | null;
}

export interface LicenseCaseModel {
  header: LicenseCaseHeaderModel;
  policy: {
    cycle_type: string;
    period_days: number;
    grace_period_days: number;
    renewal_window_days: number;
    reminder_days: number[];
  };
  available_actions: LicenseAvailableAction[];
  counts: { open_conditions: number; overdue_conditions: number };
  open_matter: LicenseLifecycleMatter | null;
  matters: LicenseLifecycleMatter[];
  renewals: Array<Record<string, unknown>>;
  conditions: Array<Record<string, unknown>>;
  history: Array<Record<string, unknown>>;
  appeals: Array<Record<string, unknown>>;
  enforcement: Array<Record<string, unknown>>;
  audience: 'internal' | 'external';
}

export interface LicenseRegisterRow {
  license_id: string;
  license_number: string;
  entity_id: string | null;
  entity_name: string | null;
  license_type: string | null;
  status: string;
  issued_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  sla_state: string;
  days_to_expiry: number | null;
  open_conditions: number;
  overdue_conditions: number;
  open_matter_kind: string | null;
  next_action: string | null;
  total_count: number;
}

export interface LicenseLifecycleQueueRow {
  work_kind: string;
  object_type: string;
  object_id: string;
  license_id: string;
  reference: string;
  entity_id: string | null;
  entity_name: string | null;
  stage: string;
  status: string;
  priority: string;
  sla_due_at: string | null;
  sla_state: string;
  waiting_on: string;
  next_action: string | null;
  canonical_href: string;
  last_activity_at: string | null;
  total_count: number;
}

export function useLicenseCase(licenseId: string | null | undefined, audience: 'internal' | 'external' = 'internal') {
  return useQuery({
    queryKey: ['license-case', licenseId, audience],
    enabled: !!licenseId,
    staleTime: 15_000,
    queryFn: async (): Promise<LicenseCaseModel> => {
      const { data, error } = await supabase.rpc('license_case' as never, {
        _license_id: licenseId,
        _audience: audience,
      } as never);
      if (error) throw error;
      return data as unknown as LicenseCaseModel;
    },
  });
}

export interface LicenseRegisterFilters {
  search?: string | null;
  status?: string | null;
  sectorId?: string | null;
  slaState?: string | null;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function useLicenseRegister(filters: LicenseRegisterFilters) {
  return useQuery({
    queryKey: ['license-register', filters],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('license_register_page' as never, {
        _search: filters.search?.trim() ? filters.search.trim() : null,
        _status: filters.status && filters.status !== 'all' ? filters.status : null,
        _sector_id: filters.sectorId ?? null,
        _sla_state: filters.slaState && filters.slaState !== 'all' ? filters.slaState : null,
        _page: filters.page ?? 0,
        _page_size: filters.pageSize ?? 25,
        _sort_by: filters.sortBy ?? 'valid_until',
        _sort_dir: filters.sortDir ?? 'asc',
      } as never);
      if (error) throw error;
      const rows = (data as unknown as LicenseRegisterRow[]) ?? [];
      return { rows, total: rows.length ? Number(rows[0].total_count) : 0 };
    },
  });
}

export function useLicenseLifecycleQueue(params: { kinds?: string[] | null; search?: string | null; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['license-lifecycle-queue', params],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('license_lifecycle_work_queue' as never, {
        _kinds: params.kinds && params.kinds.length ? params.kinds : null,
        _search: params.search?.trim() ? params.search.trim() : null,
        _page: params.page ?? 0,
        _page_size: params.pageSize ?? 25,
      } as never);
      if (error) throw error;
      const rows = (data as unknown as LicenseLifecycleQueueRow[]) ?? [];
      return { rows, total: rows.length ? Number(rows[0].total_count) : 0 };
    },
  });
}

export function useLicenseLifecycleQueueCounts() {
  return useQuery({
    queryKey: ['license-lifecycle-queue-counts'],
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc('license_lifecycle_work_queue_counts' as never, {} as never);
      if (error) throw error;
      return (data as unknown as Record<string, number>) ?? {};
    },
  });
}

export type LicenseLifecycleActionKey =
  | 'START_RENEWAL'
  | 'REQUEST_RENEWAL_INFORMATION'
  | 'APPROVE_RENEWAL'
  | 'REFUSE_RENEWAL'
  | 'APPLY_VARIATION'
  | 'APPROVE_VARIATION'
  | 'BEGIN_SUSPENSION'
  | 'SUSPEND'
  | 'REINSTATE'
  | 'BEGIN_REVOCATION'
  | 'REVOKE'
  | 'BEGIN_SURRENDER'
  | 'ACCEPT_SURRENDER'
  | 'MARK_EXPIRED';

export function useLicenseLifecycleAction(licenseId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { actionKey: LicenseLifecycleActionKey; reason?: string | null; payload?: Record<string, unknown> }) => {
      const { data, error } = await supabase.rpc('license_lifecycle_action' as never, {
        _license_id: licenseId,
        _action_key: args.actionKey,
        _payload: (args.payload ?? {}) as never,
        _reason: args.reason ?? null,
      } as never);
      if (error) throw error;
      return data as unknown as LicenseCaseModel;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license-case', licenseId] });
      qc.invalidateQueries({ queryKey: ['license-register'] });
      qc.invalidateQueries({ queryKey: ['license-lifecycle-queue'] });
      qc.invalidateQueries({ queryKey: ['license-lifecycle-queue-counts'] });
    },
  });
}
