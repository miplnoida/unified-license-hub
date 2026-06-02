import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

/**
 * Add an application remark / comment without touching workflow state.
 *
 * This is a "middle tier" capability for regulator-level users (internal staff
 * who can view applications but are NOT the configured approver for the
 * current workflow step). They are permitted to record observations on the
 * application's audit trail, but MUST NOT be able to approve, reject, send
 * back, escalate, or otherwise advance the workflow.
 *
 * Inserts a row in approval_actions with action='remark_added',
 * action_type='add_remark'. It does NOT:
 *  - change application.status
 *  - touch workflow_instances.current_step_id / status
 *  - generate licenses
 *  - emit approval / rejection timestamps
 */

const INTERNAL_ROLES = ["super_admin", "admin", "supervisor", "licensing_officer", "analyst", "developer"] as const;

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

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorResponse(req, 401, "Missing authorization header", "UNAUTHORIZED");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: authErr } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (authErr || !caller) return errorResponse(req, 401, "Invalid or expired token", "UNAUTHORIZED");

    let body: any;
    try { body = await req.json(); } catch { body = {}; }

    const application_id: string | undefined = body.application_id;
    const instance_id: string | undefined = body.instance_id;
    const step_id: string | undefined = body.step_id;
    const comments: string = (body.comments || "").toString().trim();

    if (!application_id) return errorResponse(req, 400, "application_id is required", "BAD_REQUEST");
    if (!comments) return errorResponse(req, 400, "comments is required", "BAD_REQUEST");
    if (comments.length > 4000) return errorResponse(req, 400, "comments too long (max 4000 chars)", "BAD_REQUEST");

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify application exists.
    const { data: app, error: appErr } = await admin
      .from("applications")
      .select("id")
      .eq("id", application_id)
      .maybeSingle();
    if (appErr) return errorResponse(req, 500, appErr.message, "DB_ERROR");
    if (!app) return errorResponse(req, 404, "Application not found", "NOT_FOUND");

    // Caller must be internal staff (regulator-level or higher). This is the
    // remark capability; full workflow actors flow through perform-workflow-action.
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const callerRoles = ((roleRows as any[]) || []).map(r => r.role);
    const isInternal = callerRoles.some(r => (INTERNAL_ROLES as readonly string[]).includes(r));
    if (!isInternal) {
      return errorResponse(req, 403, "Only internal staff can add remarks", "FORBIDDEN");
    }

    const insertRow: Record<string, unknown> = {
      application_id,
      actor_id: caller.id,
      action: "remark_added",
      action_type: "add_remark",
      comments,
    };
    if (instance_id) insertRow.workflow_instance_id = instance_id;
    if (step_id) insertRow.step_id = step_id;

    const { data: inserted, error: insErr } = await admin
      .from("approval_actions")
      .insert(insertRow)
      .select()
      .single();
    if (insErr) return errorResponse(req, 500, insErr.message, "DB_ERROR");

    // Best-effort notification dispatch. Never block on failure.
    try {
      await admin.functions.invoke("dispatch-notification-event", {
        body: {
          event_key: "application.remark_added",
          entity_type: "application",
          entity_id: application_id,
          payload: {
            application_id,
            actor_id: caller.id,
            comments,
          },
        },
      });
    } catch (_dispatchErr) { /* swallow */ }

    return jsonResponse(req, 200, { success: true, action: inserted });
  } catch (e) {
    console.error("add-application-remark fatal:", e);
    return errorResponse(req, 500, e instanceof Error ? e.message : "Internal server error", "INTERNAL");
  }
}

Deno.serve(handler);
