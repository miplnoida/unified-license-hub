import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { siteSettingSave } from '@/lib/configWriter';

export const DEFAULT_FROM_NAME = 'OLRAS';
export const DEFAULT_FROM_EMAIL = 'OLRAS@mishainfotech.us';

export interface SmtpSettings {
  host: string;
  port: number;
  username: string;
  password?: string;
  encryption: 'none' | 'ssl' | 'tls';
  fromName: string;
  fromEmail: string;
  enabled: boolean;
}

export interface SmsSettings {
  provider: 'twilio' | 'vonage' | 'messagebird';
  apiKey?: string;
  senderId: string;
  enabled: boolean;
}

/** General email delivery settings shared by every provider. */
export interface EmailGeneralSettings {
  enabled: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  autoFallback: boolean;
}

/**
 * Resend (primary provider). The API key is NEVER stored here — it lives in a
 * server-only secret store and is written through a governed RPC.
 */
export interface ResendSettings {
  enabled: boolean;
  status: 'not_configured' | 'missing_api_key' | 'domain_not_verified' | 'provider_error' | 'tested_ok';
  lastTestedAt?: string | null;
  lastError?: string | null;
}

export interface EmailSmsSettings {
  email: EmailGeneralSettings;
  resend: ResendSettings;
  smtp: SmtpSettings;
  sms: SmsSettings;
}

export const DEFAULTS: EmailSmsSettings = {
  email: {
    enabled: true,
    fromName: DEFAULT_FROM_NAME,
    fromEmail: DEFAULT_FROM_EMAIL,
    replyTo: '',
    autoFallback: true,
  },
  resend: {
    enabled: false,
    status: 'not_configured',
    lastTestedAt: null,
    lastError: null,
  },
  smtp: {
    host: '',
    port: 587,
    username: '',
    password: '',
    encryption: 'tls',
    fromName: '',
    fromEmail: '',
    enabled: false,
  },
  sms: {
    provider: 'twilio',
    apiKey: '',
    senderId: '',
    enabled: false,
  },
};

const QKEY = ['site_settings', 'email_sms_settings'];

export function useEmailSmsSettings() {
  return useQuery({
    queryKey: QKEY,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('site_settings' as any)
        .select('value')
        .eq('key', 'email_sms_settings')
        .maybeSingle() as any);
      if (error) throw error;
      const v = (data?.value || {}) as Partial<EmailSmsSettings>;
      return {
        email: { ...DEFAULTS.email, ...(v.email || {}) },
        resend: { ...DEFAULTS.resend, ...(v.resend || {}) },
        smtp: { ...DEFAULTS.smtp, ...(v.smtp || {}) },
        sms: { ...DEFAULTS.sms, ...(v.sms || {}) },
      } as EmailSmsSettings;
    },
  });
}

/** Whether a Resend API key exists server-side (status only, value never returned). */
export function useResendKeyPresent() {
  return useQuery({
    queryKey: ['email_provider_secret', 'resend_api_key'],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('email_provider_secret_present', {
        _key: 'resend_api_key',
      });
      if (error) return false;
      return data === true;
    },
  });
}

export function useSaveResendApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (apiKey: string) => {
      const { error } = await (supabase.rpc as any)('email_provider_secret_set', {
        _key: 'resend_api_key',
        _value: apiKey,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email_provider_secret', 'resend_api_key'] });
    },
  });
}

export function useSaveEmailSmsSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: EmailSmsSettings) => {
      // Preserve existing secrets when blank
      const { data: existing } = await (supabase
        .from('site_settings' as any)
        .select('value')
        .eq('key', 'email_sms_settings')
        .maybeSingle() as any);
      const prev = (existing?.value || {}) as Partial<EmailSmsSettings>;

      const merged: EmailSmsSettings = {
        email: { ...DEFAULTS.email, ...(prev.email || {}), ...settings.email },
        resend: { ...DEFAULTS.resend, ...(prev.resend || {}), ...settings.resend },
        smtp: {
          // SMTP configuration is never destroyed by Resend changes.
          ...(prev.smtp || {}),
          ...settings.smtp,
          port: Number(settings.smtp.port) || 587,
          password: settings.smtp.password && settings.smtp.password.length > 0
            ? settings.smtp.password
            : (prev.smtp?.password || ''),
        },
        sms: {
          ...(prev.sms || {}),
          ...settings.sms,
          apiKey: settings.sms.apiKey && settings.sms.apiKey.length > 0
            ? settings.sms.apiKey
            : (prev.sms?.apiKey || ''),
        },
      };

      await siteSettingSave('email_sms_settings', merged);
      return merged;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QKEY });
      try { sessionStorage.removeItem('site_settings_cache'); } catch { /* noop */ }
    },
  });
}
