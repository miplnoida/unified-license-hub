import { useMemo } from 'react';
import {
  useActiveRegulators, useRegulatorMandates, useSectors, useSubSectors, useSupervisedEntities,
} from '@/hooks/useOperatingStructure';

/**
 * Regulator derivation for the Operating Structure console.
 *
 * A regulator is NEVER picked from a list of every regulator record. It is
 * derived from the coverage the administrator is working on:
 *
 *   entity → sub-sector / sector → regulator
 *   sub-sector → parent sector → regulator
 *   sector → sectors.regulator_id
 *
 * When more than one active regulator could cover the same place (twin-peaks
 * style deployments) the area of work narrows the candidates through the active
 * regulator mandates. Nothing is ever silently defaulted to the first row.
 */
export type CoverageSelection = {
  functionId?: string;
  appliesTo: 'all' | 'sector' | 'sub_sector' | 'entity';
  values: string[];
};

export type RegulatorResolution = {
  /** Regulators genuinely valid for the current coverage + area of work. */
  candidates: { id: string; name: string }[];
  /** Set when exactly one candidate is valid — locked, not a default. */
  resolved: { id: string; name: string } | null;
  /** True when the deployment has a single active operational regulator. */
  singleRegulatorDeployment: boolean;
  /** Human explanation of how the regulator was derived, or why it could not be. */
  reason: string;
  /** True when coverage exists but no regulator mandate/linkage covers it. */
  notConfigured: boolean;
};

export function useRegulatorResolution(selection: CoverageSelection): RegulatorResolution {
  const regulators = useActiveRegulators();
  const sectors = useSectors();
  const subSectors = useSubSectors();
  const entities = useSupervisedEntities();
  const mandates = useRegulatorMandates();

  return useMemo(() => {
    const active = (regulators.data || []).map((r: any) => ({ id: r.id, name: r.name }));
    const byId = new Map(active.map((r) => [r.id, r]));
    const single = active.length === 1;
    const empty = (reason: string, notConfigured = false): RegulatorResolution => ({
      candidates: [], resolved: null, singleRegulatorDeployment: single, reason, notConfigured,
    });

    if (!active.length) return empty('No active regulator is configured.', true);

    const subById = new Map((subSectors.data || []).map((s: any) => [s.id, s]));
    const entById = new Map((entities.data || []).map((e: any) => [e.id, e]));

    // 1. Derive the sectors the selection touches.
    const sectorIds = new Set<string>();
    if (selection.appliesTo === 'sector') selection.values.forEach((v) => sectorIds.add(v));
    else if (selection.appliesTo === 'sub_sector')
      selection.values.forEach((v) => {
        const parent = subById.get(v)?.sector_id;
        if (parent) sectorIds.add(parent);
      });
    else if (selection.appliesTo === 'entity')
      selection.values.forEach((v) => {
        const ent: any = entById.get(v);
        const sector = ent?.sector_id || (ent?.sub_sector_id ? subById.get(ent.sub_sector_id)?.sector_id : null);
        if (sector) sectorIds.add(sector);
      });

    // 2. Whole-population responsibility: only the deployment's active regulators apply.
    if (selection.appliesTo === 'all' || sectorIds.size === 0) {
      if (selection.appliesTo !== 'all' && selection.values.length > 0)
        return empty('The selected coverage is not linked to a sector, so no regulator can be derived.', true);
      return {
        candidates: active,
        resolved: single ? active[0] : null,
        singleRegulatorDeployment: single,
        reason: single
          ? 'Only one active regulator is configured for this deployment.'
          : 'Select a sector, sub-sector or entity so the regulator can be derived.',
        notConfigured: false,
      };
    }

    // 3. Regulator that owns each derived sector.
    const owners = new Set<string>();
    for (const s of sectors.data || []) {
      if (sectorIds.has((s as any).id) && (s as any).regulator_id && byId.has((s as any).regulator_id))
        owners.add((s as any).regulator_id);
    }

    // 4. Function-aware narrowing through active mandates for the same place.
    const rows = (mandates.data?.mandates || []).filter(
      (m: any) =>
        String(m.status || '').toLowerCase() === 'active' &&
        byId.has(m.regulator_id) &&
        (!selection.functionId || m.regulatory_function_id === selection.functionId) &&
        (!m.sector_id || sectorIds.has(m.sector_id)),
    );
    const mandated = new Set<string>(rows.map((m: any) => m.regulator_id));

    let ids: string[];
    let how: string;
    if (mandated.size && owners.size) {
      const both = [...mandated].filter((id) => owners.has(id));
      ids = both.length ? both : [...mandated];
      how = 'Derived from the selected coverage and the active regulator mandate for this area of work.';
    } else if (mandated.size) {
      ids = [...mandated];
      how = 'Derived from the active regulator mandate for this area of work and coverage.';
    } else {
      ids = [...owners];
      how = 'Derived from the selected coverage.';
    }

    if (!ids.length) return empty('REGULATOR COVERAGE NOT CONFIGURED', true);

    const candidates = ids.map((id) => byId.get(id)!).filter(Boolean);
    return {
      candidates,
      resolved: candidates.length === 1 ? candidates[0] : null,
      singleRegulatorDeployment: single,
      reason:
        candidates.length === 1
          ? how
          : 'More than one regulator holds a mandate for this area of work and coverage — choose which one this responsibility belongs to.',
      notConfigured: false,
    };
  }, [
    regulators.data, sectors.data, subSectors.data, entities.data, mandates.data,
    selection.appliesTo, selection.functionId, selection.values.join(','),
  ]);
}
