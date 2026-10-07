import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  isActiveNotification,
  resolveNotificationStatus,
  type NotificationCategory,
  type NotificationRecord,
  type NotificationSeverity,
  type NotificationStatus,
} from '@/types/notifications';

export type { NotificationSeverity, NotificationCategory, NotificationStatus };

/** Canonical notification shape; legacy fields remain available for older screens. */
export type AppNotification = NotificationRecord;

export interface NotificationCounts {
  total: number;
  unread: number;
  unread_urgent: number;
  action_required: number;
  alerts: number;
  archived: number;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  loading: boolean;
  unreadCount: number;
  counts: NotificationCounts;
  markRead: (id: string) => Promise<void>;
  markManyRead: (ids: string[]) => Promise<void>;
  markAllRead: (category?: NotificationCategory) => Promise<void>;
  dismiss: (ids: string[], note?: string) => Promise<void>;
  archive: (ids: string[]) => Promise<void>;
  markActioned: (id: string, target?: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** Epoch ms of the most recent critical/high notification received live. */
  lastUrgentAt: number | null;
}

const EMPTY_COUNTS: NotificationCounts = {
  total: 0,
  unread: 0,
  unread_urgent: 0,
  action_required: 0,
  alerts: 0,
  archived: 0,
};


const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Key on the user id only: hydration replaces the user object several times
  // during sign-in, which previously re-ran this load and re-subscribed (08E).
  const userId = user?.id ?? null;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [counts, setCounts] = useState<NotificationCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [lastUrgentAt, setLastUrgentAt] = useState<number | null>(null);

  const loadCounts = useCallback(async () => {
    const { data } = await supabase.rpc('notification_counts' as never);
    if (data) setCounts({ ...EMPTY_COUNTS, ...(data as unknown as NotificationCounts) });
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('channel', 'in_app')
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    const rows = (data || []) as unknown as AppNotification[];
    setNotifications(rows.filter(isActiveNotification));
    setLoading(false);
    await loadCounts();
  }, [userId, loadCounts]);

  useEffect(() => {
    load();
    if (!userId) return;

    // Realtime is primary; a 60s poll keeps counts fresh if the socket drops.
    const poll = setInterval(() => { load(); }, 60_000);

    const channel = supabase
      .channel('notif-' + userId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const n = payload.new as AppNotification;
        if (n.channel === 'in_app' && isActiveNotification(n)) {
          setNotifications(prev => (prev.some(p => p.id === n.id) ? prev : [n, ...prev]));
          if (n.severity === 'critical' || n.severity === 'high') {
            setLastUrgentAt(Date.now());
          }
          loadCounts();
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const n = payload.new as AppNotification;
        setNotifications(prev =>
          !isActiveNotification(n)
            ? prev.filter(existing => existing.id !== n.id)
            : prev.map(existing => existing.id === n.id ? { ...existing, ...n } : existing)
        );
        loadCounts();
      })
      .subscribe();

    return () => { clearInterval(poll); supabase.removeChannel(channel); };
  }, [userId, load, loadCounts]);


  const unreadCount = counts.unread
    || notifications.filter(n => resolveNotificationStatus(n) === 'unread').length;

  const markManyRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true, status: 'read' as NotificationStatus } : n));
    await supabase.rpc('notification_mark_read' as never, { _ids: ids } as never);
    await loadCounts();
  }, [loadCounts]);

  const markRead = useCallback(async (id: string) => {
    await markManyRead([id]);
  }, [markManyRead]);

  const markAllRead = useCallback(async (category?: NotificationCategory) => {
    setNotifications(prev => prev.map(n => (!category || n.category === category)
      ? { ...n, read: true, status: (resolveNotificationStatus(n) === 'unread' ? 'read' : n.status) as NotificationStatus }
      : n));
    await supabase.rpc('notification_mark_all_read' as never, { _category: category ?? null } as never);
    await loadCounts();
  }, [loadCounts]);

  const dismiss = useCallback(async (ids: string[], note?: string) => {
    if (ids.length === 0) return;
    // Dismissed notifications remain stored server-side; they are only hidden here.
    setNotifications(prev => prev.filter(n => !ids.includes(n.id)));
    await supabase.rpc('notification_dismiss' as never, { _ids: ids, _note: note ?? null } as never);
    await loadCounts();
  }, [loadCounts]);

  const archive = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setNotifications(prev => prev.filter(n => !ids.includes(n.id)));
    await supabase.rpc('notification_archive' as never, { _ids: ids } as never);
    await loadCounts();
  }, [loadCounts]);

  const markActioned = useCallback(async (id: string, target?: string) => {
    setNotifications(prev => prev.map(n => n.id === id
      ? { ...n, read: true, status: 'actioned' as NotificationStatus, actioned_at: new Date().toISOString() }
      : n));
    await supabase.rpc('notification_mark_actioned' as never, { _id: id, _target: target ?? null } as never);
    await loadCounts();
  }, [loadCounts]);

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        loading,
        unreadCount,
        counts,
        markRead,
        markManyRead,
        markAllRead,
        dismiss,
        archive,
        markActioned,
        refresh: load,
        lastUrgentAt,
      }}
    >

      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotificationsContext must be used within a NotificationsProvider');
  }
  return ctx;
}
