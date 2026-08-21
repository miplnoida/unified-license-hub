/**
 * EPR-01 — canonical Returns aggregate accessors.
 *
 * Every supervisory / dashboard / prudential consumer of Return volumes MUST
 * read through this module. The numbers come from server-side aggregates over
 * the canonical model (`return_filings` + `v_return_filing_workflow_state`),
 * never from `rows.length` of a capped browser page and never from the retired
 * `returns_filed` / `compliance_returns` tables.
 */
import { supabase } from '@/integrations/supabase/client';

export interface CanonicalReturnsSummaryRow {
  id: string;
  filing_reference: string | null;
  entity_id: string | null;
  entity_name: string | null;
  definition_name: string | null;
  period_label: string | null;
  due_date: string | null;
  days_late: number | null;
  status: string | null;
  stage: string | null;
}

export interface CanonicalReturnsSummary {
  total: number;
  draft: number;
  submitted: number;
  pending_review: number;
  correction_requested: number;
  accepted: number;
  rejected: number;
  overdue: number;
  due_soon: number;
  sla_breached: number;
  top_overdue: CanonicalReturnsSummaryRow[];
}

const EMPTY_SUMMARY: CanonicalReturnsSummary = {
  total: 0, draft: 0, submitted: 0, pending_review: 0, correction_requested: 0,
  accepted: 0, rejected: 0, overdue: 0, due_soon: 0, sla_breached: 0, top_overdue: [],
};

/** Server-side supervisory counts, optionally scoped to one sector. */
export async function fetchCanonicalReturnsSummary(
  sectorId?: string | null,
): Promise<CanonicalReturnsSummary> {
  const { data, error } = await supabase.rpc('returns_supervisory_summary', {
    _sector_id: sectorId ?? null,
  });
  if (error) {
    if (import.meta.env.DEV) console.warn('[canonicalReturnsSummary] summary failed', error);
    return EMPTY_SUMMARY;
  }
  return { ...EMPTY_SUMMARY, ...((data ?? {}) as Partial<CanonicalReturnsSummary>) };
}

export interface CanonicalEntityReturnsSummary {
  total: number;
  draft: number;
  pending_review: number;
  correction_requested: number;
  accepted: number;
  overdue: number;
  due_soon: number;
  upcoming: Array<{
    id: string;
    filing_reference: string | null;
    definition_name: string | null;
    period_label: string | null;
    due_date: string | null;
    status: string | null;
    status_label: string | null;
    is_overdue: boolean | null;
  }>;
}

const EMPTY_ENTITY_SUMMARY: CanonicalEntityReturnsSummary = {
  total: 0, draft: 0, pending_review: 0, correction_requested: 0,
  accepted: 0, overdue: 0, due_soon: 0, upcoming: [],
};

/** Per-entity canonical counts for licensee/entity dashboards. */
export async function fetchCanonicalEntityReturnsSummary(
  entityIds: string[],
): Promise<CanonicalEntityReturnsSummary> {
  if (!entityIds || entityIds.length === 0) return EMPTY_ENTITY_SUMMARY;
  const { data, error } = await supabase.rpc('returns_entity_summary', { _entity_ids: entityIds });
  if (error) {
    if (import.meta.env.DEV) console.warn('[canonicalReturnsSummary] entity summary failed', error);
    return EMPTY_ENTITY_SUMMARY;
  }
  return { ...EMPTY_ENTITY_SUMMARY, ...((data ?? {}) as Partial<CanonicalEntityReturnsSummary>) };
}

export interface CanonicalReturnsTrendPoint {
  month: string;
  filings: number;
}

/** Monthly canonical filing volumes, aggregated server-side. */
export async function fetchCanonicalReturnsTrend(months = 6): Promise<CanonicalReturnsTrendPoint[]> {
  const { data, error } = await supabase.rpc('returns_filing_trend', { _months: months });
  if (error) {
    if (import.meta.env.DEV) console.warn('[canonicalReturnsSummary] trend failed', error);
    return [];
  }
  return ((data ?? []) as Array<{ month: string; filings: number | string }>).map((r) => ({
    month: r.month,
    filings: Number(r.filings ?? 0),
  }));
}

export interface CanonicalEntityFilingHistoryRow {
  filing_id: string;
  filing_reference: string | null;
  definition_name: string | null;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  status: string | null;
  status_label: string | null;
  submitted_at: string | null;
  accepted_at: string | null;
  current_version_number: number | null;
  accepted_version_id: string | null;
  breach_count: number;
  metric_count: number;
}

/** Canonical filing history for a single regulated entity. */
export async function fetchCanonicalEntityFilingHistory(
  entityId: string,
): Promise<CanonicalEntityFilingHistoryRow[]> {
  const { data, error } = await supabase.rpc('returns_entity_filing_history', { _entity_id: entityId });
  if (error) {
    if (import.meta.env.DEV) console.warn('[canonicalReturnsSummary] history failed', error);
    return [];
  }
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    breach_count: Number(r.breach_count ?? 0),
    metric_count: Number(r.metric_count ?? 0),
  })) as CanonicalEntityFilingHistoryRow[];
}
