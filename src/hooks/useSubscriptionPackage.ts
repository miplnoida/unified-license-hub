import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  PACKAGE_ORDER,
  isModuleEnabledFor,
  isModuleEnabledWhenPackageUnavailable,
  type FeatureOverrides,
  type PackageTier,
} from '@/lib/subscriptionPackages';

export const SUBSCRIPTION_PACKAGE_QUERY_KEY = ['system-subscription-package'];

/** loading | error (unreadable, missing row, unrecognised package value or failed refresh) | ready */
export type SubscriptionPackageStatus = 'loading' | 'error' | 'ready';

export function useSubscriptionPackage() {
  const { data, isLoading, isError, refetch } = useQuery({
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
  const status: SubscriptionPackageStatus = isLoading
    ? 'loading'
    : isError || !data?.active_package || !PACKAGE_ORDER.includes(data.active_package)
      ? 'error'
      : 'ready';
  const isReady = status === 'ready';
  // Fail closed: while loading or unreadable, only platform-core modules are available.
  const pkg: PackageTier | null = isReady ? data!.active_package : null;
  const overrides: FeatureOverrides = (isReady && data?.module_overrides) || {};
  const isModuleEnabled = useCallback(
    (m: string | null | undefined) => (pkg ? isModuleEnabledFor(m, pkg, overrides) : isModuleEnabledWhenPackageUnavailable(m)),
    [pkg, overrides],
  );
  const retry = useCallback(() => { void refetch(); }, [refetch]);
  return { activePackage: pkg, overrides, updatedAt: data?.updated_at, isLoading, status, isReady, retry, isModuleEnabled };
}
