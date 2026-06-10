import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

/**
 * Authenticated wrapper around perform_return_workflow_transition.
 * Mirrors perform-workflow-action but for entity_type='return'.
 * Skips license/licensee provisioning on final approval.
 */
const ACCEPTED_ACTIONS = new Set([
  "approve",
  "reject",
  "send_back",
  "escalate",
  "request_resubmission",
]);

function jsonResponse(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}
function errorResponse(req: Request, status: number, error: string, code: string, details?: unknown) {
  return jsonResponse(req, status, { error, code, ...(details !== undefined ? { details } : {}) });
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;
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

    let body: any; try { body = await req.json(); } catch { body = {}; }
    const return_id: string | undefined = body.return_id;
    const step_id: string | undefined = body.step_id;
    const instance_id: string | undefined = body.instance_id;
    const action_type: string | undefined = body.action_type;
    const comments: string = (body.comments || "").toString();

    if (!return_id) return errorResponse(req, 400, "return_id is required", "BAD_REQUEST");
    if (!action_type || !ACCEPTED_ACTIONS.has(action_type)) {
      return errorResponse(req, 400, `Invalid action_type`, "BAD_REQUEST");
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: rpcRes, error: rpcErr } = await admin.rpc("perform_return_workflow_transition", {
      _return_id: return_id,
      _instance_id: instance_id ?? null,
      _step_id: step_id ?? null,
      _action_type: action_type,
      _comments: comments,
      _actor_id: caller.id,
    });

    if (rpcErr) {
      console.error("perform_return_workflow_transition error:", rpcErr);
      return errorResponse(req, 500, rpcErr.message || "Workflow transition failed", "DB_ERROR");
    }
    const result = (rpcRes || {}) as Record<string, unknown>;
    if (result.error) {
      const status = typeof result.http === "number" ? (result.http as number) : 422;
      return errorResponse(req, status, String(result.error), String(result.code || "BUSINESS_ERROR"));
    }

    // Best-effort notification dispatch
    try {
      const eventKey =
        action_type === "reject" ? "return.rejected" :
        action_type === "request_resubmission" ? "return.resubmission_requested" :
        action_type === "send_back" ? "return.send_back" :
        action_type === "approve" ? (result.new_status === "VAL" ? "return.approved" : "return.approved_step") :
        "return.workflow_action_taken";
      await admin.functions.invoke("dispatch-notification-event", {
        body: {
          event_key: eventKey,
          entity_type: "return",
          entity_id: return_id,
          payload: { return_id, action_type, comments, actor_id: caller.id, step_id: (result as any).new_step_id },
        },
      });
    } catch (e) { console.warn("dispatch failed:", e); }

    return jsonResponse(req, 200, result);
  } catch (e) {
    console.error("perform-return-workflow-action fatal:", e);
    return errorResponse(req, 500, e instanceof Error ? e.message : "Internal server error", "INTERNAL");
  }
});
