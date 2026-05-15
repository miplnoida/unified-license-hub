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

    // Verify caller is admin/super_admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles").select("role").eq("id", caller.id).single();
    const isAdmin = callerProfile?.role === "admin" || callerProfile?.role === "super_admin";
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, user_id, updates } = await req.json();
    if (!user_id || !action) {
      return new Response(JSON.stringify({ error: "user_id and action are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const allowed: Record<string, any> = {};
      const fields = ["full_name", "username", "position", "gender", "user_type", "status"];
      for (const f of fields) {
        if (updates && updates[f] !== undefined) allowed[f] = updates[f];
      }
      allowed.updated_at = new Date().toISOString();
      const { error } = await supabaseAdmin.from("profiles").update(allowed).eq("id", user_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Sync user_metadata if full_name changed
      if (allowed.full_name) {
        await supabaseAdmin.auth.admin.updateUserById(user_id, {
          user_metadata: { full_name: allowed.full_name },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      // Best-effort cleanup of related rows; auth deletion cascades profiles via FK if configured.
      await supabaseAdmin.from("entity_user_access" as any).delete().eq("user_id", user_id);
      await supabaseAdmin.from("user_dynamic_roles" as any).delete().eq("user_id", user_id);
      const { error: profErr } = await supabaseAdmin.from("profiles").delete().eq("id", user_id);
      if (profErr) console.error("profile delete:", profErr.message);
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (authErr) {
        return new Response(JSON.stringify({ error: authErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
