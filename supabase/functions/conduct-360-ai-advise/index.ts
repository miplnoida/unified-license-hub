// MC-07.4 / MC-08 — Governed Conduct 360 AI generation service.
//
// CONTRACT
//   - No AI request may execute unless the institutional governance gate
//     (`ai_governance_resolve_execution`) allows it. The gate is fail-closed and
//     decides, server-side: the stop control (kill switch), use-case lifecycle
//     status, the caller's role authority, the approved model version and the
//     released instruction version. Nothing here is taken from the browser.
//   - The ONLY input the model receives is the governed context returned by
//     `conduct_360_ai_context` (scoped Conduct 360 facts + permitted source
//     references) plus the server-held instruction for the resolved version. The
//     model has no tools, no function calling, no database access and no
//     external/web access.
//   - Output is advisory text only. Every material statement must cite a
//     reference supplied in the context; an invented or unknown reference makes
//     the whole generation invalid and nothing is persisted.
//   - Persistence happens exclusively through `conduct_ai_insight_record`
//     (service role). This function never writes an AI table directly and never
//     touches a supervisory/business table: no signal validate/dismiss, no
//     pattern confirm, no alert raise, no risk rating, no investigation,
//     finding, enforcement action, complaint outcome or workflow transition.
//   - Every recorded item starts at review state NOT_REVIEWED.
//   - EVERY attempt — allowed, refused, failed or ungrounded — is recorded in the
//     AI activity register through `ai_governance_record_attempt`, so a refusal
//     is as auditable as a success.
//   - If the provider is unavailable or generation fails, the caller receives a
//     safe "AI assistance unavailable" state. Conduct 360 stays usable and no
//     business workflow is blocked.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireUserPermission } from '../_shared/authz.ts';
import {
  ADVISORY_SCHEMA, USE_CASE_CODES, buildSystemPrompt, buildUserPrompt, type UseCaseCode,
} from './prompts.ts';
import { checkGrounding, resolveCitations } from './grounding.ts';

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const DEFAULT_TEMPERATURE = 0.2;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // 1. Authority — the caller must be an authorised market-conduct user. Regulator
  //    and ROS scope are additionally enforced inside the governed context RPC,
  //    which runs as the caller.
  const gate = await requireUserPermission(req, 'market_conduct', 'view');
  if (!gate.ok) return gate.response;
  const { userId, authClient, adminClient } = gate;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
  }

  const entityId = typeof body.entity_id === 'string' ? body.entity_id : '';
  const useCaseCode = String(body.use_case_code ?? '') as UseCaseCode;
  const windowStart = isDate(body.window_start) ? String(body.window_start) : null;
  const windowEnd = isDate(body.window_end) ? String(body.window_end) : null;
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
        _entity_id: /^[0-9a-f-]{36}$/i.test(entityId) ? entityId : null,
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
        _window_start: windowStart,
        _window_end: windowEnd,
        _latency_ms: Date.now() - startedAt,
        _insight_id: insightId ?? null,
        _requested_at: requestedAt,
        _metadata: {},
      });
    } catch (_e) {
      // Register write failures must not mask the caller's result.
    }
  };

  /** Safe degraded response: advisory unavailable, Conduct 360 unaffected. */
  const unavailable = (
    reason: string,
    detail?: string,
    retryable = false,
    extra: Record<string, unknown> = {},
  ) =>
    json({
      ok: false,
      state: 'AI_ASSISTANCE_UNAVAILABLE',
      message: 'AI assistance is unavailable. The Conduct 360 regulatory facts remain fully available.',
      reason,
      detail: detail ?? null,
      retryable,
      persisted: false,
      ...extra,
    });

  if (!/^[0-9a-f-]{36}$/i.test(entityId)) {
    return json({ error: 'A valid entity is required', code: 'BAD_REQUEST' }, 400);
  }
  if (!USE_CASE_CODES.includes(useCaseCode)) {
    await record('GOVERNANCE_REFUSAL', 'USE_CASE_NOT_REGISTERED', 'Unknown advisory capability requested.');
    return json(
      { error: 'This advisory use case is not approved for Conduct 360', code: 'USE_CASE_NOT_APPROVED' },
      400,
    );
  }

  // 2. Institutional governance gate — fail closed. Runs as the caller so role
  //    authority is evaluated against the caller's own permissions.
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
      governance_note: 'The regulatory record, deterministic rule outcomes and supervisory workflow are unaffected.',
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
    return unavailable(
      'EXTERNAL_DATA_NOT_SUPPORTED',
      'External data access is not implemented for advisory generation.',
    );
  }

  // 3. Governed context — the sole permitted source. Runs as the caller, so an
  //    out-of-scope entity or a disabled use case is refused by the database.
  const { data: contextData, error: contextError } = await authClient.rpc('conduct_360_ai_context', {
    _entity_id: entityId,
    _use_case_code: useCaseCode,
    _window_start: windowStart,
    _window_end: windowEnd,
  });

  if (contextError) {
    const msg = contextError.message ?? '';
    if (/use_case_disabled/.test(msg)) {
      await record('GOVERNANCE_REFUSAL', 'USE_CASE_SUSPENDED', msg, gov);
      return json(
        { error: 'This advisory use case is currently switched off', code: 'USE_CASE_DISABLED' },
        403,
      );
    }
    if (/unknown_use_case/.test(msg)) {
      await record('GOVERNANCE_REFUSAL', 'USE_CASE_NOT_REGISTERED', msg, gov);
      return json({ error: 'Unknown advisory use case', code: 'USE_CASE_NOT_APPROVED' }, 400);
    }
    if (/not_authori|permission|out of scope|42501/i.test(msg)) {
      await record('SCOPE_REFUSAL', 'ENTITY_OUT_OF_SCOPE', msg, gov);
      return json(
        { error: 'This entity is outside your supervisory remit', code: 'OUT_OF_SCOPE' },
        403,
      );
    }
    await record('FAILURE', 'CONTEXT_UNAVAILABLE', msg, gov);
    return json({ error: 'The Conduct 360 context could not be prepared', code: 'CONTEXT_UNAVAILABLE' }, 400);
  }

  const context = (contextData ?? {}) as Record<string, unknown>;
  const useCase = (context.use_case ?? {}) as Record<string, unknown>;
  const fingerprint = String(context.input_fingerprint ?? '');
  const win = (context.window ?? {}) as Record<string, unknown>;
  const wStart = String(win.start ?? windowStart ?? '');
  const wEnd = String(win.end ?? windowEnd ?? '');
  const permitted = Array.isArray(context.permitted_source_references)
    ? (context.permitted_source_references as Array<Record<string, unknown>>)
    : [];

  if (!fingerprint || !wStart || !wEnd) {
    await record('FAILURE', 'CONTEXT_INCOMPLETE', null, gov);
    return json({ error: 'The Conduct 360 context is incomplete', code: 'CONTEXT_UNAVAILABLE' }, 400);
  }

  // 4. Boundary re-checks that must hold regardless of configuration drift.
  if (String(useCase.allowed_source ?? '') !== String(gov.allowed_fact_scope ?? 'conduct_360_snapshot')) {
    await record('GOVERNANCE_REFUSAL', 'SOURCE_POLICY_VIOLATION', null, gov, fingerprint);
    return json({ error: 'Advisory source policy violation', code: 'SOURCE_POLICY_VIOLATION' }, 403);
  }
  if (useCase.workflow_mutation_allowed === true) {
    await record('GOVERNANCE_REFUSAL', 'MUTATION_POLICY_VIOLATION', null, gov, fingerprint);
    return json({ error: 'Advisory mutation policy violation', code: 'MUTATION_POLICY_VIOLATION' }, 403);
  }

  const cap = typeof gov.temperature_max === 'number'
    ? gov.temperature_max
    : Number(gov.temperature_max ?? DEFAULT_TEMPERATURE);
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
              instruction_body: gov.instruction_body as string | null,
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
          json_schema: { name: 'conduct_360_advisory', strict: true, schema: ADVISORY_SCHEMA },
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
    return unavailable('INVALID_MODEL_OUTPUT', 'The advisory response was not valid structured output.');
  }

  // 6. Grounding — every cited reference must exist in the supplied context.
  const grounding = checkGrounding(output, permitted);
  if (grounding.invented.length > 0) {
    // Invented references make the whole item invalid — nothing is persisted.
    const detail = `The advisory response cited records that are not in the supplied context: ${grounding.invented.slice(0, 5).join(', ')}`;
    await record('REFUSAL', 'UNGROUNDED_CITATION', detail, gov, fingerprint);
    return unavailable('UNGROUNDED_CITATION', detail);
  }
  const hasPermitted = permitted.some((r) => String(r.reference ?? '').trim() !== '');
  if (useCase.citations_required === true && hasPermitted && grounding.cited.length === 0) {
    await record('REFUSAL', 'MISSING_CITATIONS', null, gov, fingerprint);
    return unavailable('MISSING_CITATIONS', 'The advisory response did not cite any of the supplied records.');
  }

  // Use-case shape: the required payload for the narrow use cases must be present.
  const shapeMissing =
    (useCaseCode === 'RECORDS_TO_REVIEW' && !(Array.isArray(output.records) && output.records.length > 0) && hasPermitted) ||
    (useCaseCode === 'SUPERVISORY_QUESTIONS' && !(Array.isArray(output.questions) && output.questions.length > 0)) ||
    (useCaseCode === 'RISK_HYPOTHESIS' && !(Array.isArray(output.hypotheses) && output.hypotheses.length > 0));
  if (shapeMissing) {
    await record('REFUSAL', 'INCOMPLETE_ADVISORY', null, gov, fingerprint);
    return unavailable('INCOMPLETE_ADVISORY', 'The advisory response did not contain the required content.');
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

  // Citations are persisted as the resolved context references (section + href),
  // so review and drill-down never depend on model-formatted text.
  const citations = resolveCitations(grounding.cited, permitted);

  // 7. Recording — governed RPC only. Review state defaults to NOT_REVIEWED.
  const { data: recordedId, error: recordError } = await adminClient.rpc('conduct_ai_insight_record', {
    _entity_id: entityId,
    _use_case_code: useCaseCode,
    _window_start: wStart,
    _window_end: wEnd,
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
    window: { start: wStart, end: wEnd },
    provenance: {
      provider,
      model,
      model_version: modelVersion,
      model_display_name: gov.model_display_name ?? null,
      prompt_template_code: instructionCode,
      prompt_template_version: instructionVersion,
      snapshot_fingerprint: fingerprint,
      source: String(gov.allowed_fact_scope ?? 'conduct_360_snapshot'),
      use_case_version: gov.use_case_version ?? null,
    },
    advisory: { ...output, use_case: useCaseCode, limitations, confidence },
    citations,
  });
});
