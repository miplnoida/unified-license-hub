import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useActiveRegulators, useAppealPanelsWithMembers, useCoverageWarnings, useFpCommittees,
  useRegulatoryFunctions, useStaffDirectory, useSupervisionAssignments,
} from '@/hooks/useOperatingStructure';
import { ACTION_LABEL, humaniseWarning, WarningAction } from './shared';
import { ResponsibilityDialog } from './ResponsibilityDialog';
import { STATUS_LABEL, useSectorCoverage, type CoverageStatus } from './sectorCoverage';

const HEALTH_ORDER: CoverageStatus[] = ['COMPLETE', 'PARTIAL', 'NO_LEAD', 'NO_COVERAGE'];

/**
 * Management overview — the answers an administrator wants before drilling in:
 * how big is the organisation, which sectors are properly covered, which
 * decision bodies are not ready, and what needs attention. Read-only; every fix
 * happens through the governed routines behind the other views.
 */
export function OverviewTab({ onNavigate }: { onNavigate: (action: WarningAction) => void }) {
  const staff = useStaffDirectory();
  const functions = useRegulatoryFunctions();
  const assignments = useSupervisionAssignments();
  const warnings = useCoverageWarnings();
  const panels = useAppealPanelsWithMembers();
  const committees = useFpCommittees();
  const regulators = useActiveRegulators();
  const { data: coverage } = useSectorCoverage();
  const [addResp, setAddResp] = useState(false);

  const regulatorName = (regulators.data || [])[0]?.name || 'Not configured';

  const supervisedEntities = useMemo(
    () => new Set((assignments.data || []).filter((a) => a.status === 'active').map((a) => a.entity_id)).size,
    [assignments.data],
  );

  const bodies = useMemo(() => {
    const now = Date.now();
    const panelList = (panels.data?.panels || []).map((p: any) => {
      const roster = (panels.data?.members || []).filter(
        (m: any) => m.panel_id === p.id && m.is_active && (!m.effective_to || new Date(m.effective_to).getTime() > now),
      );
      const voting = roster.filter((m: any) => m.is_voting).length;
      return { active: p.is_active, ready: !!roster.find((m: any) => m.is_chair) && voting >= p.quorum };
    });
    const committeeList = (committees.data?.committees || []).map((c: any) => {
      const voters = (committees.data?.members || []).filter(
        (m: any) => m.committee_id === c.id && m.is_active && m.member_role !== 'observer',
      ).length;
      return { active: c.is_active, ready: voters >= c.quorum };
    });
    const all = [...panelList, ...committeeList];
    return { total: all.length, notReady: all.filter((b) => !b.active || !b.ready).length };
  }, [panels.data, committees.data]);

  const health = HEALTH_ORDER.map((status) => ({
    status,
    sectors: coverage.filter((s) => s.status === status),
  }));

  const alerts = (warnings.data || []).filter((w) => !!w.code);

  const cards = [
    { label: 'People', value: (staff.data || []).length, action: 'people' as WarningAction },
    { label: 'Sectors covered', value: coverage.filter((s) => s.people.length > 0).length, action: 'coverage' as WarningAction },
    { label: 'Areas of work', value: (functions.data || []).length, action: 'coverage' as WarningAction },
    { label: 'Decision bodies', value: bodies.total, action: 'panel' as WarningAction },
    { label: 'Entities with a supervisor', value: supervisedEntities, action: 'entity' as WarningAction },
    { label: 'Issues needing attention', value: alerts.length + bodies.notReady, action: 'coverage' as WarningAction },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Current regulator</p>
          <p className="mt-1 text-base font-semibold">{regulatorName}</p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="cursor-pointer transition hover:border-primary" onClick={() => onNavigate(c.action)}>
            <CardContent className="py-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
              <p className="mt-1 text-2xl font-semibold">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Quick actions</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onNavigate('coverage')}>Assign sector lead</Button>
            <Button size="sm" variant="outline" onClick={() => setAddResp(true)}>Add staff responsibility</Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate('panel')}>Manage decision bodies</Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Sector coverage health</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {health.map(({ status, sectors }) => (
            <div key={status} className="flex flex-wrap items-start gap-2">
              <Badge
                variant={
                  status === 'COMPLETE' ? 'default' : status === 'NO_COVERAGE' ? 'destructive' : 'secondary'
                }
              >
                {STATUS_LABEL[status]} ({sectors.length})
              </Badge>
              <span className="text-muted-foreground">
                {sectors.length ? sectors.map((s) => s.name).join(', ') : '—'}
              </span>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="px-0" onClick={() => onNavigate('coverage')}>
            Open sector coverage
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Issues needing attention ({alerts.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.map((w, i) => {
            const h = humaniseWarning(w.code);
            return (
              <div key={i} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-[240px] flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={w.severity === 'high' ? 'destructive' : 'secondary'}>
                      {w.severity === 'high' ? 'Needs attention' : 'Review'}
                    </Badge>
                    <span className="text-sm font-medium">{w.subject}</span>
                  </div>
                  <p className="mt-1 text-sm">{h.title}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => onNavigate(h.action)}>
                  {ACTION_LABEL[h.action]}
                </Button>
              </div>
            );
          })}
          {alerts.length === 0 && <p className="text-sm text-muted-foreground">Nothing needs attention.</p>}
        </CardContent>
      </Card>

      <ResponsibilityDialog open={addResp} onOpenChange={setAddResp} userId={null} />
    </div>
  );
}
