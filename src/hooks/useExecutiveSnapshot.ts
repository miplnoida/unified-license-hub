/**
 * EXEC-01 — the single canonical Executive Dashboard snapshot hook.
 *
 * Everything on the Executive Supervisory Dashboard (KPI cards, charts,
 * deterministic supervisory attention, AI workspace and export) reads from this
 * one hook so a figure can never differ between the screen, the narrative and
 * the exported briefing.
 */
import { useQuery } from '@tanstack/react-query';
import {
  fetchExecutiveSnapshot,
  snapshotMovements,
  type ExecutiveSnapshotResult,
} from '@/lib/dashboard/executiveSnapshot';

export interface UseExecutiveSnapshotOptions {
  sectorId?: string | null;
  windowDays?: number;
  /** Auto-refresh interval; disabled in presentation mode. */
  refetchInterval?: number | false;
}

export function useExecutiveSnapshot({
  sectorId = null,
  windowDays = 30,
  refetchInterval = 60_000,
}: UseExecutiveSnapshotOptions = {}) {
  const query = useQuery<ExecutiveSnapshotResult>({
    queryKey: ['executive-dashboard-snapshot', sectorId ?? 'all', windowDays],
    queryFn: () => fetchExecutiveSnapshot({ sectorId, windowDays }),
    refetchInterval: refetchInterval === false ? undefined : refetchInterval,
  });

  const snapshot = query.data?.snapshot ?? null;
  const comparison = query.data?.comparison ?? null;

  return {
    ...query,
    snapshot,
    comparison,
    comparisonAvailable: query.data?.comparison_available === true,
    movements: snapshot ? snapshotMovements(snapshot, comparison) : null,
    fingerprint: snapshot?.fingerprint ?? null,
  };
}
