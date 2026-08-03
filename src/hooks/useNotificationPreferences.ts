import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { NotificationDigestFrequency, NotificationSeverity } from '@/types/notifications';

export interface PreferenceLocks {
  in_app?: string;
  email?: string;
  sms?: string;
  digest?: string;
  muted?: string;
}

export interface PreferenceRow {
  event_key: string;
  name: string;
  module: string;
  severity: NotificationSeverity;
  description: string | null;
  system_required: boolean;
  allow_mute: boolean;
  channels: string[];
  in_app_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  digest_frequency: NotificationDigestFrequency;
  muted: boolean;
  updated_at: string | null;
  locks: PreferenceLocks;
}

export interface PreferenceMatrix {
  sms_available: boolean;
  last_updated_at: string | null;
  events: PreferenceRow[];
}

export type PreferenceField =
  | 'in_app_enabled'
  | 'email_enabled'
  | 'sms_enabled'
  | 'muted'
  | 'digest_frequency';

const QKEY = ['notification-preference-matrix'];

/** Server locks are authoritative; the UI mirrors them so users see why. */
export function isLocked(row: PreferenceRow, field: PreferenceField): string | undefined {
  switch (field) {
    case 'in_app_enabled':
      return row.locks.in_app;
    case 'email_enabled':
      return row.locks.email;
    case 'sms_enabled':
      return row.locks.sms;
    case 'muted':
      return row.locks.muted;
    case 'digest_frequency':
      return row.locks.digest;
    default:
      return undefined;
  }
}

export function rowsDiffer(a: PreferenceRow, b: PreferenceRow): boolean {
  return (
    a.in_app_enabled !== b.in_app_enabled ||
    a.email_enabled !== b.email_enabled ||
    a.sms_enabled !== b.sms_enabled ||
    a.muted !== b.muted ||
    a.digest_frequency !== b.digest_frequency
  );
}

export function useNotificationPreferences() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: QKEY,
    queryFn: async (): Promise<PreferenceMatrix> => {
      const { data, error } = await supabase.rpc('notification_preference_matrix' as never);
      if (error) throw error;
      const m = (data ?? {}) as unknown as PreferenceMatrix;
      return {
        sms_available: Boolean(m.sms_available),
        last_updated_at: m.last_updated_at ?? null,
        events: (m.events ?? []).map((e) => ({ ...e, locks: e.locks ?? {} })),
      };
    },
  });

  const [draft, setDraft] = useState<PreferenceRow[]>([]);

  useEffect(() => {
    if (query.data) setDraft(query.data.events);
  }, [query.data]);

  const baseline = query.data?.events ?? [];

  const dirtyKeys = useMemo(() => {
    const byKey = new Map(baseline.map((r) => [r.event_key, r]));
    return draft
      .filter((r) => {
        const original = byKey.get(r.event_key);
        return original ? rowsDiffer(original, r) : false;
      })
      .map((r) => r.event_key);
  }, [draft, baseline]);

  const update = useCallback((eventKey: string, patch: Partial<PreferenceRow>) => {
    setDraft((prev) =>
      prev.map((r) => {
        if (r.event_key !== eventKey) return r;
        const next = { ...r, ...patch };
        // Mirror server rules immediately so the UI never shows an invalid state.
        if (next.muted) next.digest_frequency = r.digest_frequency;
        return next;
      }),
    );
  }, []);

  const reset = useCallback(() => setDraft(baseline), [baseline]);

  const save = useMutation({
    mutationFn: async () => {
      const byKey = new Map(draft.map((r) => [r.event_key, r]));
      const items = dirtyKeys.map((k) => {
        const r = byKey.get(k)!;
        return {
          event_key: r.event_key,
          in_app_enabled: r.in_app_enabled,
          email_enabled: r.email_enabled,
          sms_enabled: r.sms_enabled,
          digest_frequency: r.digest_frequency,
          muted: r.muted,
        };
      });
      const { data, error } = await supabase.rpc('notification_preferences_save' as never, {
        _items: items,
      } as never);
      if (error) throw error;
      return data as unknown as { updated: number; last_updated_at: string | null };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QKEY }),
  });

  return {
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
    smsAvailable: query.data?.sms_available ?? false,
    lastUpdatedAt: query.data?.last_updated_at ?? null,
    rows: draft,
    dirtyKeys,
    isDirty: dirtyKeys.length > 0,
    update,
    reset,
    save,
  };
}
