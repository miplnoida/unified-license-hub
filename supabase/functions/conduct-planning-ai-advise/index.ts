// MC-10 / MC-08 — Governed supervisory planning AI service.
//
// CONTRACT
//   - No AI request executes unless the institutional governance gate
//     (`ai_governance_resolve_execution`) allows it. The gate is fail-closed and
//     resolves server-side: the stop control (kill switch), the use-case
//     lifecycle state, the caller's authority, the approved model version and
//     the released instruction version. Nothing is taken from the browser.
//   - The ONLY input the model receives is the governed planning fact package
//     returned by `public.conduct_planning_snapshot`, evaluated as the caller so
//     an out-of-remit attention item or plan is refused by the database. No
//     tools, no function calling, no database or external access.
//   - Output is a suggestion only. Every material statement must cite a
//     reference supplied in the package, and every intervention option must name
//     a code from the approved catalogue supplied in it. An invented reference
//     or an unapproved code invalidates the whole generation.
//   - Persistence happens exclusively through
//     `conduct_planning_ai_insight_record` (service role) and always lands at
//     review state NOT_REVIEWED. This function never writes a supervisory
//     record: no priority, no plan, no intervention, no outcome, no status, no
//     closure and no workflow transition.
//   - EVERY attempt — allowed, refused, failed or ungrounded — is recorded in
//     the AI activity register via `ai_governance_record_attempt`.
//   - If AI is stopped, suspended, misconfigured or unavailable, the caller gets
//     a safe degraded state and the deterministic planning workflow stays fully
//     usable.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireUserPermission } from '../_shared/authz.ts';
import {
  PLANNING_USE_CASE_CODES, buildAdvisorySchema, buildSystemPrompt, buildUserPrompt,
  catalogueCodes, outputIsComplete, permittedReferences,
  type PlanningUseCaseCode,
} from './prompts.ts';
import { checkGrounding, resolveCitations } from './grounding.ts';

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const DEFAULT_TEMPERATURE = 0.2;
const UUID = /^[0-9a-f-]{36}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // 1. Authority — commissioning a suggestion consumes a governed model on the
  //    regulator's behalf and leaves a record in the AI activity register, so it
  //    is an analytical act, not a read. View-only officers can read the facts
  //    and any recorded suggestion but cannot commission one. Supervisory scope
  //    is additionally enforced by the snapshot RPC, which runs as the caller.
  const gate = await requireUserPermission(req, 'market_conduct', 'run_conduct_analytics');
  if (!gate.ok) return gate.response;
  const { userId, authClient, adminClient } = gate;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
  }

  const useCaseCode = String(body.use_case_code ?? '') as PlanningUseCaseCode;
  const attentionId = typeof body.attention_id === 'string' && UUID.test(body.attention_id) ? body.attention_id : null;
  const planId = typeof body.plan_id === 'string' && UUID.test(body.plan_id) ? body.plan_id : null;
  const requestedAt = new Date().toISOString();
  const startedAt = Date.now();

  /** Write the attempt to the AI activity register. Never blocks the response. */
  const record = async (
    outcome: string,
    reasonCode: string | null,
    detail: string | null,
    gov?: Record<string, unknown> | null,
    fingerprint?: string | null,
    insightId?: string | null,
  ) => {
    try {
      await adminClient.rpc('ai_governance_record_attempt', {
        _use_case_code: useCaseCode || 'UNKNOWN',
        _entity_id: null,
        _requested_by: userId,
        _outcome: outcome,
        _reason_code: reasonCode,
        _detail: detail ? detail.slice(0, 2000) : null,
        _provider: (gov?.provider as string) ?? null,
        _model: (gov?.model as string) ?? null,
        _model_version: (gov?.model_version as string) ?? null,
        _instruction_template_code: (gov?.instruction_template_code as string) ?? null,
        _instruction_version: (gov?.instruction_version as string) ?? null,
        _snapshot_fingerprint: fingerprint ?? null,
        _window_start: null,
        _window_end: null,
        _latency_ms: Date.now() - startedAt,
        _insight_id: insightId ?? null,
        _requested_at: requestedAt,
        _metadata: { attention_id: attentionId, plan_id: planId, surface: 'SUPERVISORY_PLANNING_ASSISTANCE' },
      });
    } catch (_e) {
      // Register write failures must not mask the caller's result.
    }
  };

  /** Safe degraded response: suggestion unavailable, planning workflow unaffected. */
  const unavailable = (reason: string, detail?: string, retryable = false) =>
    json({
      ok: false,
      state: 'AI_ASSISTANCE_UNAVAILABLE',
      message: 'AI assistance is unavailable. The recorded supervisory planning workflow remains fully available.',
      reason,
      detail: detail ?? null,
      retryable,
      persisted: false,
    });

  if (!PLANNING_USE_CASE_CODES.includes(useCaseCode)) {
    await record('GOVERNANCE_REFUSAL', 'USE_CASE_NOT_REGISTERED', 'Unknown planning assistance capability requested.');
    return json(
      { error: 'This assistance capability is not approved for supervisory planning', code: 'USE_CASE_NOT_APPROVED' },
      400,
    );
  }
  if (!attentionId && !planId) {
    return json({ error: 'A supervisory attention item or a supervisory plan is required', code: 'BAD_REQUEST' }, 400);
  }

  // 2. Institutional governance gate — fail closed, evaluated as the caller.
  const requestedModel = typeof body.model === 'string' ? body.model : null;
  const { data: resolution, error: resolveError } = await authClient.rpc('ai_governance_resolve_execution', {
    _use_case_code: useCaseCode,
    _acting_user: userId,
    _requested_model: requestedModel,
  });

  if (resolveError) {
    await record('GOVERNANCE_REFUSAL', 'GATE_UNAVAILABLE', String(resolveError.message ?? ''));
    return unavailable(
      'GOVERNANCE_GATE_UNAVAILABLE',
      'The AI governance gate could not be evaluated, so no AI request was made.',
    );
  }

  const gov = (resolution ?? {}) as Record<string, unknown>;
  if (gov.allowed !== true) {
    const reasonCode = String(gov.reason_code ?? 'NOT_APPROVED');
    await record('GOVERNANCE_REFUSAL', reasonCode, String(gov.message ?? ''), gov);
    return json({
      ok: false,
      state: reasonCode === 'AI_STOPPED' ? 'AI_STOPPED' : 'AI_NOT_PERMITTED',
      persisted: false,
      reason: reasonCode,
      message: String(gov.message ?? 'AI assistance is not permitted for this capability.'),
      stop_scope: gov.stop_scope ?? null,
      suspension_reason: gov.suspension_reason ?? null,
      governance_note: 'The recorded facts, the deterministic prioritisation and the supervisory planning workflow are unaffected.',
    }, 200);
  }

  const provider = String(gov.provider ?? '');
  const model = String(gov.model ?? '');
  const modelVersion = String(gov.model_version ?? model);
  const instructionCode = String(gov.instruction_template_code ?? '');
  const instructionVersion = String(gov.instruction_version ?? '');
  if (!provider || !model || !instructionVersion) {
    await record('GOVERNANCE_REFUSAL', 'INCOMPLETE_GOVERNANCE_RESOLUTION', null, gov);
    return unavailable('GOVERNANCE_INCOMPLETE', 'The approved model and instruction version could not be resolved.');
  }
  if (gov.external_data_allowed === true) {
    await record('GOVERNANCE_REFUSAL', 'EXTERNAL_DATA_NOT_SUPPORTED', null, gov);
    return unavailable('EXTERNAL_DATA_NOT_SUPPORTED', 'External data access is not implemented for planning assistance.');
  }
  if (String(gov.allowed_fact_scope ?? 'conduct_planning_snapshot') !== 'conduct_planning_snapshot') {
    await record('GOVERNANCE_REFUSAL', 'SOURCE_POLICY_VIOLATION', null, gov);
    return json({ error: 'Assistance source policy violation', code: 'SOURCE_POLICY_VIOLATION' }, 403);
  }

  // 3. Governed fact package — the sole permitted source, run as the caller.
  const { data: contextData, error: contextError } = await authClient.rpc('conduct_planning_snapshot', {
    _attention_id: attentionId,
    _plan_id: planId,
  });

  if (contextError) {
    const msg = contextError.message ?? '';
    if (/not_authori|permission|out of scope|42501|row-level security/i.test(msg)) {
      await record('SCOPE_REFUSAL', 'SUBJECT_OUT_OF_SCOPE', msg, gov);
      return json({ error: 'This record sits outside your supervisory remit', code: 'OUT_OF_SCOPE' }, 403);
    }
    await record('FAILURE', 'CONTEXT_UNAVAILABLE', msg, gov);
    return json({ error: 'The supervisory planning facts could not be prepared', code: 'CONTEXT_UNAVAILABLE' }, 400);
  }

  const context = (contextData ?? {}) as Record<string, unknown>;
  const snapshot = (context.snapshot ?? {}) as Record<string, unknown>;
  const fingerprint = String(context.facts_signature ?? '');
  if (!fingerprint || (!snapshot.attention && !snapshot.plan)) {
    await record('FAILURE', 'CONTEXT_INCOMPLETE', null, gov);
    return json({ error: 'The supervisory planning facts are incomplete', code: 'CONTEXT_UNAVAILABLE' }, 400);
  }

  const attention = (snapshot.attention ?? null) as Record<string, unknown> | null;
  const plan = (snapshot.plan ?? null) as Record<string, unknown> | null;
  const permitted = permittedReferences(snapshot);
  const approvedCodes = catalogueCodes(snapshot);

  // 4. Use-case boundary re-checks that must hold regardless of configuration drift.
  const { data: useCaseRow } = await adminClient
    .from('conduct_ai_use_cases')
    .select('code, label, allowed_source, citations_required, workflow_mutation_allowed, limitation_policy, is_enabled')
    .eq('code', useCaseCode)
    .maybeSingle();
  const useCase = (useCaseRow ?? {}) as Record<string, unknown>;
  if (String(useCase.allowed_source ?? '') !== 'conduct_planning_snapshot') {
    await record('GOVERNANCE_REFUSAL', 'SOURCE_POLICY_VIOLATION', null, gov, fingerprint);
    return json({ error: 'Assistance source policy violation', code: 'SOURCE_POLICY_VIOLATION' }, 403);
  }
  if (useCase.workflow_mutation_allowed === true) {
    await record('GOVERNANCE_REFUSAL', 'MUTATION_POLICY_VIOLATION', null, gov, fingerprint);
    return json({ error: 'Assistance mutation policy violation', code: 'MUTATION_POLICY_VIOLATION' }, 403);
  }
  if (useCase.is_enabled === false) {
    await record('GOVERNANCE_REFUSAL', 'USE_CASE_SUSPENDED', null, gov, fingerprint);
    return json({ error: 'This assistance capability is currently switched off', code: 'USE_CASE_DISABLED' }, 403);
  }

  const cap = Number(gov.temperature_max ?? DEFAULT_TEMPERATURE);
  const temperature = Math.min(DEFAULT_TEMPERATURE, Number.isFinite(cap) ? cap : DEFAULT_TEMPERATURE);

  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    await record('FAILURE', 'PROVIDER_NOT_CONFIGURED', null, gov, fingerprint);
    return unavailable('PROVIDER_NOT_CONFIGURED', 'No AI provider credential is configured.');
  }

  // 5. Generation — no tools, no function calling, strict structured output.
  let raw: string;
  try {
    const res = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Lovable-API-Key': apiKey,
        'X-Lovable-AIG-SDK': 'fetch',
      },
      body: JSON.stringify({
        model,
        temperature,
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(useCaseCode, useCase, {
              instruction_body: (gov.instruction_body as string | null) ?? null,
              instruction_template_code: instructionCode,
              instruction_version: instructionVersion,
              prohibited_behaviours: (gov.prohibited_behaviours as string[]) ?? [],
              required_caveats: (gov.required_caveats as string[]) ?? [],
              advisory_classification: (gov.advisory_classification as string) ?? null,
            }),
          },
          { role: 'user', content: buildUserPrompt(context) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'supervisory_planning_advisory',
            strict: true,
            schema: buildAdvisorySchema(useCaseCode, approvedCodes),
          },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const retryable = res.status === 429 || res.status >= 500;
      const reason = res.status === 402
        ? 'AI_CREDITS_EXHAUSTED'
        : res.status === 403
          ? 'AI_BLOCKED_BY_POLICY'
          : res.status === 429
            ? 'AI_RATE_LIMITED'
            : 'PROVIDER_ERROR';
      await record('PROVIDER_ERROR', reason, detail, gov, fingerprint);
      return unavailable(reason, detail.slice(0, 400), retryable);
    }

    const payload = await res.json();
    raw = payload?.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    const detail = String((e as Error)?.message ?? e);
    await record('PROVIDER_ERROR', 'PROVIDER_UNREACHABLE', detail, gov, fingerprint);
    return unavailable('PROVIDER_UNREACHABLE', detail.slice(0, 400), true);
  }

  let output: Record<string, unknown>;
  try {
    output = JSON.parse(raw);
  } catch {
    await record('FAILURE', 'INVALID_MODEL_OUTPUT', null, gov, fingerprint);
    return unavailable('INVALID_MODEL_OUTPUT', 'The response was not valid structured output.');
  }

  // 6. Grounding — supplied references only, approved catalogue codes only.
  const grounding = checkGrounding(output, permitted, approvedCodes);
  if (grounding.invented.length > 0) {
    const detail = `The response cited records that are not in the supplied facts: ${grounding.invented.slice(0, 5).join(', ')}`;
    await record('REFUSAL', 'UNGROUNDED_CITATION', detail, gov, fingerprint);
    return unavailable('UNGROUNDED_CITATION', detail);
  }
  if (grounding.unapprovedCodes.length > 0) {
    const detail = `The response named interventions outside the approved catalogue: ${grounding.unapprovedCodes.join(', ')}`;
    await record('REFUSAL', 'UNAPPROVED_INTERVENTION', detail, gov, fingerprint);
    return unavailable('UNAPPROVED_INTERVENTION', detail);
  }
  const hasPermitted = permitted.length > 0;
  if (useCase.citations_required === true && hasPermitted && grounding.cited.length === 0) {
    await record('REFUSAL', 'MISSING_CITATIONS', null, gov, fingerprint);
    return unavailable('MISSING_CITATIONS', 'The response did not cite any of the supplied records.');
  }
  if (!outputIsComplete(useCaseCode, output)) {
    await record('REFUSAL', 'INCOMPLETE_ADVISORY', null, gov, fingerprint);
    return unavailable('INCOMPLETE_ADVISORY', 'The response did not contain the required content.');
  }

  const confidence = typeof output.confidence === 'number'
    ? Math.max(0, Math.min(1, output.confidence))
    : null;
  const limitations = Array.isArray(output.limitations)
    ? (output.limitations as unknown[]).map((x) => String(x)).filter(Boolean)
    : [];
  for (const caveat of ((gov.required_caveats as string[]) ?? [])) {
    const text = String(caveat ?? '').trim();
    if (text && !limitations.includes(text)) limitations.unshift(text);
  }
  const standing = String(useCase.limitation_policy ?? '').trim();
  if (standing && !limitations.includes(standing)) limitations.unshift(standing);

  const citations = resolveCitations(grounding.cited, permitted);
  const subjectType = attentionId ? 'attention_item' : 'supervisory_plan';
  const subjectKey = attentionId
    ? String(attention?.reference ?? '')
    : String(plan?.reference ?? '');

  // Sector and regulator provenance come from the governed record, never the browser.
  let sectorId: string | null = null;
  let regulatorId: string | null = null;
  if (attentionId) {
    const { data } = await adminClient.from('conduct_attention_items')
      .select('sector_id, regulator_id').eq('id', attentionId).maybeSingle();
    sectorId = (data?.sector_id as string) ?? null;
    regulatorId = (data?.regulator_id as string) ?? null;
  } else if (planId) {
    const { data } = await adminClient.from('conduct_supervisory_plans')
      .select('sector_id, regulator_id').eq('id', planId).maybeSingle();
    sectorId = (data?.sector_id as string) ?? null;
    regulatorId = (data?.regulator_id as string) ?? null;
  }

  // 7. Recording — governed RPC only. Review state defaults to NOT_REVIEWED.
  const { data: recordedId, error: recordError } = await adminClient.rpc('conduct_planning_ai_insight_record', {
    _use_case_code: useCaseCode,
    _subject_type: subjectType,
    _subject_key: subjectKey,
    _attention_id: attentionId,
    _plan_id: planId,
    _sector_id: sectorId,
    _regulator_id: regulatorId,
    _snapshot_fingerprint: fingerprint,
    _ai_output: { ...output, use_case: useCaseCode },
    _source_references: citations,
    _provider: provider,
    _model: model,
    _model_version: modelVersion,
    _prompt_template_version: instructionVersion,
    _confidence: confidence,
    _uncertainty: typeof output.uncertainty === 'string' ? output.uncertainty : null,
    _limitations: limitations,
    _generated_by: userId,
    _title: null,
  });

  if (recordError) {
    await record('FAILURE', 'NOT_RECORDED', String(recordError.message ?? ''), gov, fingerprint);
    return unavailable('NOT_RECORDED', String(recordError.message ?? '').slice(0, 400));
  }

  await record('SUCCESS', 'APPROVED', null, gov, fingerprint, String(recordedId));

  return json({
    ok: true,
    state: 'RECORDED',
    persisted: true,
    conduct_ai_insight_id: recordedId,
    use_case_code: useCaseCode,
    review_state: 'NOT_REVIEWED',
    staleness_state: 'CURRENT',
    subject: { type: subjectType, key: subjectKey },
    provenance: {
      provider,
      model,
      model_version: modelVersion,
      model_display_name: gov.model_display_name ?? null,
      prompt_template_code: instructionCode,
      prompt_template_version: instructionVersion,
      snapshot_fingerprint: fingerprint,
      source: 'conduct_planning_snapshot',
      use_case_version: gov.use_case_version ?? null,
      external_data: 'none',
    },
    advisory: { ...output, use_case: useCaseCode, limitations, confidence },
    citations,
  });
});
