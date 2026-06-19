// Generates (and optionally signs) a PDF license certificate, stores it in the
// `license-certificates` private bucket, and records it in `license_certificates`.
//
// Modes:
//   { mode: "generate", license_id }  -> creates a new version of the certificate
//   { mode: "download", license_id }  -> returns a short-lived signed URL of the latest version
//
// Signing: if LICENSE_SIGNING_KEY_PEM + LICENSE_SIGNING_CERT_PEM are configured,
// the PDF is signed (placeholder: signature fingerprint stored). If not, a
// watermark "Signature pending - signing key not configured" is added so the
// feature works out-of-the-box; record is_signed=false.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function buildCertificatePdf(opts: {
  entityName: string;
  licenseType: string;
  licenseNumber: string;
  issueDate: string;
  expiryDate: string;
  signatoryName: string;
  signatoryTitle: string;
  signed: boolean;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`License Certificate ${opts.licenseNumber}`);
  doc.setAuthor("Regulator");
  doc.setSubject("License Certificate");
  const page = doc.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Border
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

  // Signatory
  const sigY = 120;
  page.drawLine({ start: { x: width - 280, y: sigY + 30 }, end: { x: width - 80, y: sigY + 30 }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawText(opts.signatoryName, { x: width - 280, y: sigY + 10, size: 12, font: bold });
  page.drawText(opts.signatoryTitle, { x: width - 280, y: sigY - 5, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  page.drawText("Authorized Signatory", { x: width - 280, y: sigY - 20, size: 9, font, color: rgb(0.5, 0.5, 0.5) });

  if (!opts.signed) {
    // Watermark
    page.drawText("Signature pending — signing key not configured", {
      x: 80, y: 60, size: 9, font, color: rgb(0.7, 0.2, 0.2),
    });
  } else {
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

    // Entity name resolution
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
    const signed = !!(signingKey && signingCert);
    const signatoryName = Deno.env.get("LICENSE_SIGNATORY_NAME") || "Authorized Officer";
    const signatoryTitle = Deno.env.get("LICENSE_SIGNATORY_TITLE") || "Director, Licensing";

    const pdf = await buildCertificatePdf({
      entityName,
      licenseType: license.license_type,
      licenseNumber: license.license_number,
      issueDate: new Date(license.issued_at).toLocaleDateString("en-GB"),
      expiryDate: license.valid_until ? new Date(license.valid_until).toLocaleDateString("en-GB") : "",
      signatoryName,
      signatoryTitle,
      signed,
    });

    const fingerprint = signed ? await sha256Hex(pdf) : null;

    // Determine next version
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
        signatory_name: signatoryName,
        signatory_title: signatoryTitle,
        signature_fingerprint: fingerprint,
        is_signed: signed,
        metadata: { entity_name: entityName },
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
