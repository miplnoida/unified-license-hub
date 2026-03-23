import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Edge function: approve-pre-licensee
 * Called when a pre-licensee application receives final approval.
 * 
 * Steps:
 * 1. Validate caller is internal staff
 * 2. Verify application is in approvable state
 * 3. Update application status to approved
 * 4. Generate license
 * 5. Create licensee entity
 * 6. Create web user for the licensee (primary user)
 * 7. Audit log everything
 * 
 * Prevents duplicate processing via idempotency checks.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller is internal staff
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: callerRole } = await admin.rpc("get_user_role", { _user_id: caller.id });
    const internalRoles = ["super_admin", "admin", "supervisor", "licensing_officer"];
    if (!callerRole || !internalRoles.includes(callerRole as string)) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { application_id, comments } = await req.json();
    if (!application_id) {
      return new Response(
        JSON.stringify({ error: "application_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch application
    const { data: app, error: appErr } = await admin
      .from("applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (appErr || !app) {
      return new Response(
        JSON.stringify({ error: "Application not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Idempotency: if already approved, return existing data
    if (app.status === "approved") {
      // Find existing license
      const { data: existingLic } = await admin
        .from("licenses")
        .select("license_number")
        .eq("application_id", application_id)
        .limit(1);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Application was already approved",
          license_number: existingLic?.[0]?.license_number || null,
          already_processed: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Must be in submitted or in_progress state
    if (!["submitted", "in_progress"].includes(app.status)) {
      return new Response(
        JSON.stringify({ error: `Cannot approve application in '${app.status}' status` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const appData = (app.data || {}) as Record<string, unknown>;

    // 2. Update application to approved
    const { error: updateErr } = await admin
      .from("applications")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", application_id);

    if (updateErr) {
      return new Response(
        JSON.stringify({ error: "Failed to update application: " + updateErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Generate license (uses DB sequence for unique number)
    const { data: license, error: licErr } = await admin
      .from("licenses")
      .insert({
        application_id: application_id,
        holder_id: app.applicant_id,
        license_type: app.license_type,
        regulator_id: app.regulator_id || null,
        sector_id: (appData.sector_id as string) || null,
        sub_sector_id: (appData.sub_sector_id as string) || null,
        category_id: (appData.category_id as string) || null,
      })
      .select("id, license_number")
      .single();

    if (licErr) {
      console.error("License creation error:", licErr);
      // Rollback application status
      await admin.from("applications").update({ status: "in_progress", approved_at: null }).eq("id", application_id);
      return new Response(
        JSON.stringify({ error: "Failed to generate license: " + licErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Create licensee entity (check for duplicate first)
    const entityName = (appData.entity_name as string) || (appData.applicant_name as string) || app.license_type;
    
    const { data: existingLicensee } = await admin
      .from("licensees")
      .select("id")
      .eq("license_id", license.id)
      .limit(1);

    let licenseeId: string;

    if (existingLicensee && existingLicensee.length > 0) {
      licenseeId = existingLicensee[0].id;
    } else {
      const { data: newLicensee, error: licenseeErr } = await admin
        .from("licensees")
        .insert({
          name: entityName,
          license_id: license.id,
          sector_id: (appData.sector_id as string) || null,
          sub_sector_id: (appData.sub_sector_id as string) || null,
          category_id: (appData.category_id as string) || null,
          status: "active",
        })
        .select("id")
        .single();

      if (licenseeErr) {
        console.error("Licensee entity creation error:", licenseeErr);
        // Non-fatal: license was already created
      }
      licenseeId = newLicensee?.id || "";
    }

    // 5. Create web user for the licensee
    // Get applicant info from pre_license_users
    let applicantEmail = "";
    let applicantName = "";

    const { data: preLicUser } = await admin
      .from("pre_license_users")
      .select("email, full_name")
      .eq("id", app.applicant_id)
      .single();

    if (preLicUser) {
      applicantEmail = preLicUser.email;
      applicantName = preLicUser.full_name;
    } else {
      // Fallback: check profiles table
      const { data: profile } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", app.applicant_id)
        .single();
      if (profile) {
        applicantEmail = profile.email;
        applicantName = profile.full_name;
      }
    }

    // Check if a licensee web user already exists for this email
    let webUserCreated = false;
    let webUserPassword = "";

    if (applicantEmail && licenseeId) {
      const { data: existingUsers } = await admin
        .from("profiles")
        .select("id")
        .eq("email", applicantEmail)
        .eq("licensee_id", licenseeId)
        .limit(1);

      if (!existingUsers || existingUsers.length === 0) {
        // Generate a strong random password
        webUserPassword = generatePassword();

        // Create auth user with licensee_primary role
        const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
          email: applicantEmail,
          password: webUserPassword,
          email_confirm: true,
          user_metadata: {
            full_name: applicantName,
            user_type: "primary",
            entity_name: entityName,
            role: "licensee_primary",
          },
        });

        if (createErr) {
          // If user already exists with that email, just link them
          if (createErr.message.includes("already been registered") || createErr.message.includes("already exists")) {
            console.log("User already exists, linking to licensee");
            // Try to update existing profile to link to licensee
            const { data: existingAuth } = await admin
              .from("profiles")
              .select("id")
              .eq("email", applicantEmail)
              .limit(1);
            
            if (existingAuth?.[0]) {
              await admin.from("profiles").update({
                licensee_id: licenseeId,
                role: "licensee_primary",
                user_type: "primary",
              }).eq("id", existingAuth[0].id);
              
              // Also update user_roles
              await admin.from("user_roles").upsert({
                user_id: existingAuth[0].id,
                role: "licensee_primary",
              }, { onConflict: "user_id,role" });
              
              webUserCreated = true;
            }
          } else {
            console.error("Web user creation error:", createErr);
          }
        } else if (newUser?.user) {
          // Link profile to licensee
          await admin.from("profiles").update({
            licensee_id: licenseeId,
          }).eq("id", newUser.user.id);
          
          webUserCreated = true;
        }
      } else {
        webUserCreated = true; // Already exists
        webUserPassword = ""; // Don't expose
      }
    }

    // 6. Complete workflow instance if exists
    if (app.workflow_id) {
      await admin
        .from("workflow_instances")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("entity_id", application_id)
        .eq("entity_type", "application")
        .eq("status", "active");
    }

    // 7. Record approval action
    await admin.from("approval_actions").insert({
      application_id,
      action: "approved",
      action_type: "approve",
      actor_id: caller.id,
      comments: comments || "Application approved",
      responded_at: new Date().toISOString(),
    });

    // 8. Audit log
    await admin.from("audit_logs").insert({
      action: "pre_licensee_approved",
      entity_type: "application",
      entity_id: application_id,
      user_id: caller.id,
      new_value: {
        license_number: license.license_number,
        licensee_id: licenseeId,
        web_user_created: webUserCreated,
      },
    });

    // 9. Notify applicant
    try {
      await admin.from("notifications").insert({
        user_id: app.applicant_id,
        title: `Application Approved: ${app.application_number}`,
        message: `Your pre-license application has been approved. License Number: ${license.license_number}`,
        type: "success",
        entity_type: "application",
        entity_id: application_id,
      });
    } catch (e) {
      console.error("Notification error:", e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Application approved successfully",
        license_number: license.license_number,
        license_id: license.id,
        licensee_id: licenseeId,
        web_user_created: webUserCreated,
        web_user_password: webUserPassword || undefined,
        web_user_email: applicantEmail,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("approve-pre-licensee error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  
  let pw = "";
  pw += upper[Math.floor(Math.random() * upper.length)];
  pw += lower[Math.floor(Math.random() * lower.length)];
  pw += digits[Math.floor(Math.random() * digits.length)];
  pw += special[Math.floor(Math.random() * special.length)];
  
  for (let i = 4; i < 16; i++) {
    pw += all[Math.floor(Math.random() * all.length)];
  }
  
  // Shuffle
  return pw.split("").sort(() => Math.random() - 0.5).join("");
}
