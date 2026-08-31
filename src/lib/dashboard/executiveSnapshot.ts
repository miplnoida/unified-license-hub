/**
 * EXEC-01 — canonical Executive Supervisory Dashboard snapshot accessor.
 *
 * There is exactly ONE snapshot of the executive position, produced server-side
 * by `public.executive_dashboard_snapshot_capture`. The same object feeds:
 *   - the visible KPI cards;
 *   - the charts and supporting figures;
 *   - the AI executive briefing / change summary / suggested review areas /
 *     meeting brief (the edge function re-reads it server-side, it never trusts
 *     a client-supplied count);
 *   - the governed PDF / presentation export.
 *
 * Never re-derive a headline figure in the browser and never pass a browser
 * count to an AI endpoint as if it were authoritative.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ExecutiveSnapshotKpis {
  open_applications: number;
  total_applications: number;
  active_licences: number;
  issued_licences: number;
  open_breaches: number;
  current_breaches: number;
  open_enforcement: number;
  penalty_total: number;
  penalty_collected: number;
  penalty_outstanding: number;
  upcoming_inspections: number;
  open_complaints: number;
  fp_active: number;
  critical_risk_entities: number;
  high_risk_entities: number;
  open_prudential_actions: number;
  open_prudential_escalations: number;
  open_conduct_alerts: number;
  return_filings: number;
  returns_pending_review: number;
  returns_overdue: number;
}

export interface ExecutiveSnapshotCharts {
  risk_bands: Record<string, number>;
  application_pipeline: Record<string, number>;
  breaches_by_risk_level: Record<string, number>;
  application_sla: { breached: number; due_soon: number; unassigned: number };
  returns: { pending_review: number; overdue: number; accepted: number; sla_breached: number };
}

export interface ExecutiveSnapshot {
  snapshot_version: string;
  as_of: string;
  regulator_id: string | null;
  scope: { sector_id: string | null; portfolio: string };
  filters: { sector_id: string | null; window_days: number };
  window: { days: number; since: string; until: string };
  kpis: ExecutiveSnapshotKpis;
  charts: ExecutiveSnapshotCharts;
  unavailable_sources: string[];
  sources: Record<string, string>;
  fingerprint: string;
}

export interface ExecutiveSnapshotComparison {
  as_of: string;
  fingerprint: string;
  kpis: ExecutiveSnapshotKpis;
}

export interface ExecutiveSnapshotResult {
  snapshot: ExecutiveSnapshot;
  comparison_available: boolean;
  comparison: ExecutiveSnapshotComparison | null;
}

export interface ExecutiveSnapshotRequest {
  sectorId?: string | null;
  windowDays?: number;
}

/** Canonical, permission-aware snapshot capture. RLS applies to the caller. */
export async function fetchExecutiveSnapshot(
  req: ExecutiveSnapshotRequest = {},
): Promise<ExecutiveSnapshotResult> {
  const { data, error } = await (supabase as any).rpc('executive_dashboard_snapshot_capture', {
    _sector_id: req.sectorId ?? null,
    _window_days: req.windowDays ?? 30,
  });
  if (error) throw error;
  const result = (data ?? {}) as ExecutiveSnapshotResult;
  if (!result.snapshot) throw new Error('The executive snapshot could not be produced');
  return result;
}

/** Deterministic KPI movement, only ever computed from two real snapshots. */
export interface KpiMovement {
  key: keyof ExecutiveSnapshotKpis;
  current: number;
  previous: number;
  delta: number;
}

export function snapshotMovements(
  current: ExecutiveSnapshot,
  comparison: ExecutiveSnapshotComparison | null,
): KpiMovement[] | null {
  if (!comparison?.kpis) return null;
  const keys = Object.keys(current.kpis) as Array<keyof ExecutiveSnapshotKpis>;
  return keys
    .map((key) => {
      const cur = Number(current.kpis[key] ?? 0);
      const prev = Number(comparison.kpis[key] ?? 0);
      return { key, current: cur, previous: prev, delta: cur - prev };
    })
    .filter((m) => m.delta !== 0);
}

export const KPI_LABELS: Record<keyof ExecutiveSnapshotKpis, string> = {
  open_applications: 'Open applications',
  total_applications: 'Applications (all)',
  active_licences: 'Active licences',
  issued_licences: 'Licences issued',
  open_breaches: 'Unacknowledged breaches',
  current_breaches: 'Current breaches',
  open_enforcement: 'Open enforcement',
  penalty_total: 'Penalties imposed',
  penalty_collected: 'Penalties collected',
  penalty_outstanding: 'Penalties outstanding',
  upcoming_inspections: 'Upcoming inspections',
  open_complaints: 'Open complaints',
  fp_active: 'Fit & Proper active',
  critical_risk_entities: 'Critical risk entities',
  high_risk_entities: 'High risk entities',
  open_prudential_actions: 'Open prudential actions',
  open_prudential_escalations: 'Open prudential escalations',
  open_conduct_alerts: 'Open conduct alerts',
  return_filings: 'Return filings',
  returns_pending_review: 'Returns awaiting review',
  returns_overdue: 'Returns overdue',
};

/** Human-readable scope/filter line reused on screen, in AI output and in the PDF. */
export function describeSnapshotScope(snapshot: ExecutiveSnapshot): string {
  const sector = snapshot.filters?.sector_id ? `sector ${snapshot.filters.sector_id}` : 'all permitted sectors';
  return `${sector} · ${snapshot.window?.days ?? 30}-day window`;
}
