/**
 * Notification administration hooks (FRD screen R-01 + Event Configuration).
 *
 * All writes go through permission-gated SECURITY DEFINER RPCs so the browser
 * can never bypass RBAC or write an unaudited template change:
 *   notification_template_save / _publish / _archive / _clone / _versions_for
 *   notification_event_config_save / notification_event_config_set_active
 *   notification_recipient_rules_validate
 *   notification_template_render_preview / notification_test_send
 *
 * This is the ONLY template system used by the dispatcher — no parallel store.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEmailSmsSettings } from '@/hooks/useEmailSmsSettings';

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase as any).rpc(fn, args);

export type TemplateStatus = 'draft' | 'active' | 'archived';
export type NotificationChannel = 'in_app' | 'email' | 'sms';

export interface NotificationTemplateRow {
  id: string;
  name: string;
  template_code: string | null;
  module: string | null;
  event_key: string | null;
  event_type: string | null;
  channel: string;
  severity: string;
  status: TemplateStatus;
  subject: string | null;
  body: string;
  variables: unknown;
  version: number;
  published_version: number | null;
  updated_at: string | null;
  updated_by: string | null;
  created_at: string;
}

export interface NotificationEventConfigRow {
  id: string;
  event_key: string;
  description: string | null;
  module: string | null;
  notification_type: string | null;
  category: string | null;
  severity: string;
  action_required: boolean;
  system_required: boolean;
  allow_mute: boolean;
  channels: string[] | null;
  recipient_rules: any;
  dedupe_window_seconds: number | null;
  delivery_frequency: string;
  failure_escalation: any;
  is_active: boolean;
  title_template: string | null;
  message_template: string | null;
  email_subject_template: string | null;
  email_body_template: string | null;
}

export interface RecipientRuleSpec {
  type: string;
  label: string;
  requires: string[];
}

export const CHANNEL_LABELS: Record<string, string> = {
  in_app: 'In-App',
  email: 'Email',
  sms: 'SMS',
};

/** Recipient rule vocabulary the dispatcher can actually execute. */
export function useRecipientRuleTypes() {
  return useQuery({
    queryKey: ['notification-recipient-rule-types'],
    queryFn: async (): Promise<RecipientRuleSpec[]> => {
      const { data, error } = await rpc('notification_recipient_rule_types', {});
      if (error) throw error;
      return (data as RecipientRuleSpec[]) || [];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useNotificationTemplateList() {
  return useQuery({
    queryKey: ['notification-admin-templates'],
    queryFn: async (): Promise<NotificationTemplateRow[]> => {
      const { data, error } = await (supabase as any)
        .from('notification_templates')
        .select('*')
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as NotificationTemplateRow[];
    },
  });
}

export function useTemplateVersions(templateId: string | null) {
  return useQuery({
    queryKey: ['notification-template-versions', templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await rpc('notification_template_versions_for', {
        _template_id: templateId,
      });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

export function useEventConfigs() {
  return useQuery({
    queryKey: ['notification-admin-events'],
    queryFn: async (): Promise<NotificationEventConfigRow[]> => {
      const { data, error } = await (supabase as any)
        .from('notification_event_configs')
        .select('*')
        .order('event_key');
      if (error) throw error;
      return (data || []) as NotificationEventConfigRow[];
    },
  });
}

export function useEventChannelTemplates() {
  return useQuery({
    queryKey: ['notification-event-channel-templates'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('notification_event_channel_templates')
        .select('id, event_config_id, channel, template_id, template_version');
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        event_config_id: string;
        channel: string;
        template_id: string;
        template_version: number | null;
      }>;
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['notification-admin-templates'] });
    qc.invalidateQueries({ queryKey: ['notification-admin-events'] });
    qc.invalidateQueries({ queryKey: ['notification-event-channel-templates'] });
    qc.invalidateQueries({ queryKey: ['notification-template-versions'] });
  };
}

export function useSaveTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await rpc('notification_template_save', { _payload: payload });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export function usePublishTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error } = await rpc('notification_template_publish', { _template_id: templateId });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useArchiveTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (args: { templateId: string; archive: boolean }) => {
      const { data, error } = await rpc('notification_template_archive', {
        _template_id: args.templateId,
        _archive: args.archive,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useCloneTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (args: { templateId: string; newName?: string }) => {
      const { data, error } = await rpc('notification_template_clone', {
        _template_id: args.templateId,
        _new_name: args.newName ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export interface TemplatePreview {
  template_id: string;
  template_code: string | null;
  channel: string;
  severity: string;
  subject: string;
  body: string;
  sample_values: Record<string, unknown>;
  unresolved_tokens: string[];
}

export function usePreviewTemplate() {
  return useMutation({
    mutationFn: async (args: { templateId: string; sample?: Record<string, unknown> }) => {
      const { data, error } = await rpc('notification_template_render_preview', {
        _template_id: args.templateId,
        _sample: args.sample ?? {},
      });
      if (error) throw error;
      return data as TemplatePreview;
    },
  });
}

export function useTestSendTemplate() {
  return useMutation({
    mutationFn: async (args: { templateId: string; sample?: Record<string, unknown> }) => {
      const { data, error } = await rpc('notification_test_send', {
        _template_id: args.templateId,
        _sample: args.sample ?? {},
      });
      if (error) throw error;
      return data as {
        ok: boolean;
        notification_id: string;
        recipient_user_id: string;
        unresolved_tokens: string[];
        subject: string;
        body: string;
      };
    },
  });
}

export function useValidateRecipientRules() {
  return useMutation({
    mutationFn: async (rules: unknown[]) => {
      const { data, error } = await rpc('notification_recipient_rules_validate', { _rules: rules });
      if (error) throw error;
      return data as { valid: boolean; errors: Array<{ index: number; error: string }> };
    },
  });
}

export function useSaveEventConfig() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await rpc('notification_event_config_save', { _payload: payload });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export function useSetEventActive() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (args: { configId: string; active: boolean }) => {
      const { data, error } = await rpc('notification_event_config_set_active', {
        _config_id: args.configId,
        _active: args.active,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

/** Channel availability + provider health shown on preview / test dialogs. */
export function useChannelHealth() {
  const { data, isLoading } = useEmailSmsSettings();
  const smtpConfigured = !!(data?.smtp?.enabled && data?.smtp?.host && data?.smtp?.fromEmail);
  const smsConfigured = !!(data?.sms?.enabled && data?.sms?.senderId);
  return {
    isLoading,
    email: { available: smtpConfigured, label: smtpConfigured ? 'SMTP configured' : 'SMTP not configured' },
    sms: { available: smsConfigured, label: smsConfigured ? 'SMS provider configured' : 'SMS unavailable — no provider configured' },
    in_app: { available: true, label: 'In-app always available' },
  };
}

/** Extract {{tokens}} declared inside a template body/subject. */
export function extractTokens(...texts: Array<string | null | undefined>): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    const matches = String(text || '').matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g);
    for (const m of matches) found.add(m[1]);
  }
  return Array.from(found).sort();
}

/** Tokens present in the content but not declared as template variables. */
export function unresolvedTokens(
  content: string | null | undefined,
  declared: unknown,
  subject?: string | null,
): string[] {
  const declaredList = Array.isArray(declared) ? declared.map((v) => String(v)) : [];
  const known = new Set([...declaredList, 'app_name', 'app_url']);
  return extractTokens(content, subject).filter((t) => !known.has(t));
}
