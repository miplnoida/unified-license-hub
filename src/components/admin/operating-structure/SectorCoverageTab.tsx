import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EntitySupervisionTab } from './EntitySupervisionTab';
import { SECTOR_GROUP_LABELS, SECTOR_GROUP_ORDER } from '@/hooks/useOperatingStructure';
import { STATUS_LABEL, useSectorCoverage, type CoverageStatus, type SectorCoverage } from './sectorCoverage';
import { SectorCoverageSheet } from './SectorCoverageSheet';
import { SectorLeadDialog } from './SectorAssignDialogs';

const STATUS_VARIANT: Record<CoverageStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  COMPLETE: 'default',
  PARTIAL: 'secondary',
  NO_LEAD: 'outline',
  NO_COVERAGE: 'destructive',
};

/**
 * Sector coverage — the main administration view.
 *
 * Each card answers WHO runs the sector and WHERE the gaps are. Every action is
 * a task-specific dialog; nothing here asks the administrator about portfolios,
 * scopes, mandates or regulators.
 */
export function SectorCoverageTab({ initialView = 'sectors' }: { initialView?: 'sectors' | 'entities' }) {
  const { data: coverage } = useSectorCoverage();
  const [search, setSearch] = useState('');
  const [manageId, setManageId] = useState<string | null>(null);
  const [leadFor, setLeadFor] = useState<SectorCoverage | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return coverage
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .slice()
      .sort(
        (a, b) =>
          SECTOR_GROUP_ORDER.indexOf(a.displayGroup) - SECTOR_GROUP_ORDER.indexOf(b.displayGroup) ||
          a.name.localeCompare(b.name),
      );
  }, [coverage, search]);

  const managed = coverage.find((s) => s.id === manageId) || null;

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
          {visible.map((sec, idx) => (
            <div key={sec.id} className="space-y-3">
              {sec.displayGroup !== visible[idx - 1]?.displayGroup && (
                <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {SECTOR_GROUP_LABELS[sec.displayGroup] || 'Other'}
                </p>
              )}
              <SectorCard
                sector={sec}
                onManage={() => setManageId(sec.id)}
                onLead={() => setLeadFor(sec)}
              />
            </div>
          ))}
          {visible.length === 0 && <p className="text-sm text-muted-foreground">No sectors found.</p>}
        </TabsContent>

        <TabsContent value="entities" className="mt-4">
          <EntitySupervisionTab />
        </TabsContent>
      </Tabs>

      <SectorCoverageSheet
        sector={managed}
        open={!!managed}
        onOpenChange={(v) => setManageId(v ? manageId : null)}
      />

      {leadFor && (
        <SectorLeadDialog
          open={!!leadFor}
          onOpenChange={(v) => setLeadFor(v ? leadFor : null)}
          sectorId={leadFor.id}
          sectorName={leadFor.name}
        />
      )}
    </>
  );
}

function SectorCard({
  sector, onManage, onLead,
}: {
  sector: SectorCoverage;
  onManage: () => void;
  onLead: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">{sector.name}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Areas covered {sector.areasCovered} / {sector.totalAreas} · {sector.supporting.length}{' '}
            supporting {sector.supporting.length === 1 ? 'person' : 'staff'} · {sector.entityCount}{' '}
            {sector.entityCount === 1 ? 'entity' : 'entities'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_VARIANT[sector.status]}>{STATUS_LABEL[sector.status]}</Badge>
          <Button size="sm" variant="outline" onClick={onLead}>
            {sector.lead ? 'Change lead' : 'Set lead'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onManage}>Manage</Button>
        </div>
      </CardHeader>
      <CardContent className="text-sm">
        <p className="text-xs uppercase text-muted-foreground">Sector lead</p>
        <p>{sector.lead ? sector.lead.name : <span className="text-muted-foreground">Not assigned</span>}</p>
      </CardContent>
    </Card>
  );
}
