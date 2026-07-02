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
  signatory: SignatoryConfig;
  cryptoSigned: boolean;
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
  const value = (text: string, x: number, yy: number) =>
    page.drawText(text, { x, y: yy, size: 13, font, color: rgb(0, 0, 0) });

  label("License Number", leftX, y); value(opts.licenseNumber, leftX, y - 18);
  label("Issue Date", rightX, y); value(opts.issueDate, rightX, y - 18);
  y -= 60;
  label("Expiry Date", leftX, y); value(opts.expiryDate || "No Expiry", leftX, y - 18);
  label("Status", rightX, y); value("Active", rightX, y - 18);

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
    page.drawText("Digitally signed", {
      x: 80, y: 60, size: 9, font: bold, color: rgb(0.09, 0.64, 0.29),
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    let body: any;
    try { body = await req.json(); } catch { body = {}; }
    const mode: "generate" | "download" = body.mode || "generate";
    const licenseId: string | undefined = body.license_id;
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
      .select("id, license_number, license_type, issued_at, valid_until, holder_id, application_id")
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

    let pdf: Uint8Array;
    try {
      pdf = await buildCertificatePdf({
        entityName,
        licenseType: license.license_type,
        licenseNumber: license.license_number,
        issueDate: new Date(license.issued_at).toLocaleDateString("en-GB"),
        expiryDate: license.valid_until ? new Date(license.valid_until).toLocaleDateString("en-GB") : "",
        signatory,
        cryptoSigned,
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
        metadata: { entity_name: entityName, signatory_configured: signatory.configured },
      })
      .select("id, file_path, version, is_signed")
      .single();
    if (insErr) return json(req, 200, { error: insErr.message });

    return json(req, 200, { success: true, certificate: certRow });
  } catch (err) {
    console.error("generate-license-certificate error:", err);
    return json(req, 200, { error: err instanceof Error ? err.message : "Internal error" });
  }
}

Deno.serve(handler);
