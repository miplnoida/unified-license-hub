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

    const { email, channel = "email" } = await req.json();

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
        const subject = "Your Registration Verification Code";
        const text = `Your verification code is: ${otp}\n\nThis code expires in 10 minutes. Do not share this code with anyone.`;
        const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 12px;">Verify your email</h2>
          <p style="color:#475569;margin:0 0 16px;">Use the code below to verify your email address. It expires in 10 minutes.</p>
          <div style="font-size:28px;font-weight:700;letter-spacing:6px;background:#0f172a;color:#fff;padding:14px 18px;border-radius:8px;text-align:center;">${otp}</div>
          <p style="color:#94a3b8;font-size:12px;margin-top:16px;">If you did not request this code, you can ignore this email.</p>
        </div>`;

        const resp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-transactional-email`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              to: email,
              subject,
              html,
              text,
            }),
          },
        );
        providerStatus = resp.status;
        const respText = await resp.text();
        if (resp.ok) {
          emailDelivered = true;
        } else {
          providerError = `Email provider returned ${resp.status}: ${respText.slice(0, 300)}`;
          console.error("send-transactional-email failed:", providerError);
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
