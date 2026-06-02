// Scheduled (hourly via pg_cron) — if there were N+ failed email dispatches in the
// last hour, send an admin alert email to ADMIN_NOTIFICATION_EMAILS.
//
// Uses dispatch-notification-event with event_key=notification.admin_failure_alert.
// Built-in dedupe (3600s window) prevents alert spam.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FAILURE_THRESHOLD = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: failures, count } = await admin
      .from("notification_dispatch_log")
      .select("event_key, error, created_at", { count: "exact" })
      .eq("status", "failed")
      .eq("channel", "email")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    const failureCount = count ?? (failures?.length ?? 0);
    if (failureCount < FAILURE_THRESHOLD) {
      return new Response(JSON.stringify({ ok: true, failure_count: failureCount, alerted: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const latest = failures?.[0];
    const adminEmails = (Deno.env.get("ADMIN_NOTIFICATION_EMAILS") || "")
      .split(",").map(s => s.trim()).filter(Boolean);

    // Dispatch via the in-app notification system to super_admin / admin roles
    await admin.functions.invoke("dispatch-notification-event", {
      body: {
        event_key: "notification.admin_failure_alert",
        entity_type: "notification_system",
        entity_id: new Date().toISOString().slice(0, 13), // hour bucket
        payload: {
          failure_count: failureCount,
          latest_event_key: latest?.event_key || "(unknown)",
          latest_error: latest?.error || "(none)",
        },
      },
    });

    // Also direct-email each configured admin (separate channel from in-app)
    let directSent = 0;
    if (adminEmails.length > 0) {
      for (const to of adminEmails) {
        try {
          await admin.functions.invoke("send-notification", {
            body: {
              type: "email",
              to,
              subject: `⚠ Email delivery failures detected (${failureCount} in last hour)`,
              body: `Multiple email notifications failed in the last hour.\n\nFailure count: ${failureCount}\nLatest event: ${latest?.event_key || "(unknown)"}\nLatest error: ${latest?.error || "(none)"}\n\nReview the notification log in the admin portal.`,
            },
          });
          directSent++;
        } catch (e: any) {
          console.error("direct admin alert failed", to, e?.message || e);
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true, failure_count: failureCount, alerted: true, direct_emails_sent: directSent,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notification-failure-sweep fatal", e?.message || e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
