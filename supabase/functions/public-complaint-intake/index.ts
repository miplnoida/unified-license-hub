// Public Market Conduct complaint intake and tracking (no portal account required).
//
//   GET  ?action=config                  -> intake configuration + CAPTCHA requirement
//   GET  ?action=types                   -> active complaint types
//   GET  ?action=taxonomy                -> products / channels for structured capture
//   GET  ?action=entities&q=             -> currently and previously regulated businesses
//   POST { action: "track", ... }        -> redacted tracking (reference + access code, or legacy email)
//   POST { ...complaint }               -> lodge a complaint via the governed RPC
//
// MC-01 boundary rule: this function is a transport and security boundary only.
// It performs CAPTCHA verification, abuse/rate limiting, file transfer into
// storage and payload normalisation, then calls the canonical governed RPC
// `public_complaint_intake_submit`. It never writes authoritative complaint
// state (complaints / complaint_evidence) directly.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { markPublicFunction } from "../_shared/publicFunction.ts";
markPublicFunction('Public consumer market-conduct complaint intake and tracking');

const MAX_PER_CONTACT_PER_HOUR = 5;
const MAX_PER_IP_PER_HOUR = 10;
const MAX_TRACK_ATTEMPTS_PER_HOUR = 20;
const DEFAULT_MAX_ATTACHMENTS = 5;
const DEFAULT_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_BUCKET = "secure-documents";
const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const CONTACT_METHODS = ["email", "phone", "post"];
const PARTY_ROLES = [
  "affected_consumer",
  "complainant",
  "representative",
  "business_representative",
  "guardian_or_carer",
  "attorney_or_authorised_agent",
  "other_authorised_representative",
];
const MATCH_STATES = [
  "MATCHED_REGULATED",
  "MATCHED_PREVIOUSLY_REGULATED",
  "UNMATCHED",
  "SUSPECTED_UNAUTHORISED",
  "INTERMEDIARY",
  "PENDING_MATCH",
];
const RESPONDENT_ROLES = ["provider", "intermediary", "agent", "broker", "other"];

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function bool(v: unknown): boolean {
  return v === true || v === "true";
}
function triBool(v: unknown): boolean | null {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return null;
}
function num(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return String(Number(v));
  return null;
}
function isoDate(v: unknown): string | null {
  const s = clean(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
async function sha256(value: string | null): Promise<string | null> {
  if (!value) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function decodeBase64(data: string): Uint8Array {
  const raw = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase().slice(0, 12) : "bin";
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;
  const cors = buildCorsHeaders(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const loadConfig = async () => {
    const { data } = await admin
      .from("complaint_public_intake_config")
      .select("*")
      .is("regulator_id", null)
      .maybeSingle();
    return (data || {}) as Record<string, unknown>;
  };

  const captchaState = async () => {
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
    return {
      required: globallyEnabled && !!cfg,
      misconfigured: globallyEnabled && !cfg,
      config: globallyEnabled && cfg ? cfg : null,
    };
  };

  try {
    const url = new URL(req.url);

    // ================= GET: reference data =================
    if (req.method === "GET") {
      const action = url.searchParams.get("action") || "config";

      if (action === "captcha") return json(await captchaState());

      if (action === "config") {
        const [cfg, captcha] = await Promise.all([loadConfig(), captchaState()]);
        return json({
          captcha,
          allow_anonymous: cfg.allow_anonymous === true,
          allow_confidential: cfg.allow_confidential !== false,
          support_categories: cfg.support_categories ?? [],
          desired_outcome_options: cfg.desired_outcome_options ?? [],
          channel_options: cfg.channel_options ?? [],
          privacy_notice_version: cfg.privacy_notice_version ?? "v1.0",
          privacy_notice_text: cfg.privacy_notice_text ?? null,
          declaration_text: cfg.declaration_text ?? null,
          require_respondent_contact_permission: cfg.require_respondent_contact_permission !== false,
          max_attachments: Number(cfg.max_attachments ?? DEFAULT_MAX_ATTACHMENTS),
          max_attachment_bytes: Number(cfg.max_attachment_bytes ?? DEFAULT_MAX_ATTACHMENT_BYTES),
        });
      }

      if (action === "types") {
        const { data, error } = await admin
          .from("complaint_types")
          .select("id, name")
          .eq("is_active", true)
          .order("name");
        if (error) return json({ error: "LOOKUP_FAILED" }, 500);
        return json({ rows: data || [] });
      }

      if (action === "taxonomy") {
        const cfg = await loadConfig();
        const [{ data: products }, { data: channels }, { data: sectors }] = await Promise.all([
          admin.from("conduct_products").select("id, name").eq("active", true).order("name"),
          admin.from("conduct_channels").select("id, name").order("name"),
          admin.from("sectors").select("id, name").order("name"),
        ]);
        return json({
          products: products || [],
          channels: channels || [],
          sectors: sectors || [],
          channel_options: cfg.channel_options ?? [],
        });
      }

      if (action === "entities") {
        // MC-01: a consumer may complain about currently OR previously regulated
        // businesses. Current licence status is no longer an intake gate.
        const q = clean(url.searchParams.get("q"), 120);
        const { data: lics, error: licErr } = await admin
          .from("licenses")
          .select("holder_id, status")
          .limit(5000);
        if (licErr) return json({ error: "LOOKUP_FAILED" }, 500);

        const state = new Map<string, string>();
        for (const l of (lics || []) as any[]) {
          if (!l.holder_id) continue;
          const active = String(l.status || "").toLowerCase() === "active";
          if (active) state.set(l.holder_id, "currently_regulated");
          else if (!state.has(l.holder_id)) state.set(l.holder_id, "previously_regulated");
        }
        const holderIds = [...state.keys()];
        if (!holderIds.length) return json({ rows: [] });

        let query = admin
          .from("licensees")
          .select("id, name, sectors(name)")
          .in("id", holderIds)
          .order("name")
          .limit(50);
        if (q) query = query.ilike("name", `%${q}%`);
        const { data, error } = await query;
        if (error) return json({ error: "LOOKUP_FAILED" }, 500);

        return json({
          rows: (data || []).map((r: any) => ({
            id: r.id,
            name: r.name || "Unnamed business",
            sector_name: r.sectors?.name || null,
            regulated_state: state.get(r.id) || "previously_regulated",
            regulated_label:
              state.get(r.id) === "currently_regulated"
                ? "Currently regulated"
                : "Previously regulated",
          })),
        });
      }

      return json({ error: "unknown action" }, 400);
    }

    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    const body = await req.json().catch(() => ({}));
    const remoteIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ipHash = await sha256(remoteIp);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // ================= public tracking =================
    if (clean(body.action, 32) === "track") {
      const reference = clean(body.reference, 64);
      const accessCode = clean(body.access_code, 64);
      const email = clean(body.email, 200).toLowerCase();

      if (ipHash) {
        const { count } = await admin
          .from("public_intake_events")
          .select("id", { count: "exact", head: true })
          .eq("kind", "complaint_track")
          .eq("ip_hash", ipHash)
          .gte("created_at", since);
        if ((count || 0) >= MAX_TRACK_ATTEMPTS_PER_HOUR) {
          return json({ found: false, error: "rate_limited" }, 429);
        }
        await admin.from("public_intake_events").insert({ kind: "complaint_track", ip_hash: ipHash });
      }

      if (reference.length < 4 || (!accessCode && !email)) return json({ found: false });

      const { data, error } = await admin.rpc("get_public_complaint_tracking_v2", {
        p_reference: reference,
        p_access_code: accessCode || null,
        p_email: email || null,
      });
      // Uniform failure response: never disclose whether a complaint exists.
      if (error) return json({ found: false });
      return json(data ?? { found: false });
    }

    // ================= lodge a complaint =================

    // Honeypot: bots fill hidden fields, humans never do.
    if (clean(body.website_hp, 200)) return json({ ok: true, reference: null });

    const cfg = await loadConfig();
    const maxAttachments = Number(cfg.max_attachments ?? DEFAULT_MAX_ATTACHMENTS);
    const maxBytes = Number(cfg.max_attachment_bytes ?? DEFAULT_MAX_ATTACHMENT_BYTES);
    const allowAnonymous = cfg.allow_anonymous === true;

    // ---------- normalisation (transport concern only) ----------
    const subject = clean(body.subject, 200);
    const description = clean(body.description, 12000);
    const anonymous = allowAnonymous && bool(body.anonymous);

    const contactIn = (body.contact_preference ?? {}) as Record<string, unknown>;
    const methodRaw = clean(contactIn.preferred_method, 20).toLowerCase();
    const preferredMethod = CONTACT_METHODS.includes(methodRaw) ? methodRaw : "";
    const altRaw = clean(contactIn.alternative_method, 20).toLowerCase();
    const contact = {
      preferred_method: preferredMethod,
      alternative_method: CONTACT_METHODS.includes(altRaw) && altRaw !== preferredMethod ? altRaw : null,
      email: clean(contactIn.email, 200).toLowerCase() || null,
      phone: clean(contactIn.phone, 40) || null,
      postal_address_line1: clean(contactIn.postal_address_line1, 200) || null,
      postal_address_line2: clean(contactIn.postal_address_line2, 200) || null,
      city: clean(contactIn.city, 120) || null,
      region: clean(contactIn.region, 120) || null,
      postal_code: clean(contactIn.postal_code, 40) || null,
      country: clean(contactIn.country, 120) || null,
      preferred_language: clean(contactIn.preferred_language, 60) || "English",
      accessibility_needs: clean(contactIn.accessibility_needs, 1000) || null,
      safe_contact_instructions: clean(contactIn.safe_contact_instructions, 1000) || null,
    };

    const parties = (Array.isArray(body.parties) ? body.parties : []).slice(0, 6).map((p: any, i: number) => {
      const role = clean(p?.party_role, 60);
      const conf = clean(p?.confidentiality, 20);
      return {
        party_role: PARTY_ROLES.includes(role) ? role : "complainant",
        party_type: clean(p?.party_type, 20) === "business" ? "business" : "individual",
        is_primary_contact: bool(p?.is_primary_contact) || i === 0,
        full_name: anonymous ? null : clean(p?.full_name, 150) || null,
        business_name: clean(p?.business_name, 200) || null,
        position_or_title: clean(p?.position_or_title, 150) || null,
        relationship_to_consumer: clean(p?.relationship_to_consumer, 200) || null,
        authority_basis: clean(p?.authority_basis, 500) || null,
        authority_confirmed: bool(p?.authority_confirmed),
        email: anonymous ? null : clean(p?.email, 200).toLowerCase() || null,
        phone: anonymous ? null : clean(p?.phone, 40) || null,
        confidentiality: anonymous
          ? "anonymous"
          : ["standard", "confidential"].includes(conf) && (conf !== "confidential" || cfg.allow_confidential !== false)
            ? conf
            : "standard",
        notes: clean(p?.notes, 1000) || null,
      };
    });

    const respondents = (Array.isArray(body.respondents) ? body.respondents : [])
      .slice(0, 6)
      .map((r: any, i: number) => {
        const ms = clean(r?.match_state, 40).toUpperCase();
        const role = clean(r?.respondent_role, 20).toLowerCase();
        return {
          is_primary: bool(r?.is_primary) || i === 0,
          match_state: MATCH_STATES.includes(ms) ? ms : "PENDING_MATCH",
          respondent_role: RESPONDENT_ROLES.includes(role) ? role : "provider",
          licensee_id: clean(r?.licensee_id, 64) || null,
          legal_name: clean(r?.legal_name, 250) || null,
          trading_name: clean(r?.trading_name, 250) || null,
          website: clean(r?.website, 250) || null,
          email: clean(r?.email, 200).toLowerCase() || null,
          phone: clean(r?.phone, 40) || null,
          address: clean(r?.address, 500) || null,
          country: clean(r?.country, 120) || null,
          online_reference: clean(r?.online_reference, 250) || null,
          service_offered: clean(r?.service_offered, 500) || null,
          agent_name: clean(r?.agent_name, 200) || null,
          related_principal_licensee_id: clean(r?.related_principal_licensee_id, 64) || null,
          related_principal_name: clean(r?.related_principal_name, 250) || null,
          consumer_notes: clean(r?.consumer_notes, 1000) || null,
        };
      });

    const supportIn = (body.support_declaration ?? {}) as Record<string, unknown>;
    const supportCategories = (Array.isArray(supportIn.categories) ? supportIn.categories : [])
      .map((c: unknown) => clean(c, 60))
      .filter(Boolean)
      .slice(0, 12);
    const support = {
      support_required: bool(supportIn.support_required) && supportCategories.length > 0,
      categories: supportCategories,
      consumer_notes: clean(supportIn.consumer_notes, 2000) || null,
    };

    const d = (body.intake_details ?? {}) as Record<string, unknown>;
    const desiredOutcomes = (Array.isArray(d.desired_outcomes) ? d.desired_outcomes : [])
      .map((c: unknown) => clean(c, 60))
      .filter(Boolean)
      .slice(0, 16);
    const details = {
      sector_id: clean(d.sector_id, 64) || null,
      product_id: clean(d.product_id, 64) || null,
      product_family: clean(d.product_family, 150) || null,
      product_other: clean(d.product_other, 250) || null,
      service_description: clean(d.service_description, 1000) || null,
      channel_id: clean(d.channel_id, 64) || null,
      channel_code: clean(d.channel_code, 60) || null,
      channel_other: clean(d.channel_other, 250) || null,
      customer_segment: clean(d.customer_segment, 60) || null,
      incident_date: isoDate(d.incident_date),
      incident_date_to: isoDate(d.incident_date_to),
      is_ongoing: bool(d.is_ongoing),
      location: clean(d.location, 250) || null,
      transaction_reference: clean(d.transaction_reference, 150) || null,
      amount_involved: num(d.amount_involved),
      // F6-X: a stated amount never acquires an assumed currency.
      currency: clean(d.currency, 8) || null,
      amount_disputed: num(d.amount_disputed),
      claimed_loss: num(d.claimed_loss),
      continuing_loss: bool(d.continuing_loss),
      urgent_funds_access: bool(d.urgent_funds_access),
      suspected_fraud: bool(d.suspected_fraud),
      raised_with_entity: bool(d.raised_with_entity),
      entity_complaint_reference: clean(d.entity_complaint_reference, 150) || null,
      raised_with_entity_date: isoDate(d.raised_with_entity_date),
      raised_with_entity_channel: clean(d.raised_with_entity_channel, 60) || null,
      acknowledgement_received: triBool(d.acknowledgement_received),
      final_response_received: triBool(d.final_response_received),
      final_response_date: isoDate(d.final_response_date),
      outcome_offered: clean(d.outcome_offered, 2000) || null,
      redress_offered: clean(d.redress_offered, 2000) || null,
      redress_offered_amount: num(d.redress_offered_amount),
      redress_accepted: triBool(d.redress_accepted),
      still_dissatisfied_reason: clean(d.still_dissatisfied_reason, 2000) || null,
      desired_outcomes: desiredOutcomes,
      desired_outcome_other: clean(d.desired_outcome_other, 500) || null,
      desired_amount: num(d.desired_amount),
      declaration_accepted: bool(d.declaration_accepted),
      privacy_notice_version: clean(d.privacy_notice_version, 40) || String(cfg.privacy_notice_version ?? "v1.0"),
      privacy_notice_acknowledged: bool(d.privacy_notice_acknowledged),
      respondent_contact_permitted: triBool(d.respondent_contact_permitted),
      information_sharing_acknowledged: bool(d.information_sharing_acknowledged),
    };

    // ---------- transport-level validation (server authority is the RPC) ----------
    const errors: Record<string, string> = {};
    if (subject.length < 5) errors.subject = "Please give a short summary of your complaint.";
    if (description.length < 30) errors.description = "Please describe what happened (at least 30 characters).";
    if (!respondents.length) errors.respondents = "Please tell us who the complaint is about.";
    if (!anonymous) {
      if (!preferredMethod) errors.preferred_method = "Please choose how we should contact you.";
      if (preferredMethod === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email || "")) {
        errors.email = "A valid email address is required for contact by email.";
      }
      if (preferredMethod === "phone" && !contact.phone) {
        errors.phone = "A phone number is required for contact by phone.";
      }
      if (preferredMethod === "post" && (!contact.postal_address_line1 || !contact.city)) {
        errors.postal_address_line1 = "A postal address is required for contact by post.";
      }
    }
    if (!details.declaration_accepted) errors.declaration_accepted = "Please confirm your declaration.";
    if (details.incident_date && new Date(`${details.incident_date}T00:00:00Z`).getTime() > Date.now()) {
      errors.incident_date = "The date cannot be in the future.";
    }
    if (Object.keys(errors).length) return json({ error: "validation_failed", fields: errors }, 400);

    // ---------- CAPTCHA ----------
    const captcha = await captchaState();
    if (captcha.required || captcha.misconfigured) {
      if (captcha.misconfigured) {
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
      // Single-use consumption.
      const { data: consumed } = await admin
        .from("captcha_verifications")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", verificationId)
        .is("consumed_at", null)
        .select("id");
      if (!consumed || !consumed.length) {
        return json({
          error: "captcha_invalid",
          message: "Your security check has already been used. Please complete it again.",
        }, 400);
      }
    }

    // ---------- rate limits (email is optional, so identity is composite) ----------
    const emailHash = await sha256(contact.email);
    const phoneHash = await sha256(contact.phone);
    const checks: Promise<{ count: number | null }>[] = [];
    if (emailHash) {
      checks.push(admin.from("public_intake_events").select("id", { count: "exact", head: true })
        .eq("kind", "complaint").eq("email_hash", emailHash).gte("created_at", since) as any);
    }
    if (phoneHash) {
      checks.push(admin.from("public_intake_events").select("id", { count: "exact", head: true })
        .eq("kind", "complaint").eq("phone_hash", phoneHash).gte("created_at", since) as any);
    }
    const contactCounts = await Promise.all(checks);
    if (contactCounts.some((c) => (c?.count || 0) >= MAX_PER_CONTACT_PER_HOUR)) {
      return json({
        error: "rate_limited",
        message: "Too many complaints have been submitted using these contact details. Please try again later.",
      }, 429);
    }
    if (ipHash) {
      const { count: ipCount } = await admin
        .from("public_intake_events")
        .select("id", { count: "exact", head: true })
        .eq("kind", "complaint")
        .eq("ip_hash", ipHash)
        .gte("created_at", since);
      if ((ipCount || 0) >= MAX_PER_IP_PER_HOUR) {
        return json({
          error: "rate_limited",
          message: "Too many submissions from your network. Please try again later.",
        }, 429);
      }
    }

    // ---------- secure file transfer (staging only, never authoritative) ----------
    const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, maxAttachments) : [];
    const attachmentWarnings: string[] = [];
    const stagedIds: string[] = [];
    const stagedPaths: string[] = [];
    for (const att of attachments) {
      const name = clean((att as any)?.name, 180) || "attachment";
      const contentType = clean((att as any)?.content_type, 120) || "application/octet-stream";
      const dataUrl = typeof (att as any)?.data === "string" ? (att as any).data : "";
      if (!dataUrl) continue;
      if (!ALLOWED_MIME.includes(contentType)) {
        attachmentWarnings.push(`${name}: this file type is not accepted`);
        continue;
      }
      let bytes: Uint8Array;
      try {
        bytes = decodeBase64(dataUrl);
      } catch {
        attachmentWarnings.push(`${name}: the file could not be read`);
        continue;
      }
      if (bytes.byteLength > maxBytes) {
        attachmentWarnings.push(`${name}: larger than the ${Math.round(maxBytes / (1024 * 1024))}MB limit`);
        continue;
      }
      const path = `complaints/public/${crypto.randomUUID()}/${name.replace(/[^\w.-]+/g, "_")}`;
      const { error: upErr } = await admin.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, bytes, { contentType, upsert: false });
      if (upErr) {
        attachmentWarnings.push(`${name}: could not be uploaded`);
        continue;
      }
      const { data: fileRow, error: fileErr } = await admin
        .from("file_uploads")
        .insert({
          file_name: name,
          file_path: path,
          file_size: bytes.byteLength,
          mime_type: contentType,
          file_extension: extOf(name),
          bucket_name: ATTACHMENT_BUCKET,
          entity_type: "staging",
          metadata: { source: "public_complaint_intake" },
        })
        .select("id")
        .single();
      if (fileErr || !fileRow?.id) {
        await admin.storage.from(ATTACHMENT_BUCKET).remove([path]);
        attachmentWarnings.push(`${name}: could not be attached`);
        continue;
      }
      stagedIds.push(fileRow.id);
      stagedPaths.push(path);
    }

    // ---------- governed complaint creation ----------
    const idempotencyKey = clean(body.idempotency_key, 100) || null;
    const payload = {
      subject,
      description,
      anonymous,
      intake_source: "public",
      complaint_type_id: clean(body.complaint_type_id, 64) || null,
      product_id: details.product_id,
      channel_id: details.channel_id,
      email: anonymous ? null : contact.email,
      parties,
      respondents,
      contact_preference: contact,
      support_declaration: support,
      intake_details: details,
    };

    const { data: rpcData, error: rpcErr } = await admin.rpc("public_complaint_intake_submit", {
      _payload: payload,
      _staged_upload_ids: stagedIds,
      _idempotency_key: idempotencyKey,
    });

    if (rpcErr) {
      console.error("[MC01 public_complaint_intake_submit failed]", {
        code: rpcErr.code,
        message: rpcErr.message,
        details: rpcErr.details,
        hint: rpcErr.hint,
        stagedUploadCount: stagedIds.length,
        hasIdempotencyKey: !!idempotencyKey,
        respondentCount: respondents.length,
        partyCount: parties.length,
      });
      // No authoritative state was created — clean up staged transfer artefacts.
      if (stagedIds.length) {
        await admin.from("file_uploads").delete().in("id", stagedIds);
        await admin.storage.from(ATTACHMENT_BUCKET).remove(stagedPaths);
      }
      let fields: Record<string, string> | undefined;
      try {
        const detail = JSON.parse((rpcErr as any).details ?? "null");
        if (Array.isArray(detail)) {
          fields = {};
          for (const e of detail) if (e?.field) fields[e.field] = e.message ?? "This needs attention.";
        }
      } catch { /* not a validation payload */ }
      if (fields) return json({ error: "validation_failed", fields }, 400);
      return json({
        error: "submission_failed",
        message: "We could not lodge your complaint just now. Please try again shortly.",
      }, 200);
    }

    const result = (rpcData ?? {}) as Record<string, any>;
    const attachResult = (result.attachments ?? {}) as Record<string, any>;
    for (const r of (attachResult.results ?? []) as any[]) {
      if (r?.ok === false) attachmentWarnings.push("One of your files could not be attached to the complaint.");
    }

    await admin.from("public_intake_events").insert({
      kind: "complaint",
      email: anonymous ? null : contact.email,
      email_hash: emailHash,
      phone_hash: phoneHash,
      ip_hash: ipHash,
      context: "mc01_public_intake",
    });

    return json({
      ok: true,
      reference: result.reference ?? null,
      tracking_access_code: result.tracking_access_code ?? null,
      submitted_at: result.submitted_at ?? new Date().toISOString(),
      duplicate: result.idempotent === true,
      attachments_accepted: Number(attachResult.linked ?? 0),
      attachment_warnings: attachmentWarnings,
    });
  } catch (_e) {
    // Never leak backend detail to a public caller.
    return json({ error: "unexpected_error", message: "Something went wrong. Please try again." }, 500);
  }
});
