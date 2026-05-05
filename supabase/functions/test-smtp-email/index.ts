import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

    // Auth check
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ success: false, error: "Unauthorized" }, 200);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ success: false, error: "Unauthorized" }, 200);
    }
    const callerEmail = userData.user.email;

    const body = await req.json().catch(() => ({}));
    const incoming: Partial<SmtpConfig> | undefined = body?.smtp;
    let to: string | undefined = body?.to;

    // Load saved
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

    // Validate
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

    // Map encryption to denomailer connection mode:
    // - ssl => implicit TLS (typically port 465): use TLS connection
    // - tls => STARTTLS (typically port 587): plain connect, upgrade with STARTTLS
    // - none => plain connect, no STARTTLS
    const useImplicitTls = smtp.encryption === "ssl";
    const useStartTls = smtp.encryption === "tls";

    const client = new SMTPClient({
      connection: {
        hostname: smtp.host,
        port: smtp.port,
        tls: useImplicitTls,
        auth: { username: smtp.username, password: smtp.password! },
      },
      debug: { allowUnsecure: !useImplicitTls && !useStartTls },
      pool: false,
      // denomailer will issue STARTTLS automatically when server advertises it
      // and tls is false; explicit hint is not needed.
    } as any);

    try {
      await client.send({
        from: `${smtp.fromName} <${smtp.fromEmail}>`,
        to,
        subject: "SMTP Test Email",
        content: "This is a test email from Unified License Hub SMTP settings.",
        html: "<p>This is a test email from <strong>Unified License Hub</strong> SMTP settings.</p>",
      });
      await client.close();
    } catch (sendErr: any) {
      try { await client.close(); } catch { /* noop */ }
      const raw = sendErr?.message || String(sendErr);
      console.error("SMTP send failed:", raw);
      let friendly = raw;
      if (/InvalidContentType|corrupt message/i.test(raw)) {
        friendly =
          "TLS handshake failed. Check encryption mode: use SSL for port 465, TLS (STARTTLS) for port 587, or None for port 25.";
      } else if (/auth|535|534|invalid login/i.test(raw)) {
        friendly = "SMTP authentication failed. Check username and password.";
      } else if (/ECONNREFUSED|refused|timeout|getaddrinfo|dns/i.test(raw)) {
        friendly = `Cannot reach SMTP server ${smtp.host}:${smtp.port}. ${raw}`;
      }
      return json({ success: false, error: friendly });
    }

    return json({ success: true, to });
  } catch (err: any) {
    console.error("test-smtp-email error:", err?.message || String(err));
    return json({ success: false, error: err?.message || "Unknown error" }, 200);
  }
});
