import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { markPublicFunction } from "../_shared/publicFunction.ts";
import { renderBrandedEmail } from "../_shared/email-layout.ts";
import { loadEmailBranding } from "../_shared/email-branding.ts";
import { loadEmailDeliveryConfig, sendEmailWithFallback } from "../_shared/email-provider.ts";

markPublicFunction('Public OTP dispatch for registration flow');

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
    const providerStatus: number | null = null;

    if (channel === "email") {
      try {
        const purposeLabels: Record<string, string> = {
          registration: 'Registration verification',
          login_2fa: 'Sign-in verification',
          enable_2fa: 'Two-factor authentication setup',
          disable_2fa: 'Two-factor authentication removal',
        };
        const label = purposeLabels[purpose] || 'Verification';
        const subject = `Verification code | ${label}`;
        const text = `Verification code: ${otp}\n\nThis code is required to complete ${label.toLowerCase()} and is valid for 10 minutes.\n\nDo not share this code with any person. The Authority will never ask you to disclose it. If you did not request this code, no action is required.`;
        const branding = await loadEmailBranding(supabaseAdmin);
        const html = renderBrandedEmail({
          appName: branding.appName,
          logoUrl: branding.logoUrl,
          tagline: branding.tagline,
          brandColor: branding.brandColor,
          eyebrow: label,
          heading: "Verification code",
          intro: `Please enter the code below to complete ${label.toLowerCase()}. The code is valid for 10 minutes from the time of this message.`,
          code: otp,
          codeCaption: "Valid for 10 minutes",
          paragraphs: [
            "Do not share this code with any person. The Authority and its officers will never ask you to disclose it.",
            "If you did not request this code, no action is required and the code will expire automatically.",
          ],

          supportEmail: branding.supportEmail,
          supportPhone: branding.supportPhone,
          footerText: branding.footerText || undefined,
        });

        // Canonical provider routing: Resend primary, existing SMTP fallback.
        const emailConfig = await loadEmailDeliveryConfig(supabaseAdmin);
        const sendResult = await sendEmailWithFallback(emailConfig, {
          to: email,
          subject,
          text,
          html,
        });
        if (sendResult.success) {
          emailDelivered = true;
        } else {
          providerError = `Email send failed: ${sendResult.error || "unknown provider error"}`;
          console.error(providerError);
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
