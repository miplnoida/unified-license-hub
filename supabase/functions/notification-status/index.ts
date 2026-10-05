// Read-only health check for the notification system. Returns:
//   - smtp_configured: boolean (from site_settings.email_sms_settings)
//   - admin_emails_configured: boolean (ADMIN_NOTIFICATION_EMAILS env)
//   - app_base_url_configured: boolean
//   - counts: { sent_24h, failed_24h, skipped_24h, pending_24h }
//   - last_failure: { event_key, error, created_at } | null
//
// Never returns secret values — booleans only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readProviderSecret } from "../_shared/email-provider.ts";
import { requireUserPermission } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const __authzGate = await requireUserPermission(req, "notification_management", "view");
  if (!__authzGate.ok) return __authzGate.response;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Require admin caller
    // Identity comes from the gate's verified token claims. A second
    // auth.getUser() round-trip can fail with "session not found" after a
    // refresh-token rotation and would surface as a bogus 401.
    const user = { id: __authzGate.userId };
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: isSuper } = await admin.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!isAdmin && !isSuper) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Effective email delivery configuration (Resend primary, SMTP fallback).
    const { data: settingsRow } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "email_sms_settings")
      .maybeSingle();
    const smtp = (settingsRow as any)?.value?.smtp || {};
    const smtpSecret = await readProviderSecret(admin, "smtp_password", "SMTP_PASSWORD");
    const resendCfg = (settingsRow as any)?.value?.resend || {};
    const generalCfg = (settingsRow as any)?.value?.email || {};
    const smtpConfigured = !!(smtp.enabled && smtp.host && smtp.port && smtp.username && smtpSecret && smtp.fromEmail);
    let resendKeyPresent = !!Deno.env.get("RESEND_API_KEY");
    if (!resendKeyPresent) {
      const { data: secret } = await admin
        .from("email_provider_secrets")
        .select("key")
        .eq("key", "resend_api_key")
        .maybeSingle();
      resendKeyPresent = !!secret;
    }
    const resendConfigured = !!(resendCfg.enabled && resendKeyPresent);


    const adminEmails = (Deno.env.get("ADMIN_NOTIFICATION_EMAILS") || "").split(",").map(s => s.trim()).filter(Boolean);
    const appBaseUrl = Deno.env.get("APP_BASE_URL") || "";

    // Counts last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const statuses = ["sent", "failed", "skipped", "pending"] as const;
    const counts: Record<string, number> = {};
    await Promise.all(statuses.map(async (s) => {
      const { count } = await admin
        .from("notification_dispatch_log")
        .select("id", { count: "exact", head: true })
        .eq("status", s)
        .gte("created_at", since);
      counts[`${s}_24h`] = count ?? 0;
    }));

    const { data: lastFailure } = await admin
      .from("notification_dispatch_log")
      .select("event_key, error, created_at, recipient_email")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return new Response(JSON.stringify({
      ok: true,
      email_enabled: generalCfg.enabled !== false,
      email_configured: resendConfigured || smtpConfigured,
      primary_provider: resendConfigured ? "resend" : (smtpConfigured ? "smtp" : null),
      resend_configured: resendConfigured,
      resend_enabled: !!resendCfg.enabled,
      resend_key_present: resendKeyPresent,
      resend_status: resendCfg.status || "not_configured",
      auto_fallback: generalCfg.autoFallback !== false,
      smtp_configured: smtpConfigured,
      smtp_host_set: !!smtp.host,
      smtp_enabled: !!smtp.enabled,

      admin_emails_configured: adminEmails.length > 0,
      admin_email_count: adminEmails.length,
      app_base_url_configured: !!appBaseUrl,
      counts,
      last_failure: lastFailure || null,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notification-status fatal", e?.message || e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
