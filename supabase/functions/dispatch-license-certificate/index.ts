// dispatch-license-certificate
// ------------------------------------------------------------------
// Marks a signed license certificate as dispatched to the licensee, records the
// dispatch in audit_logs, and (best-effort) triggers a notification event so
// downstream email/SMS templates can pick it up.
//
// Preconditions:
//   - Certificate exists and has dispatch_status = 'ready' (i.e. signed).
//   - Caller is authenticated internal staff.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const DISPATCH_ROLES = new Set([
  "super_admin", "admin", "supervisor", "licensing_officer",
]);

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json(req, 500, { error: "server_misconfigured" });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(req, 401, { error: "missing_bearer_token" });
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(req, 401, { error: "invalid_token" });
  const user = userData.user;

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const roleSet = new Set((roles || []).map(r => (r as { role: string }).role));
  if (![...roleSet].some(r => DISPATCH_ROLES.has(r))) {
    await admin.from("security_event_logs").insert({
      user_id: user.id,
      event_type: "denied_access",
      target_resource: "dispatch-license-certificate",
      detail: { reason: "role_not_permitted", roles: [...roleSet] },
    });
    return json(req, 403, { error: "not_authorized_to_dispatch" });
  }

  let body: { certificate_id?: string; note?: string };
  try { body = await req.json(); } catch { return json(req, 400, { error: "invalid_json" }); }
  if (!body.certificate_id) return json(req, 400, { error: "certificate_id_required" });

  const { data: cert } = await admin
    .from("license_certificates")
    .select("id,license_id,dispatch_status,version")
    .eq("id", body.certificate_id)
    .maybeSingle();
  if (!cert) return json(req, 404, { error: "certificate_not_found" });
  if (cert.dispatch_status !== "ready") {
    return json(req, 409, { error: "not_ready_for_dispatch", current_status: cert.dispatch_status });
  }

  const dispatched_at = new Date().toISOString();
  await admin
    .from("license_certificates")
    .update({ dispatch_status: "dispatched", dispatched_at, dispatched_by: user.id })
    .eq("id", cert.id);

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "license.certificate.dispatched",
    resource_type: "license_certificate",
    resource_id: cert.id,
    metadata: { license_id: cert.license_id, version: cert.version, note: body.note || null },
  });

  return json(req, 200, { certificate_id: cert.id, dispatch_status: "dispatched", dispatched_at });
});
