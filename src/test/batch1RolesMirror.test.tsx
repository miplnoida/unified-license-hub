import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
const api = vi.hoisted(() => ({ from: vi.fn(), mirrorError: null as Error | null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: api }));
vi.mock('@/lib/rbac/authorizedAction', () => ({ authorizedAction: vi.fn() }));
import { useRoles } from '@/hooks/useRoles';
beforeEach(() => {
  cleanup();
  api.mirrorError = null;
  api.from.mockReset().mockImplementation((table: string) => {
    const result = table === 'sec_roles'
      ? { data: [{ id: 'role-1', name: 'Reviewer' }], error: null }
      : { data: [{ id: 'role-1', scope_config: { applications: { scope: 'own' } }, access_summary: { view: true } }], error: api.mirrorError };
    return { select: () => ({ ...Promise.resolve(result), order: () => Promise.resolve(result), then: Promise.resolve(result).then.bind(Promise.resolve(result)) }) };
  });
});
it('surfaces mirror failures and retries without supplying empty authority', async () => {
  api.mirrorError = new Error('mirror denied');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useRoles(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
  expect(result.current.error).toBe(api.mirrorError);
  api.mirrorError = null;
  await act(async () => { await result.current.refetch(); });
  await waitFor(() => expect(result.current.data?.[0].scope_config).toEqual({ applications: { scope: 'own' } }));
  api.mirrorError = new Error('refresh failed');
  await act(async () => { await result.current.refetch(); });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data?.[0].scope_config).toEqual({ applications: { scope: 'own' } });
});
