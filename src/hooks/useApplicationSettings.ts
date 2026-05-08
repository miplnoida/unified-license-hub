import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ApplicationSettings {
  /**
   * Single switch controlling re-application for the same applicant + sector +
   * sub-sector + category/service.
   *
   * - true  → applicants CAN submit a new application for the same triple even
   *           if a previous matching application is Approved or Rejected.
   * - false → applicants CANNOT re-apply for the same triple once a previous
   *           matching application is Approved or Rejected.
   *
   * Note: duplicate active / in-progress applications for the same triple are
   * ALWAYS blocked, regardless of this switch. Drafts redirect to continue.
   */
  allow_reapplication: boolean;
  notify_on_form_version_change: boolean;
  notification_channels: ('in_app' | 'email')[];
}

const DEFAULTS: ApplicationSettings = {
  allow_reapplication: true,
  notify_on_form_version_change: true,
  notification_channels: ['in_app', 'email'],
};

export function useApplicationSettings() {
  return useQuery({
    queryKey: ['site_settings', 'application_settings'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('site_settings' as any)
        .select('value')
        .eq('key', 'application_settings')
        .maybeSingle() as any);
      if (error) throw error;
      const raw = (data?.value || {}) as Partial<ApplicationSettings> & { allow_reapplication_after_final?: boolean };
      // Backwards-compat: prefer the new single switch; fall back to legacy
      // `allow_reapplication_after_final` if older settings are still stored.
      const merged: ApplicationSettings = {
        ...DEFAULTS,
        ...raw,
        allow_reapplication:
          typeof raw.allow_reapplication === 'boolean'
            ? raw.allow_reapplication
            : (typeof raw.allow_reapplication_after_final === 'boolean'
              ? raw.allow_reapplication_after_final
              : DEFAULTS.allow_reapplication),
      };
      return merged;
    },
  });
}

export function useSaveApplicationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: ApplicationSettings) => {
      const { error } = await (supabase
        .from('site_settings' as any)
        .upsert({ key: 'application_settings', value: settings }, { onConflict: 'key' }) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site_settings', 'application_settings'] });
      sessionStorage.removeItem('site_settings_cache');
    },
  });
}
