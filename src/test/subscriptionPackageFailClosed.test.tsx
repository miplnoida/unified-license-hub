import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { isModuleEnabledWhenPackageUnavailable } from '@/lib/subscriptionPackages';

let response: { data: unknown; error: unknown } | 'pending' = { data: null, error: null };
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ maybeSingle: () => (response === 'pending' ? new Promise(() => {}) : Promise.resolve(response)) }) }),
  },
}));
import { useSubscriptionPackage } from '@/hooks/useSubscriptionPackage';

const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('SEC-03 package settings fail closed', () => {
  beforeEach(() => { response = { data: null, error: null }; });

  it('unavailable package keeps core modules and hides tiered ones', () => {
    expect(isModuleEnabledWhenPackageUnavailable('settings')).toBe(true);
    expect(isModuleEnabledWhenPackageUnavailable(null)).toBe(true);
    expect(isModuleEnabledWhenPackageUnavailable('aml_supervision')).toBe(false);
    expect(isModuleEnabledWhenPackageUnavailable('returns_management')).toBe(false);
    expect(isModuleEnabledWhenPackageUnavailable('unmapped_module_x')).toBe(false);
  });

  it('while loading, Package C modules are not exposed', () => {
    response = 'pending';
    const { result } = renderHook(() => useSubscriptionPackage(), { wrapper: wrap() });
    expect(result.current.status).toBe('loading');
    expect(result.current.isModuleEnabled('aml_supervision')).toBe(false);
    expect(result.current.isModuleEnabled('settings')).toBe(true);
  });

  it('unreadable setting is an error and hides tiered modules', async () => {
    response = { data: null, error: { message: 'permission denied' } };
    const { result } = renderHook(() => useSubscriptionPackage(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.activePackage).toBeNull();
    expect(result.current.isModuleEnabled('license_appeals')).toBe(false);
  });

  it('missing package row is an error, not Package C', async () => {
    const { result } = renderHook(() => useSubscriptionPackage(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.isModuleEnabled('ai_management')).toBe(false);
  });

  it('loaded Package A keeps controlling availability', async () => {
    response = { data: { active_package: 'PACKAGE_A', module_overrides: {}, updated_at: 'x' }, error: null };
    const { result } = renderHook(() => useSubscriptionPackage(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isModuleEnabled('returns_management')).toBe(true);
    expect(result.current.isModuleEnabled('aml_supervision')).toBe(false);
  });

  it('loaded Package C with an override switching AI off is respected', async () => {
    response = { data: { active_package: 'PACKAGE_C', module_overrides: { ai: false }, updated_at: 'x' }, error: null };
    const { result } = renderHook(() => useSubscriptionPackage(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isModuleEnabled('aml_supervision')).toBe(true);
    expect(result.current.isModuleEnabled('ai_management')).toBe(false);
  });
});
