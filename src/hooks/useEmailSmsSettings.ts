import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

export interface EmailSmsSettings {
  smtp: SmtpSettings;
  sms: SmsSettings;
}

export const DEFAULTS: EmailSmsSettings = {
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
        smtp: { ...DEFAULTS.smtp, ...(v.smtp || {}) },
        sms: { ...DEFAULTS.sms, ...(v.sms || {}) },
      } as EmailSmsSettings;
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
        smtp: {
          ...settings.smtp,
          port: Number(settings.smtp.port) || 587,
          password: settings.smtp.password && settings.smtp.password.length > 0
            ? settings.smtp.password
            : (prev.smtp?.password || ''),
        },
        sms: {
          ...settings.sms,
          apiKey: settings.sms.apiKey && settings.sms.apiKey.length > 0
            ? settings.sms.apiKey
            : (prev.sms?.apiKey || ''),
        },
      };

      const { error } = await (supabase
        .from('site_settings' as any)
        .upsert({ key: 'email_sms_settings', value: merged }, { onConflict: 'key' }) as any);
      if (error) throw error;
      return merged;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QKEY });
      try { sessionStorage.removeItem('site_settings_cache'); } catch { /* noop */ }
    },
  });
}
