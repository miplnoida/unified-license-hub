import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { EntitySupervisionTab } from './EntitySupervisionTab';
import { ResponsibilityDialog } from './ResponsibilityDialog';
import { SECTOR_GROUP_LABELS, SECTOR_GROUP_ORDER, useRegulatoryFunctions } from '@/hooks/useOperatingStructure';
import { STATUS_LABEL, useSectorCoverage, type CoverageStatus, type SectorCoverage } from './sectorCoverage';

const STATUS_VARIANT: Record<CoverageStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  COMPLETE: 'default',
  PARTIAL: 'secondary',
  NO_LEAD: 'outline',
  NO_COVERAGE: 'destructive',
};

/**
 * Sector coverage — the main administration view.
 *
 * People are grouped: someone holding ten responsibilities in a sector appears
 * once with ten areas of work. Organisational units are never counted as sector
 * coverage; only recorded responsibilities are.
 */
export function SectorCoverageTab({ initialView = 'sectors' }: { initialView?: 'sectors' | 'entities' }) {
  const { data: coverage } = useSectorCoverage();
  const functions = useRegulatoryFunctions();
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; sectorId?: string; lead?: boolean }>({ open: false });

  const allFunctionIds = useMemo(
    () => (functions.data || []).filter((f: any) => f.status === 'active').map((f: any) => f.id),
    [functions.data],
  );

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
                onManage={() => setDialog({ open: true, sectorId: sec.id })}
                onAssignLead={() => setDialog({ open: true, sectorId: sec.id, lead: true })}
              />
            </div>
          ))}
          {visible.length === 0 && <p className="text-sm text-muted-foreground">No sectors found.</p>}
        </TabsContent>

        <TabsContent value="entities" className="mt-4">
          <EntitySupervisionTab />
        </TabsContent>
      </Tabs>

      <ResponsibilityDialog
        open={dialog.open}
        onOpenChange={(v) => setDialog({ open: v })}
        userId={null}
        title={dialog.lead ? 'Assign sector lead' : undefined}
        preset={{
          sectorId: dialog.sectorId,
          functionIds: dialog.lead ? allFunctionIds : undefined,
        }}
      />
    </>
  );
}

function SectorCard({
  sector, onManage, onAssignLead,
}: {
  sector: SectorCoverage;
  onManage: () => void;
  onAssignLead: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">{sector.name}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Areas {sector.areasCovered} / {sector.totalAreas} · {sector.entityCount}{' '}
            {sector.entityCount === 1 ? 'entity' : 'entities'} · {sector.people.length}{' '}
            {sector.people.length === 1 ? 'person' : 'people'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_VARIANT[sector.status]}>{STATUS_LABEL[sector.status]}</Badge>
          <Button size="sm" variant="outline" onClick={onAssignLead}>Assign sector lead</Button>
          <Button size="sm" variant="ghost" onClick={onManage}>Manage coverage</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Sector lead</p>
          {sector.lead ? (
            <p>
              {sector.lead.name}
              <span className="ml-2 text-xs text-muted-foreground">
                {sector.lead.areas.length} of {sector.totalAreas} areas
              </span>
            </p>
          ) : (
            <p className="text-muted-foreground">Nobody covers every area of work for this sector.</p>
          )}
        </div>

        <div>
          <p className="text-xs uppercase text-muted-foreground">Supporting staff</p>
          {sector.supporting.length === 0 ? (
            <p className="text-muted-foreground">None recorded.</p>
          ) : (
            <div className="space-y-1">
              {sector.supporting.map((p) => (
                <Collapsible key={p.userId}>
                  <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left hover:bg-accent/40">
                    <span>
                      {p.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {p.areas.map((a) => a.name).join(', ')}
                        {p.wide ? ' (all sectors)' : ''}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.areas.length} {p.areas.length === 1 ? 'area' : 'areas'}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1 px-3 py-2 text-xs text-muted-foreground">
                    {p.areas.map((a) => <p key={a.id}>{a.name}</p>)}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
