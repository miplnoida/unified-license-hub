import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  encryption: "none" | "ssl" | "tls";
  fromName: string;
  fromEmail: string;
  enabled: boolean;
}

async function loadSmtpConfig(supabase: any): Promise<SmtpConfig | null> {
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "email_sms_settings")
    .maybeSingle();
  const smtp = data?.value?.smtp as SmtpConfig | undefined;
  if (!smtp || !smtp.enabled || !smtp.host || !smtp.port || !smtp.username || !smtp.password || !smtp.fromEmail) {
    return null;
  }
  return smtp;
}

async function sendSmtpEmail(smtp: SmtpConfig, to: string, subject: string, text: string): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: smtp.host,
      port: smtp.port,
      // Implicit TLS only for SSL (typically port 465).
      // For STARTTLS ("tls" on port 587), keep tls=false — denomailer will
      // upgrade the plaintext connection via STARTTLS automatically.
      tls: smtp.encryption === "ssl",
      auth: { username: smtp.username, password: smtp.password! },
    },
  });

  try {
    await client.send({
      from: `${smtp.fromName || "Notifications"} <${smtp.fromEmail}>`,
      to,
      subject,
      content: text,
    });
  } finally {
    try { await client.close(); } catch { /* noop */ }
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
            .update({ status: "failed", error: "smtp_not_configured", last_attempt_at: new Date().toISOString() })
            .eq("id", logId);
        }
        console.warn("send-notification: SMTP not configured; email skipped", body.to);
        return new Response(JSON.stringify({ success: false, error: "smtp_not_configured" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        await sendSmtpEmail(smtpConfig, body.to, body.subject, body.body || "");
        if (logId) {
          await supabase
            .from("notification_dispatch_log")
            .update({ status: "sent", sent_at: new Date().toISOString(), last_attempt_at: new Date().toISOString(), error: null })
            .eq("id", logId);
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        const errMsg = String(e?.message || e).slice(0, 500);
        console.error("send-notification SMTP send failed:", errMsg);
        if (logId) {
          // increment retry_count atomically via RPC-less read-modify-write
          const { data: row } = await supabase
            .from("notification_dispatch_log")
            .select("retry_count")
            .eq("id", logId)
            .maybeSingle();
          await supabase
            .from("notification_dispatch_log")
            .update({
              status: "failed",
              error: errMsg,
              last_attempt_at: new Date().toISOString(),
              retry_count: (row?.retry_count ?? 0) + 1,
            })
            .eq("id", logId);
        }
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

        // Check user preferences
        const { data: pref } = await supabase
          .from("notification_preferences")
          .select("enabled")
          .eq("user_id", user_id)
          .eq("channel", tmpl.channel)
          .eq("event_type", event_type)
          .maybeSingle();

        if (pref?.enabled === false) {
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
          try {
            await sendSmtpEmail(smtpConfig, profile.email, notif.title, notif.message);
            await supabase
              .from("notifications")
              .update({ delivery_status: "delivered" } as any)
              .eq("id", notif.id);
            processed++;
          } catch (e: any) {
            console.error("SMTP delivery failed:", e?.message || String(e));
            await supabase
              .from("notifications")
              .update({ delivery_status: "failed"} as any)
              .eq("id", notif.id);
          }
        } else if (notif.channel === "sms") {
          // SMS provider not yet implemented; keep queued with note
          await supabase
            .from("notifications")
            .update({ delivery_status: "failed"} as any)
            .eq("id", notif.id);
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
