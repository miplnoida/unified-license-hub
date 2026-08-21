/**
 * P12 — canonical correspondence read models.
 *
 * Both hooks are thin wrappers over governed server functions. The browser never
 * computes SLA state, waiting-on, next action, totals or bucket counts: those are
 * server authority (`correspondence_work_queue`, `correspondence_thread_case`).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CorrespondenceQueueRow {
  id: string;
  reference: string;
  subject: string;
  summary: string | null;
  module: string;
  category: string;
  channel: string;
  thread_type: string;
  thread_state: string;
  priority: string;
  is_entity_facing: boolean;
  source_type: string | null;
  source_id: string | null;
  source_reference: string | null;
  related_href: string | null;
  licensee_id: string | null;
  entity_name: string | null;
  person_name: string | null;
  person_org: string | null;
  owner_name: string | null;
  owner_id: string | null;
  team: string | null;
  sla_due_at: string | null;
  sla_state: 'none' | 'on_track' | 'at_risk' | 'breached' | string;
  waiting_on: 'entity' | 'regulator' | null;
  unread_count: number;
  action_required: boolean;
  next_action: string | null;
  last_activity_at: string | null;
  canonical_href: string;
  effective_direction: string;
}

export interface CorrespondenceQueueCounts {
  total?: number;
  total_open?: number;
  awaiting_response?: number;
  breached?: number;
  at_risk?: number;
  unread?: number;
  action_required?: number;
  unassigned?: number;
  mine?: number;
}

export interface CorrespondenceQueueFilters {
  query?: string;
  status?: string;
  module?: string;
  thread_type?: string;
  channel?: string;
  priority?: string;
  bucket?: string;
  assigned_officer_id?: string;
  source_type?: string;
  source_id?: string;
}

export interface CorrespondenceQueueResult {
  rows: CorrespondenceQueueRow[];
  total: number;
  page_count: number;
  counts: CorrespondenceQueueCounts;
  can_filter_assignee: boolean;
}

export function useCorrespondenceWorkQueue(
  filters: CorrespondenceQueueFilters = {},
  page = 0,
  pageSize = 25,
) {
  return useQuery({
    queryKey: ['correspondence-work-queue', filters, page, pageSize],
    queryFn: async (): Promise<CorrespondenceQueueResult> => {
      const payload: Record<string, unknown> = {};
      Object.entries(filters).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '' || v === 'all') return;
        payload[k] = v;
      });
      const { data, error } = await (supabase as any).rpc('correspondence_work_queue', {
        _filters: payload,
        _limit: pageSize,
        _offset: page * pageSize,
      });
      if (error) throw error;
      const res = (data ?? {}) as Partial<CorrespondenceQueueResult>;
      return {
        rows: (res.rows ?? []) as CorrespondenceQueueRow[],
        total: res.total ?? 0,
        page_count: res.page_count ?? 0,
        counts: (res.counts ?? {}) as CorrespondenceQueueCounts,
        can_filter_assignee: res.can_filter_assignee ?? false,
      };
    },
  });
}

export interface CorrespondenceThreadCase {
  id: string;
  reference: string;
  subject: string;
  summary: string | null;
  module: string;
  category: string;
  channel: string;
  thread_type: string;
  thread_state: string;
  stage_label: string;
  status_label: string;
  priority: string;
  is_entity_facing: boolean;
  entity_id: string | null;
  entity_name: string | null;
  entity_href: string | null;
  owner_name: string | null;
  owner_id: string | null;
  team: string | null;
  sla_due_at: string | null;
  sla_state: string;
  waiting_on: 'entity' | 'regulator' | null;
  next_action: string | null;
  last_activity_at: string | null;
  related_case: { source_type: string; source_id: string; reference: string | null; href: string | null } | null;
  rfi_links: Array<{ kind: string; id: string; status: string; summary: string; due_at: string | null; href: string }>;
  delivery_evidence: Array<{
    message_id: string; channel: string; status: string | null; sent_at: string | null;
    delivered_at: string | null; opened_at: string | null; bounce_reason: string | null; recipient: string | null;
  }>;
  reopened_count: number;
  can_act: boolean;
}

export function useCorrespondenceThreadCase(threadId?: string) {
  return useQuery({
    enabled: !!threadId,
    queryKey: ['correspondence-thread-case', threadId],
    queryFn: async (): Promise<CorrespondenceThreadCase> => {
      const { data, error } = await (supabase as any).rpc('correspondence_thread_case', { _thread_id: threadId });
      if (error) throw error;
      return data as CorrespondenceThreadCase;
    },
  });
}

/** Maps the server SLA vocabulary onto the shared CaseHeader vocabulary. */
export function caseHeaderSlaState(slaState?: string | null) {
  if (slaState === 'at_risk') return 'due_soon';
  if (slaState === 'none') return null;
  return slaState ?? null;
}
