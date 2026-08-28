// Notification outbox worker (v2).
//
// Uses the atomic `claim_notification_outbox` RPC (FOR UPDATE SKIP LOCKED) so
// multiple concurrent workers can drain the queue without double-sending. Each
// claimed row is left in `processing` while we dispatch, then flipped to `sent`
// or bounced back to `pending` with exponential backoff on failure. After
// MAX_ATTEMPTS the row is marked `dead` for admin retry.
//
// Also invokes `reap_stuck_notification_outbox` at the start of each run so
// rows stuck in `processing` (crashed worker, timeout) are recycled after 10m.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";

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


  const __workerGate = requireWorkerInvocation(req);
  if (!__workerGate.ok) return __workerGate.response;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const workerId = crypto.randomUUID();

  // Recycle stuck claims first (best-effort).
  try {
    await admin.rpc("reap_stuck_notification_outbox");
  } catch (_) { /* non-fatal */ }

  // Atomically claim a batch of pending, due rows.
  const { data: batch, error } = await admin.rpc("claim_notification_outbox", {
    _limit: BATCH_SIZE,
    _worker: workerId,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let failed = 0;
  let dead = 0;

  for (const row of (batch as any[]) || []) {
    try {
      if (row.channel === "in_app") {
        if (!row.recipient_user_id) throw new Error("in_app_row_missing_user");
        // Canonical `public.notifications` write contract: entity_type / entity_id
        // (text). `dedupe_key` is keyed on the outbox row so a repeated worker
        // invocation of the same row can never create a duplicate notification.
        const { error: insErr } = await admin.from("notifications").insert({
          user_id: row.recipient_user_id,
          title: row.subject || row.event_key,
          message: row.body || "",
          type: "system",
          channel: "in_app",
          entity_type: row.entity_type ?? null,
          entity_id: row.entity_id ? String(row.entity_id) : null,
          event_key: row.event_key,
          correlation_id: row.correlation_id ?? null,
          dedupe_key: `outbox:${row.id}`,
          metadata: {
            event_key: row.event_key,
            correlation_id: row.correlation_id,
            action_history_id: row.action_history_id,
            outbox_id: row.id,
            ...(row.payload || {}),
          },
        });
        // Idempotent: the dedupe unique index means the notification already exists.
        if (insErr && (insErr as any).code !== "23505") throw insErr;
      } else if (row.channel === "email") {
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
        .update({ status: "sent", sent_at: new Date().toISOString(), claimed_at: null, claimed_by: null })
        .eq("id", row.id);
      sent++;
    } catch (e: any) {
      const nextRetry = (row.retry_count ?? 0) + 1;
      const isDead = nextRetry >= MAX_ATTEMPTS;
      const delayMinutes = Math.min(60, Math.pow(2, nextRetry));
      await admin
        .from("notification_outbox")
        .update({
          status: isDead ? "dead" : "pending",
          retry_count: nextRetry,
          last_error: (e?.message || String(e)).slice(0, 500),
          next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
          claimed_at: null,
          claimed_by: null,
        })
        .eq("id", row.id);
      if (isDead) dead++;
      else failed++;
    }
  }

  return new Response(
    JSON.stringify({ worker: workerId, picked: (batch as any[])?.length || 0, sent, failed, dead }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
