import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CaptchaProvider = 'recaptcha_v2' | 'recaptcha_v3' | 'turnstile' | 'hcaptcha';

export interface ActiveCaptcha {
  id: string;
  provider: CaptchaProvider;
  site_key: string;
  environment: 'sandbox' | 'production';
  score_threshold?: number | null;
  expected_action?: string | null;
}

export interface CaptchaConfiguration extends ActiveCaptcha {
  name: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaptchaRuntime {
  /** CAPTCHA is on AND a usable active configuration exists. */
  enabled: boolean;
  config: ActiveCaptcha | null;
  /** Global switch is on but no active configuration exists — public forms must block. */
  misconfigured: boolean;
  /** Raw value of the global switch, independent of configuration availability. */
  globallyEnabled: boolean;
}

/**
 * Global on/off switch stored in site_settings + the active provider config.
 * There is no checkbox fallback: if the switch is on and nothing is configured the
 * runtime is reported as misconfigured and public submission must be blocked.
 */
export function useCaptchaRuntime() {
  return useQuery({
    queryKey: ['captcha-runtime'],
    staleTime: 60_000,
    queryFn: async (): Promise<CaptchaRuntime> => {
      const [settingRes, configRes] = await Promise.all([
        supabase.from('site_settings').select('value').eq('key', 'captcha_enabled').maybeSingle(),
        supabase.rpc('get_active_captcha'),
      ]);

      const raw = settingRes.data?.value;
      const globallyEnabled = raw === true || raw === 'true';
      const rows = (configRes.data ?? []) as ActiveCaptcha[];
      const config = rows.length ? rows[0] : null;

      return {
        enabled: globallyEnabled && !!config,
        config,
        misconfigured: globallyEnabled && !config,
        globallyEnabled,
      };
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
