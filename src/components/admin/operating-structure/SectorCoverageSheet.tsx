import { useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { usePortfolioMutations } from '@/hooks/useOperatingStructure';
import { act } from './shared';
import { STATUS_LABEL, type SectorCoverage } from './sectorCoverage';
import { SectorLeadDialog, SupportingStaffDialog } from './SectorAssignDialogs';

/**
 * Manage sector coverage — one focused drawer per sector. It never reopens a
 * general-purpose configuration dialog: the sector is fixed and every action is
 * a small, named task.
 */
export function SectorCoverageSheet({
  sector, open, onOpenChange,
}: {
  sector: SectorCoverage | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { endPortfolio } = usePortfolioMutations();
  const [lead, setLead] = useState(false);
  const [staffDialog, setStaffDialog] = useState<{ open: boolean; userId: string | null }>({
    open: false, userId: null,
  });

  if (!sector) return null;

  const removePerson = (portfolioIds: string[]) =>
    act(async () => {
      for (const id of portfolioIds) await endPortfolio.mutateAsync({ portfolioId: id });
    }, 'Responsibilities ended');

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{sector.name}</SheetTitle>
            <SheetDescription>
              {STATUS_LABEL[sector.status]} · areas covered {sector.areasCovered} / {sector.totalAreas} ·{' '}
              {sector.entityCount} {sector.entityCount === 1 ? 'entity' : 'entities'}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-5">
            <section>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sector lead
                </p>
                <Button size="sm" variant="outline" onClick={() => setLead(true)}>
                  {sector.lead ? 'Change lead' : 'Set lead'}
                </Button>
              </div>
              {sector.lead ? (
                <div className="mt-2 rounded-md border p-3 text-sm">
                  <p className="font-medium">{sector.lead.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Full sector responsibility · {sector.lead.areas.length}{' '}
                    {sector.lead.areas.length === 1 ? 'area' : 'areas'}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nobody covers every applicable area of work for this sector yet.
                </p>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Supporting staff
                </p>
                <Button data-rbac="user_management.create" size="sm" onClick={() => setStaffDialog({ open: true, userId: null })}>
                  + Add supporting staff
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {sector.supporting.map((p) => (
                  <div key={p.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.areas.map((a) => a.name).join(', ')}
                        {p.wide && <Badge variant="secondary" className="ml-2">All sectors</Badge>}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button data-rbac="user_management.edit"
                        size="sm"
                        variant="outline"
                        onClick={() => setStaffDialog({ open: true, userId: p.userId })}
                      >
                        Edit
                      </Button>
                      <GuardedButton module="user_management" action="edit" data-rbac="user_management.edit"
                        size="sm"
                        variant="ghost"
                        onClick={() => removePerson(p.areas.map((a) => a.portfolioId))}
                      >
                        Remove
                      </GuardedButton>
                    </div>
                  </div>
                ))}
                {sector.supporting.length === 0 && (
                  <p className="text-sm text-muted-foreground">No supporting staff recorded.</p>
                )}
              </div>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <SectorLeadDialog
        open={lead}
        onOpenChange={setLead}
        sectorId={sector.id}
        sectorName={sector.name}
      />
      <SupportingStaffDialog
        open={staffDialog.open}
        onOpenChange={(v) => setStaffDialog({ open: v, userId: v ? staffDialog.userId : null })}
        sectorId={sector.id}
        sectorName={sector.name}
        userId={staffDialog.userId}
      />
    </>
  );
}
