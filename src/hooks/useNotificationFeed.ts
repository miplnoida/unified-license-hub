/**
 * NOT-CEN-001 — server-side notification feed.
 *
 * Wraps the `notification_feed` RPC (keyset pagination + tab semantics) so the
 * Notification Centre never filters a full table client-side. Search is ignored
 * server-side below 3 characters, mirroring the FRD rule.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AppNotification } from '@/contexts/NotificationsContext';

export type NotificationTab =
  | 'all'
  | 'unread'
  | 'action_required'
  | 'alerts'
  | 'system'
  | 'archived';

export interface NotificationFeedFilters {
  tab: NotificationTab;
  module?: string | null;
  severity?: string | null;
  type?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
}

export const NOTIFICATION_PAGE_SIZE = 25;

interface Cursor {
  created_at: string;
  id: string;
}

export function useNotificationFeed(filters: NotificationFeedFilters) {
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursor = useRef<Cursor | null>(null);
  const reqId = useRef(0);

  const key = JSON.stringify(filters);

  const fetchPage = useCallback(
    async (mode: 'reset' | 'more') => {
      const id = ++reqId.current;
      if (mode === 'reset') {
        cursor.current = null;
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const search = (filters.search || '').trim();
      const { data, error: rpcError } = await supabase.rpc('notification_feed' as never, {
        _tab: filters.tab,
        _module: filters.module || null,
        _severity: filters.severity || null,
        _type: filters.type || null,
        _status: filters.status || null,
        _from: filters.from || null,
        _to: filters.to || null,
        _search: search.length >= 3 ? search : null,
        _cursor_created_at: mode === 'more' ? cursor.current?.created_at ?? null : null,
        _cursor_id: mode === 'more' ? cursor.current?.id ?? null : null,
        _limit: NOTIFICATION_PAGE_SIZE,
      } as never);

      if (id !== reqId.current) return;

      if (rpcError) {
        setError(rpcError.message || 'Could not load notifications');
        if (mode === 'reset') setRows([]);
        setHasMore(false);
      } else {
        const page = (data || []) as unknown as AppNotification[];
        setRows(prev => {
          const next = mode === 'reset' ? page : [...prev, ...page];
          const seen = new Set<string>();
          return next.filter(n => (seen.has(n.id) ? false : (seen.add(n.id), true)));
        });
        const last = page[page.length - 1];
        cursor.current = last ? { created_at: last.created_at, id: last.id } : cursor.current;
        setHasMore(page.length === NOTIFICATION_PAGE_SIZE);
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [filters],
  );

  useEffect(() => {
    fetchPage('reset');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const patchRow = useCallback((id: string, patch: Partial<AppNotification>) => {
    setRows(prev => prev.map(n => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  const removeRows = useCallback((ids: string[]) => {
    setRows(prev => prev.filter(n => !ids.includes(n.id)));
  }, []);

  return {
    rows,
    loading,
    loadingMore,
    error,
    hasMore,
    reload: () => fetchPage('reset'),
    loadMore: () => fetchPage('more'),
    patchRow,
    removeRows,
  };
}
