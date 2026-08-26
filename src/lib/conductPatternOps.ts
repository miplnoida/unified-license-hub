/**
 * MC-06 — Governed pattern (cluster) operations.
 *
 * Every mutation runs through a SECURITY DEFINER RPC that derives the acting
 * officer, enforces the Market Conduct permission and regulator scope,
 * validates the state transition and the mandatory note/rationale, and writes
 * the audit trail. Direct browser DML on the pattern stores is revoked, so
 * these are the only write paths available to the UI. Nothing here creates a
 * signal or alert automatically — an officer must ask for it.
 */
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function call<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type PatternReviewStatus = 'open' | 'under_review' | 'confirmed' | 'dismissed';

/** Record a review decision. Note min 10 chars. */
export const patternReview = (clusterId: string, status: PatternReviewStatus, note: string) =>
  call('conduct_cluster_review', { _cluster_id: clusterId, _status: status, _note: note });

/** Attach an existing conduct evidence item to the pattern (no new store). */
export const patternLinkEvidence = (clusterId: string, evidenceId: string, note?: string | null) =>
  call('conduct_cluster_link_evidence', { _cluster_id: clusterId, _evidence_id: evidenceId, _note: note ?? null });

/** Raise a conduct signal from the pattern. Rationale min 10 chars; one per pattern. */
export const patternRaiseSignal = (clusterId: string, rationale: string) =>
  call<{ id: string; reference?: string; already_exists: boolean }>(
    'conduct_cluster_raise_signal', { _cluster_id: clusterId, _rationale: rationale });

/** Raise a conduct alert from the pattern. Rationale min 10 chars; one per pattern. */
export const patternRaiseAlert = (clusterId: string, rationale: string) =>
  call<{ id: string; already_exists: boolean }>(
    'conduct_cluster_raise_alert', { _cluster_id: clusterId, _rationale: rationale });
