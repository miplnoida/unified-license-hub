import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isModuleEnabledFor, type FeatureOverrides, type PackageTier } from '@/lib/subscriptionPackages';

export const SUBSCRIPTION_PACKAGE_QUERY_KEY = ['system-subscription-package'];

export function useSubscriptionPackage() {
  const { data, isLoading } = useQuery({
    queryKey: SUBSCRIPTION_PACKAGE_QUERY_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('system_subscription_package')
        .select('active_package, module_overrides, updated_at')
        .maybeSingle();
      if (error) throw error;
      return data as { active_package: PackageTier; module_overrides: FeatureOverrides; updated_at: string } | null;
    },
  });
  // Until loaded (or if unreadable), do not hide anything.
  const pkg: PackageTier = data?.active_package ?? 'PACKAGE_C';
  const overrides: FeatureOverrides = data?.module_overrides ?? {};
  const isModuleEnabled = useCallback((m: string | null | undefined) => isModuleEnabledFor(m, pkg, overrides), [pkg, overrides]);
  return { activePackage: pkg, overrides, updatedAt: data?.updated_at, isLoading, isModuleEnabled };
}
