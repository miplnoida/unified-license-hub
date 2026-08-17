// Submission acknowledgement service (FRD 6.1).
//
// Responsibilities:
//   - `ensure`        : idempotently create the acknowledgement record for the
//                       CURRENT submission (application_id + submitted_at), render
//                       the acknowledgement PDF once, store it, and reconcile the
//                       real delivery state from the notification dispatch log.
//   - `reconcile`     : refresh the delivery state from the notification engine.
//   - `download_url`  : short-lived signed URL for the stored acknowledgement.
//
// Delivery state is NEVER invented here. It is derived from
// `notification_dispatch_log` rows written by the existing notification engine:
//   queued/processing/sent  -> DELIVERY_PENDING
//   delivered               -> DELIVERED
//   failed(smtp_not_configured) -> PROVIDER_NOT_CONFIGURED
//   failed(other)/skipped   -> DELIVERY_FAILED
//
// Refreshing the page cannot create duplicates: the acknowledgement row is
// unique per (application_id, submitted_at) and the PDF is rendered only when
// no document path is stored yet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const ACK_BUCKET = "documents";

const APPLICANT_EVENT_KEYS = [
  "application.submitted.applicant",
  "application.resubmitted.applicant",
];

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type AckRow = {
  id: string;
  application_id: string;
  submission_version: number;
  reference: string;
  applicant_name: string | null;
  applicant_email: string | null;
  entity_name: string | null;
  license_type: string | null;
  submitted_at: string;
  is_resubmission: boolean;
  ack_text: string | null;
  document_bucket: string | null;
  document_path: string | null;
  document_checksum: string | null;
  status: string;
  provider: string | null;
  provider_message_id: string | null;
  failure_reason: string | null;
  retry_count: number;
  delivered_at: string | null;
};

