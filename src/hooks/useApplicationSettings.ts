import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ApplicationSettings {
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
      return { ...DEFAULTS, ...(data?.value || {}) } as ApplicationSettings;
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
