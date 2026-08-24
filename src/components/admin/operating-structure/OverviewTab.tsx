import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useAppealPanelsWithMembers, useCoverageWarnings, useFpCommittees, useRegulatoryFunctions,
  useRegulatoryTeams, useSectors, useStaffDirectory, useSubSectors, useSupervisionAssignments,
} from '@/hooks/useOperatingStructure';
import { ACTION_LABEL, humaniseWarning, WarningAction } from './shared';

/**
 * Management overview — the answers an administrator wants before drilling in:
 * how big is the organisation, where is coverage missing, which decision bodies
 * cannot sit. Read-only; every fix is performed from People, Teams, Coverage or
 * Panels & Committees through the governed routines.
 */
export function OverviewTab({ onNavigate }: { onNavigate: (action: WarningAction) => void }) {
  const staff = useStaffDirectory();
  const teams = useRegulatoryTeams();
  const functions = useRegulatoryFunctions();
  const sectors = useSectors();
  const subSectors = useSubSectors();
  const assignments = useSupervisionAssignments();
  const warnings = useCoverageWarnings();
  const panels = useAppealPanelsWithMembers();
  const committees = useFpCommittees();

  const supervisedEntities = useMemo(() => {
    const ids = new Set(
      (assignments.data || []).filter((a) => a.status === 'active').map((a) => a.entity_id),
    );
    return ids.size;
  }, [assignments.data]);

  const notReady = useMemo(() => {
    const now = Date.now();
    const panelsNotReady = (panels.data?.panels || []).filter((p: any) => {
      const roster = (panels.data?.members || []).filter(
        (m: any) => m.panel_id === p.id && m.is_active && (!m.effective_to || new Date(m.effective_to).getTime() > now),
      );
      const voting = roster.filter((m: any) => m.is_voting).length;
      return !p.is_active || !roster.some((m: any) => m.is_chair) || voting < p.quorum;
    }).length;
    const committeesNotReady = (committees.data?.committees || []).filter((c: any) => {
      const voters = (committees.data?.members || []).filter(
        (m: any) => m.committee_id === c.id && m.is_active && m.member_role !== 'observer',
      ).length;
      return !c.is_active || voters < c.quorum;
    }).length;
    return panelsNotReady + committeesNotReady;
  }, [panels.data, committees.data]);

  const alerts = warnings.data || [];

  const cards = [
    { label: 'People', value: (staff.data || []).length, action: 'people' as WarningAction },
    { label: 'Teams', value: (teams.data || []).length, action: 'team' as WarningAction },
    { label: 'Areas of work', value: (functions.data || []).length, action: 'coverage' as WarningAction },
    { label: 'Sectors', value: (sectors.data || []).length, action: 'coverage' as WarningAction },
    { label: 'Sub-sectors', value: (subSectors.data || []).length, action: 'coverage' as WarningAction },
    { label: 'Entities with a supervisor', value: supervisedEntities, action: 'entity' as WarningAction },
    { label: 'Coverage gaps', value: alerts.length, action: 'coverage' as WarningAction },
    { label: 'Panels not ready', value: notReady, action: 'panel' as WarningAction },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <CardHeader>
          <CardTitle>Coverage alerts ({alerts.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Staffing and coverage information only. These never grant permissions and never lower a quorum.
          </p>
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
                  <p className="mt-1 text-xs text-muted-foreground">Details: {w.detail} ({w.code})</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => onNavigate(h.action)}>
                  {ACTION_LABEL[h.action]}
                </Button>
              </div>
            );
          })}
          {alerts.length === 0 && <p className="text-sm text-muted-foreground">No coverage gaps detected.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
