// sign-license-certificate
// ------------------------------------------------------------------
// Cryptographically records a signature (HMAC-SHA256 of the certificate PDF
// bytes) into `license_certificate_signatures` and flips the certificate's
// dispatch_status to `ready` so it can be dispatched to the licensee.
//
// Requires:
//   - LICENSE_SIGNING_SECRET  (server-only random secret)
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//
// Caller must be an authenticated internal staff user (super_admin, admin,
// supervisor, licensing_officer, analyst, or legal_compliance). Applicants
// and licensees cannot sign.

import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { requireUserPermission } from "../_shared/authz.ts";

// Authorization is centralised in requireUserPermission
// (license_management / manage_certificates). Do not add a second role check.


function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function hmacSha256Hex(secret: string, data: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function fingerprint(secret: string): string {
  // First 12 hex chars of SHA-256(secret) — safe to log.
  const bytes = new TextEncoder().encode(secret);
  return sha256Hex(bytes).then(h => h.slice(0, 12)) as unknown as string;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  // -- authn + authz (single authority: dynamic RBAC permission catalog)
  const __authzGate = await requireUserPermission(req, "license_management", "manage_certificates");
  if (!__authzGate.ok) return __authzGate.response;
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

  const secret = Deno.env.get("LICENSE_SIGNING_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !supabaseUrl || !serviceKey) {
    return json(req, 500, { error: "server_misconfigured" });
  }

  const admin = __authzGate.adminClient;
  // Identity comes from the gate's verified token claims. A second
  // auth.getUser() round-trip can fail with "session not found" after a
  // refresh-token rotation and would surface as a bogus 401.
  const user = { id: __authzGate.userId, email: __authzGate.email };


  // -- body
  let body: { license_id?: string; certificate_id?: string; reason?: string; signer_title?: string };
  try { body = await req.json(); } catch { return json(req, 400, { error: "invalid_json" }); }
  if (!body.license_id) return json(req, 400, { error: "license_id_required" });
  const reason = (body.reason || "").trim();
  if (reason.length < 10) return json(req, 400, { error: "reason_min_10_chars" });

  // -- load certificate (latest version if certificate_id not given)
  let cert: { id: string; license_id: string; file_path: string; version: number; dispatch_status: string } | null = null;
  if (body.certificate_id) {
    const { data } = await admin
      .from("license_certificates")
      .select("id,license_id,file_path,version,dispatch_status")
      .eq("id", body.certificate_id)
      .maybeSingle();
    cert = data as typeof cert;
  } else {
    const { data } = await admin
      .from("license_certificates")
      .select("id,license_id,file_path,version,dispatch_status")
      .eq("license_id", body.license_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    cert = data as typeof cert;
  }
  if (!cert) return json(req, 404, { error: "certificate_not_found" });
  if (cert.dispatch_status === "dispatched") {
    return json(req, 409, { error: "already_dispatched" });
  }

  // -- fetch PDF bytes
  const { data: file, error: dlErr } = await admin.storage
    .from("license-certificates")
    .download(cert.file_path);
  if (dlErr || !file) return json(req, 500, { error: "certificate_download_failed", detail: dlErr?.message });
  const bytes = new Uint8Array(await file.arrayBuffer());

  // -- compute hashes
  const content_sha256 = await sha256Hex(bytes);
  const signature_hmac = await hmacSha256Hex(secret, bytes);
  const secretDigest = await sha256Hex(new TextEncoder().encode(secret));
  const signing_key_fingerprint = secretDigest.slice(0, 12);

  // -- signer profile
  const { data: prof } = await admin
    .from("profiles")
    .select("full_name,job_title,email")
    .eq("id", user.id)
    .maybeSingle();
  const signer_name = (prof?.full_name as string | null) || user.email || "Unknown Signer";
  const signer_title = body.signer_title || (prof?.job_title as string | null) || null;

  // -- write ledger row
  const { data: sigRow, error: sigErr } = await admin
    .from("license_certificate_signatures")
    .insert({
      certificate_id: cert.id,
      license_id: cert.license_id,
      signer_user_id: user.id,
      signer_name,
      signer_title,
      content_sha256,
      signature_hmac,
      signing_key_fingerprint,
      reason,
    })
    .select("id, signed_at")
    .single();
  if (sigErr) return json(req, 500, { error: "signature_write_failed", detail: sigErr.message });

  // -- flip certificate to ready
  await admin
    .from("license_certificates")
    .update({
      is_signed: true,
      signed_at: new Date().toISOString(),
      signatory_name: signer_name,
      signatory_title: signer_title,
      signature_fingerprint: `${signing_key_fingerprint}:${signature_hmac.slice(0, 16)}`,
      dispatch_status: "ready",
    })
    .eq("id", cert.id);

  // -- audit
  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "license.certificate.signed",
    resource_type: "license_certificate",
    resource_id: cert.id,
    metadata: {
      license_id: cert.license_id,
      version: cert.version,
      signature_id: sigRow?.id,
      fingerprint: signing_key_fingerprint,
    },
  });

  return json(req, 200, {
    signature_id: sigRow?.id,
    signed_at: sigRow?.signed_at,
    content_sha256,
    signing_key_fingerprint,
    dispatch_status: "ready",
  });
});
