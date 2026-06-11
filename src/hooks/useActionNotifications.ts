/**
 * Per-action notification bindings for an approval step.
 *
 * Wraps the `approval_action_notifications` table. Each row binds one
 * notification_template + recipient_type to a (step, action_type, event_key)
 * combination. The perform-workflow-action edge function reads these at
 * runtime and dispatches one notification per enabled row.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { WorkflowActionType } from '@/hooks/useWorkflowEngine';

export type ActionNotificationRecipientType =
  | 'applicant'
  | 'current_approver'
  | 'previous_actor'
  | 'role'
  | 'admin'
  | 'custom_email';

export interface ActionNotification {
  id: string;
  step_id: string;
  action_type: WorkflowActionType;
  event_key: string;
  recipient_type: ActionNotificationRecipientType;
  recipient_config: Record<string, unknown>;
  template_id: string | null;
  is_enabled: boolean;
}

export interface NotificationTemplateLite {
  id: string;
  name: string;
  event_type: string;
  channel: string;
  is_active: boolean;
}

const TABLE = 'approval_action_notifications' as const;

export function useActionNotifications(stepId: string | null | undefined) {
  return useQuery({
    enabled: !!stepId,
    queryKey: ['action_notifications', stepId],
    queryFn: async (): Promise<ActionNotification[]> => {
      const { data, error } = await supabase
        .from(TABLE as any)
        .select('*')
        .eq('step_id', stepId)
        .order('action_type', { ascending: true })
        .order('event_key', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ActionNotification[];
    },
  });
}

export function useNotificationTemplates() {
  return useQuery({
    queryKey: ['notification_templates', 'active'],
    queryFn: async (): Promise<NotificationTemplateLite[]> => {
      const { data, error } = await supabase
        .from('notification_templates')
        .select('id, name, event_type, channel, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as NotificationTemplateLite[];
    },
    staleTime: 60_000,
  });
}

export function useUpsertActionNotification(stepId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<ActionNotification> & { action_type: WorkflowActionType; event_key: string; recipient_type: ActionNotificationRecipientType }) => {
      const payload = {
        step_id: stepId,
        action_type: row.action_type,
        event_key: row.event_key,
        recipient_type: row.recipient_type,
        recipient_config: row.recipient_config ?? {},
        template_id: row.template_id ?? null,
        is_enabled: row.is_enabled ?? true,
        ...(row.id ? { id: row.id } : {}),
      };
      const { data, error } = await supabase
        .from(TABLE as any)
        .upsert(payload as any, { onConflict: 'step_id,action_type,event_key,recipient_type' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action_notifications', stepId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save notification'),
  });
}

export function useDeleteActionNotification(stepId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action_notifications', stepId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete notification'),
  });
}

/** Default suggested event_key per action_type, used when admin adds a fresh row. */
export const DEFAULT_EVENT_FOR_ACTION: Record<WorkflowActionType, string> = {
  approve: 'application.approved_step',
  reject: 'application.rejected',
  send_back: 'application.send_back',
  escalate: 'application.escalated',
  request_resubmission: 'application.resubmission_requested',
  return_for_correction: 'application.returned_for_correction',
  request_more_info: 'application.more_info_requested',
};

export const RECIPIENT_LABELS: Record<ActionNotificationRecipientType, string> = {
  applicant: 'Applicant',
  current_approver: 'Current Approver',
  previous_actor: 'Previous Step Actor',
  role: 'Users with Role',
  admin: 'Admin Users',
  custom_email: 'Custom Email',
};
