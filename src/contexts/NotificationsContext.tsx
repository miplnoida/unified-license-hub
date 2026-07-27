import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  loading: boolean;
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('channel', 'in_app')
      .order('created_at', { ascending: false })
      .limit(100);
    setNotifications((data || []) as AppNotification[]);
    setLoading(false);
  }, [user]);

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
          prev.map(existing => existing.id === n.id ? { ...existing, ...n } : existing)
        );
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const deleted = payload.old as { id: string };
        if (deleted?.id) {
          setNotifications(prev => prev.filter(existing => existing.id !== deleted.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const ids = notifications.filter(n => !n.read).map(n => n.id);
    if (ids.length === 0) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await supabase.from('notifications').update({ read: true }).in('id', ids);
  }, [user, notifications]);

  return (
    <NotificationsContext.Provider
      value={{ notifications, loading, unreadCount, markRead, markAllRead, refresh: load }}
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
