import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

/**
 * Thin authentication wrapper around perform_registration_workflow_transition.
 *
 * Mirrors perform-workflow-action (applications) but routes to the
 * registration-aware RPC. The RPC enforces locking, role/allowed-action
 * checks, status transitions, writes the approval_actions row (with
 * entity_type='registration') and updates registrations.status.
 *
 * On final approval, the registration is marked 'approved'. Account/licensee
 * provisioning (auth user etc.) is handled separately via approve-pre-licensee
 * when an application backed by the registration is finally approved.
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

    const registration_id: string | undefined = body.registration_id;
    const step_id: string | undefined = body.step_id;
    const instance_id: string | undefined = body.instance_id;
    const raw_action: string | undefined = body.action_type;
    const comments: string = (body.comments || "").toString();
    const signature_data_url: string | null = typeof body.signature_data_url === "string" && body.signature_data_url.startsWith("data:image/")
      ? body.signature_data_url
      : null;
    const notification_overrides: Array<{ binding_id?: string; subject?: string; body?: string }> =
      Array.isArray(body.notification_overrides) ? body.notification_overrides : [];
    const overrideMap = new Map<string, { subject?: string; body?: string }>();
    for (const o of notification_overrides) {
      if (o && typeof o.binding_id === "string") {
        overrideMap.set(o.binding_id, { subject: o.subject, body: o.body });
      }
    }

    if (!registration_id) return errorResponse(req, 400, "registration_id is required", "BAD_REQUEST");
    if (!raw_action || !ACCEPTED_ACTIONS.has(raw_action)) {
      return errorResponse(
        req, 400,
        `Invalid action_type. Must be one of: ${Array.from(ACCEPTED_ACTIONS).join(", ")}`,
        "BAD_REQUEST",
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    if (step_id) {
      const { data: cfgRow } = await admin
        .from("approval_step_actions")
        .select("require_digital_signature")
        .eq("step_id", step_id)
        .eq("action_type", raw_action)
        .eq("is_enabled", true)
        .maybeSingle();
      if ((cfgRow as any)?.require_digital_signature && !signature_data_url) {
        return errorResponse(req, 422, "Digital signature is required for this action.", "SIGNATURE_REQUIRED");
      }
    }

    const { data: rpcRes, error: rpcErr } = await admin.rpc("perform_registration_workflow_transition", {
      _registration_id: registration_id,
      _instance_id: instance_id ?? null,
      _step_id: step_id ?? null,
      _action_type: raw_action,
      _comments: comments,
      _actor_id: caller.id,
    });


    if (rpcErr) {
      console.error("perform_registration_workflow_transition error:", rpcErr);
      return errorResponse(req, 500, rpcErr.message || "Workflow transition failed", "DB_ERROR");
    }

    const result = (rpcRes || {}) as Record<string, unknown>;
    if (result.error) {
      const status = typeof result.http === "number" ? (result.http as number) : 422;
      return errorResponse(req, status, String(result.error), String(result.code || "BUSINESS_ERROR"));
    }

    if (signature_data_url) {
      try {
        const { data: latest } = await admin
          .from("approval_actions")
          .select("id")
          .eq("entity_type", "registration")
          .eq("entity_id", registration_id)
          .eq("actor_id", caller.id)
          .eq("action_type", raw_action)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if ((latest as any)?.id) {
          await admin
            .from("approval_actions")
            .update({ signature_data_url })
            .eq("id", (latest as any).id);
        }
      } catch (sigErr) {
        console.warn("signature persistence failed:", sigErr);
      }
    }


    // Best-effort notification dispatch
    try {
      const isFinalApprove = raw_action === "approve" && (result as any).new_status === "approved";
      const isFinalReject = raw_action === "reject";
      const eventForAction =
        isFinalReject ? "registration.final_rejected" :
        raw_action === "request_resubmission" ? "registration.resubmission_requested" :
        raw_action === "return_for_correction" ? "registration.returned_for_correction" :
        raw_action === "request_more_info" ? "registration.more_info_requested" :
        raw_action === "send_back" ? "registration.send_back" :
        isFinalApprove ? "registration.final_approved" :
        raw_action === "approve" ? "registration.approved_step" :
        raw_action === "escalate" ? "registration.escalated" :
        "registration.action_taken";

      // Look up reviewer (current caller) display name for template rendering.
      let reviewer_name = "Reviewer";
      const { data: reviewerProfile } = await admin
        .from("profiles")
        .select("full_name, email")
        .eq("id", caller.id)
        .maybeSingle();
      if (reviewerProfile?.full_name) reviewer_name = String(reviewerProfile.full_name);
      else if (reviewerProfile?.email) reviewer_name = String(reviewerProfile.email);

      const origin =
        req.headers.get("origin") ||
        req.headers.get("referer")?.replace(/\/[^/]*$/, "") ||
        Deno.env.get("APP_BASE_URL") ||
        "";

      const sharedPayload = {
        registration_id,
        action_type: raw_action,
        comments,
        reviewer_comments: comments,
        reviewer_name,
        actor_id: caller.id,
        step_id: (result as any).new_step_id,
        new_status: (result as any).new_status,
        portal_url: origin,
        app_url: origin,
        cta_url: origin ? `${origin}/registration/update/${registration_id}` : "",
        cta_label: "Update Registration",
      };

      console.log(
        `[perform-registration-workflow-action] dispatching event=${eventForAction} ` +
          `registration_id=${registration_id} step_id=${step_id ?? "(none)"} action=${raw_action}`,
      );
      const { data: dispatchData, error: dispatchInvokeErr } = await admin.functions.invoke(
        "dispatch-notification-event",
        {
          body: {
            event_key: eventForAction,
            entity_type: "registration",
            entity_id: registration_id,
            payload: sharedPayload,
          },
        },
      );
      if (dispatchInvokeErr) {
        console.error(
          `[perform-registration-workflow-action] dispatch invoke error for ${eventForAction}:`,
          dispatchInvokeErr,
        );
      } else if (dispatchData && (dispatchData as any).error) {
        console.error(
          `[perform-registration-workflow-action] dispatch returned error for ${eventForAction}:`,
          JSON.stringify(dispatchData),
        );
      } else {
        console.log(
          `[perform-registration-workflow-action] dispatch ok for ${eventForAction}:`,
          JSON.stringify(dispatchData ?? {}),
        );
      }

      if (step_id) {
        const { data: cfgRows } = await admin
          .from("approval_action_notifications")
          .select("id, event_key, recipient_type, recipient_config, template_id, is_enabled")
          .eq("step_id", step_id)
          .eq("action_type", raw_action)
          .eq("is_enabled", true);

        for (const row of (cfgRows ?? [])) {
          try {
            const override = overrideMap.get((row as any).id);
            const { data: rowData, error: rowErr } = await admin.functions.invoke(
              "dispatch-notification-event",
              {
                body: {
                  event_key: (row as any).event_key,
                  entity_type: "registration",
                  entity_id: registration_id,
                  payload: {
                    ...sharedPayload,
                    step_id,
                    action_notification_override: true,
                    template_id: (row as any).template_id,
                    recipient_type: (row as any).recipient_type,
                    recipient_config: (row as any).recipient_config,
                    binding_id: (row as any).id,
                    subject_override: override?.subject,
                    body_override: override?.body,
                  },
                },
              },
            );
            if (rowErr) {
              console.error(
                `[perform-registration-workflow-action] per-action dispatch invoke error for ${(row as any).event_key}:`,
                rowErr,
              );
            } else if (rowData && (rowData as any).error) {
              console.error(
                `[perform-registration-workflow-action] per-action dispatch returned error for ${(row as any).event_key}:`,
                JSON.stringify(rowData),
              );
            }
          } catch (perRowErr) {
            console.error(
              "[perform-registration-workflow-action] per-action dispatch threw:",
              perRowErr,
            );
          }
        }
      }
    } catch (dispatchErr) {
      console.error(
        "[perform-registration-workflow-action] dispatch block threw:",
        dispatchErr,
      );
    }


    return jsonResponse(req, 200, result);
  } catch (e) {
    console.error("perform-registration-workflow-action fatal:", e);
    return errorResponse(req, 500, e instanceof Error ? e.message : "Internal server error", "INTERNAL");
  }
}

Deno.serve(handler);
