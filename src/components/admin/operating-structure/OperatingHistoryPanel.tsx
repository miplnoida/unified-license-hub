import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useRegulators, useRegulatoryFunctions, useRegulatoryTeams, useStaffDirectory, useStaffPortfolios,
  useTeamMembers,
} from '@/hooks/useOperatingStructure';
import { effectiveRange } from './shared';

/**
 * History — ended responsibilities and unit memberships, plus regulators kept
 * for historical reference only. Read-only; nothing here is part of daily
 * administration.
 */
export function OperatingHistoryPanel() {
  const portfolios = useStaffPortfolios();
  const members = useTeamMembers();
  const staff = useStaffDirectory();
  const functions = useRegulatoryFunctions();
  const teams = useRegulatoryTeams();
  const regulators = useRegulators();

  const staffName = (id: string) => (staff.data || []).find((s: any) => s.id === id)?.full_name || 'Staff member';
  const fnName = (id: string | null) => (functions.data || []).find((f: any) => f.id === id)?.name || 'Area of work';
  const teamName = (id: string | null) => (teams.data || []).find((t: any) => t.id === id)?.name || 'Unit';

  const endedPortfolios = (portfolios.data?.portfolios || []).filter((p: any) => p.status !== 'active');
  const endedMemberships = (members.data || []).filter((m: any) => m.status !== 'active');
  const historicalRegulators = (regulators.data || []).filter((r: any) => String(r.status || '').toLowerCase() !== 'active');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Ended responsibilities</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {endedPortfolios.map((p: any) => (
            <p key={p.id}>
              {staffName(p.user_id)} — {fnName(p.regulatory_function_id)}
              <span className="ml-2 text-xs text-muted-foreground">
                {effectiveRange(p.effective_from, p.effective_to)}
              </span>
            </p>
          ))}
          {endedPortfolios.length === 0 && <p className="text-muted-foreground">None.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Ended unit memberships</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {endedMemberships.map((m: any) => (
            <p key={m.id}>
              {staffName(m.user_id)} — {teamName(m.team_id)}
              <span className="ml-2 text-xs text-muted-foreground">
                {effectiveRange(m.effective_from, m.effective_to)}
              </span>
            </p>
          ))}
          {endedMemberships.length === 0 && <p className="text-muted-foreground">None.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Historical regulators</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {historicalRegulators.map((r: any) => (
            <p key={r.id}>
              {r.name}
              <span className="ml-2 text-xs text-muted-foreground">{r.status}</span>
            </p>
          ))}
          {historicalRegulators.length === 0 && <p className="text-muted-foreground">None.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
