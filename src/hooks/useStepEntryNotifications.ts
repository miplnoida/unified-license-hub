/**
 * Notifications fired when a workflow step is ENTERED (assigned). Distinct
 * from `approval_action_notifications` which fire when an action is executed.
 *
 * Stored in `approval_step_entry_notifications`. The runtime dispatcher reads
 * enabled rows after the perform-workflow-action RPC advances to the new
 * step (best-effort, never blocks the action).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ActionNotificationRecipientType } from '@/hooks/useActionNotifications';
import { normalizeRecipientConfig } from '@/hooks/useActionNotifications';

export interface StepEntryNotification {
  id: string;
  step_id: string;
  event_key: string;
  recipient_type: ActionNotificationRecipientType;
  recipient_config: Record<string, unknown>;
  template_id: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface StepEntryNotificationInput {
  id?: string;
  event_key: string;
  recipient_type: ActionNotificationRecipientType;
  recipient_config?: Record<string, unknown> | null;
  template_id?: string | null;
  is_enabled?: boolean;
}

const TABLE = 'approval_step_entry_notifications' as const;

export function useStepEntryNotifications(stepId: string | null | undefined) {
  return useQuery({
    enabled: !!stepId,
    queryKey: ['approval_step_entry_notifications', stepId],
    queryFn: async (): Promise<StepEntryNotification[]> => {
      const { data, error } = await supabase
        .from(TABLE as any)
        .select('*')
        .eq('step_id', stepId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as StepEntryNotification[];
    },
  });
}

export function useUpsertStepEntryNotification(stepId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: StepEntryNotificationInput) => {
      const eventKey = row.event_key.trim();
      if (!eventKey) throw new Error('Event key is required');
      const recipient_config = normalizeRecipientConfig(row.recipient_type, row.recipient_config);

      if (row.recipient_type === 'role') {
        const role =
          typeof recipient_config.role === 'string'
            ? recipient_config.role.trim()
            : typeof recipient_config.role_name === 'string'
              ? recipient_config.role_name.trim()
              : '';
        if (!role) throw new Error('Role recipient requires a role selection');
      }
      if (row.recipient_type === 'custom_email') {
        const email = typeof recipient_config.email === 'string' ? recipient_config.email.trim() : '';
        if (!email) throw new Error('Custom email recipient requires an email address');
      }

      const payload = {
        step_id: stepId,
        event_key: eventKey,
        recipient_type: row.recipient_type,
        recipient_config,
        template_id: row.template_id ?? null,
        is_enabled: row.is_enabled ?? true,
      };

      const q = row.id
        ? supabase.from(TABLE as any).update(payload as any).eq('id', row.id)
        : supabase.from(TABLE as any).insert(payload as any);
      const { data, error } = await q.select().single();
      if (error) throw error;
      return data as unknown as StepEntryNotification;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval_step_entry_notifications', stepId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save notification'),
  });
}

export function useDeleteStepEntryNotification(stepId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval_step_entry_notifications', stepId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete notification'),
  });
}
