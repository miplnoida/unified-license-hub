// Client-side helper that dispatches complaint / enforcement lifecycle events
// through the existing `dispatch-notification-event` edge function.
//
// Recipients, templates and channels are configured entirely in
// `notification_event_configs` in the database (event_key column), so admins
// can toggle / re-target notifications without any code change.
//
// Failures are logged and swallowed — notification dispatch never blocks the
// UI action that triggered it.

import { dispatchNotificationEvent } from "@/lib/notificationEvents";

export type ComplaintLifecycleEvent =
  | "complaint.investigation_started"
  | "complaint.resolved"
  | "complaint.closed"
  | "complaint.escalated_to_enforcement"
  | "enforcement.notice_issued"
  | "enforcement.response_received"
  | "enforcement.decision_recorded"
  | "enforcement.case_closed"
  | "enforcement.case_withdrawn";

export interface ComplaintNotifyArgs {
  event_key: ComplaintLifecycleEvent;
  complaint_id?: string;
  complaint_number?: string;
  enforcement_id?: string;
  enforcement_case_number?: string;
  complainant_id?: string | null;
  licensee_id?: string | null;
  sector_id?: string | null;
  regulator_id?: string | null;
  actor_name?: string | null;
  note?: string | null;
  extra?: Record<string, unknown>;
}

export async function notifyComplaintLifecycle(args: ComplaintNotifyArgs) {
  const isEnforcement = args.event_key.startsWith("enforcement.");
  const entity_type = isEnforcement ? "enforcement_action" : "complaint";
  const entity_id = isEnforcement ? args.enforcement_id : args.complaint_id;

  const app_url = typeof window !== "undefined" ? window.location.origin : "";
  const cta_url = isEnforcement
    ? (args.enforcement_id ? `${app_url}/enforcement/${args.enforcement_id}` : app_url)
    : (args.complaint_id ? `${app_url}/complaints/${args.complaint_id}` : app_url);

  await dispatchNotificationEvent({
    event_key: args.event_key,
    entity_type,
    entity_id,
    payload: {
      complaint_id: args.complaint_id ?? null,
      complaint_number: args.complaint_number ?? null,
      enforcement_id: args.enforcement_id ?? null,
      enforcement_case_number: args.enforcement_case_number ?? null,
      complainant_id: args.complainant_id ?? null,
      licensee_id: args.licensee_id ?? null,
      sector_id: args.sector_id ?? null,
      regulator_id: args.regulator_id ?? null,
      actor_name: args.actor_name ?? null,
      note: args.note ?? null,
      cta_url,
      cta_label: isEnforcement ? "Open Case" : "Open Complaint",
      app_url,
      ...(args.extra ?? {}),
    },
  });
}
