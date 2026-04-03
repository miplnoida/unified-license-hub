import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { user_id, status, action, new_password } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle password reset action
    if (action === "reset_password" && new_password) {
      // Update auth password
      const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(
        user_id,
        { password: new_password }
      );

      if (resetError) {
        return new Response(JSON.stringify({ error: resetError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Set force_password_change flag
      await supabaseAdmin
        .from("profiles")
        .update({ force_password_change: true, updated_at: new Date().toISOString() })
        .eq("id", user_id);

      // Get user email for sending notification
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", user_id)
        .single();

      // Try to send notification email via send-notification function
      if (profile?.email) {
        try {
          // Insert a notification record
          await supabaseAdmin.from("notifications").insert({
            user_id,
            title: "Password Reset",
            message: `Your password has been reset by an administrator. Please log in with your temporary password and change it immediately.`,
            type: "system",
          });

          // Try to invoke send-notification edge function for email
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          
          await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              to_email: profile.email,
              subject: "Your Password Has Been Reset",
              body: `Dear ${profile.full_name || "User"},\n\nYour account password has been reset by an administrator.\n\nYour temporary password is: ${new_password}\n\nPlease log in and change your password immediately. You will be required to set a new password before accessing the system.\n\nIf you did not expect this change, please contact your administrator.\n\nRegards,\nSystem Administration`,
              channel: "email",
            }),
          });
        } catch (_emailErr) {
          // Email sending is best-effort; don't fail the reset
          console.error("Failed to send reset email:", _emailErr);
        }
      }

      return new Response(JSON.stringify({ success: true, message: "Password reset successfully. Temporary password sent to user email." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle status toggle
    if (!status) {
      return new Response(JSON.stringify({ error: "status is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update profile status
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", user_id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Also ban/unban the auth user
    if (status === "inactive") {
      await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "876600h" });
    } else {
      await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
