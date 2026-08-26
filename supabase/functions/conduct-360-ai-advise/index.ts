// MC-07.4 — Governed Conduct 360 AI generation service.
//
// CONTRACT
//   - The ONLY input the model receives is the governed context returned by
//     `conduct_360_ai_context` (scoped Conduct 360 facts + permitted source
//     references + approved use-case instructions + prompt template version).
//     The model has no tools, no function calling, no database access and no
//     external/web access.
//   - Provider, model, temperature cap and enablement all come from
//     `conduct_ai_use_cases`. Anything outside that policy is refused here.
//   - Output is advisory text only. Every material statement must cite a
//     reference supplied in the context; an invented or unknown reference makes
//     the whole generation invalid and nothing is persisted.
//   - Persistence happens exclusively through `conduct_ai_insight_record`
//     (service role). This function never writes an AI table directly and never
//     touches a supervisory/business table: no signal validate/dismiss, no
//     pattern confirm, no alert raise, no risk rating, no investigation,
//     finding, enforcement action, complaint outcome or workflow transition.
//   - Every recorded item starts at review state NOT_REVIEWED.
//   - If the provider is unavailable or generation fails, the caller receives a
//     safe "AI assistance unavailable" state. Conduct 360 stays usable and no
//     business workflow is blocked.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireUserPermission } from '../_shared/authz.ts';
import {
  ADVISORY_SCHEMA, USE_CASE_CODES, buildSystemPrompt, buildUserPrompt, type UseCaseCode,
} from './prompts.ts';

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const PROVIDER = 'lovable_ai_gateway';
const DEFAULT_TEMPERATURE = 0.2;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Safe degraded response: advisory unavailable, Conduct 360 unaffected. */
const unavailable = (reason: string, detail?: string, retryable = false) =>
  json({
    ok: false,
    state: 'AI_ASSISTANCE_UNAVAILABLE',
    message: 'AI assistance is unavailable. The Conduct 360 regulatory facts remain fully available.',
    reason,
    detail: detail ?? null,
    retryable,
    persisted: false,
  });

const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

