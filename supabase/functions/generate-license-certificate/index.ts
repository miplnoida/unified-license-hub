// Generates (and optionally signs) a PDF license certificate, stores it in the
// `license-certificates` private bucket, and records it in `license_certificates`.
//
// Modes:
//   { mode: "generate", license_id }  -> creates a new version of the certificate
//   { mode: "download", license_id }  -> returns a short-lived signed URL of the latest version
//
// Authorized Signatory: visible signatory (name, title, signature image, optional
// seal image) is sourced from the admin-managed `site_settings` row
// `license_certificate_signatory`. Falls back to LICENSE_SIGNATORY_NAME /
// LICENSE_SIGNATORY_TITLE env vars for text only when no active config exists.
//
// Cryptographic signing remains independent: if LICENSE_SIGNING_KEY_PEM +
// LICENSE_SIGNING_CERT_PEM are configured, a SHA-256 fingerprint is stored and a
// small "Digitally signed" label is rendered. Missing signing keys no longer
// render any user-visible message.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, degrees, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { requireUserPermission, requireAuthenticatedUser } from "../_shared/authz.ts";

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

type SignatoryConfig = {
  name: string;
  title: string;
  signatureBytes?: Uint8Array;
  signatureMime?: string;
  sealBytes?: Uint8Array;
  sealMime?: string;
  configured: boolean;
  // When config references an image path but loading failed
  signatureImageError?: string;
  sealImageError?: string;
};

async function loadSignatoryConfig(admin: ReturnType<typeof createClient>): Promise<SignatoryConfig> {
  const fallback: SignatoryConfig = {
    name: Deno.env.get("LICENSE_SIGNATORY_NAME") || "",
    title: Deno.env.get("LICENSE_SIGNATORY_TITLE") || "",
    configured: false,
  };

  const { data } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", "license_certificate_signatory")
    .maybeSingle();

  const value = (data?.value || {}) as any;
  if (!value || value.is_active !== true || !value.name || !value.title) {
    return fallback;
  }

  const out: SignatoryConfig = {
    name: String(value.name),
    title: String(value.title),
    configured: true,
  };

  function sniffMime(buf: Uint8Array): "image/png" | "image/jpeg" | null {
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
    return null;
  }

  async function fetchAsset(path: string): Promise<{ bytes: Uint8Array; mime: "image/png" | "image/jpeg" } | { error: string }> {
    try {
      const { data: file, error } = await admin.storage.from("certificate-assets").download(path);
      if (error || !file) return { error: error?.message || "not found" };
      const buf = new Uint8Array(await file.arrayBuffer());
      const mime = sniffMime(buf);
      if (!mime) return { error: "unsupported image type (only PNG/JPG accepted)" };
      return { bytes: buf, mime };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "download failed" };
    }
  }

  // Try the preferred embed first; fall back to the other. Returns the mime that worked,
  // or an error string if both fail.
  async function tryEmbed(bytes: Uint8Array, preferred: "image/png" | "image/jpeg"): Promise<{ mime: "image/png" | "image/jpeg" } | { error: string }> {
    const probe = await PDFDocument.create();
    const order: Array<"image/png" | "image/jpeg"> = preferred === "image/png" ? ["image/png", "image/jpeg"] : ["image/jpeg", "image/png"];
    let lastErr = "";
    for (const m of order) {
      try {
        if (m === "image/png") await probe.embedPng(bytes);
        else await probe.embedJpg(bytes);
        return { mime: m };
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }
    return { error: lastErr || "image cannot be decoded as PNG/JPG" };
  }

  if (value.signature_image_path) {
    const sig = await fetchAsset(String(value.signature_image_path));
    if ("bytes" in sig) {
      const result = await tryEmbed(sig.bytes, sig.mime);
      if ("error" in result) out.signatureImageError = result.error;
      else { out.signatureBytes = sig.bytes; out.signatureMime = result.mime; }
    } else { out.signatureImageError = sig.error; }
  }
  if (value.seal_image_path) {
    const seal = await fetchAsset(String(value.seal_image_path));
    if ("bytes" in seal) {
      const result = await tryEmbed(seal.bytes, seal.mime);
      if ("error" in result) out.sealImageError = result.error;
      else { out.sealBytes = seal.bytes; out.sealMime = result.mime; }
    } else { out.sealImageError = seal.error; }
  }

  return out;
}


