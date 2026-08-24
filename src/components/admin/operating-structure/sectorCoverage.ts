import { useMemo } from 'react';
import {
  useActiveSectors, useRegulatoryFunctions, useStaffDirectory, useStaffPortfolios,
  useSubSectors, useSupervisedEntities,
} from '@/hooks/useOperatingStructure';

export type CoverageStatus = 'COMPLETE' | 'PARTIAL' | 'NO_LEAD' | 'NO_COVERAGE';

export type PersonCoverage = {
  userId: string;
  name: string;
  areas: { id: string; name: string }[];
  /** True when the responsibility is not narrowed to any sector. */
  wide: boolean;
};

export type SectorCoverage = {
  id: string;
  name: string;
  displayGroup: string;
  people: PersonCoverage[];
  lead: PersonCoverage | null;
  supporting: PersonCoverage[];
  areasCovered: number;
  totalAreas: number;
  entityCount: number;
  status: CoverageStatus;
};

export const STATUS_LABEL: Record<CoverageStatus, string> = {
  COMPLETE: 'Complete',
  PARTIAL: 'Partial',
  NO_LEAD: 'No lead',
  NO_COVERAGE: 'No coverage',
};

/**
 * Sector coverage read model, grouped BY PERSON.
 *
 * A person holding ten separate responsibilities appears once with ten areas of
 * work — the underlying portfolios stay separate. Team/organisational-unit
 * membership is deliberately NOT treated as sector coverage: a unit groups
 * staff, it never covers a sector by itself.
 */
export function useSectorCoverage() {
  const sectors = useActiveSectors();
  const subSectors = useSubSectors();
  const entities = useSupervisedEntities();
  const portfolios = useStaffPortfolios();
  const staff = useStaffDirectory();
  const functions = useRegulatoryFunctions();

  const isLoading =
    sectors.isLoading || portfolios.isLoading || staff.isLoading || functions.isLoading;

  const data = useMemo<SectorCoverage[]>(() => {
    const activeFunctions = (functions.data || []).filter((f: any) => f.status === 'active');
    const totalAreas = activeFunctions.length;
    const fnName = (id: string | null) =>
      (functions.data || []).find((f: any) => f.id === id)?.name || 'Area of work';
    const staffName = (id: string) =>
      (staff.data || []).find((s: any) => s.id === id)?.full_name || 'Staff member';

    const active = (portfolios.data?.portfolios || []).filter((p: any) => p.status === 'active');
    const scopes = portfolios.data?.scopes || [];

    return (sectors.data || []).map((sec: any) => {
      const byPerson = new Map<string, PersonCoverage>();
      for (const p of active) {
        const mine = scopes.filter((s: any) => s.portfolio_id === p.id);
        const wide = mine.length === 0;
        const match =
          wide ||
          mine.some((s: any) => {
            if (s.scope_kind === 'sector') return s.sector_id === sec.id;
            if (s.scope_kind === 'sub_sector')
              return (subSectors.data || []).some(
                (x: any) => x.id === s.sub_sector_id && x.sector_id === sec.id,
              );
            return (entities.data || []).find((e: any) => e.id === s.entity_id)?.sector_id === sec.id;
          });
        if (!match) continue;
        const existing = byPerson.get(p.user_id);
        const area = { id: p.regulatory_function_id, name: fnName(p.regulatory_function_id) };
        if (existing) {
          if (!existing.areas.some((a) => a.id === area.id)) existing.areas.push(area);
          existing.wide = existing.wide && wide;
        } else {
          byPerson.set(p.user_id, { userId: p.user_id, name: staffName(p.user_id), areas: [area], wide });
        }
      }

      const people = Array.from(byPerson.values()).sort(
        (a, b) => b.areas.length - a.areas.length || a.name.localeCompare(b.name),
      );
      people.forEach((p) => p.areas.sort((a, b) => a.name.localeCompare(b.name)));

      const areasCovered = new Set(people.flatMap((p) => p.areas.map((a) => a.id))).size;
      // The sector lead is the person carrying every area of work for the
      // sector. Nobody carrying the full set means the sector has no lead.
      const lead = people.find((p) => totalAreas > 0 && p.areas.length >= totalAreas) || null;
      const supporting = people.filter((p) => p !== lead);
      const entityCount = (entities.data || []).filter((e: any) => e.sector_id === sec.id).length;

      const status: CoverageStatus =
        people.length === 0
          ? 'NO_COVERAGE'
          : lead && areasCovered >= totalAreas
            ? 'COMPLETE'
            : lead
              ? 'PARTIAL'
              : 'NO_LEAD';

      return {
        id: sec.id,
        name: sec.name,
        displayGroup: sec.display_group || 'UNGROUPED',
        people,
        lead,
        supporting,
        areasCovered,
        totalAreas,
        entityCount,
        status,
      };
    });
  }, [sectors.data, subSectors.data, entities.data, portfolios.data, staff.data, functions.data]);

  return { data, isLoading };
}
