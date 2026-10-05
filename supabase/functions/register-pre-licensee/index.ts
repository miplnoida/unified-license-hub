import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { markPublicFunction } from "../_shared/publicFunction.ts";
markPublicFunction('Public self-registration intake (OTP-gated downstream)');

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
      documents_metadata, terms_accepted, captcha_verification_id,
      upload_capability,
    } = body;
    const normalizedEmail = String(email || '').trim().toLowerCase();


    // ── Resolve the registration config that governs this submission ──
    // Admin-hidden controls (OTP, CAPTCHA, declarations) can never be satisfied by
    // the applicant, so the server must not enforce them either. Matching mirrors
    // the client: the most specific taxonomy match wins, else the default config.
    type RegConfigRow = {
      sector_id: string | null;
      sub_sector_id: string | null;
      category_id: string | null;
      is_default: boolean | null;
      require_otp: boolean | null;
      require_captcha: boolean | null;
      otp_visible_to_applicant: boolean | null;
      captcha_visible_to_applicant: boolean | null;
      declarations_section_visible: boolean | null;
      declarations: unknown;
    };

    let regConfig: RegConfigRow | null = null;
    {
      const { data: configs } = await supabaseAdmin
        .from("registration_form_configs")
        .select(
          "sector_id, sub_sector_id, category_id, is_default, require_otp, require_captcha, otp_visible_to_applicant, captcha_visible_to_applicant, declarations_section_visible, declarations",
        )
        .eq("is_active", true);

      let bestScore = -1;
      for (const c of (configs || []) as RegConfigRow[]) {
        if (c.category_id && c.category_id !== category_id) continue;
        if (c.sub_sector_id && c.sub_sector_id !== sub_sector_id) continue;
        if (c.sector_id && c.sector_id !== sector_id) continue;
        const score = c.category_id ? 3 : c.sub_sector_id ? 2 : c.sector_id ? 1 : c.is_default ? 0 : -0.5;
        if (score > bestScore) {
          bestScore = score;
          regConfig = c;
        }
      }
    }

    const otpVisible = regConfig?.otp_visible_to_applicant !== false;
    const captchaVisible = regConfig?.captcha_visible_to_applicant !== false;
    const otpEnforced = (regConfig?.require_otp ?? true) && otpVisible;
    const captchaEnforced = (regConfig?.require_captcha ?? true) && captchaVisible;

    const declarationsSectionVisible = regConfig?.declarations_section_visible !== false;
    const configuredDeclarations = Array.isArray(regConfig?.declarations)
      ? (regConfig!.declarations as Array<{ required?: boolean; visible?: boolean }>)
      : null;
    // A hidden section means no declaration can be shown, so none are enforced.
    const declarationsEnforced = !declarationsSectionVisible
      ? false
      : configuredDeclarations && configuredDeclarations.length > 0
        ? configuredDeclarations.some(d => d?.required === true && d?.visible !== false)
        : true;

    // ── Server-side CAPTCHA enforcement ──
    // A client-sent boolean is never trusted. When CAPTCHA is globally enabled the
    // request must carry a verification id minted by `manage-captcha` after the
    // provider token was verified with the secret key. It is single use and expires.
    {
      const { data: setting } = await supabaseAdmin
        .from("site_settings")
        .select("value")
        .eq("key", "captcha_enabled")
        .maybeSingle();
      const rawEnabled = setting?.value as unknown;
      const captchaEnabled = (rawEnabled === true || rawEnabled === "true") && captchaEnforced;



      if (captchaEnabled) {
        const verificationId = String(captcha_verification_id || "").trim();
        const captchaError = (message: string) =>
          new Response(JSON.stringify({ error: message, code: "CAPTCHA_REQUIRED" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });

        if (!verificationId) {
          return captchaError("Security verification is required before submitting.");
        }

        const { data: verification } = await supabaseAdmin
          .from("captcha_verifications")
          .select("id, consumed_at, expires_at")
          .eq("id", verificationId)
          .maybeSingle();

        if (!verification || verification.consumed_at || new Date(verification.expires_at) < new Date()) {
          return captchaError("Security verification expired. Please complete the challenge again.");
        }

        // Consume atomically — only the request that flips consumed_at may proceed.
        const { data: consumed } = await supabaseAdmin
          .from("captcha_verifications")
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", verificationId)
          .is("consumed_at", null)
          .select("id");

        if (!consumed || consumed.length === 0) {
          return captchaError("Security verification expired. Please complete the challenge again.");
        }
      }
    }

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

    // Declarations that are hidden cannot be accepted, so acceptance is only
    // required when at least one visible required declaration exists.
    if (declarationsEnforced && !terms_accepted) {
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

    // Verify email OTP was completed (only when the control is enforced + visible)
    const { data: otpCheck } = otpEnforced ? await supabaseAdmin
      .from("otp_verifications")
      .select("id")
        .eq("user_email", normalizedEmail)
      .eq("channel", "email")
      .not("verified_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1) : { data: [{ id: 'skipped' }] };

    if (otpEnforced && (!otpCheck || otpCheck.length === 0)) {
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

    const dedupedDocuments = Array.isArray(documents_metadata)
      ? Object.values(documents_metadata.reduce((acc: Record<string, any>, doc: any) => {
          const key = String(doc?.documentKey || doc?.label || doc?.name || "document").trim().toLowerCase().replace(/\s+/g, "_");
          acc[key] = { ...doc, documentKey: key };
          return acc;
        }, {}))
      : [];

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
      documents_metadata: dedupedDocuments,
      email_verified: true,
      terms_accepted: terms_accepted || false,
      status: "pending_review",
    }).select("id, registration_reference").single();

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

    // SEC-CRIT-01B: bind the pre-registration upload capability to this
    // registration, server-side and once. The browser presents its secret; the
    // registration id is never taken from the browser.
    let uploadBinding: string | null = null;
    if (upload_capability && typeof upload_capability === 'object') {
      try {
        const capId = String(upload_capability.capability_id ?? '');
        const secret = String(upload_capability.secret ?? '');
        if (/^[0-9a-f-]{36}$/i.test(capId) && secret.length === 64) {
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
          const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
          const { data: outcome } = await supabaseAdmin.rpc('registration_upload_capability_bind', {
            _capability_id: capId, _secret_hash: hash, _registration_id: regData.id,
          });
          uploadBinding = String(outcome ?? 'UNKNOWN');
        } else uploadBinding = 'CAPABILITY_INVALID';
      } catch (e) {
        console.error('upload capability bind failed', e);
        uploadBinding = 'BIND_FAILED';
      }
    }

    // FORM_FIRST governed entity resolution (§ registration convergence).
    // The applicant has no session at submission time, so this runs through the
    // service-role-only entry point. It never creates entities via direct DML:
    //   EXACT_MATCH    → binds the registration to the existing canonical entity
    //   POSSIBLE_MATCH → governed resolution case, binding pending resolution
    //   NO_MATCH       → governed provisional entity, binding provisional
    // Retried once: an unbound registration is a governance defect
    // (GAP-F3-18 — mandatory entity binding).
    let bindingOutcome: unknown = null;
    for (let attempt = 0; attempt < 2 && !bindingOutcome; attempt++) {
      try {
        const { data: resolveData, error: resolveError } = await supabaseAdmin.rpc(
          "onboarding_form_first_resolve_service",
          { _registration_id: regData.id },
        );
        if (resolveError) {
          console.error("FORM_FIRST resolution failed:", resolveError.message);
        } else {
          bindingOutcome = resolveData ?? null;
          console.log("FORM_FIRST resolution outcome:", JSON.stringify(resolveData));
        }
      } catch (resolveErr) {
        console.error("FORM_FIRST resolution threw:", resolveErr);
      }
    }

    try {
      await supabaseAdmin.rpc("seed_external_portal_defaults", {
        _user_id: authData.user.id,
        _entity_id: null,
        _role: "pre_licensee",
        _actor: null,
      });
    } catch (seedErr) {
      console.warn("seed_external_portal_defaults failed:", seedErr);
    }

    let sectorName = "";
    let subSectorName = "";
    let categoryName = "";
    let regulatorId: string | null = null;

    // Taxonomy labels for notification content only.
    //
    // F3 BOUNDARY (GAP-F3-05): registration intake MUST NOT create a licensing
    // application. The canonical F4 handoff artefact is produced only on final
    // registration approval, by the governed
    // `registration_licensing_handoff_ensure` server path.
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
      void subSectorName;
      void categoryName;
    } catch (taxErr) {
      console.warn("Taxonomy label lookup failed:", taxErr);
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
      upload_binding: uploadBinding,
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
