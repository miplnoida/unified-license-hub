import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import { requireUserPermission } from "../_shared/authz.ts";
import { readProviderSecret } from "../_shared/email-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const __authzGate = await requireUserPermission(req, "notification_management", "test_send");
  if (!__authzGate.ok) return __authzGate.response;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ success: false, error: "Unauthorized" });

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ success: false, error: "Unauthorized" });
    const callerEmail = userData.user.email;

    const body = await req.json().catch(() => ({}));
    const incoming: Partial<SmtpConfig> | undefined = body?.smtp;
    let to: string | undefined = body?.to;

    const { data: row } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "email_sms_settings")
      .maybeSingle();
    const savedSmtp: Partial<SmtpConfig> = (row as any)?.value?.smtp || {};

    const smtp: SmtpConfig = {
      host: incoming?.host || savedSmtp.host || "",
      port: Number(incoming?.port ?? savedSmtp.port ?? 587),
      username: incoming?.username || savedSmtp.username || "",
      // SEC-CRED-01A: the password ALWAYS comes from server-side secret storage.
      // Any browser-supplied password is ignored.
      password: (await readProviderSecret(admin, "smtp_password", "SMTP_PASSWORD")) || "",
      encryption: (incoming?.encryption || savedSmtp.encryption || "tls") as SmtpConfig["encryption"],
      fromName: incoming?.fromName || savedSmtp.fromName || "Unified License Hub",
      fromEmail: incoming?.fromEmail || savedSmtp.fromEmail || "",
      enabled: incoming?.enabled ?? savedSmtp.enabled ?? true,
    };

    const missing: string[] = [];
    if (!smtp.host) missing.push("host");
    if (!smtp.port || smtp.port < 1 || smtp.port > 65535) missing.push("port");
    if (!smtp.username) missing.push("username");
    if (!smtp.password) missing.push("password");
    if (!smtp.fromEmail) missing.push("fromEmail");
    if (!to) to = callerEmail;
    if (!to) return json({ success: false, error: "No recipient available" });

    const { data: secretMeta } = await admin.from("email_provider_secrets")
      .select("updated_at").eq("key", "smtp_password").maybeSingle();
    const audit = async (status: string, failure_category: string | null, provider_message_id: string | null) => {
      try {
        await admin.from("email_provider_test_log").insert({
          invoked_by: userData.user.id, recipient: to, provider: "SMTP", status,
          failure_category, provider_message_id,
          secret_updated_at: (secretMeta as any)?.updated_at ?? null,
        });
      } catch (_e) { /* audit is best-effort; never include secrets */ }
    };
    if (missing.length) {
      await audit("FAILED", missing.includes("password") ? "SECRET_MISSING" : "CONFIG_INCOMPLETE", null);
      return json({ success: false, error: missing.includes("password")
        ? "SMTP password is not configured in secure storage. Save it first."
        : `Missing/invalid SMTP fields: ${missing.join(", ")}` });
    }

    // ssl => implicit TLS (port 465); tls => STARTTLS (port 587); none => plain
    const secure = smtp.encryption === "ssl";
    const requireTLS = smtp.encryption === "tls";

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure,
      requireTLS,
      auth: { user: smtp.username, pass: smtp.password! },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

    let info: any;
    try {
      info = await transporter.sendMail({
        from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
        to,
        subject: "SMTP Test Email",
        text: "This is a test email from Unified License Hub SMTP settings.",
        html: "<p>This is a test email from <strong>Unified License Hub</strong> SMTP settings.</p>",
      });
    } catch (sendErr: any) {
      const raw = sendErr?.message || String(sendErr);
      console.error("SMTP send failed:", raw, sendErr?.code);
      let friendly = raw;
      const code = sendErr?.code || "";
      if (/ETIMEDOUT|ESOCKET|ECONNRESET|wrong version number|SSL|TLS/i.test(raw)) {
        friendly = `TLS/connection issue: ${raw}. Check encryption (SSL=465, TLS=587, None=25) and firewall.`;
      } else if (code === "EAUTH" || /535|534|invalid login|authentication/i.test(raw)) {
        friendly = "SMTP authentication failed. Check username and password.";
      } else if (code === "ECONNECTION" || /ECONNREFUSED|ENOTFOUND|getaddrinfo|dns/i.test(raw)) {
        friendly = `Cannot reach SMTP server ${smtp.host}:${smtp.port}. ${raw}`;
      }
      const cat = code === "EAUTH" || /535|534|invalid login|authentication/i.test(raw) ? "AUTH_FAILED"
        : /ETIMEDOUT|ESOCKET|ECONNRESET|SSL|TLS/i.test(raw) ? "TLS_OR_CONNECTION" : "SEND_FAILED";
      await audit("FAILED", cat, null);
      return json({ success: false, error: friendly });
    }

    await audit("ACCEPTED", null, info?.messageId ?? null);
    return json({ success: true, to, message_id: info?.messageId ?? null, secret_updated_at: (secretMeta as any)?.updated_at ?? null });
  } catch (err: any) {
    console.error("test-smtp-email error:", err?.message || String(err));
    return json({ success: false, error: err?.message || "Unknown error" });
  }
});
