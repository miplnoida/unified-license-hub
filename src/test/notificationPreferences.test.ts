import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import {
  isLocked,
  rowsDiffer,
  useNotificationPreferences,
  type PreferenceRow,
} from '@/hooks/useNotificationPreferences';

const baseRow = (over: Partial<PreferenceRow> = {}): PreferenceRow => ({
  event_key: 'evt.medium',
  name: 'Medium event',
  module: 'applications',
  severity: 'medium',
  description: 'desc',
  system_required: false,
  allow_mute: true,
  channels: ['in_app', 'email'],
  in_app_enabled: true,
  email_enabled: true,
  sms_enabled: false,
  digest_frequency: 'immediate',
  muted: false,
  updated_at: null,
  locks: {},
  ...over,
});

const matrix = (rows: PreferenceRow[], smsAvailable = false) => ({
  data: { sms_available: smsAvailable, last_updated_at: null, events: rows },
  error: null,
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('notification preference locks', () => {
  it('surfaces the server reason for each locked control', () => {
    const row = baseRow({
      severity: 'critical',
      system_required: true,
      locks: {
        in_app: 'Critical alerts are always delivered in-app.',
        digest: 'Critical and high urgency notifications are always sent immediately.',
        muted: 'Only low urgency notifications can be muted.',
        sms: 'SMS delivery is not yet configured.',
      },
    });
    expect(isLocked(row, 'in_app_enabled')).toMatch(/always delivered in-app/);
    expect(isLocked(row, 'digest_frequency')).toMatch(/sent immediately/);
    expect(isLocked(row, 'muted')).toMatch(/low urgency/);
    expect(isLocked(row, 'sms_enabled')).toMatch(/not yet configured/);
    expect(isLocked(row, 'email_enabled')).toBeUndefined();
  });

  it('detects changed rows only', () => {
    const a = baseRow();
    expect(rowsDiffer(a, { ...a })).toBe(false);
    expect(rowsDiffer(a, { ...a, digest_frequency: 'daily' })).toBe(true);
    expect(rowsDiffer(a, { ...a, name: 'renamed' })).toBe(false);
  });
});

describe('useNotificationPreferences', () => {
  beforeEach(() => rpc.mockReset());

  it('loads preferences from the server matrix', async () => {
    rpc.mockResolvedValueOnce(matrix([baseRow()], false));
    const { result } = renderHook(() => useNotificationPreferences(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(rpc).toHaveBeenCalledWith('notification_preference_matrix');
    expect(result.current.smsAvailable).toBe(false);
    expect(result.current.isDirty).toBe(false);
  });

  it('tracks dirty state and resets it', async () => {
    rpc.mockResolvedValueOnce(matrix([baseRow()]));
    const { result } = renderHook(() => useNotificationPreferences(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    act(() => result.current.update('evt.medium', { digest_frequency: 'daily' }));
    await waitFor(() => expect(result.current.dirtyKeys).toEqual(['evt.medium']));

    act(() => result.current.reset());
    await waitFor(() => expect(result.current.isDirty).toBe(false));
  });

  it('saves only the changed rows and reports server validation errors', async () => {
    rpc.mockResolvedValueOnce(matrix([baseRow(), baseRow({ event_key: 'evt.low', severity: 'low' })]));
    const { result } = renderHook(() => useNotificationPreferences(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    act(() => result.current.update('evt.low', { muted: true }));
    await waitFor(() => expect(result.current.dirtyKeys).toEqual(['evt.low']));

    rpc.mockResolvedValueOnce({ data: { updated: 1, last_updated_at: '2026-08-03T00:00:00Z' }, error: null });
    await act(async () => { await result.current.save.mutateAsync(); });

    const [fn, payload] = rpc.mock.calls[1] as [string, { _items: unknown[] }];
    expect(fn).toBe('notification_preferences_save');
    expect(payload._items).toEqual([
      {
        event_key: 'evt.low',
        in_app_enabled: true,
        email_enabled: true,
        sms_enabled: false,
        digest_frequency: 'immediate',
        muted: true,
      },
    ]);

    rpc.mockResolvedValueOnce({ data: null, error: new Error('mute_not_permitted_for_event') });
    act(() => result.current.update('evt.medium', { muted: true }));
    await waitFor(() => expect(result.current.isDirty).toBe(true));
    await expect(result.current.save.mutateAsync()).rejects.toThrow(/mute_not_permitted/);
  });
});
