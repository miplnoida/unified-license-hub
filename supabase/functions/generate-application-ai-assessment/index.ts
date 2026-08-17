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
import { computeDataIntegrity } from "./dataIntegrity.ts";
import { logIntegration } from "../_shared/integration-log.ts";
import { requireUserPermission } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROMPT_VERSION = "v2";
const MODEL_PROVIDER = "lovable-ai-gateway";
const MODEL_NAME = "google/gemini-2.5-flash";

const SECTION_KEYS = [
  "application_details",
  "submitted_forms",
  "documents",
  "fees_payment",
  "rfi_history",
  "workflow_sla_history",
  "compliance_notes",
  "risk_indicators",
] as const;

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

// Extract the outermost {...} block using a brace-depth scan that respects
// string literals and escapes, so trailing prose or code fences never break it.
function extractJsonBlock(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  // Unterminated: return the remainder so the repair pass can try to close it.
  return raw.slice(start);
}

// Repair the failure mode observed from the model: an array element string that
// is opened but never closed before the newline (e.g. `"a.b\": 0` followed by a
// line break). Close any string literal left open at end of line.
function repairUnterminatedStrings(raw: string): string {
  const lines = raw.split("\n");
  const fixed = lines.map((line) => {
    let inString = false;
    let escaped = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
    }
    if (!inString) return line;
    // Close the dangling literal, keeping any structural trailing comma.
    const trailingComma = /,\s*$/.test(line);
    const body = line.replace(/,\s*$/, "");
    return `${body}"${trailingComma ? "," : ""}`;
  });
  return fixed.join("\n");
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
    // ignore, try the recovery passes below
  }
  const block = extractJsonBlock(stripped);
  if (!block) return null;
  try {
    return JSON.parse(block);
  } catch {
    // ignore, try the repair pass
  }
  try {
    const repaired = repairUnterminatedStrings(block);
    return JSON.parse(repaired);
  } catch {
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

  // Declared outside the try block so every exit path (including the outer
  // catch) can write a terminal status onto the seeded `pending` row. Leaving
  // it pending makes the analyst UI spin forever.
  let inboundAssessmentId: string | null = null;
  const failPending = async (message: string) => {
    if (!inboundAssessmentId) return;
    try {
      await adminClient
        .from("application_ai_assessments")
        .update({ status: "failed", error_message: message.slice(0, 500) })
        .eq("id", inboundAssessmentId)
        .eq("status", "pending");
    } catch (_e) {
      // best effort only
    }
  };

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

      // Require the application-management view permission for non-service-role
      // callers (falls back to the internal-role check below).
      const authzGate = await requireUserPermission(req, "application_management", "view");
      if (!authzGate.ok) {
        const { data: roles } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", callerUserId);
        const hasInternal = (roles ?? []).some((r: { role: string }) =>
          INTERNAL_ROLES.has(r.role),
        );
        if (!hasInternal) return authzGate.response;
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
    inboundAssessmentId = body.assessment_id || null;
    if (!application_id || typeof application_id !== "string") {
      await failPending("application_id is required");
      return jsonResponse({ error: "application_id is required" }, 400);
    }

    // Load application + adjacent data using the service role client.
    const { data: app, error: appErr } = await adminClient
      .from("applications")
      .select("*")
      .eq("id", application_id)
      .maybeSingle();
    if (appErr || !app) {
      await failPending("Application not found");
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
      approvalActions,
      workflowInstances,
      formTemplates,
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
      adminClient
        .from("approval_actions")
        .select("id, step_id, action_type, action, comments, actor_id, created_at")
        .eq("application_id", application_id)
        .order("created_at", { ascending: true }),
      adminClient
        .from("workflow_instances")
        .select("id, workflow_id, status, current_step_id, current_step_key, started_at, updated_at, version_snapshot")
        .eq("entity_type", "application")
        .eq("entity_id", application_id),
      adminClient
        .from("form_templates")
        .select("id, name"),
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

    // Derive RFI/query history and workflow timeline from approval_actions.
    const actionsList = (approvalActions.data as Array<Record<string, unknown>>) || [];
    const RFI_ACTIONS = new Set([
      "resubmission_requested",
      "info_requested",
      "query_raised",
      "returned_for_correction",
      "edit_requested",
    ]);
    const RESPONSE_ACTIONS = new Set(["resubmitted", "edit_allowed"]);
    const rfiHistory = actionsList.filter((a) => RFI_ACTIONS.has(String(a.action || "")));
    const workflowHistory = actionsList.map((a) => ({
      step_id: a.step_id ?? null,
      action_type: a.action_type ?? null,
      action: a.action ?? null,
      comments: a.comments ?? null,
      created_at: a.created_at ?? null,
    }));
    const rfiResponses = actionsList.filter((a) => RESPONSE_ACTIONS.has(String(a.action || "")));

    // Group submitted forms by template name + section.
    const templateNameById = new Map<string, string>(
      ((formTemplates.data as Array<{ id: string; name: string }>) || []).map((t) => [t.id, t.name]),
    );
    const submittedFormsGrouped = submittedFormsList.map((f: any) => ({
      id: f.id,
      template_id: f.template_id,
      template_name: templateNameById.get(f.template_id) || null,
      status: f.status,
      submitted_at: f.submitted_at,
      response_data: f.response_data,
    }));

    const workflowInstanceRows = (workflowInstances.data as Array<Record<string, unknown>>) || [];

    // Build prompt payload (advisory only).
    const applicationContext = {
      application_details: {
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
      },
      submitted_forms: submittedFormsGrouped,
      documents: documentsList.map((d: Record<string, unknown>) => ({
        source: d.source ?? null,
        id: d.id ?? null,
        file_name: d.file_name,
        document_type: d.document_type ?? null,
        file_size: d.file_size,
        mime_type: d.mime_type,
        created_at: d.created_at ?? null,
      })),
      fees_payment: {
        payments: paymentsList.map((p) => ({
          id: p.id,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          created_at: p.created_at,
        })),
        has_completed_payment: !!completedPayment,
      },
      rfi_history: {
        requests: rfiHistory,
        responses: rfiResponses,
      },
      workflow_sla_history: {
        instances: workflowInstanceRows.map((i) => ({
          id: i.id,
          status: i.status,
          current_step_id: i.current_step_id,
          current_step_key: i.current_step_key,
          started_at: i.started_at,
          updated_at: i.updated_at,
        })),
        actions: workflowHistory,
      },
      compliance_notes: appData.compliance_notes ?? null,
      risk_indicators: {
        is_resubmission: !!appData.resubmission_comments,
        prior_rfi_count: rfiHistory.length,
      },
      rule_check_snapshot: ruleCheckSnapshot,
    };

    const sourcePayloadHash = await sha256Hex(JSON.stringify(applicationContext));

    const systemPrompt = `You are an assistant to a licensing analyst.
Use ONLY the supplied application data. Do not invent facts.
Every finding, risk, and section observation must include evidence.
Each evidence entry is ONE plain sentence naming the field and its value in plain language,
for example: paid amount is 2 but the form states 46. Never embed quote characters,
colons, escape sequences, or JSON fragments inside an evidence string.

If evidence is missing, list it under missing_information rather than inventing it.
Do NOT make a final approval or rejection decision and do NOT say the application should be automatically approved.
You produce BOTH a section-wise review AND a consolidated decision-ready report. The recommended_action is advisory only; the human analyst takes the final action.

Return VALID JSON ONLY matching this exact schema:

{
  "summary": "string",
  "sections": [
    {
      "key": "application_details|submitted_forms|documents|fees_payment|rfi_history|workflow_sla_history|compliance_notes|risk_indicators",
      "label": "string",
      "status": "pass|concern|missing_info|high_risk",
      "risk_level": "low|medium|high|critical",
      "observations": ["string"],
      "evidence": ["string"],
      "suggested_action": "string",
      "links": [{ "type": "form|document|payment|rfi|workflow", "id": "string", "label": "string" }]
    }
  ],
  "findings": [
    { "severity": "low|medium|high|critical", "category": "completeness|eligibility|financial|ownership|compliance|document|duplicate|other", "title": "string", "description": "string", "evidence": ["string"], "analyst_action": "string" }
  ],
  "risks": [
    { "risk_type": "compliance|financial|operational|ownership|document|eligibility|other", "level": "low|medium|high|critical", "reason": "string", "evidence": ["string"] }
  ],
  "routing_recommendation": {
    "recommended_route": "standard_review|senior_analyst|enhanced_due_diligence|request_more_info|reject_review",
    "recommended_action": "continue_review|escalate|request_more_info|review_for_rejection",
    "reason": "string",
    "confidence": 0.0
  },
  "decision_report": {
    "executive_summary": "string",
    "recommended_action": "approve|approve_with_conditions|request_more_information|escalate|reject",
    "rationale": "string",
    "suggested_conditions": ["string"],
    "suggested_questions": ["string"],
    "escalation_reason": "string",
    "rejection_rationale": "string",
    "top_risks": ["string"],
    "compliance_concerns": ["string"],
    "suggested_next_workflow_action": "string"
  },
  "missing_information": ["string"],
  "confidence_score": 0.0
}

Rules for the section-wise review:
- Always produce one entry per available section key in: ${SECTION_KEYS.join(", ")}.
- If a section has no data, mark status="missing_info" with a clear observation, do not skip it.
- Choose status="pass" only when the section is complete and consistent.
- Choose status="high_risk" only when concrete evidence in the input shows material risk.

Rules for decision_report.recommended_action:
- "approve_with_conditions" must populate suggested_conditions.
- "request_more_information" must populate suggested_questions.
- "escalate" must populate escalation_reason.
- "reject" must populate rejection_rationale.
- "approve" requires no extra arrays but still requires rationale.`;

    const userPrompt = `Analyse the following licensing application and return the JSON described in the system message.

APPLICATION_CONTEXT:
${JSON.stringify(applicationContext, null, 2)}`;

    const aiCallStarted = Date.now();
    try {
      // One streaming gateway call. Streaming keeps bytes flowing so a long
      // generation is not severed by the platform's no-bytes ceiling (which
      // previously left the row stuck at `pending`).
      const callModel = async (
        extraInstruction: string | null,
        jsonMode: boolean,
      ): Promise<
        | { ok: true; content: string }
        | { ok: false; status: number; errText: string }
      > => {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Lovable-API-Key": aiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL_NAME,
            stream: true,
            ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
              ...(extraInstruction
                ? [{ role: "user", content: extraInstruction }]
                : []),
            ],
          }),
        });

        if (!aiResp.ok) {
          const errText = await aiResp.text();
          return { ok: false, status: aiResp.status, errText };
        }

        let content = "";
        const reader = aiResp.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const evt = JSON.parse(payload);
                const delta = evt?.choices?.[0]?.delta?.content;
                if (typeof delta === "string") content += delta;
              } catch {
                // ignore keep-alive / non-JSON frames
              }
            }
          }
        }
        return { ok: true, content };
      };

      const failGateway = async (status: number, errText: string) => {
        const message = `AI gateway error ${status}: ${errText.slice(0, 500)}`;
        await adminClient
          .from("application_ai_assessments")
          .update({
            status: "failed",
            error_message: message,
            source_payload_hash: sourcePayloadHash,
          })
          .eq("id", assessmentId);
        await logIntegration(adminClient, {
          direction: "outbound",
          integrationKey: "ai-gateway.application-assessment",
          status: "failure",
          httpStatus: status,
          actorId: callerUserId,
          entityType: "application",
          entityId: application_id,
          error: message,
          durationMs: Date.now() - aiCallStarted,
        });
      };

      // First attempt: provider-enforced JSON output mode.
      let attempt = await callModel(null, true);
      if (!attempt.ok && attempt.status === 400) {
        // Some models reject json_object mode; fall back to plain text output.
        attempt = await callModel(null, false);
      }
      if (!attempt.ok) {
        await failGateway(attempt.status, attempt.errText);
        return jsonResponse({ error: "AI gateway failed", status: attempt.status }, 502);
      }

      let content = attempt.content;
      let parsed = safeParseJson(content);

      if (!parsed) {
        // The model occasionally emits malformed JSON (unterminated evidence
        // strings). Retry once with an explicit reminder before giving up.
        const retry = await callModel(
          "Your previous response was not valid JSON. Return ONLY the JSON object described in the system message. Every string must be properly opened and closed, and evidence entries must be plain sentences with no quote characters, colons, or escape sequences.",
          true,
        );
        if (retry.ok) {
          const retryParsed = safeParseJson(retry.content);
          if (retryParsed) {
            parsed = retryParsed;
            content = retry.content;
          } else {
            content = retry.content || content;
          }
        }
      }

      if (!parsed) {
        await adminClient
          .from("application_ai_assessments")
          .update({
            status: "failed",
            error_message: "AI response was not valid JSON",
            raw_response: content ? content.slice(0, 4000) : null,
            source_payload_hash: sourcePayloadHash,
          })
          .eq("id", assessmentId);
        await logIntegration(adminClient, {
          direction: "outbound",
          integrationKey: "ai-gateway.application-assessment",
          status: "failure",
          actorId: callerUserId,
          entityType: "application",
          entityId: application_id,
          error: "AI response was not valid JSON",
          durationMs: Date.now() - aiCallStarted,
        });
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
      const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
      const decisionReport =
        parsed.decision_report && typeof parsed.decision_report === "object"
          ? parsed.decision_report
          : {};

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
          sections,
          decision_report: decisionReport,
          raw_response: null,
          source_payload_hash: sourcePayloadHash,

          generated_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", assessmentId);

      await logIntegration(adminClient, {
        direction: "outbound",
        integrationKey: "ai-gateway.application-assessment",
        status: "success",
        actorId: callerUserId,
        entityType: "application",
        entityId: application_id,
        requestSummary: `Assessment for application ${application_id}`,
        responseSummary: `${findings.length} findings, ${risks.length} risks`,
        durationMs: Date.now() - aiCallStarted,
      });

      console.log("[ai-assessment] completed id=", assessmentId);
      return jsonResponse({ success: true, assessment_id: assessmentId });
    } catch (aiErr) {
      const aiErrMsg = aiErr instanceof Error ? aiErr.message : "Unknown AI generation error";
      await adminClient
        .from("application_ai_assessments")
        .update({
          status: "failed",
          error_message: aiErrMsg,
          source_payload_hash: sourcePayloadHash,
        })
        .eq("id", assessmentId);
      await logIntegration(adminClient, {
        direction: "outbound",
        integrationKey: "ai-gateway.application-assessment",
        status: "failure",
        actorId: callerUserId,
        entityType: "application",
        entityId: application_id,
        error: aiErrMsg,
        durationMs: Date.now() - aiCallStarted,
      });
      console.error("[ai-assessment] failed id=", assessmentId, aiErrMsg);
      return jsonResponse({ error: "AI generation failed" }, 500);
    }
  } catch (err) {
    await failPending(err instanceof Error ? err.message : "Internal error");
    return jsonResponse(

      { error: err instanceof Error ? err.message : "Internal error" },
      500,
    );
  }
});
