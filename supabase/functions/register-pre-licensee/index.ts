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
      username, registration_number, entity_specific_data,
      documents_metadata, terms_accepted,
    } = body;

    // Validate required fields
    const missing: string[] = [];
    if (!email) missing.push("email");
    if (!password) missing.push("password");
    if (!first_name) missing.push("first_name");
    if (!last_name) missing.push("last_name");
    if (!applicant_name) missing.push("applicant_name");
    if (!sector_id) missing.push("sector_id");
    if (!sub_sector_id) missing.push("sub_sector_id");
    if (!category_id) missing.push("category_id");
    if (missing.length) {
      console.error("register-pre-licensee missing fields:", missing, "body keys:", Object.keys(body));
      return new Response(JSON.stringify({ error: `Missing required fields: ${missing.join(", ")}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!terms_accepted) {
      return new Response(JSON.stringify({ error: "You must accept the Terms & Conditions" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify email OTP was completed
    const { data: otpCheck } = await supabaseAdmin
      .from("otp_verifications")
      .select("id")
      .eq("user_email", email)
      .eq("channel", "email")
      .not("verified_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!otpCheck || otpCheck.length === 0) {
      return new Response(JSON.stringify({ error: "Email verification is required before registration" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check username uniqueness if provided
    if (username) {
      const { data: existingUsername } = await supabaseAdmin
        .from("registrations")
        .select("id")
        .eq("username", username)
        .limit(1);

      if (existingUsername && existingUsername.length > 0) {
        return new Response(JSON.stringify({ error: "Username is already taken" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Check registration number uniqueness if provided
    if (registration_number) {
      const { data: existingRegNum } = await supabaseAdmin
        .from("registrations")
        .select("id")
        .eq("registration_number", registration_number)
        .limit(1);

      if (existingRegNum && existingRegNum.length > 0) {
        return new Response(JSON.stringify({ error: "Registration number is already registered" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
      console.error("Auth createUser error:", authError);
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!authData.user) {
      return new Response(JSON.stringify({ error: "Failed to create user" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Insert registration record - registration_reference is auto-generated
    const { data: regData, error: regError } = await supabaseAdmin.from("registrations").insert({
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
      username: username || null,
      registration_number: registration_number || null,
      entity_specific_data: entity_specific_data || {},
      documents_metadata: documents_metadata || [],
      email_verified: true,
      terms_accepted: terms_accepted || false,
      status: "pending_review",
    }).select("registration_reference").single();

    if (regError) {
      console.error("Registration insert error:", regError);
      return new Response(JSON.stringify({
        user_id: authData.user.id,
        warning: "Account created but registration details failed to save. Please contact support.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Queue admin notification
    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: authData.user.id, // Will be re-targeted to admins below
        title: "New Registration Application",
        message: `New registration from ${applicant_name} (${email}) - Ref: ${regData.registration_reference}`,
        type: "info",
        entity_type: "registration",
        entity_id: regData.registration_reference,
      });

      // Notify all admin users
      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["super_admin", "admin"]);

      if (adminRoles && adminRoles.length > 0) {
        const adminNotifications = adminRoles
          .filter(r => r.user_id !== authData.user.id)
          .map(r => ({
            user_id: r.user_id,
            title: "New Registration Requires Review",
            message: `${applicant_name} has submitted a registration application (${regData.registration_reference}). Please review.`,
            type: "action",
            entity_type: "registration",
            entity_id: regData.registration_reference,
          }));

        if (adminNotifications.length > 0) {
          await supabaseAdmin.from("notifications").insert(adminNotifications);
        }
      }
    } catch (notifErr) {
      console.warn("Admin notification failed:", notifErr);
    }

    // 4. Send acknowledgement email
    try {
      await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            to_email: email,
            subject: "Registration Received - " + regData.registration_reference,
            body: `Dear ${first_name},\n\nYour registration application has been received successfully.\n\nRegistration Reference: ${regData.registration_reference}\n\nYour application is now under review. You will be notified once it has been processed.\n\nExpected processing time: 3-5 business days.\n\nThank you.`,
            channel: "email",
          }),
        }
      );
    } catch (emailErr) {
      console.warn("Acknowledgement email failed:", emailErr);
    }

    return new Response(JSON.stringify({
      user_id: authData.user.id,
      registration_reference: regData.registration_reference,
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
