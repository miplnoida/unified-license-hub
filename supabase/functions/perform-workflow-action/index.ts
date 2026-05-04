import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
]);

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, error: string, code: string, details?: unknown) {
  return jsonResponse(status, { error, code, ...(details !== undefined ? { details } : {}) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorResponse(401, "Missing authorization header", "UNAUTHORIZED");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: authErr } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (authErr || !caller) return errorResponse(401, "Invalid or expired token", "UNAUTHORIZED");

    let body: any;
    try { body = await req.json(); } catch { body = {}; }

    const application_id: string | undefined = body.application_id;
    const step_id: string | undefined = body.step_id;
    const instance_id: string | undefined = body.instance_id;
    const raw_action: string | undefined = body.action_type;
    const comments: string = (body.comments || "").toString();

    if (!application_id) return errorResponse(400, "application_id is required", "BAD_REQUEST");
    if (!raw_action || !ACCEPTED_ACTIONS.has(raw_action)) {
      return errorResponse(
        400,
        `Invalid action_type. Must be one of: ${Array.from(ACCEPTED_ACTIONS).join(", ")}`,
        "BAD_REQUEST",
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Atomic transition — lock + validate + write happens in one transaction.
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
      return errorResponse(500, rpcErr.message || "Workflow transition failed", "DB_ERROR");
    }

    const result = (rpcRes || {}) as Record<string, unknown>;
    if (result.error) {
      const status = typeof result.http === "number" ? (result.http as number) : 422;
      return errorResponse(status, String(result.error), String(result.code || "BUSINESS_ERROR"));
    }

    // Final approval → delegate to approve-pre-licensee (idempotent).
    if (result.final_approval === true) {
      const finalRes = await fetch(`${supabaseUrl}/functions/v1/approve-pre-licensee`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ application_id, comments }),
      });
      const finalJson = await finalRes.json().catch(() => ({}));
      if (!finalRes.ok || (finalJson as any)?.error) {
        return errorResponse(
          finalRes.status >= 400 ? finalRes.status : 500,
          (finalJson as any)?.error || "Final approval failed",
          "APPROVAL_FAILED",
        );
      }
      delete (finalJson as any).web_user_password;
      return jsonResponse(200, { success: true, ...finalJson });
    }

    return jsonResponse(200, result);
  } catch (e) {
    console.error("perform-workflow-action fatal:", e);
    return errorResponse(500, e instanceof Error ? e.message : "Internal server error", "INTERNAL");
  }
});
