import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, event_type, user_id, title, message, entity_type, entity_id } = await req.json();

    if (action === "dispatch") {
      // Manual dispatch from admin
      const { data: templates } = await supabase
        .from("notification_templates")
        .select("*")
        .eq("event_type", event_type)
        .eq("is_active", true);

      const results: { channel: string; status: string }[] = [];

      // Always create in-app
      await supabase.from("notifications").insert({
        user_id,
        title,
        message,
        type: "info",
        entity_type,
        entity_id,
        channel: "in_app",
        delivery_status: "delivered",
      });
      results.push({ channel: "in_app", status: "delivered" });

      // Process email/sms templates
      for (const tmpl of templates || []) {
        if (tmpl.channel === "in_app") continue;

        // Check user preferences
        const { data: pref } = await supabase
          .from("notification_preferences")
          .select("enabled")
          .eq("user_id", user_id)
          .eq("channel", tmpl.channel)
          .eq("event_type", event_type)
          .maybeSingle();

        if (pref?.enabled === false) {
          results.push({ channel: tmpl.channel, status: "skipped_preference" });
          continue;
        }

        // Queue the notification (email/sms delivery would be handled by external service)
        await supabase.from("notifications").insert({
          user_id,
          title,
          message: tmpl.body,
          type: "info",
          entity_type,
          entity_id,
          channel: tmpl.channel,
          template_id: tmpl.id,
          delivery_status: "queued",
        });
        results.push({ channel: tmpl.channel, status: "queued" });
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "process_queue") {
      // Process queued notifications (email/SMS delivery)
      const { data: queued } = await supabase
        .from("notifications")
        .select("*, notification_templates:template_id(*)")
        .eq("delivery_status", "queued")
        .limit(50);

      let processed = 0;
      for (const notif of queued || []) {
        // Get user profile for email
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", notif.user_id)
          .single();

        if (!profile) continue;

        if (notif.channel === "email") {
          // Email delivery placeholder - integrate with SMTP/Resend/SendGrid
          console.log(`[EMAIL] To: ${profile.email}, Subject: ${notif.title}, Body: ${notif.message}`);
          await supabase
            .from("notifications")
            .update({ delivery_status: "delivered" } as any)
            .eq("id", notif.id);
          processed++;
        } else if (notif.channel === "sms") {
          // SMS delivery placeholder - integrate with Twilio/Vonage
          console.log(`[SMS] To: ${profile.email}, Body: ${notif.message}`);
          await supabase
            .from("notifications")
            .update({ delivery_status: "delivered" } as any)
            .eq("id", notif.id);
          processed++;
        }
      }

      return new Response(JSON.stringify({ success: true, processed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
