// Thin helper to dispatch notification events from the client.
//
// All notification side effects (recipient resolution, email delivery, logging,
// idempotency) live in the dispatch-notification-event edge function. The client
// only needs to fire-and-forget the event with an event_key + entity + payload.
//
// Failures here MUST NEVER block user-facing flows. We log and swallow.

import { supabase } from "@/integrations/supabase/client";

export type NotificationEventKey =
  | "license.created"
  | "license.status_changed"
  | "license.suspended"
  | "license.revoked"
  | "license.renewed"
  | "license.reinstated"
  | "license.cancelled"
  | "license.expiring_soon"
  | "license.expiring_soon_officer"
  | "license.renewal_requested"
  | "license.renewal_approved"
  | "license.expired"
  | "user.invited"
  | "payment.required"
  | "payment.received"
  | "payment.failed"
  | "collab_review.reply"
  | "collab_review.suggestion_accepted"
  | "collab_review.suggestion_rejected"
  | "collab_review.blocking_created"
  | "collab_review.mention_user"
  | "collab_review.mention_role"
  | (string & {});

export interface DispatchEventArgs {
  event_key: NotificationEventKey;
  entity_type?: string;
  entity_id?: string;
  /** Token values used to render templates and resolve `payload_user` recipient rules. */
  payload?: Record<string, unknown>;
  /** When set, dedupe key is keyed to this window (used by scheduled reminders). */
  reminder_window?: string;
}

export async function dispatchNotificationEvent(args: DispatchEventArgs): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("dispatch-notification-event", {
      body: args,
    });
    if (error) {
       
      console.warn("[notifications] dispatch failed", args.event_key, error.message);
    }
  } catch (e) {
     
    console.warn("[notifications] dispatch threw", args.event_key, e);
  }
}
