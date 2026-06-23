// Advisory AI Analyst Assessment generator.
//
// Behavior:
//   - Accepts { application_id } in body.
//   - Authorized for either the service role (fire-and-forget from
//     verify-and-submit) OR an internal staff user (manual retry from
//     the analyst UI).
//   - Loads application data + deterministic rule-check snapshot.
//   - Calls the Lovable AI gateway and writes findings/risks/routing
//     recommendation into application_ai_assessments.
//   - Never mutates application state or workflow state.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROMPT_VERSION = "v1";
const MODEL_PROVIDER = "lovable-ai-gateway";
const MODEL_NAME = "google/gemini-2.5-flash";

const INTERNAL_ROLES = new Set([
  "super_admin",
  "admin",
  "supervisor",
  "analyst",
  "licensing_officer",
]);

type RuleCheckSnapshot = {
  has_completed_payment: boolean;
  payment_summary: Record<string, unknown> | null;
  has_submitted_forms: boolean;
  submitted_form_count: number;
  has_required_documents: boolean | null;
  document_count: number;
  application_status: string | null;
  is_resubmission: boolean;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeParseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const stripped = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Try to recover the first {...} block.
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const aiKey = Deno.env.get("LOVABLE_API_KEY");

  const adminClient = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();

    let callerIsServiceRole = false;
    let callerUserId: string | null = null;

    if (bearer && bearer === serviceKey) {
      callerIsServiceRole = true;
    } else if (authHeader) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      callerUserId = userData.user.id;

      // Require internal role for non-service-role callers.
      const { data: roles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", callerUserId);
      const hasInternal = (roles ?? []).some((r: { role: string }) =>
        INTERNAL_ROLES.has(r.role),
      );
      if (!hasInternal) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }
    } else {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    let body: { application_id?: string; assessment_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    const application_id = body.application_id;
    const inboundAssessmentId = body.assessment_id || null;
    if (!application_id || typeof application_id !== "string") {
      return jsonResponse({ error: "application_id is required" }, 400);
    }

    // Load application + adjacent data using the service role client.
    const { data: app, error: appErr } = await adminClient
      .from("applications")
      .select("*")
      .eq("id", application_id)
      .maybeSingle();
    if (appErr || !app) {
      return jsonResponse({ error: "Application not found" }, 404);
    }

    const appData = (app.data as Record<string, unknown> | null) || {};
    const sectorId = (appData.sector_id as string | undefined) || null;
    const subSectorId = (appData.sub_sector_id as string | undefined) || null;
    const categoryId = (appData.category_id as string | undefined) || null;
    const serviceId = (appData.service_id as string | undefined) || null;

    // Documents: load defensively. The legacy `documents.application_id`
    // column may or may not exist depending on schema history; try the OR
    // query first and fall back to entity-only if it fails.
    let legacyDocsList: Array<Record<string, unknown>> = [];
    try {
      const r = await adminClient
        .from("documents")
        .select("id, file_name, document_type, file_size, mime_type, created_at, entity_type, entity_id, application_id")
        .or(
          `application_id.eq.${application_id},and(entity_type.eq.application,entity_id.eq.${application_id})`,
        );
      if (r.error) throw r.error;
      legacyDocsList = (r.data as Array<Record<string, unknown>>) || [];
    } catch (e) {
      console.warn(
        "[ai-assessment] documents OR query failed, falling back to entity-only:",
        e instanceof Error ? e.message : e,
      );
      const r2 = await adminClient
        .from("documents")
        .select("id, file_name, document_type, file_size, mime_type, created_at, entity_type, entity_id")
        .eq("entity_type", "application")
        .eq("entity_id", application_id);
      legacyDocsList = (r2.data as Array<Record<string, unknown>>) || [];
    }

    const [
      sectorRow,
      subSectorRow,
      categoryRow,
      serviceRow,
      submittedForms,
      secureDocuments,
      payments,
    ] = await Promise.all([
      sectorId
        ? adminClient.from("sectors").select("name").eq("id", sectorId).maybeSingle()
        : Promise.resolve({ data: null }),
      subSectorId
        ? adminClient.from("sub_sectors").select("name").eq("id", subSectorId).maybeSingle()
        : Promise.resolve({ data: null }),
      categoryId
        ? adminClient.from("categories").select("name").eq("id", categoryId).maybeSingle()
        : Promise.resolve({ data: null }),
      serviceId
        ? adminClient.from("services").select("name").eq("id", serviceId).maybeSingle()
        : Promise.resolve({ data: null }),
      adminClient
        .from("form_responses")
        .select("id, template_id, response_data, submitted_at, status")
        .eq("entity_type", "application")
        .eq("entity_id", application_id),
      adminClient
        .from("file_uploads")
        .select("id, file_name, file_size, mime_type, created_at")
        .eq("entity_type", "application")
        .eq("entity_id", application_id),
      adminClient
        .from("payments")
        .select("id, amount, currency, status, created_at")
        .eq("application_id", application_id),
    ]);

    const submittedFormsList = (submittedForms.data as unknown[]) || [];
    const secureDocsList = (secureDocuments.data as Array<Record<string, unknown>>) || [];

    // Merge + de-duplicate by (source,id).
    const mergedRaw: Array<Record<string, unknown>> = [
      ...legacyDocsList.map((d) => ({ ...d, source: "documents" })),
      ...secureDocsList.map((d) => ({ ...d, source: "file_uploads" })),
    ];
    const seenKey = new Set<string>();
    const documentsList: Array<Record<string, unknown>> = [];
    for (const d of mergedRaw) {
      const key = `${d.source}:${d.id}`;
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      documentsList.push(d);
    }

    console.log(
      "[ai-assessment] doc counts legacy=", legacyDocsList.length,
      "secure=", secureDocsList.length,
      "merged=", documentsList.length,
    );

    const paymentsList = (payments.data as Array<Record<string, unknown>>) || [];
    const completedPayment = paymentsList.find((p) =>
      ["completed", "success", "paid"].includes(String(p.status || "").toLowerCase()),
    );

    const ruleCheckSnapshot: RuleCheckSnapshot = {
      has_completed_payment: !!completedPayment,
      payment_summary: completedPayment
        ? {
            amount: completedPayment.amount,
            currency: completedPayment.currency,
            status: completedPayment.status,
          }
        : null,
      has_submitted_forms: submittedFormsList.length > 0,
      submitted_form_count: submittedFormsList.length,
      has_required_documents: documentsList.length > 0 ? true : null,
      document_count: documentsList.length,
      application_status: app.status as string | null,
      is_resubmission: !!appData.resubmission_comments,
    };

    // Idempotent row resolution: inbound id → existing pending row → new row.
    let assessmentId: string | null = null;

    if (inboundAssessmentId) {
      const { data: existing } = await adminClient
        .from("application_ai_assessments")
        .select("id, application_id")
        .eq("id", inboundAssessmentId)
        .maybeSingle();
      if (existing && existing.application_id === application_id) {
        assessmentId = existing.id as string;
        await adminClient
          .from("application_ai_assessments")
          .update({
            status: "pending",
            error_message: null,
            rule_check_snapshot: ruleCheckSnapshot as unknown as Record<string, unknown>,
            prompt_version: PROMPT_VERSION,
            model_provider: MODEL_PROVIDER,
            model_name: MODEL_NAME,
          })
          .eq("id", assessmentId);
      }
    }

    if (!assessmentId) {
      const { data: pendingExisting } = await adminClient
        .from("application_ai_assessments")
        .select("id")
        .eq("application_id", application_id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pendingExisting?.id) {
        assessmentId = pendingExisting.id as string;
        await adminClient
          .from("application_ai_assessments")
          .update({
            rule_check_snapshot: ruleCheckSnapshot as unknown as Record<string, unknown>,
            prompt_version: PROMPT_VERSION,
            model_provider: MODEL_PROVIDER,
            model_name: MODEL_NAME,
            error_message: null,
          })
          .eq("id", assessmentId);
      }
    }

    if (!assessmentId) {
      const { data: created, error: createErr } = await adminClient
        .from("application_ai_assessments")
        .insert({
          application_id,
          status: "pending",
          rule_check_snapshot: ruleCheckSnapshot as unknown as Record<string, unknown>,
          prompt_version: PROMPT_VERSION,
          model_provider: MODEL_PROVIDER,
          model_name: MODEL_NAME,
        })
        .select("id")
        .single();
      if (createErr || !created) {
        return jsonResponse(
          { error: "Failed to create assessment row: " + (createErr?.message || "unknown") },
          500,
        );
      }
      assessmentId = created.id as string;
    }

    console.log("[ai-assessment] using assessment id=", assessmentId, "for application=", application_id);

    if (!aiKey) {
      await adminClient
        .from("application_ai_assessments")
        .update({
          status: "failed",
          error_message: "LOVABLE_API_KEY is not configured",
        })
        .eq("id", assessmentId);
      return jsonResponse({ error: "AI provider not configured" }, 500);
    }

    // Build prompt payload (advisory only).
    const applicationContext = {
      application_number: app.application_number,
      license_type: app.license_type,
      status: app.status,
      sector_name: sectorRow.data?.name ?? null,
      sub_sector_name: subSectorRow.data?.name ?? null,
      category_name: categoryRow.data?.name ?? null,
      service_name: serviceRow.data?.name ?? null,
      submitted_at: app.submitted_at,
      created_at: app.created_at,
      application_data: appData,
      submitted_forms: submittedFormsList,
      documents: documentsList.map((d: Record<string, unknown>) => ({
        file_name: d.file_name,
        document_type: d.document_type ?? null,
        file_size: d.file_size,
        mime_type: d.mime_type,
        source: d.source ?? null,
      })),
      payments: paymentsList.map((p) => ({
        amount: p.amount,
        currency: p.currency,
        status: p.status,
      })),
      rule_check_snapshot: ruleCheckSnapshot,
    };

    const sourcePayloadHash = await sha256Hex(JSON.stringify(applicationContext));

    const systemPrompt = `You are an assistant to a licensing analyst.
Use ONLY the supplied application data. Do not invent facts.
Separate deterministic rule-check outcomes from AI inferences.
Every finding and risk must include evidence (short quotes/IDs/field names).
If evidence is missing, list it under missing_information rather than making it up.
Do NOT make a final approval or rejection decision and do NOT say the application
should be automatically approved. Use "request_more_info" when required evidence
is missing. Use "enhanced_due_diligence" for high-risk ownership, compliance,
financial, or document concerns. Return VALID JSON ONLY matching this exact schema:

{
  "summary": "string",
  "findings": [
    {
      "severity": "low|medium|high|critical",
      "category": "completeness|eligibility|financial|ownership|compliance|document|duplicate|other",
      "title": "string",
      "description": "string",
      "evidence": ["string"],
      "analyst_action": "string"
    }
  ],
  "risks": [
    {
      "risk_type": "compliance|financial|operational|ownership|document|eligibility|other",
      "level": "low|medium|high|critical",
      "reason": "string",
      "evidence": ["string"]
    }
  ],
  "routing_recommendation": {
    "recommended_route": "standard_review|senior_analyst|enhanced_due_diligence|request_more_info|reject_review",
    "recommended_action": "continue_review|escalate|request_more_info|review_for_rejection",
    "reason": "string",
    "confidence": 0.0
  },
  "missing_information": ["string"],
  "confidence_score": 0.0
}`;

    const userPrompt = `Analyse the following licensing application and return the JSON described in the system message.

APPLICATION_CONTEXT:
${JSON.stringify(applicationContext, null, 2)}`;

    try {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${aiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!aiResp.ok) {
        const errText = await aiResp.text();
        await adminClient
          .from("application_ai_assessments")
          .update({
            status: "failed",
            error_message: `AI gateway error ${aiResp.status}: ${errText.slice(0, 500)}`,
            source_payload_hash: sourcePayloadHash,
          })
          .eq("id", assessmentId);
        return jsonResponse({ error: "AI gateway failed", status: aiResp.status }, 502);
      }

      const aiJson = await aiResp.json();
      const content =
        aiJson?.choices?.[0]?.message?.content ?? aiJson?.choices?.[0]?.text ?? "";
      const parsed = safeParseJson(typeof content === "string" ? content : JSON.stringify(content));

      if (!parsed) {
        await adminClient
          .from("application_ai_assessments")
          .update({
            status: "failed",
            error_message: "AI response was not valid JSON",
            source_payload_hash: sourcePayloadHash,
          })
          .eq("id", assessmentId);
        return jsonResponse({ error: "AI response unparseable" }, 502);
      }

      const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
      const risks = Array.isArray(parsed.risks) ? parsed.risks : [];
      const routing =
        parsed.routing_recommendation && typeof parsed.routing_recommendation === "object"
          ? parsed.routing_recommendation
          : {};
      const missing = Array.isArray(parsed.missing_information) ? parsed.missing_information : [];
      const summary = typeof parsed.summary === "string" ? parsed.summary : null;
      const confidence =
        typeof parsed.confidence_score === "number" ? parsed.confidence_score : null;

      await adminClient
        .from("application_ai_assessments")
        .update({
          status: "completed",
          summary,
          findings,
          risks,
          routing_recommendation: routing,
          missing_information: missing,
          confidence_score: confidence,
          source_payload_hash: sourcePayloadHash,
          generated_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", assessmentId);

      return jsonResponse({ success: true, assessment_id: assessmentId });
    } catch (aiErr) {
      await adminClient
        .from("application_ai_assessments")
        .update({
          status: "failed",
          error_message:
            aiErr instanceof Error ? aiErr.message : "Unknown AI generation error",
          source_payload_hash: sourcePayloadHash,
        })
        .eq("id", assessmentId);
      return jsonResponse({ error: "AI generation failed" }, 500);
    }
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500,
    );
  }
});
