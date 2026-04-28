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

    const { email, password, full_name, user_type, entity_name, role, licensee_id, role_id, role_ids, gender, send_email, position, username } = await req.json();

    // Normalize role_ids: accept array (preferred) or single role_id (back-compat)
    const dynamicRoleIds: string[] = Array.isArray(role_ids) && role_ids.length > 0
      ? role_ids.filter((x: any) => typeof x === 'string' && x.length > 0)
      : (role_id ? [role_id] : []);
    const primaryRoleId: string | null = dynamicRoleIds[0] || null;

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine the auth role (app_role enum) for the new user.
    // SAFETY: When a dynamic role_id is provided, do NOT inherit elevated
    // privileges from the role's system_role mapping. Module-level access
    // is enforced separately via the role_id + dynamic permissions system.
    // Only assign privileged app_roles when the caller explicitly passes
    // a `role` (e.g., for system-managed accounts like licensee users).
    let effectiveRole = role;

    if (!effectiveRole) {
      if (primaryRoleId) {
        // Dynamic role(s): assign safe baseline; real access controlled via user_dynamic_roles.
        effectiveRole = 'analyst';
      } else if (user_type) {
        effectiveRole = user_type === 'primary' ? 'licensee_primary' : 'licensee_secondary';
      } else {
        return new Response(JSON.stringify({ error: "A role must be selected" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Guard: if dynamic role(s) provided but caller passed elevated `role`,
    // downgrade unless ALL provided dynamic roles are built-in system roles.
    if (primaryRoleId && (effectiveRole === 'admin' || effectiveRole === 'super_admin')) {
      const { data: roleRows } = await supabaseAdmin
        .from("roles")
        .select("id, is_system")
        .in("id", dynamicRoleIds);
      const allSystem = (roleRows || []).length === dynamicRoleIds.length
        && (roleRows || []).every((r: any) => r.is_system);
      if (!allSystem) {
        effectiveRole = 'analyst';
      }
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

    // Update profile with additional fields
    if (userData.user) {
      const updates: Record<string, any> = { force_password_change: true };
      if (primaryRoleId) updates.role_id = primaryRoleId;
      if (gender) updates.gender = gender;
      if (licensee_id) updates.licensee_id = licensee_id;

      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update(updates)
        .eq("id", userData.user.id);

      if (updateError) {
        console.error("Failed to update profile:", updateError.message);
      }

      // Persist all dynamic role assignments to user_dynamic_roles (source of truth for RBAC)
      if (dynamicRoleIds.length > 0) {
        const rows = dynamicRoleIds.map((rid) => ({ user_id: userData.user!.id, role_id: rid }));
        const { error: udrError } = await supabaseAdmin
          .from("user_dynamic_roles")
          .upsert(rows, { onConflict: "user_id,role_id" });
        if (udrError) {
          console.error("Failed to insert user_dynamic_roles:", udrError.message);
        }
      }

      // Send credentials email
      if (send_email) {
        try {
          await supabaseAdmin.functions.invoke("send-notification", {
            body: {
              type: "email",
              to: email,
              subject: "Your Account Credentials",
              body: `Dear ${full_name},\n\nYour account has been created for ${entity_name || 'the platform'}.\n\nUsername: ${username || email}\nEmail: ${email}\nTemporary Password: ${password}\n\nPlease log in and change your password immediately after first login.\n\nRegards,\nAdministration Team`,
            },
          });
        } catch (emailErr) {
          console.error("Failed to send credentials email:", emailErr);
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
