import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CaptchaProvider = 'recaptcha_v2' | 'recaptcha_v3' | 'turnstile' | 'hcaptcha';

export interface ActiveCaptcha {
  id: string;
  provider: CaptchaProvider;
  site_key: string;
  environment: 'sandbox' | 'production';
}

export interface CaptchaConfiguration extends ActiveCaptcha {
  name: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Global on/off switch stored in site_settings + the active provider config.
 * When the switch is off (or nothing is configured), the registration form falls
 * back to the simple acknowledgement checkbox so onboarding never breaks.
 */
export function useCaptchaRuntime() {
  return useQuery({
    queryKey: ['captcha-runtime'],
    staleTime: 60_000,
    queryFn: async (): Promise<{ enabled: boolean; config: ActiveCaptcha | null }> => {
      const [settingRes, configRes] = await Promise.all([
        supabase.from('site_settings').select('value').eq('key', 'captcha_enabled').maybeSingle(),
        supabase.rpc('get_active_captcha'),
      ]);

      const raw = settingRes.data?.value;
      const enabled = raw === true || raw === 'true';
      const rows = (configRes.data ?? []) as ActiveCaptcha[];
      const config = rows.length ? rows[0] : null;

      return { enabled: enabled && !!config, config };
    },
  });
}

export function useCaptchaConfigurations() {
  return useQuery({
    queryKey: ['captcha-configurations'],
    queryFn: async (): Promise<CaptchaConfiguration[]> => {
      const { data, error } = await supabase
        .from('captcha_configurations')
        .select('id, name, provider, site_key, environment, is_active, notes, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CaptchaConfiguration[];
    },
  });
}

export const CAPTCHA_PROVIDER_LABELS: Record<CaptchaProvider, string> = {
  recaptcha_v2: 'Google reCAPTCHA v2 (checkbox)',
  recaptcha_v3: 'Google reCAPTCHA v3 (invisible)',
  turnstile: 'Cloudflare Turnstile',
  hcaptcha: 'hCaptcha',
};
