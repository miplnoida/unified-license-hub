import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateOTP(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, "0");
}

async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { email, channel = "email", purpose = "registration" } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: max 5 OTPs per email per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("otp_verifications")
      .select("id", { count: "exact", head: true })
      .eq("user_email", email)
      .eq("channel", channel)
      .eq("purpose", purpose)
      .gte("created_at", oneHourAgo);

    if ((count || 0) >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many OTP requests. Please try again later." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const otp = generateOTP();
    const codeHash = await hashCode(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    // Store OTP
    const { error: insertError } = await supabaseAdmin
      .from("otp_verifications")
      .insert({
        user_email: email,
        channel,
          purpose,
        code_hash: codeHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("OTP insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to generate OTP" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send the OTP via Lovable transactional email (send-transactional-email).
    // We REQUIRE actual delivery success — never claim success if the email failed.
    let emailDelivered = false;
    let providerError: string | null = null;
    let providerStatus: number | null = null;

    if (channel === "email") {
      try {
        const purposeLabels: Record<string, string> = {
          registration: 'Registration Verification',
          login_2fa: 'Login Verification',
          enable_2fa: 'Enable Two-Factor Authentication',
          disable_2fa: 'Disable Two-Factor Authentication',
        };
        const label = purposeLabels[purpose] || 'Verification';
        const subject = `Your ${label} Code`;
        const text = `Your verification code is: ${otp}\n\nThis code expires in 10 minutes. Do not share this code with anyone.`;
        const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 12px;">${label}</h2>
          <p style="color:#475569;margin:0 0 16px;">Use the code below to continue. It expires in 10 minutes.</p>
          <div style="font-size:28px;font-weight:700;letter-spacing:6px;background:#0f172a;color:#fff;padding:14px 18px;border-radius:8px;text-align:center;">${otp}</div>
          <p style="color:#94a3b8;font-size:12px;margin-top:16px;">If you did not request this code, you can ignore this email.</p>
        </div>`;

        // Load SMTP config from site_settings
        const { data: settingsRow } = await supabaseAdmin
          .from("site_settings")
          .select("value")
          .eq("key", "email_sms_settings")
          .maybeSingle();
        const smtp = (settingsRow as any)?.value?.smtp || {};

        const missing: string[] = [];
        if (!smtp.host) missing.push("host");
        if (!smtp.port) missing.push("port");
        if (!smtp.username) missing.push("username");
        if (!smtp.password) missing.push("password");
        if (!smtp.fromEmail) missing.push("fromEmail");

        if (missing.length) {
          providerError = `SMTP not configured. Missing: ${missing.join(", ")}. Please configure SMTP in Settings → Email & SMS.`;
          console.error(providerError);
        } else {
          const nodemailer = (await import("npm:nodemailer@6.9.16")).default;
          const secure = smtp.encryption === "ssl";
          const requireTLS = smtp.encryption === "tls";
          const transporter = nodemailer.createTransport({
            host: smtp.host,
            port: Number(smtp.port),
            secure,
            requireTLS,
            auth: { user: smtp.username, pass: smtp.password },
            tls: { rejectUnauthorized: false },
            connectionTimeout: 15000,
            greetingTimeout: 10000,
            socketTimeout: 20000,
          });
          try {
            await transporter.sendMail({
              from: `"${smtp.fromName || "Unified License Hub"}" <${smtp.fromEmail}>`,
              to: email,
              subject,
              text,
              html,
            });
            emailDelivered = true;
          } catch (sendErr) {
            const raw = (sendErr as Error)?.message || String(sendErr);
            const code = (sendErr as any)?.code || "";
            let friendly = raw;
            if (/ETIMEDOUT|ESOCKET|ECONNRESET|wrong version number|SSL|TLS/i.test(raw)) {
              friendly = `TLS/connection issue: ${raw}. Check encryption (SSL=465, TLS=587, None=25).`;
            } else if (code === "EAUTH" || /535|534|invalid login|authentication/i.test(raw)) {
              friendly = "SMTP authentication failed. Check username and password.";
            } else if (code === "ECONNECTION" || /ECONNREFUSED|ENOTFOUND|getaddrinfo|dns/i.test(raw)) {
              friendly = `Cannot reach SMTP server ${smtp.host}:${smtp.port}. ${raw}`;
            }
            providerError = `SMTP send failed: ${friendly}`;
            console.error(providerError);
          }
        }
      } catch (emailErr) {
        providerError = `Email send threw: ${(emailErr as Error).message}`;
        console.error(providerError);
      }
    } else {
      // Non-email channels not implemented yet
      providerError = `Channel '${channel}' is not configured for delivery`;
    }

    if (!emailDelivered) {
      return new Response(
        JSON.stringify({
          error:
            providerError ||
            "Verification email could not be sent. Please contact support or try again later.",
          provider_status: providerStatus,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Verification code sent" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Send OTP error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
