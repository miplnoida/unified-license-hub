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
          Configure who works here, what they are responsible for, where those responsibilities apply
          and which entities they own. The same employee may legitimately appear in several teams and
          functions — organisational overlap is allowed; conflicting actions on the same matter are
          blocked by the backend. Structure never grants a permission.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-1 py-4 text-xs text-muted-foreground sm:grid-cols-3">
          <p>
            <span className="font-semibold text-foreground">Mandate enforcement:</span>{' '}
            {enforcedFunctions > 0
              ? `${enforcedFunctions} function(s) enforced — a covering mandate is required.`
              : 'Draft everywhere — mandates place no restriction yet.'}
          </p>
          <p>
            <span className="font-semibold text-foreground">Functional responsibilities:</span>{' '}
            {activePortfolios > 0
              ? `${activePortfolios} active — staff without one are not restricted by portfolios.`
              : 'None recorded — portfolios place no restriction.'}
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
        <TabsList className="flex-wrap">
          <TabsTrigger value="staff">Staff Responsibilities</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="mandates">Mandates &amp; Enforcement</TabsTrigger>
          <TabsTrigger value="supervision">Entity Supervision</TabsTrigger>
          <TabsTrigger value="bodies">Panels &amp; Committees</TabsTrigger>
          <TabsTrigger value="warnings">Coverage Warnings</TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="mt-4">
          <StaffResponsibilityTab />
        </TabsContent>

        <TabsContent value="teams" className="mt-4">
          <TeamAdminTab />
        </TabsContent>

        <TabsContent value="mandates" className="mt-4">
          <MandateAdminTab />
        </TabsContent>

        <TabsContent value="supervision" className="mt-4">
          <EntitySupervisionTab />
        </TabsContent>

        <TabsContent value="bodies" className="mt-4">
          <PanelsCommitteesTab />
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
