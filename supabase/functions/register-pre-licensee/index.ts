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

    const body = await req.json();
    const {
      email, password, first_name, last_name, applicant_name, applicant_name_alt,
      sector_id, sub_sector_id, category_id,
      mailing_address, physical_address, same_as_mailing, telephone,
    } = body;

    // Validate required fields
    if (!email || !password || !first_name || !last_name || !applicant_name || !sector_id || !sub_sector_id || !category_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: `${first_name} ${last_name}`,
        entity_name: applicant_name,
        role: "pre_licensee",
        user_type: "primary",
      },
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!authData.user) {
      return new Response(JSON.stringify({ error: "Failed to create user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Insert registration record (using service role bypasses RLS)
    const { error: regError } = await supabaseAdmin.from("registrations").insert({
      user_id: authData.user.id,
      sector_id,
      sub_sector_id,
      category_id,
      applicant_name,
      applicant_name_alt: applicant_name_alt || "",
      mailing_address,
      physical_address,
      same_as_mailing: same_as_mailing || false,
      first_name,
      last_name,
      telephone: telephone || "",
      email,
      status: "pending_verification",
    });

    if (regError) {
      console.error("Registration insert error:", regError);
      // User was created but registration failed - still return success with warning
      return new Response(JSON.stringify({
        user_id: authData.user.id,
        warning: "Account created but registration details failed to save. Please contact support.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      user_id: authData.user.id,
      message: "Registration successful",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
