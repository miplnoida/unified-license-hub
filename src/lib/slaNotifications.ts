// Fire-and-forget notification helper for SLA configuration changes.
// Routes through the existing dispatch-notification-event pipeline so recipient
// resolution, idempotency, in-app insert and SMTP delivery are all handled
// server-side. Failures must never block the admin UI.
import { dispatchNotificationEvent } from "@/lib/notificationEvents";
import { supabase } from "@/integrations/supabase/client";

export interface SlaChangeNotifyArgs {
  process_type: string;
  entity_id?: string;
  change_summary: string;
}

export async function notifySlaChange(args: SlaChangeNotifyArgs): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const app_url =
      typeof window !== "undefined" ? window.location.origin : "";
    await dispatchNotificationEvent({
      event_key: "sla.configuration_updated",
      entity_type: "sla_configuration",
      entity_id: args.entity_id,
      payload: {
        process_type: args.process_type,
        change_summary: args.change_summary,
        updated_by_email: user?.email ?? "an admin",
        app_url,
      },
    });
  } catch {
    /* swallow */
  }
}
