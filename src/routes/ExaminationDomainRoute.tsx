/**
 * Canonical examination route guard.
 *
 * `/supervision/examinations/:id` serves the ONE enterprise examination
 * workspace for every supervisory domain. Authorization is derived from the
 * examination's own `domain_code` (the record's real domain), so an AML
 * examiner never has to hold the Prudential module permission to open an
 * AML/CFT examination — and a prudential officer cannot reach an AML case
 * through the canonical URL either.
 *
 * The database remains the final authority: RLS and the governed examination
 * operations enforce entity scope, maker/checker and confidentiality.
 */
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ModuleRoute } from '@/components/auth/RouteGuards';
import { P } from '@/routes/routeHelpers';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';
import type { PermissionModule } from '@/lib/permissionModules';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';

const sb = supabase as any;

/** Supervisory domain → permission module that owns that domain's casework. */
export function moduleForSupervisoryDomain(domain?: string | null): PermissionModule {
  switch ((domain ?? '').toUpperCase()) {
    case 'AML_CFT':
    case 'AML':
      return 'aml_supervision';
    case 'CONDUCT':
    case 'MARKET_CONDUCT':
      return 'market_conduct';
    default:
      return 'prudential_supervision';
  }
}

export function useExaminationDomain(id?: string) {
  return useQuery({
    queryKey: ['examination', 'domain', id],
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await sb
        .from('examinations')
        .select('id, domain_code')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data?.domain_code as string | null) ?? null;
    },
  });
}

/**
 * Module gate for an examination (or examination finding) route.
 *
 * Prudential examinations are readable by the database for holders of either
 * `prudential_supervision.view` or `inspection_management.view`
 * (`can_read_examination`). The route gate mirrors that rule so an Inspection
 * Supervisor is not refused a page the database would show them. Entity scope
 * stays with RLS. AML and Conduct domains are unchanged.
 */
export function useExaminationGateModule(domain?: string | null): PermissionModule {
  const { hasPermission } = useUserDynamicPermissions();
  const module = moduleForSupervisoryDomain(domain);
  if (
    module === 'prudential_supervision'
    && !hasPermission('prudential_supervision', 'view')
    && hasPermission('inspection_management', 'view')
  ) {
    return 'inspection_management' as PermissionModule;
  }
  return module;
}

/**
 * Wraps a page in the module gate that corresponds to the examination's real
 * supervisory domain. While the domain is resolving we show the standard
 * loading screen rather than guessing a module.
 */
export function ExaminationDomainRoute({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const { data: domain, isLoading, isError } = useExaminationDomain(id);
  // Unreadable record (RLS) or unknown domain: fall back to the owning module
  // of the canonical supervisory spine so the guard still denies cleanly.
  const module = useExaminationGateModule(isError ? null : domain);

  if (isLoading) return <AuthLoadingScreen />;

  return (
    <P>
      <ModuleRoute module={module}>{children}</ModuleRoute>
    </P>
  );
}

export default ExaminationDomainRoute;
