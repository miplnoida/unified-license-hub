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
  "return_for_correction",
  "request_more_info",
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
    const notification_overrides: Array<{ binding_id?: string; subject?: string; body?: string }> =
      Array.isArray(body.notification_overrides) ? body.notification_overrides : [];
    const overrideMap = new Map<string, { subject?: string; body?: string }>();
    for (const o of notification_overrides) {
      if (o && typeof o.binding_id === "string") {
        overrideMap.set(o.binding_id, { subject: o.subject, body: o.body });
      }
    }

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
        action_type === "return_for_correction" ? "return.returned_for_correction" :
        action_type === "request_more_info" ? "return.more_info_requested" :
        action_type === "send_back" ? "return.send_back" :
        action_type === "escalate" ? "return.escalated" :
        action_type === "approve" ? ((result as any).new_status === "VAL" ? "return.approved" : "return.approved_step") :
        "return.workflow_action_taken";
      const sharedPayload = {
        return_id,
        action_type,
        comments,
        action_comments: comments,
        actor_id: caller.id,
        step_id: step_id ?? null,
        previous_step_id: step_id ?? null,
        new_step_id: (result as any).new_step_id,
        current_step_id: (result as any).new_step_id,
        new_status: (result as any).new_status,
        previous_status: body.previous_status ?? null,
        reason: comments,
        edit_reason: comments,
        approved_at: action_type === "approve" && (result as any).new_status === "VAL" ? new Date().toISOString() : undefined,
        rejected_at: action_type === "reject" ? new Date().toISOString() : undefined,
        reviewer_name: caller.email,
        reviewer_email: caller.email,
        actor_name: caller.email,
        actor_email: caller.email,
      };
      await admin.functions.invoke("dispatch-notification-event", {
        body: {
          event_key: eventKey,
          entity_type: "return",
          entity_id: return_id,
          payload: sharedPayload,
        },
      });
      await admin.functions.invoke("dispatch-notification-event", {
        body: {
          event_key: "return.workflow_action_taken",
          entity_type: "return",
          entity_id: return_id,
          payload: {
            ...sharedPayload,
            actor_excluded: false,
          },
        },
      });

      if (step_id) {
        const { data: cfgRows } = await admin
          .from("approval_action_notifications")
          .select("id, event_key, recipient_type, recipient_config, template_id, is_enabled")
          .eq("step_id", step_id)
          .eq("action_type", action_type)
          .eq("is_enabled", true);

        for (const row of (cfgRows ?? [])) {
          try {
            const override = overrideMap.get((row as any).id);
            await admin.functions.invoke("dispatch-notification-event", {
              body: {
                event_key: (row as any).event_key,
                entity_type: "return",
                entity_id: return_id,
                payload: {
                  ...sharedPayload,
                  action_notification_override: true,
                  template_id: (row as any).template_id,
                  recipient_type: (row as any).recipient_type,
                  recipient_config: (row as any).recipient_config,
                  binding_id: (row as any).id,
                  subject_override: override?.subject,
                  body_override: override?.body,
                },
              },
            });
          } catch (perRowErr) {
            console.warn("return per-action notification dispatch failed:", perRowErr);
          }
        }
      }
    } catch (e) { console.warn("dispatch failed:", e); }

    return jsonResponse(req, 200, result);
  } catch (e) {
    console.error("perform-return-workflow-action fatal:", e);
    return errorResponse(req, 500, e instanceof Error ? e.message : "Internal server error", "INTERNAL");
  }
});
