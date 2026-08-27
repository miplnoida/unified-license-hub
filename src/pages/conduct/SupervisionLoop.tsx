import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileDown, Loader2, RotateCcw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { SupervisionCycleSankey } from '@/components/conduct/supervision-loop/SupervisionCycleSankey';
import { EffectivenessKpis } from '@/components/conduct/supervision-loop/EffectivenessKpis';
import { EntityConductTimeline } from '@/components/conduct/supervision-loop/EntityConductTimeline';
import { UnresolvedRisksPanel } from '@/components/conduct/supervision-loop/UnresolvedRisksPanel';
import { RegulatoryLearningFeed } from '@/components/conduct/supervision-loop/RegulatoryLearningFeed';
import { StageDrilldownDialog } from '@/components/conduct/supervision-loop/StageDrilldownDialog';
import {
  useSupervisionLoopSummary, useSupervisionLoopCases, useSupervisionTimeline,
  useUnresolvedRisks, useRegulatoryLearning, useConductEntityOptions, useLogSupervisionEvent,
  type LoopFilters,
} from '@/hooks/useSupervisionLoop';
import {
  EMPTY_SUMMARY, buildSupervisionLoopHtml, printSupervisionReport, periodRange,
  type LoopFunnel,
} from '@/lib/conduct/supervisionLoop';
import { useUserRole } from '@/hooks/useUserPermissions';

export default function SupervisionLoop() {
  const [params, setParams] = useSearchParams();
  const [preset, setPreset] = useState<'6m' | '12m' | '24m' | 'custom'>('12m');
  const initial = periodRange('12m');
  const [range, setRange] = useState({ from: initial.from, to: initial.to });
  const [entityId, setEntityId] = useState<string | null>(params.get('entity'));
  const [stage, setStage] = useState<keyof LoopFunnel | null>(null);

  const { data: entities = [] } = useConductEntityOptions();
  const role = useUserRole();
  const canAnnotate = !!role && ['super_admin', 'admin', 'supervisor'].includes(role);

  const filters: LoopFilters = { entityId, sectorId: null, from: range.from, to: range.to };

  const summaryQ = useSupervisionLoopSummary(filters);
  const timelineQ = useSupervisionTimeline(entityId, range.from, range.to);
  const risksQ = useUnresolvedRisks(entityId, null);
  const learningQ = useRegulatoryLearning(25);
  const casesQ = useSupervisionLoopCases(stage, filters);
  const { logView, logExport } = useLogSupervisionEvent();

  const summary = summaryQ.data ?? EMPTY_SUMMARY;
  const entityName = entityId ? (entities.find((e) => e.id === entityId)?.name ?? 'Selected entity') : 'All entities';

  useEffect(() => {
    logView({ entity_id: entityId, from: range.from, to: range.to });
    // Log once per scope change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, range.from, range.to]);

  const applyPreset = (p: '6m' | '12m' | '24m') => {
    setPreset(p);
    setRange(periodRange(p));
  };

  const selectEntity = (v: string) => {
    const id = v === 'all' ? null : v;
    setEntityId(id);
    const next = new URLSearchParams(params);
    if (id) next.set('entity', id); else next.delete('entity');
    setParams(next, { replace: true });
  };

  const exportReport = async () => {
    const html = buildSupervisionLoopHtml({
      entityName,
      summary,
      timeline: timelineQ.data ?? [],
      risks: risksQ.data ?? [],
      learning: learningQ.data ?? [],
    });
    const ok = printSupervisionReport(html);
    if (!ok) {
      toast({ title: 'Popup blocked', description: 'Allow popups to generate the conduct report.', variant: 'destructive' });
      return;
    }
    await logExport({ entity_id: entityId, from: range.from, to: range.to, scope: entityName });
    toast({ title: 'Conduct report generated', description: 'Use your browser print dialog to save as PDF.' });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title="Supervision Loop"
          description="Closed-loop conduct oversight — intake through resolution, enforcement, and recurrence monitoring"
          actions={
            <Button data-rbac="market_conduct.run_conduct_analytics" onClick={exportReport} disabled={summaryQ.isLoading}>
              <FileDown className="h-4 w-4 mr-1" /> Export Full Conduct Report
            </Button>
          }
        />

        <Card>
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[260px]">
              <Label className="text-xs">Entity</Label>
              <Select value={entityId ?? 'all'} onValueChange={selectEntity}>
                <SelectTrigger className="h-9"><SelectValue placeholder="All entities" /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="all">All entities (sector view)</SelectItem>
                  {entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Period</Label>
              <div className="flex gap-1">
                {(['6m', '12m', '24m'] as const).map((p) => (
                  <Button key={p} size="sm" variant={preset === p ? 'default' : 'outline'} onClick={() => applyPreset(p)}>
                    {p.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs" htmlFor="from">From</Label>
              <Input id="from" type="date" className="h-9 w-[150px]" value={range.from}
                onChange={(e) => { setPreset('custom'); setRange({ ...range, from: e.target.value }); }} />
            </div>
            <div>
              <Label className="text-xs" htmlFor="to">To</Label>
              <Input id="to" type="date" className="h-9 w-[150px]" value={range.to}
                onChange={(e) => { setPreset('custom'); setRange({ ...range, to: e.target.value }); }} />
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setEntityId(null); applyPreset('12m'); setParams(new URLSearchParams(), { replace: true }); }}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>
            <Badge variant="outline" className="ml-auto">
              {summaryQ.isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : `${summary.entity_count} entit${summary.entity_count === 1 ? 'y' : 'ies'} in scope`}
            </Badge>
          </CardContent>
        </Card>

        {summaryQ.isError && (
          <Card><CardContent className="p-4 text-sm text-destructive">
            Unable to load supervision loop data: {(summaryQ.error as Error).message}
          </CardContent></Card>
        )}

        <SupervisionCycleSankey funnel={summary.funnel} onStageClick={(s) => setStage(s)} />

        <EffectivenessKpis effectiveness={summary.effectiveness} funnel={summary.funnel} />

        <EntityConductTimeline
          entityId={entityId}
          entityName={entityName}
          events={timelineQ.data ?? []}
          isLoading={timelineQ.isLoading}
          canAnnotate={canAnnotate}
        />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <UnresolvedRisksPanel risks={risksQ.data ?? []} isLoading={risksQ.isLoading} />
          <RegulatoryLearningFeed items={learningQ.data ?? []} isLoading={learningQ.isLoading} />
        </div>

        <StageDrilldownDialog
          stage={stage}
          cases={casesQ.data ?? []}
          isLoading={casesQ.isLoading}
          onOpenChange={(open) => { if (!open) setStage(null); }}
        />
      </div>
    </DashboardLayout>
  );
}
