/**
 * Canonical finding route guard.
 *
 * `/supervision/findings/:id` is the ONE enterprise finding workspace.
 * Authorization is derived from the finding's own `domain_code`, so an AML/CFT
 * finding is never gated behind the Market Conduct or Prudential module shell,
 * and a prudential-only officer cannot reach an AML finding through the
 * canonical URL. Entity scope, confidentiality and action authority remain the
 * database's decision.
 */
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ModuleRoute } from '@/components/auth/RouteGuards';
import { P } from '@/routes/routeHelpers';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';
import { useExaminationGateModule } from '@/routes/ExaminationDomainRoute';

const sb = supabase as any;

export function useFindingDomain(id?: string) {
  return useQuery({
    queryKey: ['supervisory-finding', 'domain', id],
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await sb
        .from('supervisory_finding')
        .select('id, domain_code')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (data) return (data.domain_code as string | null) ?? null;
      // Historical examination finding: the domain is its examination's.
      const { data: legacy } = await sb
        .from('examination_findings')
        .select('id, examination:examinations(domain_code)')
        .eq('id', id)
        .maybeSingle();
      return (legacy?.examination?.domain_code as string | null) ?? null;
    },
  });
}

export function FindingDomainRoute({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const { data: domain, isLoading, isError } = useFindingDomain(id);
  // Same gate as the examination route; finding visibility stays with RLS.
  const module = useExaminationGateModule(isError ? null : domain);

  if (isLoading) return <AuthLoadingScreen />;

  return (
    <P>
      <ModuleRoute module={module}>{children}</ModuleRoute>
    </P>
  );
}

export default FindingDomainRoute;
