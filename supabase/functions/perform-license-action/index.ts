import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logComplianceAudit, logSecurityEvent } from "../_shared/audit.ts";
import { requireUserPermission } from "../_shared/authz.ts";

/**
 * Server-side license action executor for suspend / revoke / cancel / reinstate
 * / status_change. Enforces that when a license_action_form_configs row marks a
 * form as required for the action+taxonomy, the caller MUST supply a valid
 * submitted form_responses id BEFORE the license status changes.
 *
 * Renewal is intentionally NOT handled here — that flow lives elsewhere.
 */

// Authorization is delegated to the centralized `user_has_permission` RPC
// (mirrors the same logic used by useUserDynamicPermissions on the frontend).
const REQUIRED_PERMISSION_MODULE = "license_management";
const REQUIRED_PERMISSION_ACTION = "manage_license_actions";

const ALLOWED_ACTIONS = new Set([
  "suspension",
  "revocation",
  "cancellation",
  "reinstatement",
  "status_change",
]);

const MANDATORY_REASON_ACTIONS = new Set(["suspension", "revocation", "cancellation"]);
const MIN_REASON_LEN = 10;

const EVENT_KEY: Record<string, string> = {
  suspension: "license.suspended",
  revocation: "license.revoked",
  reinstatement: "license.reinstated",
  cancellation: "license.cancelled",
  status_change: "license.status_changed",
};

