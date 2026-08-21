/**
 * EPR-05 — P03 Licensing canonical read-model hooks.
 *
 * Every value consumed by the licensing queue and case workspace comes from the
 * server (`application_work_queue`, `application_work_queue_counts`,
 * `application_case`). No SLA, priority, stage or eligibility semantics are
 * derived in the client.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ApplicationQueueRow {
  application_id: string;
  application_number: string;
  applicant_id: string | null;
  applicant_name: string | null;
  entity_id: string | null;
  entity_name: string | null;
  application_category: string | null;
  license_type: string | null;
  stage: string;
  stage_label: string;
  status: string;
  status_label: string;
  owner_user_id: string | null;
  owner_name: string | null;
  team: string | null;
  priority: string;
  priority_reason: string | null;
  priority_source: string | null;
  sla_due_at: string | null;
  sla_state: string | null;
  waiting_on: string | null;
  blocker_count: number;
  blockers: Array<{ code: string; label: string; href?: string | null; severity?: string }> | null;
  next_action_code: string | null;
  next_action_label: string | null;
  next_action_permission: string | null;
  next_action_href: string | null;
  submitted_at: string | null;
  last_activity_at: string | null;
  current_workflow_step: string | null;
  canonical_href: string;
  total_count: number;
}

export interface ApplicationQueueFilters {
  stages?: string[] | null;
  statuses?: string[] | null;
  slaStates?: string[] | null;
  waitingOn?: string | null;
  categories?: string[] | null;
  licenseType?: string | null;
  entityId?: string | null;
  regulatorId?: string | null;
  sectorId?: string | null;
  assignedTo?: string | null;
  unassigned?: boolean;
  priorities?: string[] | null;
  submittedFrom?: string | null;
  submittedTo?: string | null;
  search?: string | null;
  includeClosed?: boolean;
  includeDrafts?: boolean;
  sort?: string;
  limit?: number;
  offset?: number;
}

export interface ApplicationQueueCounts {
  total_open: number;
  awaiting_triage: number;
  sufficiency_review: number;
  under_review: number;
  awaiting_applicant: number;
  decision_ready: number;
  authorisation: number;
  breached: number;
  due_soon: number;
  unassigned: number;
  closed: number;
  by_stage: Record<string, number>;
  by_priority: Record<string, number>;
}

const nz = <T,>(v: T | null | undefined): T | null => (v === undefined ? null : v);

export function useApplicationWorkQueue(filters: ApplicationQueueFilters) {
  return useQuery({
    queryKey: ['application-work-queue', filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('application_work_queue', {
        _stages: nz(filters.stages),
        _statuses: nz(filters.statuses),
        _sla_states: nz(filters.slaStates),
        _waiting_on: nz(filters.waitingOn),
        _categories: nz(filters.categories),
        _license_type: nz(filters.licenseType),
        _entity_id: nz(filters.entityId),
        _regulator_id: nz(filters.regulatorId),
        _sector_id: nz(filters.sectorId),
        _assigned_to: nz(filters.assignedTo),
        _unassigned: filters.unassigned ?? false,
        _priorities: nz(filters.priorities),
        _submitted_from: nz(filters.submittedFrom),
        _submitted_to: nz(filters.submittedTo),
        _search: filters.search?.trim() ? filters.search.trim() : null,
        _include_closed: filters.includeClosed ?? false,
        _include_drafts: filters.includeDrafts ?? false,
        _sort: filters.sort ?? 'priority',
        _limit: filters.limit ?? 25,
        _offset: filters.offset ?? 0,
      } as never);
      if (error) throw error;
      const rows = (data as unknown as ApplicationQueueRow[]) ?? [];
      return { rows, total: rows.length ? Number(rows[0].total_count) : 0 };
    },
    staleTime: 30_000,
  });
}

export function useApplicationQueueCounts(regulatorId?: string | null, sectorId?: string | null) {
  return useQuery({
    queryKey: ['application-work-queue-counts', regulatorId ?? null, sectorId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('application_work_queue_counts', {
        _regulator_id: regulatorId ?? null,
        _sector_id: sectorId ?? null,
      } as never);
      if (error) throw error;
      return (data as unknown as ApplicationQueueCounts) ?? null;
    },
    staleTime: 30_000,
  });
}

export interface ApplicationCaseModel {
  application_id: string;
  reference: string;
  applicant_id: string | null;
  applicant_name: string | null;
  applicant_org: string | null;
  entity_id: string | null;
  entity_name: string | null;
  entity_href: string | null;
  application_category: string | null;
  license_type: string | null;
  stage: string;
  stage_label: string;
  status: string;
  status_label: string;
  submitted_at: string | null;
  created_at: string | null;
  last_activity_at: string | null;
  is_terminal: boolean;
  canonical_href: string;
  next_action: {
    code: string; label: string; permission: string | null; href: string | null; audience?: string;
  } | null;
  workflow: {
    instance_id: string | null; workflow_id: string | null; current_step_id: string | null;
    current_step_name: string | null; current_step_order: number | null; is_final_step: boolean | null;
  };
  sufficiency: {
    status: string | null; evaluation_id?: string; evaluated_at?: string; overall_status?: string;
    blocker_count?: number; warning_count?: number; pass_count?: number;
  } | null;
  rfis: Array<{
    id: string; summary: string | null; status: string; raised_at: string | null; due_at: string | null;
    closed_at: string | null; closure_notes: string | null; pauses_sla: boolean | null; raised_by_name: string | null;
  }>;
  open_rfi_count: number;
  forms: Array<{
    requirement_id: string; template_id: string | null; form_version_id: string | null;
    package_id: string | null; is_required: boolean | null; sequence: number | null;
    status: string | null; response_id: string | null; pinned_at: string | null;
  }>;
  payments: Array<{
    id: string; amount: number | null; currency: string | null; status: string | null;
    verification_status: string | null; paid_at: string | null; receipt_number: string | null;
  }>;
  license: { id: string; license_number: string | null; status: string | null; issued_at: string | null; valid_from: string | null; valid_until: string | null; href: string } | null;
  /* internal-only */
  owner_user_id?: string | null;
  owner_name?: string | null;
  team?: string | null;
  priority?: string;
  priority_reason?: string | null;
  priority_source?: string | null;
  sla_due_at?: string | null;
  sla_state?: string | null;
  sla_hours?: number | null;
  waiting_on?: string | null;
  blockers?: Array<{ code: string; label: string; href?: string | null; severity?: string; detail?: string | null }>;
  decision_gates?: Record<string, unknown>;
  fit_and_proper?: Record<string, unknown>;
  decision?: {
    rationale: string | null; approved_at: string | null; rejected_at: string | null;
    cancelled_at: string | null; artifacts: Array<{ id: string; artifact_type: string; version: number; created_at: string }>;
  };
}

export function useApplicationCase(applicationId?: string | null, audience: 'internal' | 'external' = 'internal') {
  return useQuery({
    queryKey: ['application-case', applicationId, audience],
    enabled: !!applicationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('application_case', {
        _application_id: applicationId,
        _audience: audience,
      } as never);
      if (error) throw error;
      return (data as unknown as ApplicationCaseModel) ?? null;
    },
    staleTime: 15_000,
  });
}
