// Document Intelligence extraction.
//
// Body: { file_upload_id: string, preset?: string, source_type?, source_id? }
//
// Loads the file from file_uploads, mints a short-lived signed URL, calls
// Lovable AI Gateway (google/gemini-2.5-flash multimodal) with a preset
// instruction, and stores the structured JSON result on document_extractions.
//
// Presets: 'generic' | 'financial_statement' | 'id_document' | 'certificate'
// | 'invoice' | 'compliance_return'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logIntegration } from "../_shared/integration-log.ts";
import { requireUserPermission } from "../_shared/authz.ts";

const PRESET_PROMPTS: Record<string, string> = {
  generic:
    "Extract every material fact from this document as a JSON object. Include a `document_type` guess, a short `summary`, a `key_fields` object with the most important labeled values, and a `parties` array (name + role) if any. Respond with JSON only, no prose.",
  financial_statement:
    "This is a regulated entity's financial statement. Extract JSON with: reporting_period, currency, entity_name, total_assets, total_liabilities, total_equity, gross_premium, net_premium, net_income, capital_adequacy_ratio (if present), and a `line_items` array of {label, value}. Numbers as plain numbers. Respond with JSON only.",
  id_document:
    "This is an identity or KYC document. Extract JSON with: document_type, id_number, full_name, date_of_birth, nationality, issue_date, expiry_date, issuing_authority. Respond with JSON only.",
  certificate:
    "This is a certificate (education, professional, or corporate). Extract JSON with: certificate_type, holder_name, issuer, issue_date, expiry_date (if any), reference_number, subject_or_award. Respond with JSON only.",
  invoice:
    "This is an invoice or receipt. Extract JSON with: vendor, invoice_number, invoice_date, due_date, currency, subtotal, tax, total, and a `line_items` array of {description, qty, unit_price, amount}. Respond with JSON only.",
  compliance_return:
    "This is a supervisory compliance return. Extract JSON with: return_period, licensee_name, submission_date, and a `metrics` object of {label: value} for every disclosed metric or ratio. Respond with JSON only.",
};

