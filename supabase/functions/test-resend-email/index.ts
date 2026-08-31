import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUserPermission } from "../_shared/authz.ts";
import {
  DEFAULT_FROM_EMAIL,
  DEFAULT_FROM_NAME,
  isValidRecipient,
} from "../_shared/email-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const gate = await requireUserPermission(req, "notification_management", "test_send");
  if (!gate.ok) return gate.response;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ success: false, error: "Unauthorized" });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ success: false, error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const to: string = body?.to || userData.user.email || "";
    if (!isValidRecipient(to)) return json({ success: false, error: "Invalid recipient address" });

    const { data: row } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "email_sms_settings")
      .maybeSingle();
    const general = ((row as any)?.value?.email ?? {}) as Record<string, string>;

    // The API key is read server-side only; it is never accepted from or returned to the browser.
    const { data: secret } = await admin
      .from("email_provider_secrets")
      .select("value")
      .eq("key", "resend_api_key")
      .maybeSingle();
    const apiKey = (secret?.value as string | undefined) || Deno.env.get("RESEND_API_KEY") || "";
    if (!apiKey) {
      return json({ success: false, status: "missing_api_key", error: "Resend API key is not configured." });
    }

    const fromName = general.fromName || DEFAULT_FROM_NAME;
    const fromEmail = general.fromEmail || DEFAULT_FROM_EMAIL;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject: "Resend Test Email",
        text: "This is a test email sent through Resend from your email delivery settings.",
        html: "<p>This is a test email sent through <strong>Resend</strong> from your email delivery settings.</p>",
        reply_to: general.replyTo || undefined,
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      let detail = raw;
      try {
        const parsed = JSON.parse(raw);
        detail = parsed?.message || parsed?.error?.message || raw;
      } catch { /* keep raw */ }
      const domainIssue = /domain (is )?not verified|not verified|verify a domain/i.test(detail);
      return json({
        success: false,
        status: domainIssue ? "domain_not_verified" : "provider_error",
        http_status: res.status,
        error: domainIssue ? `RESEND DOMAIN NOT VERIFIED: ${detail}` : detail,
      });
    }

    let id: string | null = null;
    try { id = JSON.parse(raw)?.id ?? null; } catch { /* ignore */ }
    return json({ success: true, status: "tested_ok", to, provider_message_id: id, from: fromEmail });
  } catch (err: any) {
    console.error("test-resend-email error:", err?.message || String(err));
    return json({ success: false, status: "provider_error", error: err?.message || "Unknown error" });
  }
});
