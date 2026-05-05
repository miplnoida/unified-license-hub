import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { email, code, channel = "email", purpose = "registration" } = await req.json();

    if (!email || !code) {
      return new Response(JSON.stringify({ error: "Email and code are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the most recent non-expired, non-verified OTP
    const { data: otpRecords, error: fetchError } = await supabaseAdmin
      .from("otp_verifications")
      .select("*")
      .eq("user_email", email)
      .eq("channel", channel)
      .eq("purpose", purpose)
      .is("verified_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (fetchError || !otpRecords || otpRecords.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid verification code found. Please request a new one." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const otp = otpRecords[0];

    // Check max attempts
    if (otp.attempts >= otp.max_attempts) {
      return new Response(
        JSON.stringify({ error: "Maximum verification attempts exceeded. Please request a new code." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Increment attempts
    await supabaseAdmin
      .from("otp_verifications")
      .update({ attempts: otp.attempts + 1 })
      .eq("id", otp.id);

    // Verify code
    const inputHash = await hashCode(code);
    if (inputHash !== otp.code_hash) {
      const remaining = otp.max_attempts - (otp.attempts + 1);
      return new Response(
        JSON.stringify({
          error: `Invalid code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
          verified: false,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark as verified
    await supabaseAdmin
      .from("otp_verifications")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", otp.id);

    return new Response(
      JSON.stringify({ verified: true, message: "Verification successful" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Verify OTP error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
