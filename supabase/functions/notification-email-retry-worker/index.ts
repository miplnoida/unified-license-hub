// Email retry worker (pg_cron, every 2 minutes).
//
// Claims failed email dispatch rows atomically (claim_email_retry_batch uses
// FOR UPDATE SKIP LOCKED) and re-sends them with exponential backoff. Retries
// re-use the immutable rendered content stored on the log row, so a template
// edit can never rewrite an already-attempted message.
//
// Hard bounces, missing addresses, opt-outs and digest deferrals are excluded by
// the claim function. After MAX_ATTEMPTS a row is marked `poisoned` and a
// system_health.dispatch_failure_repeated escalation is raised.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireWorkerInvocationAsync } from "../_shared/workerAuth.ts";
import { enqueueNotificationEvent } from "../_shared/notification-dispatch.ts";
import { isHardFailure, redact } from "../_shared/notification-redact.ts";
import { renderBrandedEmail } from "../_shared/email-layout.ts";
import { loadEmailBranding, detailsFromVars } from "../_shared/email-branding.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;

function backoffMinutes(attempts: number): number {
  return Math.min(60, Math.pow(2, attempts));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await requireWorkerInvocationAsync(req, "notification-email-retry-worker");
  if (!gate.ok) return gate.response;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const workerId = crypto.randomUUID();

  const { data: batch, error } = await admin.rpc("claim_email_retry_batch", {
    _limit: BATCH_SIZE,
    _worker: workerId,
  });

  if (error) {
    console.error("[email-retry] claim failed", redact(error.message));
    return new Response(JSON.stringify({ ok: false, error: redact(error.message) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let failed = 0;
  let poisoned = 0;

  for (const row of (batch as any[]) || []) {
    const attempts = (row.attempts ?? 0) + 1;
    const vars = (row.payload?.vars as Record<string, any>) || {};
    const subject = row.subject || row.event_key;
    const body = row.rendered_content || "";
    const branding = await loadEmailBranding(admin);
    const html = renderBrandedEmail({
      appName: String(vars.app_name || branding.appName),
      logoUrl: branding.logoUrl,
      tagline: branding.tagline,
      brandColor: branding.brandColor,
      heading: subject,
      paragraphs: body ? body.split(/\n{2,}/) : [],
      details: detailsFromVars(vars as Record<string, unknown>),
      ctaUrl: typeof vars.cta_url === "string" ? vars.cta_url : "",
      ctaLabel: typeof vars.cta_label === "string" ? vars.cta_label : "Open Portal",
      supportEmail: typeof vars.support_email === "string" && vars.support_email ? vars.support_email : branding.supportEmail,
      supportPhone: branding.supportPhone,
      footerText: branding.footerText || undefined,
    });

    try {
      const { data: res, error: invokeErr } = await admin.functions.invoke("send-notification", {
        body: {
          type: "email",
          to: row.recipient_email,
          subject,
          body,
          html,
          dispatch_log_id: row.id,
          attempt: attempts,
        },
      });
      if (invokeErr) throw invokeErr;
      if (res && res.success === false) throw new Error(String(res.error || "send_failed"));
      // send-notification owns the terminal status write (sent / failed / bounced).
      sent++;
    } catch (e: any) {
      const message = redact(e?.message || e);
      const hard = isHardFailure(message);
      const isPoisoned = hard || attempts >= MAX_ATTEMPTS;
      await admin
        .from("notification_dispatch_log")
        .update({
          status: hard ? "bounced" : "failed",
          attempts,
          retry_count: attempts,
          poisoned: isPoisoned,
          error: message,
          error_details: { message, channel: "email", attempts, hard_failure: hard },
          failed_at: new Date().toISOString(),
          last_attempt_at: new Date().toISOString(),
          next_attempt_at: isPoisoned
            ? null
            : new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
          claimed_at: null,
          claimed_by: null,
        })
        .eq("id", row.id);

      if (isPoisoned) {
        poisoned++;
        await enqueueNotificationEvent(admin, {
          event_key: "system_health.dispatch_failure_repeated",
          entity_type: "notification_dispatch_log",
          entity_id: row.id,
          payload: {
            event_key: row.event_key,
            channel: "email",
            failure_count: attempts,
            error_message: message,
          },
          idempotency_suffix: `poison:${row.id}`,
        });
      } else {
        failed++;
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, worker: workerId, picked: (batch as any[])?.length || 0, sent, failed, poisoned }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
