import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

/**
 * Thin authentication wrapper around the atomic perform_workflow_transition RPC.
 *
 * - Validates the caller's Supabase JWT
 * - Delegates atomic transition (lock, validate, write action, advance, audit, notify) to Postgres
 * - For final approval, calls approve-pre-licensee for license/licensee creation (idempotent)
 * - Returns proper HTTP status codes (400/401/403/404/409/422/500) with a consistent JSON shape:
 *   { error, code, details? }
 *
 * Synthetic actions like `request_info` and `delegate` are NOT accepted — they were never
 * fully implemented. allowed_actions on the step is the single source of truth.
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

// All seven action types are now first-class transitions in the RPC.
// return_for_correction / request_more_info each set their own application
// status (returned_for_correction / info_requested) and pause the workflow
// instance so the applicant can resubmit. They are NOT aliased to
// request_resubmission anymore — keeping a distinct action_type matters for
// audit history, notification routing, and applicant-facing status text.


function jsonResponse(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function errorResponse(req: Request, status: number, error: string, code: string, details?: unknown) {
  return jsonResponse(req, status, { error, code, ...(details !== undefined ? { details } : {}) });
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
    const step_id: string | undefined = body.step_id;
    const instance_id: string | undefined = body.instance_id;
    const raw_action: string | undefined = body.action_type;
    const comments: string = (body.comments || "").toString();

    if (!application_id) return errorResponse(req, 400, "application_id is required", "BAD_REQUEST");
    if (!raw_action || !ACCEPTED_ACTIONS.has(raw_action)) {
      return errorResponse(
        req,
        400,
        `Invalid action_type. Must be one of: ${Array.from(ACCEPTED_ACTIONS).join(", ")}`,
        "BAD_REQUEST",
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Atomic transition — lock + validate + write happens in one transaction.
    // raw_action is passed through unchanged; the RPC understands every
    // accepted action type as a first-class transition.
    const { data: rpcRes, error: rpcErr } = await admin.rpc("perform_workflow_transition", {
      _application_id: application_id,
      _instance_id: instance_id ?? null,
      _step_id: step_id ?? null,
      _action_type: raw_action,

      _comments: comments,
      _actor_id: caller.id,
    });

    if (rpcErr) {
      console.error("perform_workflow_transition error:", rpcErr);
      return errorResponse(req, 500, rpcErr.message || "Workflow transition failed", "DB_ERROR");
    }

    const result = (rpcRes || {}) as Record<string, unknown>;
    if (result.error) {
      const status = typeof result.http === "number" ? (result.http as number) : 422;
      return errorResponse(req, status, String(result.error), String(result.code || "BUSINESS_ERROR"));
    }



    // Final approval → atomic RPC commits all DB state, then we call
    // approve-pre-licensee for auth-user provisioning (which needs auth admin APIs).
    if (result.final_approval === true) {
      const { data: finalRpc, error: finalRpcErr } = await admin.rpc(
        "perform_final_workflow_approval",
        {
          _application_id: application_id,
          _instance_id: instance_id ?? null,
          _step_id: step_id ?? null,
          _comments: comments,
          _actor_id: caller.id,
        },
      );
      if (finalRpcErr) {
        console.error("perform_final_workflow_approval error:", finalRpcErr);
        return errorResponse(req, 500, finalRpcErr.message || "Final approval failed", "DB_ERROR");
      }
      const finalResult = (finalRpc || {}) as Record<string, unknown>;
      if (finalResult.error) {
        const status = typeof finalResult.http === "number" ? (finalResult.http as number) : 422;
        return errorResponse(req, status, String(finalResult.error), String(finalResult.code || "BUSINESS_ERROR"));
      }

      // Approval is now committed in DB. Provision the licensee web user.
      const provRes = await fetch(`${supabaseUrl}/functions/v1/approve-pre-licensee`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ application_id }),
      });
      const provJson = await provRes.json().catch(() => ({}));
      // Provisioning failure must NOT roll back approval — the approval is final.
      // We surface the issue but still report success of the approval itself.
      if (!provRes.ok || (provJson as any)?.error) {
        console.error("provisioning failed after approval:", provJson);
        return jsonResponse(req, 200, {
          success: true,
          ...finalResult,
          provisioning_warning: (provJson as any)?.error || "User provisioning failed; please retry from admin panel",
        });
      }
      delete (provJson as any).web_user_password;
      // Fire template-driven final-approval notifications. Never block on failure.
      try {
        await admin.functions.invoke("dispatch-notification-event", {
          body: {
            event_key: "application.final_approved",
            entity_type: "application",
            entity_id: application_id,
            payload: {
              application_id,
              application_number: (finalResult as any).application_number,
              license_number: (provJson as any).license_number,
              actor_id: caller.id,
              comments,
            },
          },
        });
        if ((provJson as any).license_id) {
          await admin.functions.invoke("dispatch-notification-event", {
            body: {
              event_key: "license.created",
              entity_type: "license",
              entity_id: (provJson as any).license_id,
              payload: {
                application_id,
                license_number: (provJson as any).license_number,
                licensee_id: (provJson as any).licensee_id,
              },
            },
          });
        }
        if ((provJson as any).licensee_id) {
          await admin.functions.invoke("dispatch-notification-event", {
            body: {
              event_key: "licensee.created",
              entity_type: "licensee",
              entity_id: (provJson as any).licensee_id,
              payload: {
                licensee_id: (provJson as any).licensee_id,
                licensee_name: (provJson as any).licensee_name,
                application_id,
              },
            },
          });
        }
      } catch (dispatchErr) {
        console.warn("dispatch final approval failed:", dispatchErr);
      }
      return jsonResponse(req, 200, { success: true, ...finalResult, ...provJson });
    }

    // Fire template-driven notification for the workflow action. Best-effort.
    try {
      const eventForAction =
        raw_action === "reject" ? "application.rejected" :
        raw_action === "request_resubmission" ? "application.resubmission_requested" :
        raw_action === "return_for_correction" ? "application.returned_for_correction" :
        raw_action === "request_more_info" ? "application.more_info_requested" :
        raw_action === "send_back" ? "application.send_back" :
        raw_action === "approve" ? "application.approved_step" :
        "application.workflow_action_taken";
      await admin.functions.invoke("dispatch-notification-event", {
        body: {
          event_key: eventForAction,
          entity_type: "application",
          entity_id: application_id,
          payload: {
            application_id,
            action_type: raw_action,
            comments,
            actor_id: caller.id,
            step_id: step_id ?? (result as any).new_step_id,
          },
        },
      });
      // Always also publish the generic regulator-action event for super_admins/applicants.
      await admin.functions.invoke("dispatch-notification-event", {
        body: {
          event_key: "regulator.action_taken_on_application",
          entity_type: "application",
          entity_id: application_id,
          payload: {
            application_id,
            action_type: raw_action,
            comments,
            actor_id: caller.id,
          },
        },
      });

      // Per-action admin-configured notifications from approval_action_notifications.
      // The Edit Workflow UI lets admins bind extra (template, recipient) pairs to
      // any (step, action_type). We resolve them here and fan out one dispatch per row.
      if (step_id) {
        const { data: cfgRows } = await admin
          .from("approval_action_notifications")
          .select("event_key, recipient_type, recipient_config, template_id, is_enabled")
          .eq("step_id", step_id)
          .eq("action_type", raw_action)
          .eq("is_enabled", true);
        for (const row of (cfgRows ?? [])) {
          try {
            await admin.functions.invoke("dispatch-notification-event", {
              body: {
                event_key: (row as any).event_key,
                entity_type: "application",
                entity_id: application_id,
                payload: {
                  application_id,
                  action_type: raw_action,
                  comments,
                  actor_id: caller.id,
                  step_id,
                  action_notification_override: true,
                  template_id: (row as any).template_id,
                  recipient_type: (row as any).recipient_type,
                  recipient_config: (row as any).recipient_config,
                },
              },
            });
          } catch (perRowErr) {
            console.warn("per-action notification dispatch failed:", perRowErr);
          }
        }
      }

      // Step-entry notifications: fired when the workflow advances INTO a new
      // step. Distinct from action notifications above. We use the step_id the
      // RPC returned as the new current step. Best-effort — never blocks.
      const newStepId = (result as any).new_step_id as string | undefined;
      if (newStepId && newStepId !== step_id) {
        const { data: entryRows } = await admin
          .from("approval_step_entry_notifications")
          .select("event_key, recipient_type, recipient_config, template_id, is_enabled")
          .eq("step_id", newStepId)
          .eq("is_enabled", true);
        for (const row of (entryRows ?? [])) {
          try {
            await admin.functions.invoke("dispatch-notification-event", {
              body: {
                event_key: (row as any).event_key,
                entity_type: "application",
                entity_id: application_id,
                payload: {
                  application_id,
                  step_id: newStepId,
                  trigger: "step_entered",
                  action_notification_override: true,
                  template_id: (row as any).template_id,
                  recipient_type: (row as any).recipient_type,
                  recipient_config: (row as any).recipient_config,
                },
              },
            });
          } catch (entryErr) {
            console.warn("step-entry notification dispatch failed:", entryErr);
          }
        }
      }
    } catch (dispatchErr) {
      console.warn("dispatch workflow action failed:", dispatchErr);
    }

    return jsonResponse(req, 200, result);
  } catch (e) {
    console.error("perform-workflow-action fatal:", e);
    return errorResponse(req, 500, e instanceof Error ? e.message : "Internal server error", "INTERNAL");
  }
}

Deno.serve(handler);
