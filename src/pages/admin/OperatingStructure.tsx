import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Settings2 } from 'lucide-react';
import { OverviewTab } from '@/components/admin/operating-structure/OverviewTab';
import { PeopleTab } from '@/components/admin/operating-structure/PeopleTab';
import { TeamAdminTab } from '@/components/admin/operating-structure/TeamAdminTab';
import { SectorCoverageTab } from '@/components/admin/operating-structure/SectorCoverageTab';
import { PanelsCommitteesTab } from '@/components/admin/operating-structure/PanelsCommitteesTab';
import { MandateAdminTab } from '@/components/admin/operating-structure/MandateAdminTab';
import { RegulatorsAdminTab } from '@/components/admin/operating-structure/RegulatorsAdminTab';
import { OperatingHistoryPanel } from '@/components/admin/operating-structure/OperatingHistoryPanel';

import { WarningAction } from '@/components/admin/operating-structure/shared';
import { useActiveRegulators } from '@/hooks/useOperatingStructure';

/**
 * Administration → Operating Structure.
 *
 * Four everyday views: Overview, People & Responsibilities, Sector Coverage and
 * Decision Bodies. Organisational units, regulator mandates/enforcement and
 * history live behind Advanced — they remain fully available, just out of the
 * daily path.
 *
 * Authority semantics are unchanged: every write still goes through a governed
 * SECURITY DEFINER routine, and recording structure can only narrow authority.
 */
export default function OperatingStructure() {
  const [tab, setTab] = useState('overview');
  const [coverageView, setCoverageView] = useState<'sectors' | 'entities'>('sectors');
  const [advanced, setAdvanced] = useState<false | 'units' | 'authority' | 'history'>(false);

  const regulators = useActiveRegulators();
  const regulatorName = (regulators.data || [])[0]?.name || 'Regulator not configured';

  const navigate = (action: WarningAction) => {
    if (action === 'team') setAdvanced('units');
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
          <p className="text-sm font-medium">{regulatorName}</p>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Who works here, what they are responsible for and where those responsibilities apply. The
            same person may cover several sectors and several areas of work — recording structure never
            grants a permission.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setAdvanced('units')}>
            <Settings2 className="mr-2 h-4 w-4" /> Advanced
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="people">People &amp; Responsibilities</TabsTrigger>
          <TabsTrigger value="coverage">Sector Coverage</TabsTrigger>
          <TabsTrigger value="bodies">Decision Bodies</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab onNavigate={navigate} />
        </TabsContent>

        <TabsContent value="people" className="mt-4">
          <PeopleTab />
        </TabsContent>

        <TabsContent value="coverage" className="mt-4">
          <SectorCoverageTab key={coverageView} initialView={coverageView} />
        </TabsContent>

        <TabsContent value="bodies" className="mt-4">
          <PanelsCommitteesTab />
        </TabsContent>
      </Tabs>

      <Sheet open={!!advanced} onOpenChange={(v) => setAdvanced(v ? 'units' : false)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Advanced</SheetTitle>
            <SheetDescription>
              Organisational units group staff and never grant a permission. Authority &amp; governance
              settings can stop staff from acting — normal staffing and coverage work does not need them.
            </SheetDescription>
          </SheetHeader>
          <Tabs value={advanced || 'units'} onValueChange={(v) => setAdvanced(v as any)} className="mt-4">
            <TabsList className="flex-wrap">
              <TabsTrigger value="units">Organisational Units</TabsTrigger>
              <TabsTrigger value="authority">Authority &amp; Governance</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="units" className="mt-4">
              <TeamAdminTab />
            </TabsContent>

            <TabsContent value="authority" className="mt-4 space-y-4">
              <RegulatorsAdminTab />
              <MandateAdminTab />
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <OperatingHistoryPanel />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  );
}
