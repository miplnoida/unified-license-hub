import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Settings2 } from 'lucide-react';
import { OverviewTab } from '@/components/admin/operating-structure/OverviewTab';
import { PeopleTab } from '@/components/admin/operating-structure/PeopleTab';
import { TeamAdminTab } from '@/components/admin/operating-structure/TeamAdminTab';
import { CoverageTab } from '@/components/admin/operating-structure/CoverageTab';
import { PanelsCommitteesTab } from '@/components/admin/operating-structure/PanelsCommitteesTab';
import { MandateAdminTab } from '@/components/admin/operating-structure/MandateAdminTab';
import { RegulatorsAdminTab } from '@/components/admin/operating-structure/RegulatorsAdminTab';

import { WarningAction } from '@/components/admin/operating-structure/shared';
import { useRegulatorMandates, useRoleRegistryDrift, useStaffPortfolios } from '@/hooks/useOperatingStructure';

/**
 * Administration → Operating Structure.
 *
 * Organised around the questions an administrator actually asks: who are my
 * people, what teams exist, who covers each sector and entity, which panels can
 * sit, and where are the gaps. Mandate/enforcement architecture is kept out of
 * the daily path in Advanced authority settings.
 *
 * Authority semantics are unchanged: every write still goes through a governed
 * SECURITY DEFINER routine, and recording structure can only narrow authority.
 */
export default function OperatingStructure() {
  const [tab, setTab] = useState('overview');
  const [coverageView, setCoverageView] = useState<'sectors' | 'entities'>('sectors');
  const [advanced, setAdvanced] = useState(false);

  const drift = useRoleRegistryDrift();
  const mandates = useRegulatorMandates();
  const portfolios = useStaffPortfolios();

  const enforcedFunctions = (mandates.data?.enforcement || []).filter(
    (e: any) => e.enforcement_status === 'ACTIVE',
  ).length;
  const activePortfolios = (portfolios.data?.portfolios || []).filter((p: any) => p.status === 'active').length;

  const navigate = (action: WarningAction) => {
    if (action === 'team') setTab('teams');
    else if (action === 'people') setTab('people');
    else if (action === 'panel') setTab('bodies');
    else {
      setCoverageView(action === 'entity' ? 'entities' : 'sectors');
      setTab('coverage');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Operating Structure</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Who works here, what they are responsible for, where those responsibilities apply and which
            entities they look after. The same person may sit in several teams and cover several areas of
            work — recording structure never grants a permission.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAdvanced(true)}>
          <Settings2 className="mr-2 h-4 w-4" /> Advanced authority settings
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-1 py-4 text-xs text-muted-foreground sm:grid-cols-3">
          <p>
            <span className="font-semibold text-foreground">Responsibilities recorded:</span>{' '}
            {activePortfolios > 0
              ? `${activePortfolios} active — staff without one are not restricted to a sector.`
              : 'None yet — nobody is narrowed to a sector or entity.'}
          </p>
          <p>
            <span className="font-semibold text-foreground">Authority restrictions:</span>{' '}
            {enforcedFunctions > 0
              ? `${enforcedFunctions} area(s) of work restricted by mandate.`
              : 'Not enforced — mandates place no restriction.'}
          </p>
          <p>
            <span className="font-semibold text-foreground">Role registry:</span>{' '}
            {drift.data?.missing?.length
              ? `Reconciliation required — missing: ${drift.data.missing.join(', ')}`
              : 'Complete.'}
          </p>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
          <TabsTrigger value="bodies">Panels &amp; Committees</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab onNavigate={navigate} />
        </TabsContent>

        <TabsContent value="people" className="mt-4">
          <PeopleTab />
        </TabsContent>

        <TabsContent value="teams" className="mt-4">
          <TeamAdminTab />
        </TabsContent>

        <TabsContent value="coverage" className="mt-4">
          <CoverageTab key={coverageView} initialView={coverageView} />
        </TabsContent>

        <TabsContent value="bodies" className="mt-4">
          <PanelsCommitteesTab />
        </TabsContent>
      </Tabs>

      <Sheet open={advanced} onOpenChange={setAdvanced}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Advanced authority settings</SheetTitle>
            <SheetDescription>
              Mandates describe what this regulator is legally responsible for. They place no restriction
              until enforcement is switched on for an area of work. Changing these settings can stop staff
              from acting — normal staffing and coverage work does not need this screen.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <RegulatorsAdminTab />
            <MandateAdminTab />
          </div>

        </SheetContent>
      </Sheet>
    </div>
  );
}
