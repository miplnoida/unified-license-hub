import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ReviewSettings {
  registration_review_enabled: boolean;
  application_review_enabled: boolean;
  return_review_enabled: boolean;
  review_mode: 'readonly' | 'editable';
}

const DEFAULTS: ReviewSettings = {
  registration_review_enabled: true,
  application_review_enabled: true,
  return_review_enabled: false,
  review_mode: 'readonly',
};

export function useReviewSettings() {
  return useQuery({
    queryKey: ['site_settings', 'review_settings'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('site_settings' as any)
        .select('value')
        .eq('key', 'review_settings')
        .maybeSingle() as any);
      if (error) throw error;
      return { ...DEFAULTS, ...(data?.value || {}) } as ReviewSettings;
    },
  });
}

export function useSaveReviewSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: ReviewSettings) => {
      const { error } = await (supabase
        .from('site_settings' as any)
        .upsert({ key: 'review_settings', value: settings }, { onConflict: 'key' }) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site_settings', 'review_settings'] });
    },
  });
}
