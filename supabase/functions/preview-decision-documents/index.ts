// Decision-time document preview for licensing approvers.
//
// Renders a DRAFT (watermarked) licence certificate PDF from a pending
// application so an approver can see exactly what will be issued before the
// decision is committed. Strictly read-only: nothing is uploaded to storage and
// no `license_certificates` row is created. The live post-issue certificate flow
// (`generate-license-certificate`) is untouched.
//
// Request:  { application_id, outcome?, conditions?: string[] }
// Response: { success: true, pdf_base64, filename, meta } | { error }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, degrees, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { requireUserPermission } from "../_shared/authz.ts";

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

type Signatory = { name: string; title: string; configured: boolean };

async function loadSignatory(admin: ReturnType<typeof createClient>): Promise<Signatory> {
  const { data } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", "license_certificate_signatory")
    .maybeSingle();
  const value = (data?.value || {}) as Record<string, unknown>;
  if (value && value.is_active === true && value.name && value.title) {
    return { name: String(value.name), title: String(value.title), configured: true };
  }
  return {
    name: Deno.env.get("LICENSE_SIGNATORY_NAME") || "",
    title: Deno.env.get("LICENSE_SIGNATORY_TITLE") || "",
    configured: false,
  };
}

async function buildDraftCertificate(opts: {
  entityName: string;
  licenseType: string;
  applicationNumber: string;
  previewDate: string;
  validityNote: string;
  signatory: Signatory;
  conditions: string[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`DRAFT License Certificate — ${opts.applicationNumber}`);
  doc.setSubject("Draft license certificate preview (not valid for issue)");

  const page = doc.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.05, 0.12, 0.36);

  page.drawRectangle({ x: 30, y: 30, width: width - 60, height: height - 60, borderColor: rgb(0.12, 0.23, 0.54), borderWidth: 3 });
  page.drawRectangle({ x: 40, y: 40, width: width - 80, height: height - 80, borderColor: rgb(0.09, 0.64, 0.29), borderWidth: 1 });

  const center = (text: string, size: number, y: number, useBold = false, color = navy) => {
    const f = useBold ? bold : font;
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font: f, color });
  };

  center("LICENSE CERTIFICATE", 28, height - 100, true);
  center("Issued by the Regulatory Authority", 12, height - 125);
  center("DRAFT PREVIEW — NOT VALID FOR ISSUE", 11, height - 145, true, rgb(0.75, 0.1, 0.1));

  center("This is to certify that", 13, height - 190);
  center(opts.entityName, 22, height - 225, true);
  center("is licensed to operate as a", 13, height - 258);
  center(opts.licenseType, 18, height - 283, true);

  const leftX = 120;
  const rightX = width / 2 + 60;
  let y = height - 345;
  const label = (text: string, x: number, yy: number) =>
    page.drawText(text, { x, y: yy, size: 11, font: bold, color: rgb(0.3, 0.3, 0.3) });
  const value = (text: string, x: number, yy: number, color = rgb(0, 0, 0)) =>
    page.drawText(text, { x, y: yy, size: 13, font, color });

  label("License Number", leftX, y);
  value("To be assigned on issue", leftX, y - 18, rgb(0.4, 0.4, 0.4));
  label("Application Number", rightX, y);
  value(opts.applicationNumber, rightX, y - 18);
  y -= 58;
  label("Validity", leftX, y);
  value(opts.validityNote, leftX, y - 18, rgb(0.4, 0.4, 0.4));
  label("Preview Generated", rightX, y);
  value(opts.previewDate, rightX, y - 18);

  // Watermark
  const wm = "PREVIEW";
  const wmSize = 130;
  const wmWidth = bold.widthOfTextAtSize(wm, wmSize);
  page.drawText(wm, {
    x: (width - wmWidth) / 2 + 110,
    y: height / 2 - 130,
    size: wmSize,
    font: bold,
    color: rgb(0.85, 0.1, 0.1),
    opacity: 0.16,
    rotate: degrees(-30),
  });

  // Signatory block
  const blockRight = width - 80;
  const blockLeft = width - 280;
  const lineY = 130;
  page.drawLine({ start: { x: blockLeft, y: lineY }, end: { x: blockRight, y: lineY }, thickness: 1, color: rgb(0, 0, 0) });
  if (opts.signatory.configured && opts.signatory.name) {
    page.drawText(opts.signatory.name, { x: blockLeft, y: lineY - 18, size: 12, font: bold });
    page.drawText(opts.signatory.title, { x: blockLeft, y: lineY - 33, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText("Authorized Signatory", { x: blockLeft, y: lineY - 48, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  } else {
    page.drawText("Authorized signatory not configured", { x: blockLeft, y: lineY - 18, size: 10, font, color: rgb(0.55, 0.55, 0.55) });
  }
  page.drawText("Signature, seal and licence number are applied when the licence is issued.", {
    x: 70, y: 58, size: 9, font, color: rgb(0.45, 0.45, 0.45),
  });

  // Draft conditions page
  const conditions = opts.conditions.filter((c) => c.trim().length > 0);
  if (conditions.length > 0) {
    const p2 = doc.addPage([842, 595]);
    const { width: w2, height: h2 } = p2.getSize();
    p2.drawRectangle({ x: 30, y: 30, width: w2 - 60, height: h2 - 60, borderColor: rgb(0.12, 0.23, 0.54), borderWidth: 2 });
    const centerP2 = (text: string, size: number, yy: number, useBold = false, color = navy) => {
      const f = useBold ? bold : font;
      const wt = f.widthOfTextAtSize(text, size);
      p2.drawText(text, { x: (w2 - wt) / 2, y: yy, size, font: f, color });
    };
    centerP2("DRAFT LICENSE CONDITIONS", 22, h2 - 80, true);
    centerP2(`Proposed for application ${opts.applicationNumber}`, 11, h2 - 105);

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

    let yy = h2 - 150;
    conditions.forEach((text, idx) => {
      if (yy < 80) return;
      p2.drawText(`${idx + 1}.`, { x: 60, y: yy, size: 11, font: bold, color: rgb(0.09, 0.5, 0.2) });
      wrap(text, 10, w2 - 160).slice(0, 5).forEach((line) => {
        p2.drawText(line, { x: 82, y: yy, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
        yy -= 13;
      });
      yy -= 8;
    });
  }

  return await doc.save();
}

export async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const __authzGate = await requireUserPermission(req, "application_management", "approve");
  if (!__authzGate.ok) return __authzGate.response;

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    let body: any;
    try { body = await req.json(); } catch { body = {}; }
    const applicationId: string | undefined = body.application_id;
    if (!applicationId || typeof applicationId !== "string") {
      return json(req, 200, { error: "application_id is required" });
    }
    const conditions: string[] = Array.isArray(body.conditions)
      ? body.conditions.map((c: unknown) => String(c)).slice(0, 25)
      : [];

    const { data: app, error: appErr } = await admin
      .from("applications")
      .select("id, application_number, applicant_id, license_type, status, data, submitted_at")
      .eq("id", applicationId)
      .maybeSingle();
    if (appErr || !app) return json(req, 200, { error: "Application not found" });

    const appData = ((app as any).data || {}) as Record<string, any>;

    // Entity name: application payload first, then the applicant account.
    let entityName =
      appData.entity_name || appData.company_name || appData.applicant_name ||
      appData.institution_name || appData.business_name || "";
    if (!entityName && (app as any).applicant_id) {
      const [{ data: profile }, { data: preUser }] = await Promise.all([
        admin.from("profiles").select("full_name, email").eq("id", (app as any).applicant_id).maybeSingle(),
        admin.from("pre_license_users").select("full_name, email").eq("id", (app as any).applicant_id).maybeSingle(),
      ]);
      entityName =
        (profile as any)?.full_name || (preUser as any)?.full_name ||
        (profile as any)?.email || (preUser as any)?.email || "";
    }
    if (!entityName) entityName = "Applicant name not recorded";

    const licenseType = String((app as any).license_type || appData.license_type || "License type not recorded");
    const signatory = await loadSignatory(admin);

    const pdf = await buildDraftCertificate({
      entityName: String(entityName),
      licenseType,
      applicationNumber: String((app as any).application_number || "—"),
      previewDate: new Date().toLocaleDateString("en-GB"),
      validityNote: "Determined on issue",
      signatory,
      conditions,
    });

    return json(req, 200, {
      success: true,
      pdf_base64: toBase64(pdf),
      filename: `DRAFT-certificate-${(app as any).application_number || applicationId}.pdf`,
      meta: {
        entity_name: entityName,
        license_type: licenseType,
        application_number: (app as any).application_number ?? null,
        signatory_configured: signatory.configured,
        signatory_name: signatory.name || null,
        signatory_title: signatory.title || null,
        outcome: body.outcome ?? null,
        conditions_count: conditions.length,
      },
    });
  } catch (err) {
    console.error("preview-decision-documents error:", err);
    return json(req, 200, { error: err instanceof Error ? err.message : "Internal error" });
  }
}

Deno.serve(handler);
