// Retry a failed entry in notification_dispatch_log.
//
// Body: { log_id: string }
// - Loads the log row + its stored payload.subject / payload.body (or recomputes from the event config).
// - Re-invokes send-notification for email channel.
// - In-app retries simply re-insert the notification row.
// - Caller must be a super_admin/admin (RLS on dispatch log limits writes).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBrandedEmail, stripUnresolvedTemplateTokens } from "../_shared/email-layout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function render(tpl: string | null | undefined, vars: Record<string, any>): string {
  if (!tpl) return "";
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Require an authenticated admin caller
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "unauthenticated" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: isSuper } = await admin.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!isAdmin && !isSuper) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { log_id } = await req.json();
    if (!log_id) {
      return new Response(JSON.stringify({ ok: false, error: "log_id required" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row, error } = await admin
      .from("notification_dispatch_log")
      .select("*")
      .eq("id", log_id)
      .maybeSingle();
    if (error || !row) {
      return new Response(JSON.stringify({ ok: false, error: "log entry not found" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-render in case templates changed since the original attempt
    const { data: cfg } = await admin
      .from("notification_event_configs")
      .select("*")
      .eq("event_key", row.event_key)
      .maybeSingle();
    const vars = (row.payload?.vars as Record<string, any>) || {};
    const subject = stripUnresolvedTemplateTokens(row.subject || render(cfg?.email_subject_template, vars) || render(cfg?.title_template, vars) || row.event_key);
    const body = stripUnresolvedTemplateTokens(render(cfg?.email_body_template, vars) || render(cfg?.message_template, vars) || "");

    if (row.channel === "email") {
      const to = row.recipient_email;
      if (!to) {
        await admin.from("notification_dispatch_log").update({
          status: "skipped", error: "no_email_on_retry", last_attempt_at: new Date().toISOString(),
        }).eq("id", log_id);
        return new Response(JSON.stringify({ ok: false, error: "no_email_on_retry" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const html = renderBrandedEmail({
        appName: String(vars.app_name || 'Unified License Hub'),
        heading: subject,
        paragraphs: body ? body.split(/\n{2,}/) : [],
        ctaUrl: typeof vars.cta_url === 'string' ? vars.cta_url : '',
        ctaLabel: typeof vars.cta_label === 'string' ? vars.cta_label : 'Open Portal',
        supportEmail: typeof vars.support_email === 'string' ? vars.support_email : '',
      });
      const { data: sendRes, error: sendErr } = await admin.functions.invoke("send-notification", {
        body: { type: "email", to, subject, body, html, dispatch_log_id: log_id },
      });
      return new Response(JSON.stringify({ ok: !sendErr, result: sendRes }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (row.channel === "in_app" && row.recipient_user_id) {
      const { error: insErr } = await admin.from("notifications").insert({
        user_id: row.recipient_user_id,
        title: render(cfg?.title_template, vars) || row.event_key,
        message: render(cfg?.message_template, vars) || "",
        type: cfg?.notification_type || "info",
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        channel: "in_app",
        delivery_status: "delivered",
      });
      if (insErr) {
        await admin.from("notification_dispatch_log").update({
          status: "failed", error: insErr.message.slice(0, 500), last_attempt_at: new Date().toISOString(),
        }).eq("id", log_id);
        return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await admin.from("notification_dispatch_log").update({
        status: "sent", sent_at: new Date().toISOString(), last_attempt_at: new Date().toISOString(), error: null,
      }).eq("id", log_id);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: false, error: "unsupported channel" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notification-retry fatal", e?.message || e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
