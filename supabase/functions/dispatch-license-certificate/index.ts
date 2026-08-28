// dispatch-license-certificate
// ------------------------------------------------------------------
// Marks a signed license certificate as dispatched to the licensee, records the
// dispatch in audit_logs, and (best-effort) triggers a notification event so
// downstream email/SMS templates can pick it up.
//
// Preconditions:
//   - Certificate exists and has dispatch_status = 'ready' (i.e. signed).
//   - Caller is authenticated internal staff.

import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { requireUserPermission } from "../_shared/authz.ts";

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  // Authorization is centralised in requireUserPermission
  // (license_management / manage_certificates). Do not add a second role check.
  const __authzGate = await requireUserPermission(req, "license_management", "manage_certificates");
  if (!__authzGate.ok) return __authzGate.response;
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

  const admin = __authzGate.adminClient;
  const user = { id: __authzGate.userId };


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
    entity_type: "license_certificate",
    entity_id: cert.id,
    metadata: { license_id: cert.license_id, version: cert.version, note: body.note || null },
  });

  return json(req, 200, { certificate_id: cert.id, dispatch_status: "dispatched", dispatched_at });
});
