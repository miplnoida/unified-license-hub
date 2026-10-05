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
    encryption: 'tls',
    fromName: '',
    fromEmail: '',
    enabled: false,
  },
  sms: {
    provider: 'twilio',
    senderId: '',
    enabled: false,
  },
};

const QKEY = ['site_settings', 'email_sms_settings'];

export type ProviderSecretKey = 'resend_api_key' | 'smtp_password' | 'sms_api_key';

/** SEC-CRED-01: provider secrets never live in site_settings — remove them from any settings object. */
export function stripSecrets(s: EmailSmsSettings): EmailSmsSettings {
  const { password: _p, ...smtp } = s.smtp;
  const { apiKey: _k, ...sms } = s.sms;
  const { ...resend } = s.resend as ResendSettings & { apiKey?: string };
  delete (resend as { apiKey?: string }).apiKey;
  return { ...s, smtp: smtp as SmtpSettings, sms: sms as SmsSettings, resend };
}

/** Whether a provider secret exists server-side (status only, value never returned). */
export function useProviderSecretPresent(key: ProviderSecretKey) {
  return useQuery({
    queryKey: ['email_provider_secret', key],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('email_provider_secret_present', { _key: key });
      if (error) return false;
      return data === true;
    },
  });
}

export interface ProviderSecretStatus {
  key: ProviderSecretKey;
  configured: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export class SecretNotSavedError extends Error {
  constructor() { super('SMTP password was not saved. Existing credential remains unchanged.'); }
}

export async function fetchProviderSecretStatus(key: ProviderSecretKey): Promise<ProviderSecretStatus> {
  const { data, error } = await (supabase.rpc as any)('email_provider_secret_status', { _key: key });
  if (error) throw error;
  return data as ProviderSecretStatus;
}

/** Server-backed secret metadata (never the value). */
export function useProviderSecretStatus(key: ProviderSecretKey) {
  return useQuery({ queryKey: ['email_provider_secret_status', key], queryFn: () => fetchProviderSecretStatus(key) });
}

/**
 * Decide whether a secret write is proven: the server must acknowledge a configured
 * secret with a strictly later write time than before, and (when known) by this user.
 */
export function isSecretWriteProven(
  before: Pick<ProviderSecretStatus, 'updated_at'> | null,
  after: Partial<ProviderSecretStatus> | null,
  currentUserId?: string | null,
): boolean {
  if (!after || after.configured !== true || !after.updated_at) return false;
  if (before?.updated_at && !(Date.parse(after.updated_at) > Date.parse(before.updated_at))) return false;
  if (currentUserId && after.updated_by && after.updated_by !== currentUserId) return false;
  return true;
}

/**
 * Write-only secret entry through the governed RPC, with server read-back proof.
 * Throws SecretNotSavedError unless the write is proven.
 */
export async function saveProviderSecret(key: ProviderSecretKey, value: string, currentUserId?: string | null) {
  const before = await fetchProviderSecretStatus(key).catch(() => null);
  const { data: ack, error } = await (supabase.rpc as any)('email_provider_secret_set', { _key: key, _value: value });
  if (error) throw new SecretNotSavedError();
  const after = await fetchProviderSecretStatus(key).catch(() => null);
  if (!isSecretWriteProven(before, ack, currentUserId) || !isSecretWriteProven(before, after, currentUserId)) {
    throw new SecretNotSavedError();
  }
  return after as ProviderSecretStatus;
}

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
      return stripSecrets({
        email: { ...DEFAULTS.email, ...(v.email || {}) },
        resend: { ...DEFAULTS.resend, ...(v.resend || {}) },
        smtp: { ...DEFAULTS.smtp, ...(v.smtp || {}) },
        sms: { ...DEFAULTS.sms, ...(v.sms || {}) },
      } as EmailSmsSettings);
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
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      // Preserve existing secrets when blank
      const { data: existing } = await (supabase
        .from('site_settings' as any)
        .select('value')
        .eq('key', 'email_sms_settings')
        .maybeSingle() as any);
      const prev = (existing?.value || {}) as Partial<EmailSmsSettings>;

      // Secrets typed in the form go only to the server-side secret store.
      if (settings.smtp.password && settings.smtp.password.trim()) {
        await saveProviderSecret('smtp_password', settings.smtp.password.trim(), uid);
      }
      if (settings.sms.apiKey && settings.sms.apiKey.trim()) {
        await saveProviderSecret('sms_api_key', settings.sms.apiKey.trim(), uid);
      }
      const merged = stripSecrets({
        email: { ...DEFAULTS.email, ...(prev.email || {}), ...settings.email },
        resend: { ...DEFAULTS.resend, ...(prev.resend || {}), ...settings.resend },
        // SMTP configuration is never destroyed by Resend changes.
        smtp: { ...DEFAULTS.smtp, ...(prev.smtp || {}), ...settings.smtp, port: Number(settings.smtp.port) || 587 },
        sms: { ...DEFAULTS.sms, ...(prev.sms || {}), ...settings.sms },
      });

      await siteSettingSave('email_sms_settings', merged);
      return merged;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QKEY });
      qc.invalidateQueries({ queryKey: ['email_provider_secret'] });
      qc.invalidateQueries({ queryKey: ['email_provider_secret_status'] });
      try { sessionStorage.removeItem('site_settings_cache'); } catch { /* noop */ }
    },
  });
}
