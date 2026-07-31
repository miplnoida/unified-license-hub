import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type NotificationSeverity = 'critical' | 'high' | 'medium' | 'low';
export type NotificationCategory = 'action_required' | 'alert' | 'system' | 'info';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  channel: string;
  delivery_status: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  module: string | null;
  action_required: boolean;
  dismissed_at: string | null;
  dismiss_note: string | null;
  actioned_at: string | null;
  event_key: string | null;
  metadata: Record<string, unknown> | null;
}

export interface NotificationCounts {
  total: number;
  unread: number;
  unread_urgent: number;
  action_required: number;
  alerts: number;
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
  markActioned: (id: string, target?: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const EMPTY_COUNTS: NotificationCounts = {
  total: 0,
  unread: 0,
  unread_urgent: 0,
  action_required: 0,
  alerts: 0,
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [counts, setCounts] = useState<NotificationCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);

  const loadCounts = useCallback(async () => {
    const { data } = await supabase.rpc('notification_counts' as never);
    if (data) setCounts({ ...EMPTY_COUNTS, ...(data as unknown as NotificationCounts) });
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('channel', 'in_app')
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    setNotifications((data || []) as unknown as AppNotification[]);
    setLoading(false);
    await loadCounts();
  }, [user, loadCounts]);

  useEffect(() => {
    load();
    if (!user) return;

    const channel = supabase
      .channel('notif-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const n = payload.new as AppNotification;
        if (n.channel === 'in_app') {
          setNotifications(prev => (prev.some(p => p.id === n.id) ? prev : [n, ...prev]));
          loadCounts();
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const n = payload.new as AppNotification;
        setNotifications(prev =>
          n.dismissed_at
            ? prev.filter(existing => existing.id !== n.id)
            : prev.map(existing => existing.id === n.id ? { ...existing, ...n } : existing)
        );
        loadCounts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, load, loadCounts]);

  const unreadCount = counts.unread || notifications.filter(n => !n.read).length;

  const markManyRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n));
    await supabase.rpc('notification_mark_read' as never, { _ids: ids } as never);
    await loadCounts();
  }, [loadCounts]);

  const markRead = useCallback(async (id: string) => {
    await markManyRead([id]);
  }, [markManyRead]);

  const markAllRead = useCallback(async (category?: NotificationCategory) => {
    setNotifications(prev => prev.map(n => (!category || n.category === category) ? { ...n, read: true } : n));
    await supabase.rpc('notification_mark_all_read' as never, { _category: category ?? null } as never);
    await loadCounts();
  }, [loadCounts]);

  const dismiss = useCallback(async (ids: string[], note?: string) => {
    if (ids.length === 0) return;
    setNotifications(prev => prev.filter(n => !ids.includes(n.id)));
    await supabase.rpc('notification_dismiss' as never, { _ids: ids, _note: note ?? null } as never);
    await loadCounts();
  }, [loadCounts]);

  const markActioned = useCallback(async (id: string, target?: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true, actioned_at: new Date().toISOString() } : n));
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
        markActioned,
        refresh: load,
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
