import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

let response: { data: unknown; error: unknown } = { data: null, error: null };
const calls = { count: 0 };
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ maybeSingle: () => { calls.count += 1; return Promise.resolve(response); } }) }),
  },
}));
import { useSubscriptionPackage, SUBSCRIPTION_PACKAGE_QUERY_KEY } from '@/hooks/useSubscriptionPackage';

const row = (active_package: string, module_overrides = {}) => ({ data: { active_package, module_overrides, updated_at: 't' }, error: null });
const setup = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, ...renderHook(() => useSubscriptionPackage(), { wrapper }) };
};

describe('SEC-03 package scenarios', () => {
  beforeEach(() => { response = { data: null, error: null }; calls.count = 0; });

  it('Package A: licensing on, prudential and AML off', async () => {
    response = row('PACKAGE_A');
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isModuleEnabled('license_management')).toBe(true);
    expect(result.current.isModuleEnabled('prudential_supervision')).toBe(false);
    expect(result.current.isModuleEnabled('aml_supervision')).toBe(false);
  });

  it('Package B: prudential on, AML and appeals off', async () => {
    response = row('PACKAGE_B');
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isModuleEnabled('prudential_supervision')).toBe(true);
    expect(result.current.isModuleEnabled('aml_supervision')).toBe(false);
    expect(result.current.isModuleEnabled('license_appeals')).toBe(false);
  });

  it('Package C: AML, appeals and AI on', async () => {
    response = row('PACKAGE_C');
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isModuleEnabled('aml_supervision')).toBe(true);
    expect(result.current.isModuleEnabled('license_appeals')).toBe(true);
    expect(result.current.isModuleEnabled('ai_management')).toBe(true);
  });

  it('an unrecognised package value is an error, not a guessed tier', async () => {
    response = row('PACKAGE_Z');
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.activePackage).toBeNull();
    expect(result.current.isModuleEnabled('returns_management')).toBe(false);
    expect(result.current.isModuleEnabled('settings')).toBe(true);
  });

  it('switching C -> A after refresh hides AML', async () => {
    response = row('PACKAGE_C');
    const { result, qc } = setup();
    await waitFor(() => expect(result.current.isModuleEnabled('aml_supervision')).toBe(true));
    response = row('PACKAGE_A');
    await act(async () => { await qc.invalidateQueries({ queryKey: SUBSCRIPTION_PACKAGE_QUERY_KEY }); });
    await waitFor(() => expect(result.current.activePackage).toBe('PACKAGE_A'));
    expect(result.current.isModuleEnabled('aml_supervision')).toBe(false);
  });

  it('a failed refresh does not keep serving the stale cached Package C', async () => {
    response = row('PACKAGE_C');
    const { result, qc } = setup();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    response = { data: null, error: { message: 'network' } };
    await act(async () => { await qc.invalidateQueries({ queryKey: SUBSCRIPTION_PACKAGE_QUERY_KEY }); });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.activePackage).toBeNull();
    expect(result.current.isModuleEnabled('aml_supervision')).toBe(false);
  });

  it('retry after a temporary failure recovers the confirmed package', async () => {
    response = { data: null, error: { message: 'timeout' } };
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('error'));
    response = row('PACKAGE_B');
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.activePackage).toBe('PACKAGE_B');
    expect(result.current.isModuleEnabled('prudential_supervision')).toBe(true);
    expect(calls.count).toBe(2);
  });
});
