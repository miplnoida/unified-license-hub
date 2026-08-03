// System health monitor.
//
// Threshold-based, incident-scoped health notifications required by the FRD:
//   system_health.smtp_failure_threshold
//   system_health.sms_provider_failure
//   system_health.integration_failure
//   system_health.scheduler_failure
//   system_health.cron_failure
//   system_health.notification_queue_backlog
//
// Each alert is enqueued with an hour-bucketed idempotency suffix so a single
// incident raises one alert per window instead of one per failure.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";
import { enqueueNotificationEvent } from "../_shared/notification-dispatch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WINDOW_MINUTES = 60;
const WINDOW_LABEL = "60 minutes";
const SMTP_THRESHOLD = 3;
const SMS_THRESHOLD = 1;
const INTEGRATION_THRESHOLD = 3;
const SCHEDULER_THRESHOLD = 1;
const BACKLOG_THRESHOLD = 100;

function bucket(): string {
  return new Date().toISOString().slice(0, 13); // hour bucket
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = requireWorkerInvocation(req);
  if (!gate.ok) return gate.response;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const raised: string[] = [];

  // --- Email / SMS delivery failures -------------------------------------
  try {
    const { data: fails } = await admin
      .from("notification_dispatch_log")
      .select("channel, error, created_at")
      .eq("status", "failed")
      .gte("created_at", since)
      .limit(500);

    const email = (fails || []).filter((r: any) => r.channel === "email");
    const sms = (fails || []).filter((r: any) => r.channel === "sms");

    if (email.length >= SMTP_THRESHOLD) {
      await enqueueNotificationEvent(admin, {
        event_key: "system_health.smtp_failure_threshold",
        entity_type: "system_health",
        payload: {
          failure_count: email.length,
          window_label: WINDOW_LABEL,
          error_message: String(email[email.length - 1]?.error || "unknown").slice(0, 300),
        },
        idempotency_suffix: `smtp:${bucket()}`,
      });
      raised.push("system_health.smtp_failure_threshold");
    }

    if (sms.length >= SMS_THRESHOLD) {
      await enqueueNotificationEvent(admin, {
        event_key: "system_health.sms_provider_failure",
        entity_type: "system_health",
        payload: {
          failure_count: sms.length,
          window_label: WINDOW_LABEL,
          error_message: String(sms[sms.length - 1]?.error || "SMS provider not configured").slice(0, 300),
        },
        idempotency_suffix: `sms:${bucket()}`,
      });
      raised.push("system_health.sms_provider_failure");
    }
  } catch (e: any) {
    console.error("delivery failure check", e?.message || e);
  }

  // --- Integration failures ---------------------------------------------
  try {
    const { data: logs } = await admin
      .from("integration_logs")
      .select("integration_key, error, status, created_at")
      .eq("status", "failure")
      .gte("created_at", since)
      .limit(500);

    const byKey = new Map<string, any[]>();
    for (const row of logs || []) {
      const k = row.integration_key || "unknown";
      byKey.set(k, [...(byKey.get(k) || []), row]);
    }
    for (const [key, rows] of byKey) {
      if (rows.length < INTEGRATION_THRESHOLD) continue;
      await enqueueNotificationEvent(admin, {
        event_key: "system_health.integration_failure",
        entity_type: "system_health",
        payload: {
          integration_key: key,
          failure_count: rows.length,
          window_label: WINDOW_LABEL,
          error_message: String(rows[rows.length - 1]?.error || "unknown").slice(0, 300),
        },
        idempotency_suffix: `integration:${key}:${bucket()}`,
      });
      raised.push(`system_health.integration_failure:${key}`);

      // AI gateway failures are also surfaced to the reporting/AI owners.
      if (key.startsWith("ai-gateway")) {
        await enqueueNotificationEvent(admin, {
          event_key: "ai.processing_failed",
          entity_type: "system_health",
          payload: {
            job_label: key,
            error_message: String(rows[rows.length - 1]?.error || "unknown").slice(0, 300),
          },
          idempotency_suffix: `ai:${key}:${bucket()}`,
        });
        raised.push("ai.processing_failed");
      }
    }
  } catch (e: any) {
    console.error("integration check", e?.message || e);
  }

  // --- Scheduler (job queue) failures -----------------------------------
  try {
    const { data: jobs } = await admin
      .from("job_queue")
      .select("type, last_error, status, updated_at")
      .eq("status", "failed")
      .gte("updated_at", since)
      .limit(200);

    if ((jobs || []).length >= SCHEDULER_THRESHOLD) {
      const last = (jobs || [])[jobs!.length - 1];
      await enqueueNotificationEvent(admin, {
        event_key: "system_health.scheduler_failure",
        entity_type: "system_health",
        payload: {
          failure_count: jobs!.length,
          window_label: WINDOW_LABEL,
          job_label: last?.type || "job",
          error_message: String(last?.last_error || "unknown").slice(0, 300),
        },
        idempotency_suffix: `scheduler:${bucket()}`,
      });
      raised.push("system_health.scheduler_failure");
    }
  } catch (e: any) {
    console.error("scheduler check", e?.message || e);
  }

  // --- Cron failures -----------------------------------------------------
  try {
    const { data: cron } = await admin.rpc("notification_recent_cron_failures", {
      _since_minutes: WINDOW_MINUTES,
    });
    for (const row of (cron as any[]) || []) {
      await enqueueNotificationEvent(admin, {
        event_key: "system_health.cron_failure",
        entity_type: "system_health",
        payload: {
          job_label: row.jobname,
          occurred_at: row.end_time,
          error_message: String(row.return_message || "cron job failed").slice(0, 300),
        },
        idempotency_suffix: `cron:${row.jobname}:${bucket()}`,
      });
      raised.push(`system_health.cron_failure:${row.jobname}`);
    }
  } catch (e: any) {
    console.error("cron check", e?.message || e);
  }

  // --- Notification queue backlog ---------------------------------------
  try {
    const [{ count: outboxPending }, { count: eventPending }] = await Promise.all([
      admin.from("notification_outbox").select("id", { count: "exact", head: true }).eq("status", "pending"),
      admin.from("notification_event_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    const backlog = (outboxPending || 0) + (eventPending || 0);
    if (backlog >= BACKLOG_THRESHOLD) {
      const { data: oldest } = await admin
        .from("notification_outbox")
        .select("created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      await enqueueNotificationEvent(admin, {
        event_key: "system_health.notification_queue_backlog",
        entity_type: "system_health",
        payload: {
          backlog_count: backlog,
          oldest_age: oldest?.created_at || "unknown",
          window_label: WINDOW_LABEL,
        },
        idempotency_suffix: `backlog:${bucket()}`,
      });
      raised.push("system_health.notification_queue_backlog");
    }
  } catch (e: any) {
    console.error("backlog check", e?.message || e);
  }

  return new Response(JSON.stringify({ ok: true, raised }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
