// Inbound delivery/bounce webhook for email providers.
//
// PUBLIC endpoint (verify_jwt = false) protected by an HMAC-SHA256 signature over
// the raw request body using NOTIFICATION_WEBHOOK_SECRET. Requests without a
// valid signature are rejected with 401 and never touch the dispatch log.
//
// With plain SMTP no provider posts callbacks, so this endpoint stays dormant and
// no status is ever invented: `delivered`, `bounced` and `opened` are only set
// from a verified provider callback.
//
// Expected body (provider-neutral):
//   { message_id?: string, dispatch_log_id?: string, event: "delivered"|"bounced"|"opened"|"failed",
//     timestamp?: string, reason?: string }

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { redact } from "../_shared/notification-redact.ts";
import { requireSignedWebhook } from "../_shared/webhookAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const raw = await req.text();

  // Canonical gate: HMAC-SHA256 over the raw body against
  // NOTIFICATION_WEBHOOK_SECRET. Fail-closed on unset secret / bad signature.
  const gate = await requireSignedWebhook(req, raw, "NOTIFICATION_WEBHOOK_SECRET", corsHeaders);
  if (!gate.ok) return gate.response;


  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const event = String(body?.event || "").toLowerCase();
  if (!["delivered", "bounced", "opened", "failed"].includes(event)) {
    return json({ ok: false, error: "unsupported_event" }, 400);
  }
  if (!body?.dispatch_log_id && !body?.message_id) {
    return json({ ok: false, error: "missing_identifier" }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  let query = admin.from("notification_dispatch_log").select("id, status, channel").limit(1);
  query = body.dispatch_log_id
    ? query.eq("id", body.dispatch_log_id)
    : query.eq("provider_message_id", body.message_id);
  const { data: row } = await query.maybeSingle();
  if (!row) return json({ ok: false, error: "dispatch_row_not_found" }, 404);

  const at = body?.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString();
  const patch: Record<string, unknown> = { last_attempt_at: at };

  if (event === "delivered") {
    patch.status = "delivered";
    patch.delivered_at = at;
    patch.error = null;
    patch.error_details = null;
  } else if (event === "opened") {
    // Only recorded because a provider legitimately reported it.
    patch.status = row.status === "bounced" ? row.status : "opened";
    patch.error_details = { opened_at: at, provider_event: "opened" };
  } else {
    patch.status = event === "bounced" ? "bounced" : "failed";
    patch.failed_at = at;
    patch.poisoned = event === "bounced";
    patch.next_attempt_at = null;
    patch.error = redact(body?.reason || `provider_${event}`, 300);
    patch.error_details = { provider_event: event, reason: redact(body?.reason || "", 300) };
  }

  const { error: updErr } = await admin.from("notification_dispatch_log").update(patch).eq("id", row.id);
  if (updErr) {
    console.error("[delivery-webhook] update failed", redact(updErr.message));
    return json({ ok: false, error: "update_failed" }, 200);
  }

  return json({ ok: true, dispatch_log_id: row.id, event });
});