async function buildAcknowledgementPdf(opts: {
  ack: AckRow;
  appName: string;
  sectorPath: string;
  currentStep: string;
}): Promise<Uint8Array> {
  const { ack } = opts;
  const doc = await PDFDocument.create();
  doc.setTitle(`Submission Acknowledgement — ${ack.reference}`);
  doc.setSubject("Application submission acknowledgement");

  const page = doc.addPage([595, 842]); // A4 portrait
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.05, 0.12, 0.36);
  const grey = rgb(0.38, 0.4, 0.45);

  page.drawRectangle({ x: 0, y: height - 110, width, height: 110, color: navy });
  page.drawText(opts.appName, { x: 45, y: height - 55, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Submission Acknowledgement", { x: 45, y: height - 80, size: 12, font, color: rgb(0.85, 0.9, 1) });

  let y = height - 155;
  const row = (label: string, value: string) => {
    page.drawText(label.toUpperCase(), { x: 45, y, size: 8, font: bold, color: grey });
    const lines = String(value || "—").match(/.{1,58}/g) || ["—"];
    let ly = y - 14;
    for (const line of lines) {
      page.drawText(line, { x: 45, y: ly, size: 11, font, color: rgb(0.1, 0.1, 0.12) });
      ly -= 14;
    }
    y = ly - 10;
  };

  page.drawText(
    ack.is_resubmission
      ? "Your application resubmission has been received and recorded."
      : "Your application has been received and recorded.",
    { x: 45, y, size: 12, font: bold, color: navy },
  );
  y -= 32;

  row("Application reference", ack.reference);
  row("Submitted at (UTC)", new Date(ack.submitted_at).toISOString().replace("T", " ").slice(0, 19));
  row("Applicant / entity", ack.entity_name || ack.applicant_name || "—");
  row("Applicant contact", ack.applicant_email || "—");
  row("Licence / service", [ack.license_type, opts.sectorPath].filter(Boolean).join(" — ") || "—");

  page.drawText(
    "This acknowledgement confirms receipt only. It is not a decision, approval, or licence.",
    { x: 45, y: 90, size: 9, font, color: grey },
  );
  page.drawText(
    `Generated ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC — system generated document`,
    { x: 45, y: 74, size: 8, font, color: grey },
  );

  return await doc.save();
}

/** Derive the honest delivery state from the notification engine's own log. */
function mapDispatchRowsToState(rows: Array<{ status: string; error: string | null; delivered_at: string | null; provider: string | null; provider_message_id: string | null }>) {
  if (rows.length === 0) {
    return { status: "DELIVERY_PENDING", provider: null as string | null, providerMessageId: null as string | null, failureReason: null as string | null };
  }
  const delivered = rows.find((r) => r.status === "delivered" || !!r.delivered_at);
  if (delivered) {
    return { status: "DELIVERED", provider: delivered.provider, providerMessageId: delivered.provider_message_id, failureReason: null };
  }
  const inFlight = rows.find((r) => ["queued", "processing", "sent", "retrying"].includes(r.status));
  if (inFlight) {
    return { status: "DELIVERY_PENDING", provider: inFlight.provider, providerMessageId: inFlight.provider_message_id, failureReason: null };
  }
  const notConfigured = rows.find((r) => (r.error || "").includes("smtp_not_configured"));
  if (notConfigured) {
    return { status: "PROVIDER_NOT_CONFIGURED", provider: null, providerMessageId: null, failureReason: "smtp_not_configured" };
  }
  const failed = rows.find((r) => r.status === "failed" || r.status === "skipped");
  if (failed) {
    return { status: "DELIVERY_FAILED", provider: failed.provider, providerMessageId: null, failureReason: failed.error || "delivery_failed" };
  }
  return { status: "DELIVERY_PENDING", provider: null, providerMessageId: null, failureReason: null };
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json(req, 401, { error: "Missing authorization header" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json(req, 401, { error: "Invalid or expired token" });

    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "ensure");
    const applicationId: string | undefined = body?.application_id;
    if (!applicationId) return json(req, 400, { error: "application_id is required" });

    // Access control: reuse the canonical DB predicate. No UI-only gating.
    const { data: canRead, error: aclErr } = await admin.rpc("can_read_application", {
      _user: user.id,
      _application_id: applicationId,
    } as never);
    if (aclErr) return json(req, 403, { error: "Access check failed" });
    if (canRead !== true) return json(req, 403, { error: "You do not have access to this application" });

    const { data: app } = await admin
      .from("applications")
      .select("id, application_number, applicant_id, license_type, status, submitted_at, current_step_id, data, ack_text")
      .eq("id", applicationId)
      .maybeSingle();
    if (!app) return json(req, 404, { error: "Application not found" });
    if (!app.submitted_at) return json(req, 200, { acknowledgement: null, reason: "NOT_SUBMITTED" });

    // ---------- download_url ----------
    if (action === "download_url") {
      const { data: ackRow } = await admin
        .from("application_acknowledgements")
        .select("*")
        .eq("application_id", applicationId)
        .order("submission_version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const ack = ackRow as AckRow | null;
      if (!ack?.document_path) return json(req, 404, { error: "No acknowledgement document available" });
      const { data: signed, error: signErr } = await admin.storage
        .from(ack.document_bucket || ACK_BUCKET)
        .createSignedUrl(ack.document_path, 300);
      if (signErr || !signed?.signedUrl) return json(req, 200, { error: signErr?.message || "Failed to sign URL" });
      return json(req, 200, { url: signed.signedUrl, filename: `acknowledgement-${ack.reference}-v${ack.submission_version}.pdf` });
    }

    // ---------- ensure / reconcile ----------
    const appData = (app.data as Record<string, unknown> | null) || {};
    const [profile, preUser, sectorRow, subSectorRow, categoryRow, siteRow] = await Promise.all([
      admin.from("profiles").select("email, full_name").eq("id", app.applicant_id).maybeSingle(),
      admin.from("pre_license_users").select("email, full_name").eq("id", app.applicant_id).maybeSingle(),
      appData.sector_id ? admin.from("sectors").select("name").eq("id", appData.sector_id as string).maybeSingle() : Promise.resolve({ data: null }),
      appData.sub_sector_id ? admin.from("sub_sectors").select("name").eq("id", appData.sub_sector_id as string).maybeSingle() : Promise.resolve({ data: null }),
      appData.category_id ? admin.from("categories").select("name").eq("id", appData.category_id as string).maybeSingle() : Promise.resolve({ data: null }),
      admin.from("site_settings").select("value").eq("key", "site_config").maybeSingle(),
    ]);

    const applicantEmail = (profile.data as any)?.email || (preUser.data as any)?.email || null;
    const applicantName = (profile.data as any)?.full_name || (preUser.data as any)?.full_name || null;
    const entityName =
      (appData.entity_name as string)
      || (appData.company_name as string)
      || applicantName;
    const appNameSetting = ((siteRow.data as any)?.value?.app_name as string) || "Unified License Hub";
    const sectorPath = [
      (sectorRow.data as any)?.name,
      (subSectorRow.data as any)?.name,
      (categoryRow.data as any)?.name,
    ].filter(Boolean).join(" / ");

    const isResubmission = Number(appData.resubmission_count || 0) > 0
      || !!appData.resubmission_comments
      || !!appData.resubmitted_at;

    let ack: AckRow | null = null;

    if (action === "ensure") {
      const { data: ensured, error: ensureErr } = await admin.rpc("ensure_submission_acknowledgement", {
        _application_id: applicationId,
        _ack_text: (app as any).ack_text ?? null,
        _applicant_name: applicantName,
        _applicant_email: applicantEmail,
        _entity_name: entityName,
        _is_resubmission: isResubmission,
      } as never);
      if (ensureErr) return json(req, 200, { error: ensureErr.message });
      const result = (ensured || {}) as Record<string, unknown>;
      if (result.error) return json(req, 200, { error: result.error, code: result.code });
      ack = result.acknowledgement as AckRow;
    } else {
      const { data: existing } = await admin
        .from("application_acknowledgements")
        .select("*")
        .eq("application_id", applicationId)
        .eq("submitted_at", app.submitted_at)
        .maybeSingle();
      ack = (existing as AckRow | null);
      if (!ack) return json(req, 200, { acknowledgement: null, reason: "NOT_GENERATED" });
    }

    // Render the document exactly once per acknowledgement record.
    if (ack && !ack.document_path) {
      let currentStep = "";
      if (app.current_step_id) {
        const { data: step } = await admin.from("approval_steps").select("name").eq("id", app.current_step_id).maybeSingle();
        currentStep = (step as any)?.name || "";
      }
      try {
        const pdf = await buildAcknowledgementPdf({ ack, appName: appNameSetting, sectorPath, currentStep });
        const checksum = await sha256Hex(pdf);
        const path = `acknowledgements/${applicationId}/v${ack.submission_version}.pdf`;
        const { error: upErr } = await admin.storage
          .from(ACK_BUCKET)
          .upload(path, pdf, { contentType: "application/pdf", upsert: true });
        if (upErr) throw upErr;
        const { data: stateRes } = await admin.rpc("set_acknowledgement_delivery_state", {
          _acknowledgement_id: ack.id,
          _status: ack.status,
          _document_bucket: ACK_BUCKET,
          _document_path: path,
          _document_checksum: checksum,
        } as never);
        const updated = (stateRes as Record<string, unknown>)?.acknowledgement as AckRow | undefined;
        if (updated) ack = updated;
      } catch (e) {
        console.error("[acknowledgement] pdf/storage failed (non-fatal):", e instanceof Error ? e.message : e);
      }
    }

    // Reconcile the real delivery state from the notification engine.
    if (ack) {
      const { data: logs } = await admin
        .from("notification_dispatch_log")
        .select("status, error, delivered_at, provider, provider_message_id, created_at, channel, event_key")
        .eq("entity_type", "application")
        .eq("entity_id", applicationId)
        .in("event_key", APPLICANT_EVENT_KEYS)
        .eq("channel", "email")
        .order("created_at", { ascending: false })
        .limit(20);

      const mapped = mapDispatchRowsToState(((logs as any[]) || []).map((r) => ({
        status: String(r.status),
        error: r.error ?? null,
        delivered_at: r.delivered_at ?? null,
        provider: r.provider ?? null,
        provider_message_id: r.provider_message_id ?? null,
      })));

      if (mapped.status !== ack.status || (mapped.providerMessageId && mapped.providerMessageId !== ack.provider_message_id)) {
        const { data: stateRes } = await admin.rpc("set_acknowledgement_delivery_state", {
          _acknowledgement_id: ack.id,
          _status: mapped.status,
          _provider: mapped.provider,
          _provider_message_id: mapped.providerMessageId,
          _failure_reason: mapped.failureReason,
        } as never);
        const updated = (stateRes as Record<string, unknown>)?.acknowledgement as AckRow | undefined;
        if (updated) ack = updated;
      }
    }

    return json(req, 200, { acknowledgement: ack });
  } catch (err) {
    return json(req, 500, { error: err instanceof Error ? err.message : "Internal server error" });
  }
});
