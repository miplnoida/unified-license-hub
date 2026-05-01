import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Centralized workflow action endpoint.
 *
 * Validates:
 *  - authenticated user
 *  - internal role / dynamic-role permission
 *  - active workflow instance for the application
 *  - current_step_id matches requested step
 *  - action is allowed for that step
 *  - mandatory comments for approve / reject / request_resubmission
 *  - application status is valid
 *
 * Then advances/pauses/completes workflow + writes a single approval_actions row.
 *
 * For final approval, delegates to approve-pre-licensee for license/licensee creation
 * (kept idempotent there).
 *
 * Errors are returned as HTTP 200 with `{ error, code }` so the client can render them.
 */

type ActionType =
  | "approve"
  | "reject"
  | "send_back"
  | "escalate"
  | "request_resubmission"
  | "request_info"
  | "delegate";

const VALID_ACTIONS: ActionType[] = [
  "approve",
  "reject",
  "send_back",
  "escalate",
  "request_resubmission",
  "request_info",
  "delegate",
];

const INTERNAL_ROLES = ["super_admin", "admin", "supervisor", "licensing_officer", "analyst"];

function err(status: number, error: string, code?: string) {
  // Per project convention: validation errors return HTTP 200 with details.
  const httpStatus = status >= 500 ? status : 200;
  return new Response(
    JSON.stringify({ error, code }),
    { status: httpStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return err(401, "Missing authorization header", "UNAUTHORIZED");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: authErr } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (authErr || !caller) return err(401, "Invalid or expired token", "UNAUTHORIZED");

    const body = await req.json().catch(() => ({}));
    const application_id: string | undefined = body.application_id;
    const step_id: string | undefined = body.step_id;
    const instance_id: string | undefined = body.instance_id;
    const raw_action: string | undefined = body.action_type;
    const comments: string | undefined = (body.comments || "").toString().trim();
    const delegated_to: string | undefined = body.delegated_to;

    if (!application_id) return err(400, "application_id is required", "BAD_REQUEST");
    if (!raw_action || !VALID_ACTIONS.includes(raw_action as ActionType)) {
      return err(400, `Invalid action_type. Must be one of: ${VALID_ACTIONS.join(", ")}`, "BAD_REQUEST");
    }
    const action_type = raw_action as ActionType;

    // Mandatory remarks
    if (["approve", "reject", "request_resubmission"].includes(action_type) && !comments) {
      return err(400, "Remarks are mandatory for this action", "REMARKS_REQUIRED");
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Verify caller has an internal role (or matches dynamic role mapped to the step)
    const { data: callerRole } = await admin.rpc("get_user_role", { _user_id: caller.id });
    const callerSystemRoles = new Set<string>();
    if (callerRole) callerSystemRoles.add(callerRole as string);

    // Pull dynamic role -> system_role mappings for the caller
    const { data: udr } = await admin
      .from("user_dynamic_roles")
      .select("role_id")
      .eq("user_id", caller.id);
    const roleIds = Array.from(new Set((udr || []).map((r: any) => r.role_id).filter(Boolean)));
    if (roleIds.length > 0) {
      const { data: dynRoles } = await admin.from("roles").select("system_role").in("id", roleIds);
      (dynRoles || []).forEach((r: any) => { if (r.system_role) callerSystemRoles.add(r.system_role); });
    }

    const isInternal = Array.from(callerSystemRoles).some((r) => INTERNAL_ROLES.includes(r));
    if (!isInternal) return err(403, "You do not have permission to act on workflows", "FORBIDDEN");

    // 2. Load application
    const { data: app, error: appErr } = await admin
      .from("applications")
      .select("id, applicant_id, status, license_type, application_number, workflow_id, current_step_id")
      .eq("id", application_id)
      .single();
    if (appErr || !app) return err(404, "Application not found", "NOT_FOUND");

    if (!["submitted", "in_progress"].includes(app.status)) {
      return err(409, `Cannot act on application in '${app.status}' status`, "INVALID_STATUS");
    }

    // 3. Load active workflow instance (idempotency-protected by unique index)
    const { data: instances } = await admin
      .from("workflow_instances")
      .select("id, workflow_id, current_step_id, status")
      .eq("entity_id", application_id)
      .eq("entity_type", "application")
      .eq("status", "active")
      .limit(1);

    const instance = (instances || [])[0];
    if (!instance) return err(409, "No active workflow instance for this application", "NO_ACTIVE_INSTANCE");
    if (instance_id && instance_id !== instance.id) {
      return err(409, "Stale workflow instance — please refresh", "STALE_INSTANCE");
    }

    // 4. Verify current_step matches
    if (!instance.current_step_id) return err(409, "Workflow has no current step", "NO_CURRENT_STEP");
    if (step_id && step_id !== instance.current_step_id) {
      return err(409, "Stale step — page is out of date, please refresh", "STALE_STEP");
    }

    // 5. Load all steps in the workflow + the current step
    const { data: allSteps } = await admin
      .from("approval_steps")
      .select("id, step_order, name, approver_role, allowed_actions, sla_hours")
      .eq("workflow_id", instance.workflow_id)
      .order("step_order", { ascending: true });
    const steps = allSteps || [];
    const currentStep = steps.find((s: any) => s.id === instance.current_step_id);
    if (!currentStep) return err(409, "Current step not found", "STEP_NOT_FOUND");
    const currentIdx = steps.findIndex((s: any) => s.id === currentStep.id);
    const isLast = currentIdx === steps.length - 1;
    const isFirst = currentIdx === 0;

    // 6. Check user is allowed for this step (super_admin always allowed)
    const isSuperAdmin = callerSystemRoles.has("super_admin");
    if (!isSuperAdmin && !callerSystemRoles.has(currentStep.approver_role)) {
      return err(403, `Only ${currentStep.approver_role} can act on this step`, "WRONG_APPROVER");
    }

    // 7. Check action is allowed for this step
    const allowed: string[] = Array.isArray(currentStep.allowed_actions)
      ? currentStep.allowed_actions
      : ["approve", "reject", "send_back"];
    // Synthetic actions always available unless explicitly removed
    const synthetic = new Set(["request_resubmission", "escalate"]);
    if (!allowed.includes(action_type) && !synthetic.has(action_type)) {
      return err(400, `Action '${action_type}' is not allowed on this step`, "ACTION_NOT_ALLOWED");
    }
    if (action_type === "send_back" && isFirst) {
      return err(400, "Cannot send back from the first step", "CANNOT_SEND_BACK");
    }
    if (action_type === "escalate" && isLast) {
      return err(400, "Cannot escalate from the last step", "CANNOT_ESCALATE");
    }

    // 8. Final approval → delegate to approve-pre-licensee (license/licensee idempotent)
    if (action_type === "approve" && isLast) {
      const finalRes = await fetch(`${supabaseUrl}/functions/v1/approve-pre-licensee`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ application_id, comments }),
      });
      const finalJson = await finalRes.json();
      if (!finalRes.ok || finalJson?.error) {
        return err(finalRes.status || 500, finalJson?.error || "Final approval failed", "APPROVAL_FAILED");
      }
      // approve-pre-licensee already records its own approval_action + completes instance.
      // Strip any plaintext password before returning.
      delete (finalJson as any).web_user_password;
      return new Response(
        JSON.stringify({ success: true, ...finalJson }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 9. Record the approval action (single source of truth)
    const { error: actionErr } = await admin.from("approval_actions").insert({
      application_id,
      step_id: currentStep.id,
      workflow_instance_id: instance.id,
      actor_id: caller.id,
      action: action_type,
      action_type,
      comments: comments || null,
      delegated_to: delegated_to || null,
      responded_at: new Date().toISOString(),
    });
    if (actionErr) return err(500, "Failed to record action: " + actionErr.message, "DB_ERROR");

    // 10. Advance / pause / complete the workflow
    let newAppStatus: string | null = null;
    let newCurrentStepId: string | null = currentStep.id;
    let newInstanceStatus: string | null = null;
    const nowIso = new Date().toISOString();

    if (action_type === "approve" || action_type === "escalate") {
      // Move forward
      const next = steps[currentIdx + 1];
      if (next) {
        newCurrentStepId = next.id;
        newAppStatus = "in_progress";
        await admin.from("workflow_instances").update({
          current_step_id: next.id,
        }).eq("id", instance.id);
      }
    } else if (action_type === "send_back") {
      const prev = steps[currentIdx - 1];
      if (prev) {
        newCurrentStepId = prev.id;
        newAppStatus = "in_progress";
        await admin.from("workflow_instances").update({
          current_step_id: prev.id,
        }).eq("id", instance.id);
      }
    } else if (action_type === "reject") {
      newInstanceStatus = "rejected";
      newAppStatus = "rejected";
      await admin.from("workflow_instances").update({
        status: "rejected",
        completed_at: nowIso,
      }).eq("id", instance.id);
    } else if (action_type === "request_resubmission") {
      newInstanceStatus = "paused";
      newAppStatus = "resubmission_requested";
      await admin.from("workflow_instances").update({
        status: "paused",
      }).eq("id", instance.id);
    }

    // 11. Update application
    const appUpdate: Record<string, unknown> = { current_step_id: newCurrentStepId };
    if (newAppStatus) appUpdate.status = newAppStatus;
    if (newAppStatus === "rejected") appUpdate.rejected_at = nowIso;
    await admin.from("applications").update(appUpdate).eq("id", application_id);

    // 12. Notify applicant on rejection / resubmission
    if (action_type === "reject" || action_type === "request_resubmission") {
      try {
        await admin.from("notifications").insert({
          user_id: app.applicant_id,
          title: action_type === "reject"
            ? `Application Rejected: ${app.application_number}`
            : `Resubmission Requested: ${app.application_number}`,
          message: comments || (action_type === "reject" ? "Your application was rejected." : "Please review and resubmit."),
          type: action_type === "reject" ? "error" : "warning",
          entity_type: "application",
          entity_id: application_id,
        });
      } catch (_e) { /* non-fatal */ }
    }

    // 13. Audit
    await admin.from("audit_logs").insert({
      action: `workflow_${action_type}`,
      entity_type: "workflow_instance",
      entity_id: instance.id,
      user_id: caller.id,
      new_value: {
        application_id,
        step_id: currentStep.id,
        next_step_id: newCurrentStepId,
        instance_status: newInstanceStatus || "active",
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        action: action_type,
        new_step_id: newCurrentStepId,
        application_status: newAppStatus || app.status,
        instance_status: newInstanceStatus || "active",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("perform-workflow-action error:", e);
    return err(500, e instanceof Error ? e.message : "Internal server error", "INTERNAL");
  }
});
