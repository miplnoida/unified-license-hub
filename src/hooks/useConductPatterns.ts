/**
 * MC-06 — Pattern register and pattern detail read models.
 *
 * Both are served, filtered, paged and counted by the governed server read
 * models (`conduct_cluster_register`, `conduct_cluster_detail`). The browser
 * never selects from, nor writes to, the pattern tables directly.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  patternLinkEvidence, patternRaiseAlert, patternRaiseSignal, patternReview,
  type PatternReviewStatus,
} from '@/lib/conductPatternOps';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export interface PatternRow {
  id: string;
  reference: string;
  title: string;
  pattern_type: string;
  rule_id: string | null;
  rule_code: string | null;
  rule_version: number | null;
  metric: string | null;
  metric_value: number | null;
  metric_unit: string | null;
  threshold_value: number | null;
  comparison_operator: string | null;
  window_start: string | null;
  window_end: string | null;
  window_days: number | null;
  member_count: number | null;
  severity: string | null;
  systemic_member_count: number | null;
  distinct_entity_count: number | null;
  entity_id: string | null;
  entity_name: string | null;
  sector_id: string | null;
  product_name: string | null;
  channel_name: string | null;
  status: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  raised_signal_id: string | null;
  raised_alert_id: string | null;
  match_explanation: string | null;
  first_detected_at: string | null;
  last_evaluated_at: string | null;
  evaluation_count: number | null;
  evidence_count: number | string | null;
  canonical_href: string;
  total_count: number | string;
}

export interface PatternFilters {
  statuses?: string[] | null;
  patternTypes?: string[] | null;
  severities?: string[] | null;
  entityId?: string | null;
  ruleId?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

export function usePatternRegister(filters: PatternFilters = {}) {
  return useQuery({
    queryKey: ['conduct_cluster_register', filters],
    queryFn: () => rpc<PatternRow[]>('conduct_cluster_register', {
      _statuses: filters.statuses ?? null,
      _pattern_types: filters.patternTypes ?? null,
      _severities: filters.severities ?? null,
      _entity_id: filters.entityId ?? null,
      _rule_id: filters.ruleId ?? null,
      _search: filters.search ?? null,
      _limit: filters.limit ?? 25,
      _offset: filters.offset ?? 0,
    }),
  });
}

export interface PatternMember {
  id: string;
  member_type: string;
  member_reference: string | null;
  member_title: string | null;
  member_severity: string | null;
  member_id: string | null;
  occurred_at: string | null;
  last_seen_at: string | null;
  detail: Record<string, unknown> | null;
}

export interface PatternMetric {
  id: string;
  rule_version: number | null;
  metric: string | null;
  metric_value: number | null;
  threshold_value: number | null;
  comparison_operator: string | null;
  window_start: string | null;
  window_end: string | null;
  matched: boolean | null;
  member_count: number | null;
  evaluated_at: string | null;
}

export interface PatternHistoryItem {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  actor_id: string | null;
}

export interface PatternEvidenceItem {
  id: string;
  title: string | null;
  evidence_type: string | null;
  uploaded_at: string | null;
}

export interface PatternDetail {
  cluster: PatternRow & {
    licensee_id: string | null;
    regulator_id: string | null;
    product_id: string | null;
    channel_id: string | null;
    review_note: string | null;
  };
  rule: { name?: string | null; description?: string | null; frequency?: string | null } | null;
  rule_version_snapshot: Record<string, unknown> | null;
  members: PatternMember[];
  metrics: PatternMetric[];
  history: PatternHistoryItem[];
  evidence: PatternEvidenceItem[];
  raised: {
    signal: { id: string; reference: string; status: string } | null;
    alert: { id: string; title: string; status: string } | null;
  };
}

export function usePatternDetail(clusterId?: string) {
  return useQuery({
    queryKey: ['conduct_cluster_detail', clusterId],
    enabled: !!clusterId,
    queryFn: () => rpc<PatternDetail>('conduct_cluster_detail', { _cluster_id: clusterId }),
  });
}

/* ------------------------------------------------------------- mutations */

function usePatternMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>, successMessage: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conduct_cluster_detail'] });
      qc.invalidateQueries({ queryKey: ['conduct_cluster_register'] });
      qc.invalidateQueries({ queryKey: ['conduct_signal_register'] });
      qc.invalidateQueries({ queryKey: ['conduct_alert_register'] });
      qc.invalidateQueries({ queryKey: ['conduct-evidence'] });
      toast.success(successMessage);
    },
    onError: (e: Error) => toast.error(e.message || 'The action could not be completed'),
  });
}

export const useReviewPattern = () =>
  usePatternMutation<{ id: string; status: PatternReviewStatus; note: string }>(
    (a) => patternReview(a.id, a.status, a.note), 'Review decision recorded');

export const useLinkPatternEvidence = () =>
  usePatternMutation<{ id: string; evidenceId: string; note?: string }>(
    (a) => patternLinkEvidence(a.id, a.evidenceId, a.note), 'Evidence attached');

export const useRaisePatternSignal = () =>
  usePatternMutation<{ id: string; rationale: string }>(
    (a) => patternRaiseSignal(a.id, a.rationale), 'Conduct signal raised');

export const useRaisePatternAlert = () =>
  usePatternMutation<{ id: string; rationale: string }>(
    (a) => patternRaiseAlert(a.id, a.rationale), 'Conduct alert raised');
