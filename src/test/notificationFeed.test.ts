import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { useNotificationFeed, NOTIFICATION_PAGE_SIZE } from '@/hooks/useNotificationFeed';

const row = (id: string, created_at = '2026-08-01T10:00:00Z') => ({
  id, created_at, title: `n-${id}`, message: 'm', severity: 'medium',
  category: 'info', status: 'unread', read: false, channel: 'in_app',
});

beforeEach(() => rpc.mockReset());

describe('useNotificationFeed', () => {
  it('passes tab and filters to notification_feed', async () => {
    rpc.mockResolvedValue({ data: [row('a')], error: null });
    renderHook(() => useNotificationFeed({
      tab: 'action_required', module: 'licensing', severity: 'high',
      status: 'unread', from: null, to: null, search: '',
    }));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('notification_feed');
    expect(args._tab).toBe('action_required');
    expect(args._module).toBe('licensing');
    expect(args._severity).toBe('high');
    expect(args._status).toBe('unread');
    expect(args._limit).toBe(NOTIFICATION_PAGE_SIZE);
    expect(args._cursor_created_at).toBeNull();
  });

  it('ignores searches shorter than 3 characters', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderHook(() => useNotificationFeed({ tab: 'all', search: 'ab' }));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect((rpc.mock.calls[0][1] as Record<string, unknown>)._search).toBeNull();
  });

  it('sends searches of 3 or more characters', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderHook(() => useNotificationFeed({ tab: 'all', search: '  abc ' }));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect((rpc.mock.calls[0][1] as Record<string, unknown>)._search).toBe('abc');
  });

  it('reports hasMore only when a full page is returned', async () => {
    rpc.mockResolvedValue({
      data: Array.from({ length: NOTIFICATION_PAGE_SIZE }, (_, i) => row(String(i))),
      error: null,
    });
    const { result } = renderHook(() => useNotificationFeed({ tab: 'all' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);
    expect(result.current.rows).toHaveLength(NOTIFICATION_PAGE_SIZE);
  });

  it('pages with a keyset cursor and de-duplicates rows', async () => {
    const first = Array.from({ length: NOTIFICATION_PAGE_SIZE }, (_, i) =>
      row(String(i), `2026-08-01T10:00:${String(i).padStart(2, '0')}Z`));
    rpc.mockResolvedValueOnce({ data: first, error: null });
    const { result } = renderHook(() => useNotificationFeed({ tab: 'all' }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    rpc.mockResolvedValueOnce({ data: [first[0], row('new')], error: null });
    await act(async () => { await result.current.loadMore(); });

    const args = rpc.mock.calls[1][1] as Record<string, unknown>;
    expect(args._cursor_created_at).toBe(first[first.length - 1].created_at);
    expect(args._cursor_id).toBe(first[first.length - 1].id);
    expect(result.current.rows.filter(r => r.id === first[0].id)).toHaveLength(1);
    expect(result.current.rows.some(r => r.id === 'new')).toBe(true);
  });

  it('surfaces a recoverable error instead of throwing', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useNotificationFeed({ tab: 'all' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(result.current.rows).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it('supports optimistic patch and removal for read/archive actions', async () => {
    rpc.mockResolvedValue({ data: [row('a'), row('b')], error: null });
    const { result } = renderHook(() => useNotificationFeed({ tab: 'all' }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.patchRow('a', { read: true, status: 'read' }));
    expect(result.current.rows.find(r => r.id === 'a')?.status).toBe('read');

    act(() => result.current.removeRows(['b']));
    expect(result.current.rows.map(r => r.id)).toEqual(['a']);
  });
});
