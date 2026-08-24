import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { EntitySupervisionTab } from '@/components/admin/operating-structure/EntitySupervisionTab';
import { PanelsCommitteesTab } from '@/components/admin/operating-structure/PanelsCommitteesTab';
import { TeamAdminTab } from '@/components/admin/operating-structure/TeamAdminTab';
import { StaffResponsibilityTab } from '@/components/admin/operating-structure/StaffResponsibilityTab';
import { MandateAdminTab } from '@/components/admin/operating-structure/MandateAdminTab';
import { useRegulatorMandates, useRoleRegistryDrift, useStaffPortfolios } from '@/hooks/useOperatingStructure';

/**
 * Administration → Regulatory Operating Structure.
 *
 * The single configuration console for WHO works here, WHAT organisational
 * responsibilities they hold, WHERE those responsibilities apply, WHICH teams
 * they belong to and WHICH entities / functions they own.
 *
 * Every write is performed by a governed SECURITY DEFINER routine — the client
 * holds no DML grant on any operating-structure table, and recording structure
 * can only narrow authority, never widen it.
 */
type Warning = {
  code: string;
  severity: string;
  subject_type: string;
  subject_id: string | null;
  subject: string;
  detail: string;
};

function useWarnings() {
  return useQuery({
    queryKey: ['regulatory-coverage-warnings'],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('regulatory_coverage_warnings');
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Warning[];
    },
  });
}

export default function OperatingStructure() {
  const warnings = useWarnings();
  const drift = useRoleRegistryDrift();
  const mandates = useRegulatorMandates();
  const portfolios = useStaffPortfolios();

  const enforcedFunctions = (mandates.data?.enforcement || []).filter(
    (e: any) => e.enforcement_status === 'ACTIVE',
  ).length;
  const activePortfolios = (portfolios.data?.portfolios || []).filter((p: any) => p.status === 'active').length;


  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Regulatory Operating Structure</h1>
        <p className="text-sm text-muted-foreground">
          Functional responsibility groups, staff responsibilities and coverage warnings. The same
          employee may legitimately appear in several teams and functions — organisational overlap is
          allowed; conflicting actions on the same matter are blocked by the backend.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-1 py-4 text-xs text-muted-foreground sm:grid-cols-3">
          <p>
            <span className="font-semibold text-foreground">Mandates:</span> Configured — Not Enforced
            (regulator mandate enforcement remains inactive until sector coverage is reviewed).
          </p>
          <p>
            <span className="font-semibold text-foreground">Portfolios:</span>{' '}
            PORTFOLIO_CONFIGURATION_REQUIRED — no applicable portfolio means no additional restriction.
          </p>
          <p>
            <span className="font-semibold text-foreground">Role registry:</span>{' '}
            {drift.data?.missing?.length
              ? `ROLE_REGISTRY_RECONCILIATION_REQUIRED — missing: ${drift.data.missing.join(', ')}`
              : 'No expected role keys missing.'}
          </p>
        </CardContent>
      </Card>


      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="staff">Staff Responsibilities</TabsTrigger>
          <TabsTrigger value="supervision">Entity Supervision</TabsTrigger>
          <TabsTrigger value="bodies">Panels &amp; Committees</TabsTrigger>
          <TabsTrigger value="warnings">Coverage Warnings</TabsTrigger>
        </TabsList>

        <TabsContent value="supervision" className="mt-4">
          <EntitySupervisionTab />
        </TabsContent>

        <TabsContent value="bodies" className="mt-4">
          <PanelsCommitteesTab />
        </TabsContent>


        <TabsContent value="teams" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Functional responsibility groups</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(teams.data || []).map((t) => (
                <div key={t.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{t.name}</span>
                    <Badge variant={t.status === 'active' ? 'default' : 'secondary'}>{t.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.code}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Internal staff</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[540px] space-y-1 overflow-auto">
                {(directory.data || []).map((u) => (
                  <button
                    key={u.user_id}
                    onClick={() => setSelected(u.user_id)}
                    className={`w-full rounded-md border p-2 text-left text-sm hover:bg-accent/40 ${
                      selected === u.user_id ? 'border-primary bg-accent/30' : ''
                    }`}
                  >
                    <div className="font-medium">{u.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.roles} roles · {u.teams} teams · {u.functions} functions · {u.entities} entities
                    </div>
                  </button>
                ))}
                {(directory.data || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No internal staff visible.</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{p?.user?.full_name || 'Select a member of staff'}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <List title="Roles" items={(p.roles || []).map((r: any) => r.name)} />
                <List
                  title="Teams"
                  items={(p.teams || []).map(
                    (t: any) => `${t.name} — ${t.member_role}${t.expired ? ' (expired)' : ''}`,
                  )}
                />
                <List
                  title="Functions / Portfolios"
                  items={(p.portfolios || []).map((x: any) => `${x.function || 'Function'} — ${x.regulator || 'All'}`)}
                />
                <List
                  title="Entity responsibilities"
                  items={(p.entity_assignments || []).map(
                    (e: any) => `${e.entity_name || 'Entity'} — ${e.function || 'Function'} ${e.role}`,
                  )}
                />
                <List
                  title="Examination roles"
                  items={(p.examinations || []).map((x: any) => `${x.reference || x.title} — ${x.team_role || 'member'}`)}
                />
                <List
                  title="Decision bodies"
                  items={[
                    ...(p.appeal_panels || []).map(
                      (x: any) => `${x.name} — ${x.is_voting ? 'Voting Member' : x.member_role}`,
                    ),
                    ...(p.committees || []).map((x: any) => `${x.name} — ${x.member_role}`),
                  ]}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="warnings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Coverage warnings ({(warnings.data || []).length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Management information only — these never grant permissions or lower a quorum.
              </p>
              {(warnings.data || []).map((w, i) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={w.severity === 'high' ? 'destructive' : 'secondary'}>{w.code}</Badge>
                    <span className="text-sm font-medium">{w.subject}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{w.detail}</p>
                </div>
              ))}
              {(warnings.data || []).length === 0 && (
                <p className="text-sm text-muted-foreground">No coverage warnings.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