interface Policy {
  allowed_providers?: string[];
  allowed_models?: string[];
  temperature_max?: number;
  external_data_allowed?: boolean;
}

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

  if (!/^[0-9a-f-]{36}$/i.test(entityId)) {
    return json({ error: 'A valid entity is required', code: 'BAD_REQUEST' }, 400);
  }
  if (!USE_CASE_CODES.includes(useCaseCode)) {
    return json(
      { error: 'This advisory use case is not approved for Conduct 360', code: 'USE_CASE_NOT_APPROVED' },
      400,
    );
  }

  // 2. Governed context — the sole permitted source. Runs as the caller, so an
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
      return json(
        { error: 'This advisory use case is currently switched off', code: 'USE_CASE_DISABLED' },
        403,
      );
    }
    if (/unknown_use_case/.test(msg)) {
      return json({ error: 'Unknown advisory use case', code: 'USE_CASE_NOT_APPROVED' }, 400);
    }
    if (/not_authori|permission|out of scope|42501/i.test(msg)) {
      return json(
        { error: 'This entity is outside your supervisory remit', code: 'OUT_OF_SCOPE' },
        403,
      );
    }
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
    return json({ error: 'The Conduct 360 context is incomplete', code: 'CONTEXT_UNAVAILABLE' }, 400);
  }

  // 3. Policy enforcement — provider, model, temperature cap, external data.
  if (String(useCase.allowed_source ?? '') !== 'conduct_360_snapshot') {
    return json({ error: 'Advisory source policy violation', code: 'SOURCE_POLICY_VIOLATION' }, 403);
  }
  if (useCase.workflow_mutation_allowed === true) {
    return json({ error: 'Advisory mutation policy violation', code: 'MUTATION_POLICY_VIOLATION' }, 403);
  }
  const policy = (useCase.model_policy ?? {}) as Policy;
  const allowedProviders = Array.isArray(policy.allowed_providers) ? policy.allowed_providers : [];
  const allowedModels = Array.isArray(policy.allowed_models) ? policy.allowed_models : [];
  if (!allowedProviders.includes(PROVIDER)) {
    return json(
      { error: 'No permitted AI provider is configured for this use case', code: 'PROVIDER_NOT_PERMITTED' },
      403,
    );
  }
  if (allowedModels.length === 0) {
    return json(
      { error: 'No permitted AI model is configured for this use case', code: 'MODEL_NOT_PERMITTED' },
      403,
    );
  }
  // A caller may request one of the permitted models; anything else is refused
  // rather than silently downgraded.
  const requestedModel = typeof body.model === 'string' ? body.model : null;
  if (requestedModel && !allowedModels.includes(requestedModel)) {
    return json(
      { error: 'The requested AI model is not permitted for this use case', code: 'MODEL_NOT_PERMITTED' },
      403,
    );
  }
  const model = requestedModel ?? allowedModels[0];
  const cap = typeof policy.temperature_max === 'number' ? policy.temperature_max : DEFAULT_TEMPERATURE;
  const temperature = Math.min(DEFAULT_TEMPERATURE, cap);
  if (policy.external_data_allowed === true) {
    // Policy does not yet enable external data; refuse rather than reach out.
    return json(
      { error: 'External data access is not implemented for advisory generation', code: 'EXTERNAL_DATA_NOT_SUPPORTED' },
      403,
    );
  }

  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return unavailable('PROVIDER_NOT_CONFIGURED', 'No AI provider credential is configured.');

  // 4. Generation — no tools, no function calling, strict structured output.
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
          { role: 'system', content: buildSystemPrompt(useCaseCode, useCase) },
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
      return unavailable(reason, detail.slice(0, 400), retryable);
    }

    const payload = await res.json();
    raw = payload?.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    return unavailable('PROVIDER_UNREACHABLE', String((e as Error)?.message ?? e).slice(0, 400), true);
  }

  let output: Record<string, unknown>;
  try {
    output = JSON.parse(raw);
  } catch {
    return unavailable('INVALID_MODEL_OUTPUT', 'The advisory response was not valid structured output.');
  }

  // 5. Grounding — every cited reference must exist in the supplied context.
  const grounding = checkGrounding(output, permitted);
  if (grounding.invented.length > 0) {
    // Invented references make the whole item invalid — nothing is persisted.
    return unavailable(
      'UNGROUNDED_CITATION',
      `The advisory response cited records that are not in the supplied context: ${grounding.invented.slice(0, 5).join(', ')}`,
    );
  }
  const hasPermitted = permitted.some((r) => String(r.reference ?? '').trim() !== '');
  if (useCase.citations_required === true && hasPermitted && grounding.cited.length === 0) {
    return unavailable(
      'MISSING_CITATIONS',
      'The advisory response did not cite any of the supplied records.',
    );
  }

  // Use-case shape: the required payload for the narrow use cases must be present.
  const shapeMissing =
    (useCaseCode === 'RECORDS_TO_REVIEW' && !(Array.isArray(output.records) && output.records.length > 0) && permittedRefs.size > 0) ||
    (useCaseCode === 'SUPERVISORY_QUESTIONS' && !(Array.isArray(output.questions) && output.questions.length > 0)) ||
    (useCaseCode === 'RISK_HYPOTHESIS' && !(Array.isArray(output.hypotheses) && output.hypotheses.length > 0));
  if (shapeMissing) {
    return unavailable('INCOMPLETE_ADVISORY', 'The advisory response did not contain the required content.');
  }

  const confidence = typeof output.confidence === 'number'
    ? Math.max(0, Math.min(1, output.confidence))
    : null;
  const limitations = Array.isArray(output.limitations)
    ? (output.limitations as unknown[]).map((x) => String(x)).filter(Boolean)
    : [];
  const standing = String(useCase.limitation_policy ?? '').trim();
  if (standing && !limitations.includes(standing)) limitations.unshift(standing);

  // Citations are persisted as the resolved context references (section + href),
  // so review and drill-down never depend on model-formatted text.
  const citations = permitted.filter((r) => collected.has(String(r.reference ?? '')));

  // 6. Recording — governed RPC only. Review state defaults to NOT_REVIEWED.
  const { data: recordedId, error: recordError } = await adminClient.rpc('conduct_ai_insight_record', {
    _entity_id: entityId,
    _use_case_code: useCaseCode,
    _window_start: wStart,
    _window_end: wEnd,
    _snapshot_fingerprint: fingerprint,
    _ai_output: { ...output, use_case: useCaseCode },
    _source_references: citations,
    _provider: PROVIDER,
    _model: model,
    _model_version: model,
    _prompt_template_version: String(useCase.prompt_template_version ?? 'v1'),
    _confidence: confidence,
    _uncertainty: typeof output.uncertainty === 'string' ? output.uncertainty : null,
    _limitations: limitations,
    _generated_by: userId,
  });

  if (recordError) {
    return unavailable('NOT_RECORDED', String(recordError.message ?? '').slice(0, 400));
  }

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
      provider: PROVIDER,
      model,
      prompt_template_code: String(useCase.prompt_template_code ?? ''),
      prompt_template_version: String(useCase.prompt_template_version ?? 'v1'),
      snapshot_fingerprint: fingerprint,
      source: 'conduct_360_snapshot',
    },
    advisory: { ...output, use_case: useCaseCode, limitations, confidence },
    citations,
  });
});