function extractJson(text: string): any {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  try {
    return JSON.parse(raw);
  } catch {
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    if (s >= 0 && e > s) {
      try { return JSON.parse(raw.slice(s, e + 1)); } catch { /* fallthrough */ }
    }
    return null;
  }
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  const __authzGate = await requireUserPermission(req, "document_management", "upload");
  if (!__authzGate.ok) return __authzGate.response;
  const cors = buildCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "LOVABLE_API_KEY not configured" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Identity comes from the gate's verified token claims. A second
    // auth.getUser() round-trip can fail with "session not found" after a
    // refresh-token rotation and would surface as a bogus 401.
    const userId = __authzGate.userId;

    const admin = createClient(SUPABASE_URL, SERVICE);

    const { file_upload_id, preset = "generic", source_type, source_id } = await req.json();
    if (!file_upload_id) {
      return new Response(JSON.stringify({ ok: false, error: "file_upload_id required" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { data: file, error: fErr } = await admin
      .from("file_uploads")
      .select("id, file_name, file_path, mime_type, bucket_name")
      .eq("id", file_upload_id)
      .maybeSingle();
    if (fErr || !file) {
      return new Response(JSON.stringify({ ok: false, error: "file not found" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Create the extraction row
    const { data: row, error: insErr } = await admin
      .from("document_extractions")
      .insert({
        file_upload_id,
        source_type: source_type || null,
        source_id: source_id || null,
        preset,
        status: "processing",
        requested_by: userId,
      })
      .select("id")
      .single();
    if (insErr) {
      return new Response(JSON.stringify({ ok: false, error: insErr.message }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const extractionId = row.id;

    // Sign a URL for the model
    const bucket = (file as any).bucket_name || "secure-files";
    const { data: signed, error: sErr } = await admin
      .storage.from(bucket)
      .createSignedUrl((file as any).file_path, 60 * 15);
    if (sErr || !signed?.signedUrl) {
      await admin.from("document_extractions").update({ status: "failed", error: sErr?.message || "sign failed" }).eq("id", extractionId);
      return new Response(JSON.stringify({ ok: false, error: sErr?.message || "sign failed" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const mime = (file as any).mime_type || "application/octet-stream";
    const isImage = mime.startsWith("image/");
    const isPdf = mime === "application/pdf" || (file as any).file_name?.toLowerCase().endsWith(".pdf");

    const instruction = PRESET_PROMPTS[preset] || PRESET_PROMPTS.generic;
    const model = "google/gemini-2.5-flash";

    const contentParts: any[] = [
      { type: "text", text: instruction + "\n\nFile name: " + (file as any).file_name },
    ];
    if (isImage) {
      contentParts.push({ type: "image_url", image_url: { url: signed.signedUrl } });
    } else if (isPdf) {
      // For PDF we fetch and inline as base64 file part (Gemini via OpenRouter chat).
      const resp = await fetch(signed.signedUrl);
      const buf = new Uint8Array(await resp.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      contentParts.push({
        type: "file",
        file: { filename: (file as any).file_name || "document.pdf", file_data: `data:application/pdf;base64,${b64}` },
      });
    } else {
      // Fallback: try to read as text
      const resp = await fetch(signed.signedUrl);
      const txt = await resp.text();
      contentParts.push({ type: "text", text: "Document contents:\n\n" + txt.slice(0, 40_000) });
    }

    const gwStarted = Date.now();
    let gwResp: Response;
    try {
      gwResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You are a precise document extraction engine. You output JSON only." },
            { role: "user", content: contentParts },
          ],
        }),
      });
    } catch (e: any) {
      await admin.from("document_extractions").update({ status: "failed", error: String(e?.message || e) }).eq("id", extractionId);
      await logIntegration(admin, {
        direction: "outbound",
        integrationKey: "ai-gateway.document-extract",
        status: "failure",
        actorId: userId,
        entityType: "document_extraction",
        entityId: extractionId,
        error: String(e?.message || e),
        durationMs: Date.now() - gwStarted,
      });
      return new Response(JSON.stringify({ ok: false, error: e?.message || "gateway error" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (!gwResp.ok) {
      const txt = await gwResp.text();
      const msg = gwResp.status === 429
        ? "Rate limit exceeded, please retry later"
        : gwResp.status === 402
          ? "AI credits exhausted"
          : `gateway ${gwResp.status}: ${txt.slice(0, 300)}`;
      await admin.from("document_extractions").update({ status: "failed", error: msg, model }).eq("id", extractionId);
      await logIntegration(admin, {
        direction: "outbound",
        integrationKey: "ai-gateway.document-extract",
        status: "failure",
        httpStatus: gwResp.status,
        actorId: userId,
        entityType: "document_extraction",
        entityId: extractionId,
        error: msg,
        durationMs: Date.now() - gwStarted,
      });
      return new Response(JSON.stringify({ ok: false, error: msg }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const json = await gwResp.json();
    const text: string = json?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(text);
    const usage = json?.usage || {};

    await admin.from("document_extractions").update({
      status: parsed ? "completed" : "failed",
      extracted: parsed,
      raw_text: text,
      model,
      input_tokens: usage.prompt_tokens || null,
      output_tokens: usage.completion_tokens || null,
      error: parsed ? null : "Model did not return valid JSON",
    }).eq("id", extractionId);

    await logIntegration(admin, {
      direction: "outbound",
      integrationKey: "ai-gateway.document-extract",
      status: parsed ? "success" : "failure",
      actorId: userId,
      entityType: "document_extraction",
      entityId: extractionId,
      error: parsed ? null : "Model did not return valid JSON",
      durationMs: Date.now() - gwStarted,
    });

    return new Response(JSON.stringify({ ok: true, extraction_id: extractionId, extracted: parsed }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("document-extract error", e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message || "unknown" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
