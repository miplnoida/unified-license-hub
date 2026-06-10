/**
 * Frontend logger for return_audit_log.
 *
 * All non-RPC code paths (legacy admin approve / request-edit fallback, draft
 * save, manual submit, etc.) should call these helpers instead of inserting
 * directly into return_audit_log, so we always capture the same enriched
 * payload (previous/new status, previous/new step, metadata, event_key,
 * source).
 *
 * RPC-backed paths (perform_return_workflow_transition, resubmit_return,
 * start_return_workflow) already write enriched activity rows server-side.
 */
import { supabase } from '@/integrations/supabase/client';

export interface LogReturnActivityArgs {
  return_id: string;
  action: string;
  previous_status?: string | null;
  new_status?: string | null;
  previous_step_id?: string | null;
  new_step_id?: string | null;
  comments?: string | null;
  performed_by?: string | null;
  actor_role?: string | null;
  metadata?: Record<string, unknown> | null;
  event_key?: string | null;
  source?: string | null;
}

export async function logReturnActivity(args: LogReturnActivityArgs): Promise<void> {
  try {
    const payload = {
      return_id: args.return_id,
      action: args.action,
      previous_status: args.previous_status ?? null,
      new_status: args.new_status ?? null,
      previous_step_id: args.previous_step_id ?? null,
      new_step_id: args.new_step_id ?? null,
      comments: args.comments ?? null,
      performed_by: args.performed_by ?? null,
      actor_role: args.actor_role ?? null,
      metadata: args.metadata ?? {},
      event_key: args.event_key ?? null,
      source: args.source ?? 'client',
    };
    const { error } = await (supabase as any).from('return_audit_log').insert(payload);
    if (error && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[returnActivityLogger]', args.action, error.message);
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[returnActivityLogger]', e);
  }
}

/** Convenience helpers for common composite events. */

export async function logReturnSubmitted(args: {
  return_id: string; previous_status: string; performed_by?: string | null;
  workflow_id?: string | null; current_step_id?: string | null;
}) {
  await Promise.all([
    logReturnActivity({
      return_id: args.return_id,
      action: 'return_submitted',
      previous_status: args.previous_status,
      new_status: 'SUB',
      new_step_id: args.current_step_id ?? null,
      performed_by: args.performed_by ?? null,
      metadata: { workflow_id: args.workflow_id ?? null },
      event_key: 'return.submitted',
      source: 'client:FillReturnPage',
    }),
    logReturnActivity({
      return_id: args.return_id,
      action: 'status_changed',
      previous_status: args.previous_status,
      new_status: 'SUB',
      performed_by: args.performed_by ?? null,
      metadata: { from: args.previous_status, to: 'SUB' },
      event_key: 'return.status_changed',
      source: 'client:FillReturnPage',
    }),
  ]);
}

export async function logReturnResubmittedClient(args: {
  return_id: string; previous_status: string; performed_by?: string | null;
  current_step_id?: string | null;
}) {
  await logReturnActivity({
    return_id: args.return_id,
    action: 'return_resubmitted',
    previous_status: args.previous_status,
    new_status: 'SUB',
    new_step_id: args.current_step_id ?? null,
    performed_by: args.performed_by ?? null,
    event_key: 'return.resubmitted',
    source: 'client:FillReturnPage',
  });
}

export async function logReturnApprovedLegacy(args: {
  return_id: string; previous_status: string; comments?: string; performed_by?: string | null;
}) {
  await Promise.all([
    logReturnActivity({
      return_id: args.return_id,
      action: 'return_approved',
      previous_status: args.previous_status,
      new_status: 'VAL',
      comments: args.comments ?? null,
      performed_by: args.performed_by ?? null,
      event_key: 'return.approved',
      source: 'client:ReturnDetail',
    }),
    logReturnActivity({
      return_id: args.return_id,
      action: 'status_changed',
      previous_status: args.previous_status,
      new_status: 'VAL',
      comments: args.comments ?? null,
      performed_by: args.performed_by ?? null,
      metadata: { from: args.previous_status, to: 'VAL' },
      event_key: 'return.status_changed',
      source: 'client:ReturnDetail',
    }),
  ]);
}

export async function logEditRequestedLegacy(args: {
  return_id: string; previous_status: string; comments: string; performed_by?: string | null;
}) {
  await Promise.all([
    logReturnActivity({
      return_id: args.return_id,
      action: 'edit_requested',
      previous_status: args.previous_status,
      new_status: 'TBR',
      comments: args.comments,
      performed_by: args.performed_by ?? null,
      event_key: 'return.edit_requested',
      source: 'client:ReturnDetail',
    }),
    logReturnActivity({
      return_id: args.return_id,
      action: 'status_changed_to_tbr',
      previous_status: args.previous_status,
      new_status: 'TBR',
      comments: args.comments,
      performed_by: args.performed_by ?? null,
      event_key: 'return.status_changed_to_tbr',
      source: 'client:ReturnDetail',
    }),
    logReturnActivity({
      return_id: args.return_id,
      action: 'status_changed',
      previous_status: args.previous_status,
      new_status: 'TBR',
      performed_by: args.performed_by ?? null,
      metadata: { from: args.previous_status, to: 'TBR' },
      event_key: 'return.status_changed',
      source: 'client:ReturnDetail',
    }),
  ]);
}

/** Friendly label / colour for known action keys. Unknown keys fall back to a
 *  prettified version of the raw key so nothing is hidden in the UI. */
export const RETURN_ACTIVITY_LABELS: Record<string, string> = {
  return_created: 'Return created',
  draft_saved: 'Draft saved',
  return_submitted: 'Return submitted',
  submitted: 'Return submitted',
  workflow_started: 'Workflow started',
  workflow_step_assigned: 'Workflow step assigned',
  review_started: 'Review started',
  workflow_step_approved: 'Workflow step approved',
  workflow_step_moved: 'Workflow advanced to next step',
  workflow_step_changed: 'Workflow step changed',
  workflow_step_escalated: 'Workflow step escalated',
  edit_requested: 'Edit requested from licensee',
  status_changed_to_tbr: 'Status changed to TBR',
  return_edited: 'Return edited by licensee',
  return_resubmitted: 'Return resubmitted by licensee',
  resubmitted: 'Return resubmitted by licensee',
  edit_request_closed: 'Edit request resolved',
  return_approved: 'Return approved',
  validated: 'Return approved',
  return_rejected: 'Return rejected',
  rejected: 'Edit requested from licensee',
  return_sent_back: 'Return sent back to previous step',
  comment_added: 'Comment added',
  comment_edited: 'Comment edited',
  comment_deleted: 'Comment removed',
  attachment_added: 'Attachment added',
  attachment_removed: 'Attachment removed',
  notification_dispatched: 'Notification dispatched',
  notification_failed: 'Notification failed',
  status_changed: 'Status changed',
  created: 'Return created',
};

export function labelForReturnActivity(action: string): string {
  if (!action) return 'Activity';
  const exact = RETURN_ACTIVITY_LABELS[action];
  if (exact) return exact;
  return action.replace(/[_.]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
