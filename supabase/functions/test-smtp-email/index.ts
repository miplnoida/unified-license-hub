import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

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
      password:
        incoming?.password && incoming.password.length > 0
          ? incoming.password
          : savedSmtp.password || "",
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
    if (missing.length) {
      return json({ success: false, error: `Missing/invalid SMTP fields: ${missing.join(", ")}` });
    }

    if (!to) to = callerEmail;
    if (!to) return json({ success: false, error: "No recipient available" });

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

    try {
      await transporter.sendMail({
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
      return json({ success: false, error: friendly });
    }

    return json({ success: true, to });
  } catch (err: any) {
    console.error("test-smtp-email error:", err?.message || String(err));
    return json({ success: false, error: err?.message || "Unknown error" });
  }
});
