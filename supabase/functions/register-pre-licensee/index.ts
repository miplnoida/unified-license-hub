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
    const normalizedEmail = String(email || '').trim().toLowerCase();

    // Validate required fields
    const missing: string[] = [];
    if (!normalizedEmail) missing.push("email");
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

    // Explicit duplicate guard for the primary user email across existing registrations,
    // profiles, and auth users before attempting auth account creation.
    {
      const [{ data: existingRegistration }, { data: existingProfile }, { data: existingAuthEmail, error: existingAuthEmailError }] = await Promise.all([
        supabaseAdmin
          .from("registrations")
          .select("id")
          .ilike("email", normalizedEmail)
          .limit(1),
        supabaseAdmin
          .from("profiles")
          .select("id")
          .ilike("email", normalizedEmail)
          .limit(1),
        supabaseAdmin.rpc("check_primary_user_email_exists", { p_email: normalizedEmail }),
      ]);

      if ((existingRegistration && existingRegistration.length > 0) || (existingProfile && existingProfile.length > 0) || (!existingAuthEmailError && existingAuthEmail === true)) {
        return new Response(JSON.stringify({
          error: "This email is already registered. Please use a different email.",
          code: "PRIMARY_USER_EMAIL_EXISTS",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Verify email OTP was completed
    const { data: otpCheck } = await supabaseAdmin
      .from("otp_verifications")
      .select("id")
        .eq("user_email", normalizedEmail)
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

    // Check applicant name uniqueness (case-insensitive, trimmed)
    {
      const normalized = String(applicant_name).trim();
      const { data: existingName } = await supabaseAdmin
        .from("registrations")
        .select("id")
        .ilike("applicant_name", normalized)
        .limit(1);

      if (existingName && existingName.length > 0) {
        return new Response(JSON.stringify({
          error: "Applicant Name already exists. Please enter a unique applicant name.",
          code: "APPLICANT_NAME_EXISTS",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 1. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
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
      email: normalizedEmail,
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

    let sectorName = "";
    let subSectorName = "";
    let categoryName = "";
    let regulatorId: string | null = null;

    // 2b. Create a draft application pre-populated with selected sector/sub-sector/category
    try {
      const [{ data: sectorRow }, { data: subSectorRow }, { data: categoryRow }] = await Promise.all([
        supabaseAdmin.from("sectors").select("id,name,regulator_id").eq("id", sector_id).maybeSingle(),
        supabaseAdmin.from("sub_sectors").select("id,name").eq("id", sub_sector_id).maybeSingle(),
        supabaseAdmin.from("categories").select("id,name").eq("id", category_id).maybeSingle(),
      ]);

      sectorName = sectorRow?.name || "";
      subSectorName = subSectorRow?.name || "";
      categoryName = categoryRow?.name || "";
      regulatorId = sectorRow?.regulator_id || null;
      const licenseType = [sectorName, subSectorName, categoryName].filter(Boolean).join(" - ");

      // Match form templates using the same priority logic as NewApplication
      const { data: publishedTemplates } = await supabaseAdmin
        .from("form_templates")
        .select("id, sector_id, sub_sector_id, category_id, status, form_type")
        .eq("status", "published")
        .in("form_type", ["pre_license", "application"]);

      let matched: { id: string }[] = [];
      const all = publishedTemplates || [];
      const byCat = all.filter(t => t.category_id === category_id);
      if (byCat.length) matched = byCat;
      else {
        const bySub = all.filter(t => t.sub_sector_id === sub_sector_id && !t.category_id);
        if (bySub.length) matched = bySub;
        else {
          const bySec = all.filter(t => t.sector_id === sector_id && !t.sub_sector_id && !t.category_id);
          matched = bySec;
        }
      }
      const matchedIds = matched.map(t => t.id);

      // Duplicate protection: check if a draft already exists for this user with this registration_reference
      const { data: existingDraft } = await supabaseAdmin
        .from("applications")
        .select("id, data")
        .eq("applicant_id", authData.user.id)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(5);

      const dupe = (existingDraft || []).find((r: any) =>
        r?.data?.registration_reference === regData.registration_reference
      );

      const draftData = {
        sector_id,
        sub_sector_id,
        category_id,
        sector_name: sectorName,
        sub_sector_name: subSectorName,
        category_name: categoryName,
        registration_reference: regData.registration_reference,
        source: "public_registration",
        form_template_ids: matchedIds,
        forms_data: {},
        form_version_ids: {},
      };

      if (dupe) {
        await supabaseAdmin
          .from("applications")
          .update({ license_type: licenseType, regulator_id: regulatorId, data: { ...(dupe as any).data, ...draftData } })
          .eq("id", (dupe as any).id);
      } else {
        await supabaseAdmin.from("applications").insert({
          applicant_id: authData.user.id,
          license_type: licenseType,
          status: "draft",
          regulator_id: regulatorId,
          data: draftData,
        });
      }
    } catch (draftErr) {
      console.warn("Draft application creation failed:", draftErr);
    }

    // 3. Fire template-driven notifications (in_app + email) via the central dispatcher.
    //    Best-effort: never block registration on dispatch failures.
    const dispatchPayload = {
      applicant_id: authData.user.id,
      applicant_name,
      applicant_email: normalizedEmail,
      registration_reference: regData.registration_reference,
      sector_id,
      category_id,
      regulator_id: regulatorId,
      sector_name: sectorName,
    };
    for (const event_key of ["registration.submitted", "registration.received"]) {
      try {
        await supabaseAdmin.functions.invoke("dispatch-notification-event", {
          body: {
            event_key,
            entity_type: "registration",
            entity_id: regData.registration_reference,
            payload: dispatchPayload,
          },
        });
      } catch (dispatchErr) {
        console.warn(`dispatch ${event_key} failed:`, dispatchErr);
      }
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
    return new Response(JSON.stringify({ error: (error as Error)?.message || String(error) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
