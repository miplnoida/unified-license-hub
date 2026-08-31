import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logIntegration } from "../_shared/integration-log.ts";
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";
import { isHardFailure, maskEmail, redact } from "../_shared/notification-redact.ts";
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

  const __workerGate = requireWorkerInvocation(req);
  if (!__workerGate.ok) return __workerGate.response;
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, event_type, user_id, title, message, entity_type, entity_id } = body;

    // ─── Direct email send path (used by dispatch-notification-event and admin Retry) ───
    if (body?.type === "email" && body?.to && body?.subject) {
      const smtpConfig = await loadSmtpConfig(supabase);
      const logId: string | undefined = body.dispatch_log_id;
      if (!smtpConfig) {
        if (logId) {
          await supabase
            .from("notification_dispatch_log")
            .update({
              status: "failed",
              error: "smtp_not_configured",
              error_details: { reason: "smtp_not_configured", channel: "email" },
              failed_at: new Date().toISOString(),
              last_attempt_at: new Date().toISOString(),
            })
            .eq("id", logId);
        }
        console.warn("send-notification: SMTP not configured; email skipped", body.to);
        return new Response(JSON.stringify({ success: false, error: "smtp_not_configured" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const smtpStarted = Date.now();
      const attemptNo = Number(body.attempt ?? 0) || null;
      try {
        const { messageId } = await sendSmtpEmail(smtpConfig, body.to, body.subject, body.body || "", body.html);
        if (logId) {
          await supabase
            .from("notification_dispatch_log")
            .update({
              // SMTP accepted the message. This is `sent`, never `delivered`:
              // delivery confirmation can only come from a provider callback.
              status: "sent",
              provider: "smtp",
              provider_message_id: messageId,
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
          integrationKey: "smtp.send-notification",
          status: "success",
          entityType: entity_type ?? null,
          entityId: entity_id ?? null,
          requestSummary: `Email to ${maskEmail(body.to)}: ${body.subject}`,
          durationMs: Date.now() - smtpStarted,
        });
        return new Response(JSON.stringify({ success: true, provider_message_id: messageId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        const errMsg = redact(e?.message || e);
        console.error("send-notification SMTP send failed:", errMsg);
        const hard = isHardFailure(errMsg);
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
              error_details: { message: errMsg, channel: "email", provider: "smtp", attempts, hard_failure: hard },
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
          integrationKey: "smtp.send-notification",
          status: "failure",
          entityType: entity_type ?? null,
          entityId: entity_id ?? null,
          error: errMsg,
          durationMs: Date.now() - smtpStarted,
        });
        return new Response(JSON.stringify({ success: false, error: errMsg }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
      const smtpConfig = await loadSmtpConfig(supabase);

      for (const notif of queued || []) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", notif.user_id)
          .single();

        if (!profile) continue;

        if (notif.channel === "email") {
          if (!smtpConfig) {
            await supabase
              .from("notifications")
              .update({ delivery_status: "failed"} as any)
              .eq("id", notif.id);
            continue;
          }
          if (!profile.email) {
            await supabase
              .from("notifications")
              .update({ delivery_status: "failed"} as any)
              .eq("id", notif.id);
            continue;
          }
          const queueSmtpStarted = Date.now();
          try {
            await sendSmtpEmail(smtpConfig, profile.email, notif.title, notif.message);
            await supabase
              .from("notifications")
              .update({ delivery_status: "delivered" } as any)
              .eq("id", notif.id);
            await logIntegration(supabase, {
              direction: "outbound",
              integrationKey: "smtp.send-notification",
              status: "success",
              entityType: notif.entity_type ?? null,
              entityId: notif.entity_id ?? null,
              requestSummary: `Queued email to ${profile.email}: ${notif.title}`,
              durationMs: Date.now() - queueSmtpStarted,
            });
            processed++;
          } catch (e: any) {
            const errMsg = e?.message || String(e);
            console.error("SMTP delivery failed:", errMsg);
            await supabase
              .from("notifications")
              .update({ delivery_status: "failed"} as any)
              .eq("id", notif.id);
            await logIntegration(supabase, {
              direction: "outbound",
              integrationKey: "smtp.send-notification",
              status: "failure",
              entityType: notif.entity_type ?? null,
              entityId: notif.entity_id ?? null,
              error: errMsg,
              durationMs: Date.now() - queueSmtpStarted,
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