async function buildCertificatePdf(opts: {
  entityName: string;
  licenseType: string;
  licenseNumber: string;
  issueDate: string;
  expiryDate: string;
  status: string;
  statusEffectiveDate: string;
  signatory: SignatoryConfig;
  cryptoSigned: boolean;
  conditions?: Array<{ category: string; description: string; due_date: string | null }>;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`License Certificate ${opts.licenseNumber}`);
  doc.setAuthor("Regulator");
  doc.setSubject("License Certificate");
  const page = doc.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({ x: 30, y: 30, width: width - 60, height: height - 60, borderColor: rgb(0.12, 0.23, 0.54), borderWidth: 3 });
  page.drawRectangle({ x: 40, y: 40, width: width - 80, height: height - 80, borderColor: rgb(0.09, 0.64, 0.29), borderWidth: 1 });

  const center = (text: string, size: number, y: number, useBold = false) => {
    const f = useBold ? bold : font;
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font: f, color: rgb(0.05, 0.12, 0.36) });
  };

  center("LICENSE CERTIFICATE", 28, height - 100, true);
  center("Issued by the Regulatory Authority", 12, height - 125);

  center("This is to certify that", 13, height - 180);
  center(opts.entityName, 24, height - 215, true);
  center("is licensed to operate as a", 13, height - 250);
  center(opts.licenseType, 18, height - 275, true);

  // Details grid
  const leftX = 120;
  const rightX = width / 2 + 60;
  let y = height - 340;
  const label = (text: string, x: number, yy: number) =>
    page.drawText(text, { x, y: yy, size: 11, font: bold, color: rgb(0.3, 0.3, 0.3) });
  const value = (text: string, x: number, yy: number, color = rgb(0, 0, 0)) =>
    page.drawText(text, { x, y: yy, size: 13, font, color });

  label("License Number", leftX, y); value(opts.licenseNumber, leftX, y - 18);
  label("Issue Date", rightX, y); value(opts.issueDate, rightX, y - 18);
  y -= 60;
  label("Expiry Date", leftX, y); value(opts.expiryDate || "No Expiry", leftX, y - 18);

  const normalizedStatus = (opts.status || "active").toLowerCase();
  const isActive = normalizedStatus === "active";
  const statusLabel = normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
  const statusColor = isActive ? rgb(0.09, 0.5, 0.2) : rgb(0.75, 0.1, 0.1);
  label("Status", rightX, y);
  value(statusLabel, rightX, y - 18, statusColor);
  if (!isActive && opts.statusEffectiveDate) {
    page.drawText(`Effective: ${opts.statusEffectiveDate}`, {
      x: rightX, y: y - 34, size: 10, font, color: rgb(0.4, 0.4, 0.4),
    });
  }

  // Watermark for non-active licenses so the certificate cannot be mistaken
  // for a valid one when printed.
  if (!isActive) {
    const wm = statusLabel.toUpperCase();
    const wmSize = 120;
    const wmWidth = bold.widthOfTextAtSize(wm, wmSize);
    page.drawText(wm, {
      x: (width - wmWidth) / 2 + 120,
      y: height / 2 - 120,
      size: wmSize,
      font: bold,
      color: rgb(0.85, 0.1, 0.1),
      opacity: 0.18,
      rotate: degrees(-30),
    });
  }

  // Signatory block (right side)
  const blockRight = width - 80;
  const blockLeft = width - 280;
  const lineY = 130;

  // Signature image (above the line) — fail loudly if embed/draw fails
  if (opts.signatory.configured && opts.signatory.signatureBytes && opts.signatory.signatureMime) {
    try {
      const img = opts.signatory.signatureMime === "image/png"
        ? await doc.embedPng(opts.signatory.signatureBytes)
        : await doc.embedJpg(opts.signatory.signatureBytes);
      const maxW = 180, maxH = 60;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale, h = img.height * scale;
      page.drawImage(img, { x: blockLeft + (200 - w) / 2, y: lineY + 8, width: w, height: h });
    } catch (e) {
      throw new Error(`SIGNATURE_IMAGE_EMBED_FAILED:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Seal (optional) — fail loudly if embed/draw fails
  if (opts.signatory.configured && opts.signatory.sealBytes && opts.signatory.sealMime) {
    try {
      const img = opts.signatory.sealMime === "image/png"
        ? await doc.embedPng(opts.signatory.sealBytes)
        : await doc.embedJpg(opts.signatory.sealBytes);
      const maxW = 90, maxH = 90;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale, h = img.height * scale;
      page.drawImage(img, { x: blockRight + 10, y: lineY - 10, width: w, height: h });
    } catch (e) {
      throw new Error(`SEAL_IMAGE_EMBED_FAILED:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  page.drawLine({ start: { x: blockLeft, y: lineY }, end: { x: blockRight, y: lineY }, thickness: 1, color: rgb(0, 0, 0) });

  if (opts.signatory.configured) {
    page.drawText(opts.signatory.name, { x: blockLeft, y: lineY - 18, size: 12, font: bold });
    page.drawText(opts.signatory.title, { x: blockLeft, y: lineY - 33, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText("Authorized Signatory", { x: blockLeft, y: lineY - 48, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  } else {
    page.drawText("Authorized signatory not configured", {
      x: blockLeft, y: lineY - 18, size: 10, font, color: rgb(0.55, 0.55, 0.55),
    });
  }

  if (opts.cryptoSigned) {
    // Visible digital-signature stamp
    page.drawRectangle({
      x: 70, y: 45, width: 170, height: 42,
      borderColor: rgb(0.09, 0.64, 0.29), borderWidth: 1,
      color: rgb(0.95, 1, 0.96),
    });
    page.drawText("DIGITALLY SIGNED", {
      x: 80, y: 72, size: 10, font: bold, color: rgb(0.09, 0.5, 0.2),
    });
    page.drawText("SHA-256 verified", {
      x: 80, y: 58, size: 8, font, color: rgb(0.3, 0.3, 0.3),
    });
  }

  // Conditions page (appended when there are conditions attached)
  if (opts.conditions && opts.conditions.length > 0) {
    const p2 = doc.addPage([842, 595]);
    const { width: w2, height: h2 } = p2.getSize();
    p2.drawRectangle({ x: 30, y: 30, width: w2 - 60, height: h2 - 60, borderColor: rgb(0.12, 0.23, 0.54), borderWidth: 2 });
    const centerP2 = (text: string, size: number, y: number, useBold = false) => {
      const f = useBold ? bold : font;
      const wt = f.widthOfTextAtSize(text, size);
      p2.drawText(text, { x: (w2 - wt) / 2, y, size, font: f, color: rgb(0.05, 0.12, 0.36) });
    };
    centerP2("LICENSE CONDITIONS", 22, h2 - 80, true);
    centerP2(`Attached to License No. ${opts.licenseNumber}`, 11, h2 - 105);

    let yy = h2 - 150;
    const wrap = (text: string, size: number, maxWidth: number): string[] => {
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        const trial = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(trial, size) > maxWidth) {
          if (cur) lines.push(cur);
          cur = w;
        } else cur = trial;
      }
      if (cur) lines.push(cur);
      return lines;
    };

    opts.conditions.forEach((c, idx) => {
      if (yy < 80) return; // hard-stop; keep single-page to avoid overflow
      p2.drawText(`${idx + 1}. [${c.category}]`, { x: 60, y: yy, size: 11, font: bold, color: rgb(0.09, 0.5, 0.2) });
      if (c.due_date) {
        p2.drawText(`Due: ${c.due_date}`, { x: w2 - 200, y: yy, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
      }
      yy -= 14;
      const lines = wrap(c.description, 10, w2 - 140);
      lines.slice(0, 4).forEach(line => {
        p2.drawText(line, { x: 78, y: yy, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
        yy -= 12;
      });
      yy -= 6;
    });
  }

  return await doc.save();
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  // Internal system calls (licence issuance / renewal / backfill) present the
  // service-role key. Those are trusted and must not be blocked by the
  // user-permission gate, which can only evaluate real user JWTs.
  const authHeader = req.headers.get("Authorization") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const isSystemCall = serviceRoleKey.length > 0 &&
    authHeader === `Bearer ${serviceRoleKey}`;

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const mode: "generate" | "download" = body?.mode || "generate";
  const licenseId: string | undefined = body?.license_id;

  if (!isSystemCall) {
    const __authzGate = await requireUserPermission(req, "license_management", "manage_certificates");
    if (!__authzGate.ok) {
      // Holder-side access: the licence holder / applicant / mapped entity user
      // may DOWNLOAD their own certificate, but never generate, sign or dispatch.
      if (mode !== "download" || !licenseId) return __authzGate.response;
      const auth = await requireAuthenticatedUser(req);
      if (!auth.ok) return auth.response;
      const { data: allowed } = await auth.adminClient.rpc("can_read_license", {
        _user: auth.userId,
        _license_id: licenseId,
      });
      if (allowed !== true) return __authzGate.response;
    }
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    if (!licenseId) return json(req, 200, { error: "license_id is required" });



    if (mode === "download") {
      const { data: cert } = await admin
        .from("license_certificates")
        .select("file_path")
        .eq("license_id", licenseId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cert) return json(req, 200, { error: "No certificate found", code: "NOT_FOUND" });
      const { data: signed, error } = await admin.storage
        .from("license-certificates")
        .createSignedUrl(cert.file_path, 300);
      if (error) return json(req, 200, { error: error.message });
      return json(req, 200, { url: signed.signedUrl });
    }

    // Generate mode
    const { data: license, error: licErr } = await admin
      .from("licenses")
      .select("id, license_number, license_type, issued_at, valid_until, status, holder_id, application_id")
      .eq("id", licenseId)
      .maybeSingle();
    if (licErr || !license) return json(req, 200, { error: "License not found" });

    const { data: licenseeRow } = await admin
      .from("licensees").select("name").eq("license_id", license.id).maybeSingle();
    let entityName = licenseeRow?.name || "";
    if (!entityName) {
      const { data: app } = await admin
        .from("applications").select("data").eq("id", license.application_id).maybeSingle();
      entityName = (app?.data as any)?.entity_name || (app?.data as any)?.applicant_name || "Licensed Entity";
    }

    // Resolve the effective date for the license's current status so the
    // certificate reflects when the change took effect (suspension/revocation/
    // cancellation) or when the license expired.
    const status = String((license as any).status || "active").toLowerCase();
    let statusEffectiveDate = "";
    if (status !== "active") {
      if (status === "expired") {
        statusEffectiveDate = license.valid_until
          ? new Date(license.valid_until).toLocaleDateString("en-GB")
          : "";
      } else {
        const actionTypeByStatus: Record<string, string> = {
          suspended: "suspension",
          revoked: "revocation",
          cancelled: "cancellation",
          canceled: "cancellation",
        };
        const actionType = actionTypeByStatus[status];
        if (actionType) {
          const { data: act } = await admin
            .from("license_actions")
            .select("created_at")
            .eq("license_id", license.id)
            .eq("action_type", actionType)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (act?.created_at) {
            statusEffectiveDate = new Date(act.created_at).toLocaleDateString("en-GB");
          }
        }
        if (!statusEffectiveDate) {
          const { data: act2 } = await admin
            .from("license_actions")
            .select("created_at")
            .eq("license_id", license.id)
            .eq("new_status", status)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (act2?.created_at) {
            statusEffectiveDate = new Date(act2.created_at).toLocaleDateString("en-GB");
          }
        }
      }
    }


    const signingKey = Deno.env.get("LICENSE_SIGNING_KEY_PEM") || "";
    const signingCert = Deno.env.get("LICENSE_SIGNING_CERT_PEM") || "";
    const cryptoSigned = !!(signingKey && signingCert);

    const signatory = await loadSignatoryConfig(admin);

    if (signatory.configured && signatory.signatureImageError) {
      return json(req, 200, {
        error: `Configured signature image could not be embedded (${signatory.signatureImageError}). Please re-upload a standard non-interlaced PNG or a JPG.`,
        code: "SIGNATURE_IMAGE_UNAVAILABLE",
        details: signatory.signatureImageError,
      });
    }
    if (signatory.configured && signatory.sealImageError) {
      return json(req, 200, {
        error: `Configured seal image could not be embedded (${signatory.sealImageError}). Please re-upload a standard non-interlaced PNG or a JPG, or remove the seal.`,
        code: "SEAL_IMAGE_UNAVAILABLE",
        details: signatory.sealImageError,
      });
    }

    // Fetch active conditions attached to this license (open / in_progress / overdue).
    const { data: condRows } = await admin
      .from("license_conditions")
      .select("category, description, due_date, status")
      .eq("license_id", license.id)
      .in("status", ["open", "in_progress", "overdue"])
      .order("created_at", { ascending: true });
    const conditions = ((condRows as any[]) || []).map(r => ({
      category: String(r.category || "Condition"),
      description: String(r.description || ""),
      due_date: r.due_date ? new Date(r.due_date).toLocaleDateString("en-GB") : null,
    }));

    let pdf: Uint8Array;
    try {
      pdf = await buildCertificatePdf({
        entityName,
        licenseType: license.license_type,
        licenseNumber: license.license_number,
        issueDate: new Date(license.issued_at).toLocaleDateString("en-GB"),
        expiryDate: license.valid_until ? new Date(license.valid_until).toLocaleDateString("en-GB") : "",
        status,
        statusEffectiveDate,
        signatory,
        cryptoSigned,
        conditions,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("SIGNATURE_IMAGE_EMBED_FAILED:")) {
        return json(req, 200, {
          error: "Configured signature image was loaded but could not be embedded in the PDF. Please upload a valid PNG or JPG signature image.",
          code: "SIGNATURE_IMAGE_EMBED_FAILED",
          details: msg.slice("SIGNATURE_IMAGE_EMBED_FAILED:".length),
        });
      }
      if (msg.startsWith("SEAL_IMAGE_EMBED_FAILED:")) {
        return json(req, 200, {
          error: "Configured seal image was loaded but could not be embedded in the PDF. Please upload a valid PNG or JPG seal image or remove it.",
          code: "SEAL_IMAGE_EMBED_FAILED",
          details: msg.slice("SEAL_IMAGE_EMBED_FAILED:".length),
        });
      }
      throw e;
    }

    const fingerprint = cryptoSigned ? await sha256Hex(pdf) : null;

    const { data: existing } = await admin
      .from("license_certificates").select("version").eq("license_id", license.id)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    const nextVersion = (existing?.version || 0) + 1;

    const filePath = `${license.id}/${license.license_number}-v${nextVersion}.pdf`;
    const { error: upErr } = await admin.storage
      .from("license-certificates")
      .upload(filePath, pdf, { contentType: "application/pdf", upsert: true });
    if (upErr) return json(req, 200, { error: upErr.message });

    const { data: certRow, error: insErr } = await admin
      .from("license_certificates")
      .insert({
        license_id: license.id,
        file_path: filePath,
        version: nextVersion,
        signatory_name: signatory.name || null,
        signatory_title: signatory.title || null,
        signature_fingerprint: fingerprint,
        is_signed: cryptoSigned,
        metadata: { entity_name: entityName, signatory_configured: signatory.configured, status, status_effective_date: statusEffectiveDate || null },
      })
      .select("id, file_path, version, is_signed")
      .single();
    if (insErr) return json(req, 200, { error: insErr.message });

    // Canonical registration in the central document register. The certificate
    // becomes one logical document per licence (new issues are new versions of
    // the same document), classified publication-eligible but NOT published and
    // never anonymously accessible. Registration failure never fails issuance.
    try {
      const { data: linked } = await admin
        .from("entity_licenses")
        .select("entity_id")
        .eq("license_id", license.id)
        .is("effective_to", null)
        .maybeSingle();
      const { error: dmsErr } = await admin.rpc("dms_register_certificate", {
        _license_id: license.id,
        _entity_id: linked?.entity_id ?? null,
        _bucket: "license-certificates",
        _storage_path: filePath,
        _file_name: `${license.license_number}-v${nextVersion}.pdf`,
        _file_size: pdf.byteLength ?? pdf.length ?? 0,
        _mime_type: "application/pdf",
        _version: nextVersion,
        _license_number: license.license_number,
      });
      if (dmsErr) console.error("dms_register_certificate failed:", dmsErr.message);
    } catch (e) {
      console.error("dms_register_certificate threw:", e instanceof Error ? e.message : e);
    }


    return json(req, 200, { success: true, certificate: certRow });
  } catch (err) {
    console.error("generate-license-certificate error:", err);
    return json(req, 200, { error: err instanceof Error ? err.message : "Internal error" });
  }
}

Deno.serve(handler);
