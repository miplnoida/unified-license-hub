import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { requireUserPermission } from "../_shared/authz.ts";

/**
 * Edge function: approve-pre-licensee (post-approval provisioning ONLY)
 *
 * Workflow ownership:
 * - All DB state for final approval (application status, license, licensee, workflow
 *   instance, approval action, audit, notification) is performed atomically by the
 *   Postgres RPC `perform_final_workflow_approval`, which validates the actor,
 *   step, allowed_actions, and last-step position.
 * - This function does NOT perform any approval state mutation. It is invoked by
 *   `perform-workflow-action` AFTER `perform_final_workflow_approval` has already
 *   committed the approval. Its sole responsibility is provisioning the licensee
 *   web user via the Supabase Auth admin API (which is not callable from SQL).
 *
 * Returned password is never sent back to the client — instead a recovery link is
 * generated so the user sets their own password on first login.
 */

function jsonResponse(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function errorResponse(req: Request, status: number, error: string, code: string) {
  return jsonResponse(req, status, { error, code });
}

export async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;


  const __authzGate = await requireUserPermission(req, "registration_management", "approve");
  if (!__authzGate.ok) return __authzGate.response;
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorResponse(req, 401, "Missing authorization header", "UNAUTHORIZED");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Identity comes from the gate's cryptographically verified token claims.
    // Never re-derive it via auth.getUser(): that round-trip fails with
    // "session not found" after a refresh-token rotation even though the
    // bearer token is valid, which surfaced as a bogus 401 on approvals.
    const caller = { id: __authzGate.userId, email: __authzGate.email };

    const admin = createClient(supabaseUrl, serviceKey);

    // Caller must be internal staff to invoke provisioning.
    const { data: callerRole } = await admin.rpc("get_user_role", { _user_id: caller.id });
    const internal = ["super_admin", "admin", "supervisor", "licensing_officer"];
    if (!callerRole || !internal.includes(callerRole as string)) {
      return errorResponse(req, 403, "Insufficient permissions", "FORBIDDEN");
    }

    let body: any;
    try { body = await req.json(); } catch { body = {}; }

    const application_id: string | undefined = body.application_id;
    if (!application_id) return errorResponse(req, 400, "application_id is required", "BAD_REQUEST");

    // The RPC must already have committed the approval. Verify state from DB —
    // this prevents anyone from invoking provisioning on a non-approved app to
    // bypass workflow.
    const { data: app, error: appErr } = await admin
      .from("applications")
      .select("id, applicant_id, application_number, status, license_type, data")
      .eq("id", application_id)
      .single();
    if (appErr || !app) return errorResponse(req, 404, "Application not found", "NOT_FOUND");

    if (app.status !== "approved") {
      return errorResponse(req, 409, "Application is not approved — cannot provision user", "NOT_APPROVED");
    }

    const appData = (app.data ?? {}) as Record<string, any>;
    const isRenewal = appData.is_renewal === true && !!appData.renewal_of_license_id;

    // Renewal: resolve the existing license/licensee; do NOT create a new user or entity.
    if (isRenewal) {
      const { data: rLicense } = await admin
        .from("licenses")
        .select("id, license_number, valid_from, valid_until")
        .eq("id", appData.renewal_of_license_id)
        .maybeSingle();
      if (!rLicense) return errorResponse(req, 409, "Original license not found for renewal", "RENEWAL_LICENSE_MISSING");

      const { data: rLicensee } = await admin
        .from("licensees")
        .select("id, name")
        .eq("license_id", rLicense.id)
        .maybeSingle();
      if (!rLicensee) return errorResponse(req, 409, "Licensee not found for renewed license", "NO_LICENSEE");

      // Regenerate certificate with updated expiry. Best-effort.
      try {
        await admin.functions.invoke("generate-license-certificate", {
          body: { mode: "generate", license_id: rLicense.id },
        });
      } catch (e) { console.error("generate-license-certificate (renewal) failed:", e); }

      const renewedValidUntil = (appData.renewed_valid_until as string | undefined) ?? null;
      const previousValidUntil = (appData.previous_valid_until as string | undefined) ?? null;
      const newValidUntil = renewedValidUntil ?? rLicense.valid_until ?? null;

      return jsonResponse(req, 200, {
        success: true,
        renewal: true,
        message: "License renewed",
        license_number: rLicense.license_number,
        license_id: rLicense.id,
        licensee_id: rLicensee.id,
        valid_from: rLicense.valid_from,
        valid_until: rLicense.valid_until,
        previous_valid_until: previousValidUntil,
        new_valid_until: newValidUntil,
        web_user_created: false,
      });
    }

    // License + licensee must already exist (created atomically by the approval RPC).
    const { data: license } = await admin
      .from("licenses")
      .select("id, license_number")
      .eq("application_id", application_id)
      .maybeSingle();
    if (!license) return errorResponse(req, 409, "License not found for approved application", "NO_LICENSE");

    const { data: licensee } = await admin
      .from("licensees")
      .select("id, name")
      .eq("license_id", license.id)
      .maybeSingle();
    if (!licensee) return errorResponse(req, 409, "Licensee not found for approved license", "NO_LICENSEE");


    // Resolve applicant identity for user provisioning.
    let applicantEmail = "";
    let applicantName = "";

    const { data: preLicUser } = await admin
      .from("pre_license_users")
      .select("email, full_name")
      .eq("id", app.applicant_id)
      .maybeSingle();
    if (preLicUser) {
      applicantEmail = preLicUser.email;
      applicantName = preLicUser.full_name;
    } else {
      const { data: profile } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", app.applicant_id)
        .maybeSingle();
      if (profile) {
        applicantEmail = profile.email;
        applicantName = profile.full_name;
      }
    }

    let webUserCreated = false;
    let passwordSetupUrl: string | null = null;

    if (applicantEmail) {
      const { data: existingUsers } = await admin
        .from("profiles")
        .select("id")
        .eq("email", applicantEmail)
        .eq("licensee_id", licensee.id)
        .limit(1);

      if (!existingUsers || existingUsers.length === 0) {
        const tempPassword = generatePassword();

        const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
          email: applicantEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: applicantName,
            user_type: "primary",
            entity_name: licensee.name,
            role: "licensee_primary",
          },
        });

        if (createErr) {
          if (createErr.message.includes("already been registered") || createErr.message.includes("already exists")) {
            const { data: existingAuth } = await admin
              .from("profiles").select("id").eq("email", applicantEmail).limit(1);
            if (existingAuth?.[0]) {
              await admin.from("profiles").update({
                licensee_id: licensee.id,
                role: "licensee_primary",
                user_type: "primary",
              }).eq("id", existingAuth[0].id);
              await admin.from("user_roles").upsert({
                user_id: existingAuth[0].id, role: "licensee_primary",
              }, { onConflict: "user_id,role" });
              try {
                await admin.rpc("seed_external_portal_defaults", {
                  _user_id: existingAuth[0].id,
                  _entity_id: licensee.id,
                  _role: "licensee_primary",
                  _actor: null,
                });
              } catch (seedErr) { console.error("seed_external_portal_defaults failed:", seedErr); }
              webUserCreated = true;
            }
          } else {
            console.error("Web user creation error:", createErr);
          }
        } else if (newUser?.user) {
          await admin.from("profiles").update({
            licensee_id: licensee.id,
            force_password_change: true,
          }).eq("id", newUser.user.id);

          try {
            await admin.rpc("seed_external_portal_defaults", {
              _user_id: newUser.user.id,
              _entity_id: licensee.id,
              _role: "licensee_primary",
              _actor: null,
            });
          } catch (seedErr) { console.error("seed_external_portal_defaults failed:", seedErr); }


          try {
            const { data: linkData } = await admin.auth.admin.generateLink({
              type: "recovery",
              email: applicantEmail,
            });
            passwordSetupUrl = (linkData as any)?.properties?.action_link || null;
          } catch (linkErr) {
            console.error("Failed to generate recovery link:", linkErr);
          }
          webUserCreated = true;
        }
      } else {
        webUserCreated = true; // already exists — do not reset
      }
    }

    // Fire-and-forget: bootstrap supervisory profile (risk rating + plan + actions)
    try {
      await admin.rpc("bootstrap_supervisory_profile", { _license_id: license.id });
    } catch (e) { console.error("bootstrap_supervisory_profile failed:", e); }

    // Fire-and-forget: generate signed license certificate
    try {
      await admin.functions.invoke("generate-license-certificate", {
        body: { mode: "generate", license_id: license.id },
      });
    } catch (e) { console.error("generate-license-certificate failed:", e); }

    return jsonResponse(req, 200, {
      success: true,
      message: "Licensee provisioned",
      license_number: license.license_number,
      license_id: license.id,
      licensee_id: licensee.id,
      web_user_created: webUserCreated,
      web_user_email: applicantEmail,
      password_setup_url: passwordSetupUrl,
    });
  } catch (err) {
    console.error("approve-pre-licensee error:", err);
    return errorResponse(req, 500, err instanceof Error ? err.message : "Internal error", "INTERNAL");
  }
}

Deno.serve(handler);

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
  for (let i = 4; i < 16; i++) pw += all[Math.floor(Math.random() * all.length)];
  return pw.split("").sort(() => Math.random() - 0.5).join("");
}
