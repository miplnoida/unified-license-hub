import { useMemo } from 'react';
import { useRegulatorMandates, useRegulatoryFunctions } from '@/hooks/useOperatingStructure';

export type SectorArea = { id: string; name: string };

/**
 * THE single source of truth for "which areas of work apply to a sector".
 *
 * Used by Assign Sector Lead, the coverage denominator, sector-lead detection
 * and coverage status — so an administrator never sees mismatched numbers like
 * "9 / 12".
 *
 * Rules (read-only, no backend change):
 *  - the area of work must be active;
 *  - global-only areas (coverage_level = 'global') are organisation-wide and are
 *    NEVER counted as missing sector coverage;
 *  - where active regulator mandates are configured, only mandated areas count
 *    for a sector (a mandate without a sector applies to every sector).
 */
export function useApplicableSectorAreas() {
  const functions = useRegulatoryFunctions();
  const mandates = useRegulatorMandates();

  const isLoading = functions.isLoading || mandates.isLoading;

  const sectorCapable = useMemo<SectorArea[]>(
    () =>
      (functions.data || [])
        .filter((f: any) => f.status === 'active' && String(f.coverage_level || '') !== 'global')
        .map((f: any) => ({ id: f.id, name: f.name })),
    [functions.data],
  );

  const activeMandates = useMemo(
    () => (mandates.data?.mandates || []).filter((m: any) => String(m.status || '').toLowerCase() === 'active'),
    [mandates.data],
  );

  const areasFor = useMemo(() => {
    return (sectorId?: string | null): SectorArea[] => {
      if (activeMandates.length === 0) return sectorCapable;
      const mandated = new Set<string>(
        activeMandates
          .filter((m: any) => !m.sector_id || !sectorId || m.sector_id === sectorId)
          .map((m: any) => m.regulatory_function_id),
      );
      const narrowed = sectorCapable.filter((f) => mandated.has(f.id));
      return narrowed.length ? narrowed : sectorCapable;
    };
  }, [sectorCapable, activeMandates]);

  return { areasFor, sectorCapable, isLoading };
}
