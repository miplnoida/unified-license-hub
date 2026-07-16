// Notification outbox worker.
//
// Drains pending rows from `public.notification_outbox`, writes in-app
// notifications into `public.notifications` and dispatches emails through
// the existing `dispatch-notification-event` edge function (which owns
// template rendering + delivery). Failures update retry_count / next_attempt_at
// with exponential backoff; after 6 attempts the row is marked `dead`.
//
// Idempotency: the outbox has a unique dedupe key
// (event_key, entity_id, recipient, channel, action_history_id) so
// re-inserts during retried RPCs are safe.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 6;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Pull a batch of pending, due rows.
  const { data: batch, error } = await admin
    .from("notification_outbox")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let failed = 0;
  let dead = 0;

  for (const row of batch || []) {
    try {
      if (row.channel === "in_app") {
        if (!row.recipient_user_id) throw new Error("in_app_row_missing_user");
        const { error: insErr } = await admin.from("notifications").insert({
          user_id: row.recipient_user_id,
          title: row.subject || row.event_key,
          message: row.body || "",
          type: "system",
          related_entity_type: row.entity_type,
          related_entity_id: row.entity_id,
          metadata: {
            event_key: row.event_key,
            correlation_id: row.correlation_id,
            action_history_id: row.action_history_id,
            ...(row.payload || {}),
          },
        });
        if (insErr) throw insErr;
      } else if (row.channel === "email") {
        // Delegate to the shared dispatcher, which owns email template rendering.
        const dispatchRes = await admin.functions.invoke("dispatch-notification-event", {
          body: {
            event_key: row.event_key,
            entity_type: row.entity_type,
            entity_id: row.entity_id,
            payload: {
              ...(row.payload || {}),
              _outbox_id: row.id,
              _recipient_email: row.recipient_email,
              _channel: "email",
            },
          },
        });
        if (dispatchRes.error) throw dispatchRes.error;
      }

      await admin
        .from("notification_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent++;
    } catch (e: any) {
      const nextRetry = row.retry_count + 1;
      const isDead = nextRetry >= MAX_ATTEMPTS;
      const delayMinutes = Math.min(60, Math.pow(2, nextRetry));
      await admin
        .from("notification_outbox")
        .update({
          status: isDead ? "dead" : "pending",
          retry_count: nextRetry,
          last_error: (e?.message || String(e)).slice(0, 500),
          next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        })
        .eq("id", row.id);
      if (isDead) dead++;
      else failed++;
    }
  }

  return new Response(
    JSON.stringify({ picked: batch?.length || 0, sent, failed, dead }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
