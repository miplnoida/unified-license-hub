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

    const { email, password, full_name, user_type, entity_name, role, licensee_id, role_id, gender } = await req.json();

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine the system role
    let effectiveRole = role || 'analyst';
    
    // If role_id is provided, look up the system_role from roles table
    if (role_id) {
      const { data: roleData } = await supabaseAdmin
        .from("roles")
        .select("system_role")
        .eq("id", role_id)
        .single();
      if (roleData) {
        effectiveRole = roleData.system_role;
      }
    } else if (!role && user_type) {
      effectiveRole = user_type === 'primary' ? 'licensee_primary' : 'licensee_secondary';
    }

    // Create the auth user with metadata
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        user_type: user_type || "primary",
        entity_name: entity_name || "",
        role: effectiveRole,
      },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update profile with additional fields (role_id, gender)
    if (userData.user) {
      const updates: Record<string, any> = {};
      if (role_id) updates.role_id = role_id;
      if (gender) updates.gender = gender;
      
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update(updates)
          .eq("id", userData.user.id);

        if (updateError) {
          console.error("Failed to update profile extras:", updateError.message);
        }
      }

      // If licensee_id is provided, link the user profile to the licensee entity
      if (licensee_id) {
        const { error: linkError } = await supabaseAdmin
          .from("profiles")
          .update({ licensee_id })
          .eq("id", userData.user.id);

        if (linkError) {
          console.error("Failed to link user to licensee:", linkError.message);
        }
      }
    }

    return new Response(JSON.stringify({ user: userData.user }), {
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
