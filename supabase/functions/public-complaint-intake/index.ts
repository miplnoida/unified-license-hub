// Public Market Conduct complaint intake and tracking (no auth).
//
//   GET  ?action=entities&q=            -> regulated entities that may be complained against
//   GET  ?action=types                  -> active complaint types
//   POST { action: "track", ... }       -> redacted tracking record (reference + email)
//   POST { ...complaint }               -> lodge a complaint, returns the reference number
//
// Consumers of financial services are not portal users, so this entry point is
// deliberately unauthenticated. Protections: strict field whitelist, server-side
// validation, honeypot, CAPTCHA (when configured), and per-email / per-IP rate
// limits. The complaint enters the existing triage + workflow pipeline exactly
// like an internal intake, with `intake_source = 'public'`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { markPublicFunction } from "../_shared/publicFunction.ts";
markPublicFunction('Public consumer market-conduct complaint intake and tracking');

const MAX_PER_EMAIL_PER_HOUR = 5;
const MAX_PER_IP_PER_HOUR = 10;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_BUCKET = "secure-documents";
const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const CONTACT_METHODS = ["email", "phone", "post"];

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function decodeBase64(data: string): Uint8Array {
  const raw = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;
  const cors = buildCorsHeaders(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const action = url.searchParams.get("action") || "entities";

      if (action === "types") {
        const { data, error } = await admin
          .from("complaint_types")
          .select("id, name")
          .eq("is_active", true)
          .order("name");
        if (error) return json({ error: error.message }, 500);
        return json({ rows: data || [] });
      }

      if (action === "captcha") {
        // Tell the public form whether a CAPTCHA challenge must be rendered.
        const [{ data: setting }, { data: cfg }] = await Promise.all([
          admin.from("site_settings").select("value").eq("key", "captcha_enabled").maybeSingle(),
          admin
            .from("captcha_configurations")
            .select("provider, site_key, expected_action")
            .eq("is_active", true)
            .maybeSingle(),
        ]);
        const raw = (setting as any)?.value;
        const globallyEnabled = raw === true || raw === "true";
        return json({
          required: globallyEnabled && !!cfg,
          misconfigured: globallyEnabled && !cfg,
          config: globallyEnabled && cfg ? cfg : null,
        });
      }

      if (action === "entities") {
        // Eligible respondents = entities that currently hold a regulated licence.
        // `licenses.holder_id` has no FK, so the join is done explicitly.
        const q = clean(url.searchParams.get("q"), 120);
        const { data: lics, error: licErr } = await admin
          .from("licenses")
          .select("holder_id")
          .eq("status", "active")
          .limit(2000);
        if (licErr) return json({ error: licErr.message }, 500);
        const holderIds = [...new Set((lics || []).map((l: any) => l.holder_id).filter(Boolean))];
        if (!holderIds.length) return json({ rows: [] });
        const { data, error } = await admin
          .from("licensees")
          .select("id, name, sectors(name)")
          .in("id", holderIds)
          .order("name");
        if (error) return json({ error: error.message }, 500);
        let rows = (data || []).map((r: any) => ({
          id: r.id,
          name: r.name || "Unnamed entity",
          sector_name: r.sectors?.name || null,
        }));
        if (q) {
          const needle = q.toLowerCase();
          rows = rows.filter((r) => r.name.toLowerCase().includes(needle));
        }
        return json({ rows });
      }

      return json({ error: "unknown action" }, 400);
    }

    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    const body = await req.json().catch(() => ({}));
    const remoteIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ipHash = await hashIp(remoteIp);

    // ---------------- public tracking (reference + email) ----------------
    if (clean(body.action, 32) === "track") {
      const reference = clean(body.reference, 64);
      const email = clean(body.email, 200).toLowerCase();
      if (reference.length < 4) return json({ found: false, error: "REFERENCE_REQUIRED" });

      const { data: c } = await admin
        .from("complaints")
        .select("id, email")
        .eq("complaint_number", reference)
        .maybeSingle();
      if (!c) return json({ found: false });

      const onFile = String((c as any).email ?? "").trim().toLowerCase();
      if (!onFile || !email || onFile !== email) {
        return json({ found: false, error: "CONTACT_MISMATCH" });
      }

      const { data, error } = await admin.rpc("get_public_complaint_tracking_raw", {
        p_reference: reference,
        p_email: onFile,
      });
      if (error) return json({ found: false, error: "LOOKUP_FAILED" });
      return json(data);
    }

    // ---------------- lodge a complaint ----------------

    // Honeypot: bots fill hidden fields, humans never do.
    if (clean(body.website, 200)) return json({ ok: true, reference: null });

    const subject = clean(body.subject, 200);
    const description = clean(body.description, 8000);
    const email = clean(body.email, 200).toLowerCase();
    const fullName = clean(body.full_name, 150);
    const phone = clean(body.phone, 40);
    const licenseeId = clean(body.licensee_id, 64);
    const complaintTypeId = clean(body.complaint_type_id, 64);
    const contactMethodRaw = clean(body.preferred_contact_method, 20).toLowerCase();
    const contactMethod = CONTACT_METHODS.includes(contactMethodRaw) ? contactMethodRaw : "email";
    const incidentDate = clean(body.incident_date, 10);
    const outcomeSought = clean(body.outcome_sought, 2000);
    const productService = clean(body.product_service, 200);
    const raisedWithEntity = body.raised_with_entity === true;
    const entityResponse = clean(body.entity_response, 2000);

    const errors: Record<string, string> = {};
    if (subject.length < 5) errors.subject = "Please provide a short summary (at least 5 characters).";
    if (description.length < 30) errors.description = "Please describe what happened (at least 30 characters).";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = "A valid email address is required.";
    if (!fullName) errors.full_name = "Your name is required.";
    if (!licenseeId) errors.licensee_id = "Please select the entity you are complaining about.";
    if (contactMethod === "phone" && !phone) errors.phone = "A phone number is required for phone contact.";
    if (incidentDate && !/^\d{4}-\d{2}-\d{2}$/.test(incidentDate)) {
      errors.incident_date = "Enter the date as YYYY-MM-DD.";
    } else if (incidentDate && new Date(`${incidentDate}T00:00:00Z`).getTime() > Date.now()) {
      errors.incident_date = "The date of the incident cannot be in the future.";
    }
    if (Object.keys(errors).length) return json({ error: "validation_failed", fields: errors }, 400);

    // ---- CAPTCHA (only when the regulator has configured and enabled it) ----
    const [{ data: setting }, { data: activeCfg }] = await Promise.all([
      admin.from("site_settings").select("value").eq("key", "captcha_enabled").maybeSingle(),
      admin.from("captcha_configurations").select("id").eq("is_active", true).maybeSingle(),
    ]);
    const rawSetting = (setting as any)?.value;
    const captchaOn = rawSetting === true || rawSetting === "true";
    if (captchaOn) {
      if (!activeCfg) {
        return json({
          error: "captcha_unavailable",
          message: "Security verification is temporarily unavailable. Please try again later.",
        }, 503);
      }
      const verificationId = clean(body.captcha_verification_id, 64);
      if (!verificationId) {
        return json({ error: "captcha_required", message: "Please complete the security check." }, 400);
      }
      const { data: verification } = await admin
        .from("captcha_verifications")
        .select("id, consumed_at, expires_at")
        .eq("id", verificationId)
        .maybeSingle();
      const valid =
        verification &&
        !(verification as any).consumed_at &&
        new Date((verification as any).expires_at).getTime() > Date.now();
      if (!valid) {
        return json({
          error: "captcha_invalid",
          message: "Your security check has expired. Please complete it again.",
        }, 400);
      }
      await admin
        .from("captcha_verifications")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", verificationId)
        .is("consumed_at", null);
    }

    // Respondent must actually be a regulated entity holding an active licence.
    const { data: lic } = await admin
      .from("licenses")
      .select("id, holder_id")
      .eq("holder_id", licenseeId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!lic) {
      return json({ error: "validation_failed", fields: { licensee_id: "That entity is not currently licensed." } }, 400);
    }

    // ---- rate limits: per email and per network ----
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [{ count: emailCount }, { count: ipCount }] = await Promise.all([
      admin
        .from("public_intake_events")
        .select("id", { count: "exact", head: true })
        .eq("kind", "complaint")
        .eq("email", email)
        .gte("created_at", since),
      ipHash
        ? admin
            .from("public_intake_events")
            .select("id", { count: "exact", head: true })
            .eq("kind", "complaint")
            .eq("ip_hash", ipHash)
            .gte("created_at", since)
        : Promise.resolve({ count: 0 } as { count: number }),
    ]);
    if ((emailCount || 0) >= MAX_PER_EMAIL_PER_HOUR) {
      return json({ error: "rate_limited", message: "Too many complaints submitted from this email address. Please try again later." }, 429);
    }
    if ((ipCount || 0) >= MAX_PER_IP_PER_HOUR) {
      return json({ error: "rate_limited", message: "Too many submissions from your network. Please try again later." }, 429);
    }

    const { data: licensee } = await admin
      .from("licensees")
      .select("id, regulator_id")
      .eq("id", licenseeId)
      .maybeSingle();

    // Extra context the consumer supplied, kept as readable narrative in the
    // complaint description. Identity now lives in dedicated columns.
    const extras: string[] = [];
    if (productService) extras.push(`Product or service: ${productService}`);
    if (outcomeSought) extras.push(`Outcome sought: ${outcomeSought}`);
    extras.push(`Raised with the entity first: ${raisedWithEntity ? "Yes" : "No"}`);
    if (raisedWithEntity && entityResponse) extras.push(`Entity response: ${entityResponse}`);

    const insertRow: Record<string, unknown> = {
      subject,
      description: `${description}\n\n--\n${extras.join("\n")}`,
      email,
      complainant_name: fullName,
      complainant_phone: phone || null,
      preferred_contact_method: contactMethod,
      incident_date: incidentDate || null,
      licensee_id: licenseeId,
      license_holder_id: licenseeId,
      complaint_type_id: complaintTypeId || null,
      regulator_id: (licensee as any)?.regulator_id || null,
      status: "submitted",
      intake_source: "public",
    };

    const { data: created, error: insErr } = await admin
      .from("complaints")
      .insert(insertRow)
      .select("id, complaint_number")
      .single();
    if (insErr) return json({ error: insErr.message }, 200);

    await admin.from("public_intake_events").insert({ kind: "complaint", email, ip_hash: ipHash });

    // ---- optional attachments ----
    const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, MAX_ATTACHMENTS) : [];
    const attachmentErrors: string[] = [];
    for (const att of attachments) {
      const name = clean((att as any)?.name, 180) || "attachment";
      const contentType = clean((att as any)?.content_type, 120) || "application/octet-stream";
      const dataUrl = typeof (att as any)?.data === "string" ? (att as any).data : "";
      if (!dataUrl) continue;
      if (!ALLOWED_MIME.includes(contentType)) {
        attachmentErrors.push(`${name}: file type not accepted`);
        continue;
      }
      let bytes: Uint8Array;
      try {
        bytes = decodeBase64(dataUrl);
      } catch {
        attachmentErrors.push(`${name}: could not be read`);
        continue;
      }
      if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        attachmentErrors.push(`${name}: larger than 5MB`);
        continue;
      }
      const path = `complaints/public/${created.id}/${crypto.randomUUID()}-${name.replace(/[^\w.\-]+/g, "_")}`;
      const { error: upErr } = await admin.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, bytes, { contentType, upsert: false });
      if (upErr) {
        attachmentErrors.push(`${name}: upload failed`);
        continue;
      }
      const { data: fileRow } = await admin
        .from("file_uploads")
        .insert({
          file_name: name,
          file_path: path,
          file_size: bytes.byteLength,
          mime_type: contentType,
          bucket_name: ATTACHMENT_BUCKET,
          entity_type: "complaint",
          entity_id: created.id,
          metadata: { source: "public_complaint_intake" },
        })
        .select("id")
        .single();
      if (fileRow?.id) {
        await admin.from("complaint_evidence").insert({
          complaint_id: created.id,
          file_upload_id: fileRow.id,
          label: name,
          finalized_at: new Date().toISOString(),
        });
      }
    }

    return json({
      ok: true,
      reference: created.complaint_number,
      id: created.id,
      attachment_warnings: attachmentErrors,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unexpected error" }, 500);
  }
});
