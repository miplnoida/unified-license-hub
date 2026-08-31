import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logIntegration } from "../_shared/integration-log.ts";
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";
import { maskEmail, redact } from "../_shared/notification-redact.ts";
import {
  EmailDeliveryConfig,
  loadEmailDeliveryConfig,
  sendEmailWithFallback,
} from "../_shared/email-provider.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Accept either a worker/cron invocation (service key or worker token) OR a
  // signed-in user session — client screens (FPA declarations/invitations,
  // settings tests) invoke this function with their user JWT.
  const __workerGate = requireWorkerInvocation(req);
  if (!__workerGate.ok) {
    const authHeader = req.headers.get("Authorization") || "";
    let authorizedUser = false;
    if (authHeader.startsWith("Bearer ")) {
      try {
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
          { global: { headers: { Authorization: authHeader } } },
        );
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        const { data, error } = await userClient.auth.getClaims(token);
        authorizedUser = !error && !!data?.claims?.sub;
      } catch {
        authorizedUser = false;
      }
    }
    if (!authorizedUser) return __workerGate.response;
  }


  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, event_type, user_id, title, message, entity_type, entity_id } = body;

    // ─── Direct email send path (used by dispatch-notification-event and admin Retry) ───
    if (body?.type === "email" && body?.to && body?.subject) {
      const emailConfig: EmailDeliveryConfig = await loadEmailDeliveryConfig(supabase);
      const logId: string | undefined = body.dispatch_log_id;
      const sendStarted = Date.now();
      const attemptNo = Number(body.attempt ?? 0) || null;

      const result = await sendEmailWithFallback(emailConfig, {
        to: body.to,
        subject: body.subject,
        text: body.body || "",
        html: body.html,
      });

      if (result.success) {
        if (logId) {
          await supabase
            .from("notification_dispatch_log")
            .update({
              // The provider accepted the message. This is `sent`, never `delivered`:
              // delivery confirmation can only come from a provider callback.
              status: "sent",
              provider: result.provider,
              provider_message_id: result.messageId,
              sent_at: new Date().toISOString(),
              last_attempt_at: new Date().toISOString(),
              next_attempt_at: null,
              claimed_at: null,
              claimed_by: null,
              error: null,
              error_details: null,
            })
            .eq("id", logId);
        }

        await logIntegration(supabase, {
          direction: "outbound",
          integrationKey: `${result.provider}.send-notification`,
          status: "success",
          entityType: entity_type ?? null,
          entityId: entity_id ?? null,
          requestSummary: `Email to ${maskEmail(body.to)}: ${body.subject}`,
          durationMs: Date.now() - sendStarted,
        });
        return new Response(
          JSON.stringify({
            success: true,
            provider: result.provider,
            provider_message_id: result.messageId,
            attempts: result.attempts,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Controlled failure: never propagate into the calling business workflow.
      const errMsg = redact(result.error || "email_delivery_failed");
      console.error("send-notification email delivery failed:", errMsg);
      // The router already distinguished recipient hard failures from
      // retryable infrastructure failures (quota, rate limit, outage, timeout).
      const hard = result.hardFailure;

      if (logId) {
        const { data: row } = await supabase
          .from("notification_dispatch_log")
          .select("retry_count, attempts")
          .eq("id", logId)
          .maybeSingle();
        const attempts = attemptNo ?? ((row?.attempts ?? row?.retry_count ?? 0) + 1);
        const delayMinutes = Math.min(60, Math.pow(2, attempts));
        await supabase
          .from("notification_dispatch_log")
          .update({
            status: hard ? "bounced" : "failed",
            error: errMsg,
            error_details: {
              message: errMsg,
              channel: "email",
              provider: result.attempts.map((a) => a.provider).join(","),
              provider_attempts: result.attempts,
              attempts,
              hard_failure: hard,
            },
            failed_at: new Date().toISOString(),
            last_attempt_at: new Date().toISOString(),
            retry_count: attempts,
            attempts,
            poisoned: hard || attempts >= 5,
            next_attempt_at: hard || attempts >= 5
              ? null
              : new Date(Date.now() + delayMinutes * 60_000).toISOString(),
            claimed_at: null,
            claimed_by: null,
          })
          .eq("id", logId);
      }
      await logIntegration(supabase, {
        direction: "outbound",
        integrationKey: "email.send-notification",
        status: "failure",
        entityType: entity_type ?? null,
        entityId: entity_id ?? null,
        error: errMsg,
        durationMs: Date.now() - sendStarted,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: errMsg,
          email_delivery_failed: true,
          hard_failure: hard,
          attempts: result.attempts,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

    }


    if (action === "dispatch") {
      // Manual dispatch from admin
      const { data: templates } = await supabase
        .from("notification_templates")
        .select("*")
        .eq("event_type", event_type)
        .eq("is_active", true);

      const results: { channel: string; status: string }[] = [];

      // Always create in-app
      await supabase.from("notifications").insert({
        user_id,
        title,
        message,
        type: "info",
        entity_type,
        entity_id,
        channel: "in_app",
        delivery_status: "delivered",
      });
      results.push({ channel: "in_app", status: "delivered" });

      // Process email/sms templates
      for (const tmpl of templates || []) {
        if (tmpl.channel === "in_app") continue;

        // notification_preferences stores one row per user: `channels` holds the
        // globally enabled channels and `type_settings` holds per-event overrides.
        // There are no enabled/channel/event_type columns.
        const { data: pref } = await supabase
          .from("notification_preferences")
          .select("channels, type_settings")
          .eq("user_id", user_id)
          .maybeSingle();

        const channels = (pref?.channels ?? null) as Record<string, unknown> | string[] | null;
        const override = ((pref?.type_settings ?? null) as Record<string, any> | null)?.[event_type];
        const channelAllowed = (() => {
          if (override && typeof override === "object" && tmpl.channel in override) {
            return override[tmpl.channel] !== false;
          }
          if (Array.isArray(channels)) return channels.includes(tmpl.channel);
          if (channels && typeof channels === "object" && tmpl.channel in channels) {
            return (channels as Record<string, unknown>)[tmpl.channel] !== false;
          }
          return true; // no stored preference: default to sending
        })();

        if (!channelAllowed) {
          results.push({ channel: tmpl.channel, status: "skipped_preference" });
          continue;
        }

        // Queue the notification (email/sms delivery would be handled by external service)
        await supabase.from("notifications").insert({
          user_id,
          title,
          message: tmpl.body,
          type: "info",
          entity_type,
          entity_id,
          channel: tmpl.channel,
          template_id: tmpl.id,
          delivery_status: "queued",
        });
        results.push({ channel: tmpl.channel, status: "queued" });
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "process_queue") {
      // Process queued notifications (email/SMS delivery)
      const { data: queued } = await supabase
        .from("notifications")
        .select("*, notification_templates:template_id(*)")
        .eq("delivery_status", "queued")
        .limit(50);

      let processed = 0;
      const emailConfig: EmailDeliveryConfig = await loadEmailDeliveryConfig(supabase);

      for (const notif of queued || []) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", notif.user_id)
          .single();

        if (!profile) continue;

        if (notif.channel === "email") {
          if (!profile.email) {
            await supabase
              .from("notifications")
              .update({ delivery_status: "failed"} as any)
              .eq("id", notif.id);
            continue;
          }
          const queueSendStarted = Date.now();
          const queueResult = await sendEmailWithFallback(emailConfig, {
            to: profile.email,
            subject: notif.title,
            text: notif.message,
          });
          if (queueResult.success) {
            await supabase
              .from("notifications")
              .update({ delivery_status: "sent" } as any)
              .eq("id", notif.id);
            await logIntegration(supabase, {
              direction: "outbound",
              integrationKey: `${queueResult.provider}.send-notification`,
              status: "success",
              entityType: notif.entity_type ?? null,
              entityId: notif.entity_id ?? null,
              requestSummary: `Queued email to ${maskEmail(profile.email)}: ${notif.title}`,
              durationMs: Date.now() - queueSendStarted,
            });
            processed++;
          } else {
            const errMsg = redact(queueResult.error || "email_delivery_failed");
            console.error("Queued email delivery failed:", errMsg);
            await supabase
              .from("notifications")
              .update({ delivery_status: "failed"} as any)
              .eq("id", notif.id);
            await logIntegration(supabase, {
              direction: "outbound",
              integrationKey: "email.send-notification",
              status: "failure",
              entityType: notif.entity_type ?? null,
              entityId: notif.entity_id ?? null,
              error: errMsg,
              durationMs: Date.now() - queueSendStarted,
            });
          }

        } else if (notif.channel === "sms") {
          // No SMS provider integration exists yet. Never record a successful
          // SMS delivery — fail loudly and audit the reason instead.
          await supabase
            .from("notifications")
            .update({ delivery_status: "failed"} as any)
            .eq("id", notif.id);
          await supabase.rpc("notification_record_delivery", {
            _event_key: notif.event_key ?? notif.type ?? "sms.unavailable",
            _channel: "sms",
            _status: "failed",
            _notification_id: notif.id,
            _recipient_user_id: notif.user_id ?? null,
            _error_details: {
              error: "sms_provider_not_configured",
              detail: "An administrator must configure an SMS provider before SMS delivery can be used.",
            },
          });
        }
      }

      return new Response(JSON.stringify({ success: true, processed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
