// Notification event queue worker.
//
// Drains public.notification_event_queue (written transactionally by database
// triggers and RPCs) and hands each event to the shared dispatcher, which does
// recipient resolution, preference/severity enforcement, in-app creation, email
// queueing and dispatch logging.
//
// - Claims rows atomically (FOR UPDATE SKIP LOCKED) so concurrent workers never
//   double-dispatch.
// - Exponential backoff on failure; rows go `dead` after MAX_ATTEMPTS and a
//   `system_health.dispatch_failure_repeated` escalation event is raised.
// - Correlation IDs are preserved end-to-end in the dispatched payload.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireWorkerInvocationAsync } from "../_shared/workerAuth.ts";
import { enqueueNotificationEvent } from "../_shared/notification-dispatch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await requireWorkerInvocationAsync(req, "notification-event-queue-worker");
  if (!gate.ok) return gate.response;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const workerId = crypto.randomUUID();

  try {
    await admin.rpc("reap_stuck_notification_event_queue");
  } catch (_) { /* non-fatal */ }

  const { data: batch, error } = await admin.rpc("claim_notification_event_queue", {
    _limit: BATCH_SIZE,
    _worker: workerId,
  });

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let dispatched = 0;
  let failed = 0;
  let dead = 0;

  for (const row of (batch as any[]) || []) {
    try {
      const res = await admin.functions.invoke("dispatch-notification-event", {
        body: {
          event_key: row.event_key,
          entity_type: row.entity_type || undefined,
          entity_id: row.entity_id || undefined,
          reminder_window: row.reminder_window || undefined,
          payload: {
            ...(row.payload || {}),
            _correlation_id: row.correlation_id,
            _idempotency_key: row.idempotency_key,
            _queue_id: row.id,
          },
        },
      });
      if (res.error) throw res.error;

      await admin
        .from("notification_event_queue")
        .update({ status: "dispatched", dispatched_at: new Date().toISOString(), claimed_at: null, claimed_by: null })
        .eq("id", row.id);
      dispatched++;
    } catch (e: any) {
      const attempts = (row.attempts ?? 0) + 1;
      const isDead = attempts >= MAX_ATTEMPTS;
      const delayMinutes = Math.min(60, Math.pow(2, attempts));
      await admin
        .from("notification_event_queue")
        .update({
          status: isDead ? "dead" : "pending",
          attempts,
          last_error: String(e?.message || e).slice(0, 500),
          next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
          claimed_at: null,
          claimed_by: null,
        })
        .eq("id", row.id);

      if (isDead) {
        dead++;
        // Failure is recorded and escalated, never silently dropped.
        await enqueueNotificationEvent(admin, {
          event_key: "system_health.dispatch_failure_repeated",
          entity_type: "notification_event_queue",
          entity_id: row.id,
          payload: {
            event_key: row.event_key,
            failure_count: attempts,
            error_message: String(e?.message || e).slice(0, 300),
            correlation_id: row.correlation_id,
          },
          idempotency_suffix: `dead:${row.event_key}`,
          correlation_id: row.correlation_id,
        });
      } else {
        failed++;
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, worker: workerId, picked: (batch as any[])?.length || 0, dispatched, failed, dead }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