function jsonResponse(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

export async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;


  const __authzGate = await requireUserPermission(req, "license_management", "workflow_action");
  if (!__authzGate.ok) return __authzGate.response;
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return jsonResponse(req, 200, { error: "Missing authorization header", code: "UNAUTHORIZED" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Identity comes from the gate's verified token claims. A second
    // auth.getUser() round-trip can fail with "session not found" after a
    // refresh-token rotation and would surface as a bogus 401.
    const caller = { id: __authzGate.userId, email: __authzGate.email };

    const admin = createClient(supabaseUrl, serviceKey);

    // Check caller has the centralized "manage_license_actions" permission
    const { data: allowed, error: permErr } = await admin.rpc("user_has_permission", {
      _user_id: caller.id,
      _module: REQUIRED_PERMISSION_MODULE,
      _action: REQUIRED_PERMISSION_ACTION,
    });
    if (permErr) {
      return jsonResponse(req, 200, { error: permErr.message, code: "PERMISSION_CHECK_FAILED" });
    }
    if (!allowed) {
      await logSecurityEvent(admin, {
        actorId: caller.id,
        eventType: "ACCESS_DENIED",
        targetResource: "license_actions",
        userAgent: req.headers.get("user-agent"),
        detail: {
          module: REQUIRED_PERMISSION_MODULE,
          action: REQUIRED_PERMISSION_ACTION,
          reason: "missing_permission",
        },
        metadata: { edge_function: "perform-license-action" },
      });
      return jsonResponse(req, 200, { error: "You do not have permission to perform license actions", code: "FORBIDDEN" });
    }

    let body: any;
    try { body = await req.json(); } catch { body = {}; }

    const license_id: string | undefined = body.license_id;
    const action_type: string | undefined = body.action_type;
    const new_status: string | undefined = body.new_status;
    const reason: string = (body.reason || "").toString();
    const form_response_id: string | null = body.form_response_id || null;

    if (!license_id || !action_type || !new_status) {
      return jsonResponse(req, 200, { error: "license_id, action_type and new_status are required", code: "BAD_REQUEST" });
    }
    if (!ALLOWED_ACTIONS.has(action_type)) {
      return jsonResponse(req, 200, { error: `Unsupported action_type: ${action_type}`, code: "BAD_REQUEST" });
    }
    if (MANDATORY_REASON_ACTIONS.has(action_type) && reason.trim().length < MIN_REASON_LEN) {
      return jsonResponse(req, 200, { error: `Justification of at least ${MIN_REASON_LEN} characters required`, code: "REASON_REQUIRED" });
    }

    // Load license
    const { data: license, error: licErr } = await admin
      .from("licenses")
      .select("id, license_number, license_type, holder_id, status, valid_until, sector_id, sub_sector_id, category_id, regulator_id")
      .eq("id", license_id)
      .maybeSingle();
    if (licErr || !license) return jsonResponse(req, 200, { error: "License not found", code: "NOT_FOUND" });

    // Resolve form config
    const { data: cfgRows, error: cfgErr } = await admin.rpc("resolve_license_action_form", {
      _action_type: action_type,
      _regulator_id: license.regulator_id,
      _sector_id: license.sector_id,
      _sub_sector_id: license.sub_sector_id,
      _category_id: license.category_id,
    });
    if (cfgErr) return jsonResponse(req, 200, { error: cfgErr.message, code: "RESOLVE_FAILED" });
    const cfg = (cfgRows as Array<{ form_template_id: string | null; is_required: boolean }> | null)?.[0] ?? null;
    const required = !!(cfg && cfg.is_required);
    const templateId: string | null = cfg?.form_template_id || null;

    let formTemplateName: string | null = null;
    let formVersionId: string | null = null;

    if (required) {
      if (!form_response_id) {
        return jsonResponse(req, 200, {
          error: "Internal form must be submitted before this action",
          code: "FORM_REQUIRED",
          form_template_id: templateId,
        });
      }
      const { data: resp, error: respErr } = await admin
        .from("form_responses")
        .select("id, template_id, version_id, user_id, status, entity_type")
        .eq("id", form_response_id)
        .maybeSingle();
      if (respErr || !resp) return jsonResponse(req, 200, { error: "Form response not found", code: "FORM_RESPONSE_NOT_FOUND" });
      if (resp.user_id !== caller.id) return jsonResponse(req, 200, { error: "Form response does not belong to caller", code: "FORM_RESPONSE_MISMATCH" });
      if (resp.template_id !== templateId) return jsonResponse(req, 200, { error: "Form response template mismatch", code: "FORM_RESPONSE_MISMATCH" });
      if (resp.status !== "submitted") return jsonResponse(req, 200, { error: "Form response not submitted", code: "FORM_NOT_SUBMITTED" });
      if (resp.entity_type !== "license_action") return jsonResponse(req, 200, { error: "Form response entity_type must be license_action", code: "FORM_RESPONSE_MISMATCH" });
      formVersionId = resp.version_id;

      const { data: tpl } = await admin
        .from("form_templates")
        .select("name")
        .eq("id", resp.template_id)
        .maybeSingle<{ name: string | null }>();
      formTemplateName = tpl?.name ?? null;
    }

    const oldStatus = license.status as string;

    // Insert license_actions row
    const { data: actionRow, error: actErr } = await admin
      .from("license_actions")
      .insert({
        license_id: license.id,
        action_type,
        actor_id: caller.id,
        reason: reason || null,
        old_status: oldStatus,
        new_status,
        form_response_id: form_response_id,
        form_template_id: templateId,
        form_version_id: formVersionId,
      })
      .select("id, created_at")
      .single();
    if (actErr || !actionRow) return jsonResponse(req, 200, { error: actErr?.message || "Failed to record action", code: "INSERT_FAILED" });

    // Update license status
    const { error: updErr } = await admin
      .from("licenses")
      .update({ status: new_status, updated_at: new Date().toISOString() })
      .eq("id", license.id);
    if (updErr) return jsonResponse(req, 200, { error: updErr.message, code: "UPDATE_FAILED" });

    // Mirror to licensees row for revoke/cancel (preserves existing client behavior)
    let licenseeId: string | null = null;
    let licenseeName: string | null = null;
    const { data: licensee } = await admin
      .from("licensees")
      .select("id, name")
      .eq("license_id", license.id)
      .maybeSingle<{ id: string; name: string | null }>();
    if (licensee) {
      licenseeId = licensee.id;
      licenseeName = licensee.name;
      if (new_status === "revoked" || new_status === "cancelled") {
        await admin.from("licensees").update({ status: new_status }).eq("license_id", license.id);
      }
    }

    // Repoint the form_response.entity_id to the new action row id
    if (form_response_id) {
      await admin
        .from("form_responses")
        .update({ entity_id: actionRow.id })
        .eq("id", form_response_id);
    }

    await logComplianceAudit(admin, {
      actorId: caller.id,
      actionType: "WORKFLOW_TRANSITION",
      objectType: "license",
      objectId: license.id,
      beforeValue: { status: oldStatus },
      afterValue: { status: new_status, action_type, reason, form_response_id, form_template_id: templateId },
      justification: reason || null,
      userAgent: req.headers.get("user-agent"),
      metadata: {
        edge_function: "perform-license-action",
        license_action_id: actionRow.id,
        legacy_action: `license_${action_type}`,
      },
    });

    // Dispatch notification (best-effort)
    const eventKey = EVENT_KEY[action_type] || "license.status_changed";
    try {
      await admin.functions.invoke("dispatch-notification-event", {
        body: {
          event_key: eventKey,
          entity_type: "license",
          entity_id: license.id,
          payload: {
            license_id: license.id,
            license_number: license.license_number,
            license_type: license.license_type,
            licensee_id: licenseeId,
            licensee_name: licenseeName,
            holder_user_id: license.holder_id,
            old_status: oldStatus,
            new_status,
            action_type,
            reason: reason || "",
            action_date: actionRow.created_at,
            form_response_id,
            form_template_id: templateId,
            form_template_name: formTemplateName,
            valid_until: license.valid_until ? new Date(license.valid_until).toISOString().slice(0, 10) : "",
          },
        },
      });
    } catch (e) {
      console.warn("[perform-license-action] dispatch failed", (e as Error)?.message);
    }

    return jsonResponse(req, 200, {
      ok: true,
      action_id: actionRow.id,
      new_status,
    });
  } catch (e) {
    return jsonResponse(req, 200, { error: (e as Error).message, code: "INTERNAL_ERROR" });
  }
}

Deno.serve(handler);
