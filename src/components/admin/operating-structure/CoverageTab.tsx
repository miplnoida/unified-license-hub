import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EntitySupervisionTab } from './EntitySupervisionTab';
import { ResponsibilityDialog } from './ResponsibilityDialog';
import {
  SECTOR_GROUP_LABELS, useActiveSectors, useRegulatoryFunctions, useRegulatoryTeams, useSectors,
  useStaffDirectory, useStaffPortfolios,
  useSubSectors, useSupervisedEntities, useSupervisionAssignments,
} from '@/hooks/useOperatingStructure';

/**
 * WHERE responsibilities apply — the "who is responsible for this sector,
 * sub-sector or entity?" view. Read-only analysis plus one action: record a
 * responsibility for the selected place, through the governed routine.
 */
export function CoverageTab({ initialView = 'sectors' }: { initialView?: 'sectors' | 'entities' }) {
  const sectors = useSectors();
  const activeSectors = useActiveSectors();
  const subSectors = useSubSectors();
  const entities = useSupervisedEntities();
  const portfolios = useStaffPortfolios();
  const staff = useStaffDirectory();
  const teams = useRegulatoryTeams();
  const functions = useRegulatoryFunctions();
  const assignments = useSupervisionAssignments();

  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; sectorId?: string; subSectorId?: string }>({ open: false });

  const staffName = (id: string) => (staff.data || []).find((s: any) => s.id === id)?.full_name || 'Staff member';
  const fnName = (id: string | null) => (functions.data || []).find((f: any) => f.id === id)?.name || 'Area of work';

  /** People covering a place: an unscoped responsibility covers everything. */
  const peopleFor = (sectorId: string, subSectorId?: string) => {
    const active = (portfolios.data?.portfolios || []).filter((p: any) => p.status === 'active');
    const out: { name: string; area: string; wide: boolean }[] = [];
    for (const p of active) {
      const scopes = (portfolios.data?.scopes || []).filter((s: any) => s.portfolio_id === p.id);
      const wide = scopes.length === 0;
      const match =
        wide ||
        scopes.some((s: any) => {
          if (s.scope_kind === 'sector') return s.sector_id === sectorId;
          if (s.scope_kind === 'sub_sector')
            return subSectorId
              ? s.sub_sector_id === subSectorId
              : (subSectors.data || []).some((x: any) => x.id === s.sub_sector_id && x.sector_id === sectorId);
          const ent = (entities.data || []).find((e: any) => e.id === s.entity_id);
          return subSectorId ? ent?.sub_sector_id === subSectorId : ent?.sector_id === sectorId;
        });
      if (match) out.push({ name: staffName(p.user_id), area: fnName(p.regulatory_function_id), wide });
    }
    return out;
  };

  const teamsFor = (sectorId: string) =>
    (teams.data || [])
      .filter((t: any) => t.status === 'active')
      .filter((t: any) => {
        const sec = (sectors.data || []).find((s: any) => s.id === sectorId);
        return !t.regulator_id || !sec?.regulator_id || t.regulator_id === sec.regulator_id;
      })
      .map((t: any) => t.name);

  const supervisedIds = useMemo(
    () => new Set((assignments.data || []).filter((a) => a.status === 'active').map((a) => a.entity_id)),
    [assignments.data],
  );

  const visibleSectors = useMemo(() => {
    const q = search.trim().toLowerCase();
    const order = ['DOMESTIC_FINANCIAL_SECTOR', 'INTERNATIONAL_FINANCIAL_SECTOR', 'OTHER_NEW_REGULATED_SECTOR', 'UNGROUPED'];
    return (activeSectors.data || [])
      .filter((s: any) => !q || String(s.name).toLowerCase().includes(q))
      .slice()
      .sort(
        (a: any, b: any) =>
          order.indexOf(a.display_group || 'UNGROUPED') - order.indexOf(b.display_group || 'UNGROUPED') ||
          String(a.name).localeCompare(String(b.name)),
      );
  }, [activeSectors.data, search]);

  return (
    <>
      <Tabs defaultValue={initialView}>
        <TabsList>
          <TabsTrigger value="sectors">Sector coverage</TabsTrigger>
          <TabsTrigger value="entities">Entity ownership</TabsTrigger>
        </TabsList>

        <TabsContent value="sectors" className="mt-4 space-y-3">
          <Input
            className="max-w-xs"
            placeholder="Search sector"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {visibleSectors.map((sec: any, idx: number) => {
            const groupKey = sec.display_group || 'UNGROUPED';
            const showGroup = groupKey !== (visibleSectors[idx - 1]?.display_group || (idx === 0 ? null : 'UNGROUPED'));
            const subs = (subSectors.data || []).filter(
              (s: any) => s.sector_id === sec.id && String(s.status || '').toLowerCase() === 'active',
            );
            const secPeople = peopleFor(sec.id);
            const secEntities = (entities.data || []).filter((e: any) => e.sector_id === sec.id);
            return (
              <div key={sec.id} className="space-y-3">
              {showGroup && (
                <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {SECTOR_GROUP_LABELS[groupKey]}
                </p>
              )}
              <Card>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">{sec.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {secPeople.length} people · {teamsFor(sec.id).length} teams · {secEntities.length} entities
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {secPeople.length === 0 && <Badge variant="destructive">No coverage</Badge>}
                    <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, sectorId: sec.id })}>
                      Assign responsibility
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm">
                    {secPeople.length === 0 ? (
                      <p className="text-muted-foreground">Nobody is recorded as responsible for this sector.</p>
                    ) : (
                      secPeople.map((p, i) => (
                        <p key={i}>
                          {p.name} — {p.area}
                          {p.wide && <span className="ml-2 text-xs text-muted-foreground">(all sectors)</span>}
                        </p>
                      ))
                    )}
                  </div>

                  {subs.length > 0 && (
                    <div className="space-y-1 rounded-md border p-2">
                      {subs.map((sub: any) => {
                        const sp = peopleFor(sec.id, sub.id);
                        const se = (entities.data || []).filter((e: any) => e.sub_sector_id === sub.id);
                        const unowned = se.filter((e: any) => !supervisedIds.has(e.id)).length;
                        return (
                          <div key={sub.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span>
                              {sub.name}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {sp.length} people · {se.length} entities
                                {unowned > 0 ? ` · ${unowned} without a supervisor` : ''}
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              {sp.length === 0 && <Badge variant="destructive">No coverage</Badge>}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDialog({ open: true, sectorId: sec.id, subSectorId: sub.id })}
                              >
                                Assign
                              </Button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
              </div>
            );

          })}
          {visibleSectors.length === 0 && <p className="text-sm text-muted-foreground">No sectors found.</p>}
        </TabsContent>

        <TabsContent value="entities" className="mt-4">
          <EntitySupervisionTab />
        </TabsContent>
      </Tabs>

      <ResponsibilityDialog
        open={dialog.open}
        onOpenChange={(v) => setDialog({ open: v })}
        userId={null}
        preset={{ sectorId: dialog.sectorId, subSectorId: dialog.subSectorId }}
      />
    </>
  );
}
