import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRegulatorMutations } from '@/hooks/useRegulators';
import {
  useRegulatorMandates, useRegulators, useRegulatoryTeams, useSectors,
  useStaffPortfolios, useSupervisionAssignments,
} from '@/hooks/useOperatingStructure';
import { act } from './shared';

/**
 * Regulator master data for the Advanced authority settings sheet.
 *
 * Regulators are never deleted here — where structure or history references a
 * regulator it stays readable and is simply deactivated so it can no longer be
 * linked to new responsibilities, teams or assignments.
 */
export function RegulatorsAdminTab() {
  const regulators = useRegulators();
  const sectors = useSectors();
  const teams = useRegulatoryTeams();
  const portfolios = useStaffPortfolios();
  const assignments = useSupervisionAssignments();
  const mandates = useRegulatorMandates();
  const { upsert } = useRegulatorMutations();

  const rows = useMemo(() => {
    const count = (list: any[] | undefined, id: string, key = 'regulator_id') =>
      (list || []).filter((r: any) => r[key] === id).length;
    return (regulators.data || []).map((r: any) => {
      const sectorList = (sectors.data || []).filter((s: any) => s.regulator_id === r.id);
      const functions = new Set(
        (mandates.data?.mandates || [])
          .filter((m: any) => m.regulator_id === r.id)
          .map((m: any) => m.regulatory_function_id),
      );
      const used =
        sectorList.length +
        count(teams.data, r.id) +
        count(portfolios.data?.portfolios, r.id) +
        count(assignments.data?.assignments, r.id) +
        functions.size;
      return {
        ...r,
        sectors: sectorList,
        teams: count(teams.data, r.id),
        people: count(portfolios.data?.portfolios, r.id),
        entities: count(assignments.data?.assignments, r.id),
        functions: functions.size,
        used,
        active: String(r.status || '').toLowerCase() === 'active',
      };
    });
  }, [regulators.data, sectors.data, teams.data, portfolios.data, assignments.data, mandates.data]);

  const setStatus = (row: any, status: string) =>
    act(
      () =>
        upsert.mutateAsync({
          id: row.id, name: row.name, code: row.code, description: row.description || '', status,
        }),
      status === 'active' ? 'Regulator activated' : 'Regulator deactivated',
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Regulators</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/regulators">Full regulator management</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Only active regulators can be linked to new responsibilities, teams and entity ownership.
          Deactivating a regulator keeps every historical record intact.
        </p>
        {rows.map((r) => (
          <div key={r.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{r.name}</span>
              <Badge variant="outline" className="font-mono text-xs">{r.code}</Badge>
              <Badge variant={r.active ? 'default' : 'secondary'}>
                {r.active ? 'Active' : 'Not used for new structure'}
              </Badge>
              <span className="ml-auto flex gap-2">
                {r.active ? (
                  <Button size="sm" variant="outline" onClick={() => setStatus(r, 'inactive')}>
                    Deactivate
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setStatus(r, 'active')}>
                    Activate
                  </Button>
                )}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {r.functions} areas of work · {r.sectors.length} sectors · {r.teams} teams ·{' '}
              {r.people} people responsibilities · {r.entities} entities
              {r.used === 0 && ' · no structure references this regulator'}
            </p>
            {r.sectors.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Sectors: {r.sectors.map((s: any) => s.name).join(', ')}
              </p>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No regulators configured.</p>}
      </CardContent>
    </Card>
  );
}
