import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logComplianceAudit, logSecurityEvent } from "../_shared/audit.ts";
import { requireUserPermission } from "../_shared/authz.ts";

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
  "save_comment",
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


  const __authzGate = await requireUserPermission(req, "application_management", "workflow_action");
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

    let body: any;
    try { body = await req.json(); } catch { body = {}; }

    const application_id: string | undefined = body.application_id;
    const step_id: string | undefined = body.step_id;
    const instance_id: string | undefined = body.instance_id;
    const raw_action: string | undefined = body.action_type;
    const comments: string = (body.comments || "").toString();
    const signature_data_url: string | null = typeof body.signature_data_url === "string" && body.signature_data_url.startsWith("data:image/")
      ? body.signature_data_url
      : null;
    // Optional per-binding subject/body overrides supplied from the reviewer's
    // email preview dialog. Shape: [{ binding_id, subject, body }].
    const notification_overrides: Array<{ binding_id?: string; subject?: string; body?: string }> =
      Array.isArray(body.notification_overrides) ? body.notification_overrides : [];
    const overrideMap = new Map<string, { subject?: string; body?: string }>();
    for (const o of notification_overrides) {
      if (o && typeof o.binding_id === "string") {
        overrideMap.set(o.binding_id, { subject: o.subject, body: o.body });
      }
    }

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

    let result: Record<string, unknown>;

    if (raw_action === "save_comment" && !comments.trim()) {
      return errorResponse(req, 400, "A comment is required.", "COMMENT_REQUIRED");
    }
    {
    // save_comment is a first-class action in the RPC (records the row,
    // advances the step like Approve, and dedups per actor/step). For
    // signature/legal-stage gating we reuse the Approve configuration.
    const effective_action = raw_action;
    const config_action = raw_action === "save_comment" ? "approve" : raw_action;


    // Digital signature capture is hidden in the UI, so a configured
    // `require_digital_signature` is recorded but never blocks the action.
    // Any signature that is still supplied is persisted further below.
    if (step_id) {
      const [{ data: cfgRow }, { data: stepRow }] = await Promise.all([
        admin
          .from("approval_step_actions")
          .select("require_digital_signature")
          .eq("step_id", step_id)
          .eq("action_type", config_action)
          .eq("is_enabled", true)
          .maybeSingle(),
        admin
          .from("approval_steps")
          .select("require_digital_signature, is_legal_compliance_stage")
          .eq("id", step_id)
          .maybeSingle(),
      ]);
      const needsSig = (cfgRow as any)?.require_digital_signature || (stepRow as any)?.require_digital_signature;
      if (needsSig && !signature_data_url) {
        console.log("signature configured but capture disabled — proceeding without signature", { step_id, config_action });
      }

      // Legal/Compliance stage enforcement — only Legal/Compliance reviewers may act on a legal stage.
      if ((stepRow as any)?.is_legal_compliance_stage === true) {
        const { data: isLegal } = await admin.rpc("is_legal_compliance_user", { _user_id: caller.id });
        if (!isLegal) {
          try {
            const detail = {
              user_id: caller.id,
              application_id,
              workflow_instance_id: instance_id ?? null,
              step_id,
              action_type: raw_action,
              reason: "actor_not_legal_compliance_user",
            };
            await logSecurityEvent(admin, {
              actorId: caller.id,
              eventType: "ACCESS_DENIED",
              targetResource: `application:${application_id}:legal_stage`,
              userAgent: req.headers.get("user-agent"),
              detail,
              metadata: { edge_function: "perform-workflow-action" },
            });
            await logComplianceAudit(admin, {
              actorId: caller.id,
              actionType: "ACCESS_DENIED",
              objectType: "application",
              objectId: application_id,
              afterValue: detail,
              userAgent: req.headers.get("user-agent"),
              metadata: { edge_function: "perform-workflow-action", workflow_instance_id: instance_id ?? null, step_id },
            });
          } catch (e) {
            console.warn("legal_stage_action_denied audit log failed:", e);
          }
          return errorResponse(
            req,
            403,
            "This step requires the Legal/Compliance role. You are not authorized to act on this step.",
            "LEGAL_STAGE_FORBIDDEN",
          );
        }
      }
    }

    // LIC-DEC-001 — mandatory decision gates. A final approval is refused while a
    // blocking gate (unresolved sufficiency blocker, open SLA-pausing RFI) is unmet.
    if (raw_action === "approve" && step_id) {
      const { data: stepMeta } = await admin
        .from("approval_steps")
        .select("workflow_id, step_order, is_terminal")
        .eq("id", step_id)
        .maybeSingle();
      let isFinalStep = (stepMeta as any)?.is_terminal === true;
      if (!isFinalStep && (stepMeta as any)?.workflow_id) {
        const { data: lastStep } = await admin
          .from("approval_steps")
          .select("step_order")
          .eq("workflow_id", (stepMeta as any).workflow_id)
          .order("step_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        isFinalStep = (lastStep as any)?.step_order === (stepMeta as any)?.step_order;
      }

      if (isFinalStep) {
        const { data: gateRes, error: gateErr } = await admin.rpc("decision_gate_status", {
          _application_id: application_id,
        });
        if (gateErr) {
          console.warn("decision_gate_status failed:", gateErr.message);
        } else if (gateRes && (gateRes as any).ready === false) {
          const unmet = ((gateRes as any).gates ?? []).filter(
            (g: any) => g.blocking && !g.passed,
          );
          const detail = {
            user_id: caller.id,
            application_id,
            step_id,
            action_type: raw_action,
            reason: "decision_gates_unmet",
            unmet_gates: unmet,
          };
          try {
            await logSecurityEvent(admin, {
              actorId: caller.id,
              eventType: "ACCESS_DENIED",
              targetResource: `application:${application_id}:final_decision`,
              userAgent: req.headers.get("user-agent"),
              detail,
              severity: "high",
              module: "licensing_decision",
              action: "final_approval",
              objectType: "application",
              objectId: application_id,
              metadata: { edge_function: "perform-workflow-action" },
            });

            await logComplianceAudit(admin, {
              actorId: caller.id,
              actionType: "ACCESS_DENIED",
              objectType: "application",
              objectId: application_id,
              afterValue: detail,
              userAgent: req.headers.get("user-agent"),
              metadata: { edge_function: "perform-workflow-action", step_id },
            });
          } catch (e) {
            console.warn("decision gate denial audit failed:", e);
          }
          return errorResponse(
            req,
            422,
            `Final approval blocked — ${unmet.map((g: any) => g.label).join("; ")}`,
            "DECISION_GATES_UNMET",
            { gates: unmet },
          );
        }
      }
    }

    // Atomic transition — lock + validate + write happens in one transaction.

    const { data: rpcRes, error: rpcErr } = await admin.rpc("perform_workflow_transition", {
      _application_id: application_id,
      _instance_id: instance_id ?? null,
      _step_id: step_id ?? null,
      _action_type: effective_action,
      _comments: comments,
      _actor_id: caller.id,
    });

    if (rpcErr) {
      console.error("perform_workflow_transition error:", rpcErr);
      return errorResponse(req, 500, rpcErr.message || "Workflow transition failed", "DB_ERROR");
    }

    result = (rpcRes || {}) as Record<string, unknown>;
    if (result.error) {
      const status = typeof result.http === "number" ? (result.http as number) : 422;
      return errorResponse(req, status, String(result.error), String(result.code || "BUSINESS_ERROR"));
    }
    if (raw_action === "save_comment") {
      (result as any).saved_comment = true;
    }
    } // end transition block

    // Persist captured signature on the just-written approval_actions row.
    if (signature_data_url) {
      try {
        const { data: latest } = await admin
          .from("approval_actions")
          .select("id")
          .eq("application_id", application_id)
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
        const isRenewalResult = (provJson as any).renewal === true;
        if (isRenewalResult && (provJson as any).license_id) {
          await admin.functions.invoke("dispatch-notification-event", {
            body: {
              event_key: "license.renewed",
              entity_type: "license",
              entity_id: (provJson as any).license_id,
              payload: {
                application_id,
                license_number: (provJson as any).license_number,
                licensee_id: (provJson as any).licensee_id,
                previous_valid_until: (provJson as any).previous_valid_until,
                new_valid_until: (provJson as any).new_valid_until,
              },
            },
          });
        } else {
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
        raw_action === "save_comment" ? "application.comment_saved" :
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
          .select("id, event_key, recipient_type, recipient_config, template_id, is_enabled")
          .eq("step_id", step_id)
          .eq("action_type", raw_action)
          .eq("is_enabled", true);
        for (const row of (cfgRows ?? [])) {
          try {
            const override = overrideMap.get((row as any).id);
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
                  binding_id: (row as any).id,
                  subject_override: override?.subject,
                  body_override: override?.body,
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
