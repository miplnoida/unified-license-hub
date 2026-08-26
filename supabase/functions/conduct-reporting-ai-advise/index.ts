// MC-11 / MC-08 — Governed supervisory management reporting AI service.
//
// CONTRACT
//   - No AI request executes unless the institutional governance gate
//     (`ai_governance_resolve_execution`) allows it. The gate is fail-closed and
//     resolves server-side: the stop control (kill switch), the use-case
//     lifecycle state, the caller's authority, the approved model version and the
//     released instruction version. Nothing authoritative comes from the browser.
//   - The ONLY input the model receives is the governed reporting fact package
//     returned by `public.conduct_reporting_ai_context`, evaluated as the caller
//     so an out-of-remit sector or an inaccessible evidence pack is refused by the
//     database. No tools, no function calling, no database or external access.
//   - NUMERIC INTEGRITY: the model never calculates authoritative supervisory MI.
//     Every figure it states must reconcile exactly with a deterministic measure
//     supplied in the package; anything else invalidates the generation.
//   - Output is a suggestion only, recorded exclusively through
//     `conduct_reporting_ai_insight_record` (service role) at review state
//     NOT_REVIEWED. This function writes no supervisory or reporting record: no
//     metric, no pack, no adoption, no status and no workflow transition.
//   - EVERY attempt — allowed, refused, failed or ungrounded — is recorded in the
//     AI activity register via `ai_governance_record_attempt`.
//   - If AI is stopped, suspended, misconfigured or unavailable, the caller gets a
//     safe degraded state and deterministic management reporting stays fully
//     usable.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireUserPermission } from '../_shared/authz.ts';
import {
  REPORTING_USE_CASE_CODES, buildAdvisorySchema, buildSystemPrompt, buildUserPrompt,
  outputIsComplete, permittedFigures, permittedReferences,
  type ReportingUseCaseCode,
} from './prompts.ts';
import { checkGrounding, isRejectable, rejectionDetail, resolveCitations } from './grounding.ts';

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const DEFAULT_TEMPERATURE = 0.2;
const ALLOWED_SOURCE = 'conduct_reporting_snapshot';
const SURFACE = 'MANAGEMENT_REPORTING_ASSISTANCE';
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // 1. Authority — commissioning a narrative consumes a governed model on the
  //    regulator's behalf and leaves a record in the AI activity register, so it
  //    is an analytical act, not a read. View-only officers can read the MI and
  //    any recorded narrative but cannot commission one. Sector scope is
  //    additionally enforced by the context RPC, which runs as the caller.
  const gate = await requireUserPermission(req, 'market_conduct', 'run_conduct_analytics');
  if (!gate.ok) return gate.response;
  const { userId, authClient, adminClient } = gate;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
  }

  const useCaseCode = String(body.use_case_code ?? '') as ReportingUseCaseCode;
  const periodStart = typeof body.period_start === 'string' && DATE.test(body.period_start) ? body.period_start : null;
  const periodEnd = typeof body.period_end === 'string' && DATE.test(body.period_end) ? body.period_end : null;
  const sectorId = typeof body.sector_id === 'string' && UUID.test(body.sector_id) ? body.sector_id : null;
  const regulatorId = typeof body.regulator_id === 'string' && UUID.test(body.regulator_id) ? body.regulator_id : null;
  const packId = typeof body.pack_id === 'string' && UUID.test(body.pack_id) ? body.pack_id : null;
  const packVersion = Number.isInteger(body.pack_version) ? (body.pack_version as number) : null;
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
        _window_start: periodStart,
        _window_end: periodEnd,
        _latency_ms: Date.now() - startedAt,
        _insight_id: insightId ?? null,
        _requested_at: requestedAt,
        _metadata: {
          sector_id: sectorId,
          regulator_id: regulatorId,
          pack_id: packId,
          pack_version: packVersion,
          surface: SURFACE,
        },
      });
    } catch (_e) {
      // Register write failures must not mask the caller's result.
    }
  };

  /** Safe degraded response: narrative unavailable, deterministic reporting unaffected. */
  const unavailable = (reason: string, detail?: string, retryable = false) =>
    json({
      ok: false,
      state: 'AI_ASSISTANCE_UNAVAILABLE',
      message:
        'AI narrative assistance is unavailable. Deterministic management reporting, drill-down and evidence packs remain fully available.',
      reason,
      detail: detail ?? null,
      retryable,
      persisted: false,
    });

  if (!REPORTING_USE_CASE_CODES.includes(useCaseCode)) {
    await record('GOVERNANCE_REFUSAL', 'USE_CASE_NOT_REGISTERED', 'Unknown reporting assistance capability requested.');
    return json(
      { error: 'This assistance capability is not approved for management reporting', code: 'USE_CASE_NOT_APPROVED' },
      400,
    );
  }
  if (useCaseCode === 'EVIDENCE_PACK_SUMMARY' && !packId) {
    return json({ error: 'An evidence pack is required for this capability', code: 'BAD_REQUEST' }, 400);
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
      governance_note:
        'Deterministic management information, drill-down, period comparison, coverage reporting and evidence packs are unaffected.',
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
    return unavailable('EXTERNAL_DATA_NOT_SUPPORTED', 'External data access is not implemented for reporting assistance.');
  }
  if (String(gov.allowed_fact_scope ?? ALLOWED_SOURCE) !== ALLOWED_SOURCE) {
    await record('GOVERNANCE_REFUSAL', 'SOURCE_POLICY_VIOLATION', null, gov);
    return json({ error: 'Assistance source policy violation', code: 'SOURCE_POLICY_VIOLATION' }, 403);
  }

  // 3. Governed fact package — the sole permitted source, run as the caller so
  //    sector scope, pack access and view authority are enforced by the database.
  const { data: contextData, error: contextError } = await authClient.rpc('conduct_reporting_ai_context', {
    _use_case_code: useCaseCode,
    _period_start: periodStart,
    _period_end: periodEnd,
    _sector_id: sectorId,
    _regulator_id: regulatorId,
    _pack_id: packId,
    _pack_version: packVersion,
  });

  if (contextError) {
    const msg = contextError.message ?? '';
    if (/not_authori|permission|out of scope|out_of_scope|42501|row-level security/i.test(msg)) {
      await record('SCOPE_REFUSAL', 'SUBJECT_OUT_OF_SCOPE', msg, gov);
      return json({ error: 'This reporting scope sits outside your supervisory remit', code: 'OUT_OF_SCOPE' }, 403);
    }
    await record('FAILURE', 'CONTEXT_UNAVAILABLE', msg, gov);
    return json({ error: 'The management reporting facts could not be prepared', code: 'CONTEXT_UNAVAILABLE' }, 400);
  }

  const context = (contextData ?? {}) as Record<string, unknown>;
  const snapshot = (context.snapshot ?? {}) as Record<string, unknown>;
  const fingerprint = String(context.facts_signature ?? '');
  const period = (context.period ?? {}) as Record<string, unknown>;
  const permitted = permittedReferences(context);
  const figures = permittedFigures(context);

  if (!fingerprint || Object.keys(snapshot).length === 0 || figures.length === 0) {
    await record('FAILURE', 'CONTEXT_INCOMPLETE', 'No deterministic measures were supplied.', gov, fingerprint || null);
    return json({ error: 'The management reporting facts are incomplete', code: 'CONTEXT_UNAVAILABLE' }, 400);
  }

  // 4. Use-case boundary re-checks that must hold regardless of configuration drift.
  const { data: useCaseRow } = await adminClient
    .from('conduct_ai_use_cases')
    .select('code, label, allowed_source, citations_required, workflow_mutation_allowed, limitation_policy, is_enabled')
    .eq('code', useCaseCode)
    .maybeSingle();
  const useCase = (useCaseRow ?? {}) as Record<string, unknown>;
  if (String(useCase.allowed_source ?? '') !== ALLOWED_SOURCE) {
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
            name: 'management_reporting_advisory',
            strict: true,
            schema: buildAdvisorySchema(useCaseCode),
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

  // 6. Grounding and numeric integrity — supplied references and supplied
  //    deterministic values only. The model may not compute reporting figures.
  const grounding = checkGrounding(output, permitted, figures);
  if (isRejectable(grounding)) {
    const detail = rejectionDetail(grounding);
    const reason = grounding.unsupportedFigures.length > 0
      || grounding.unsupportedNarrativeNumbers.length > 0
      || grounding.inventedMeasureCodes.length > 0
        ? 'UNSUPPORTED_FIGURE'
        : 'UNGROUNDED_CITATION';
    await record('REFUSAL', reason, detail, gov, fingerprint);
    return json({
      ok: false,
      state: 'AI_OUTPUT_REJECTED',
      persisted: false,
      reason,
      message:
        'The draft narrative was rejected because it stated figures or references that do not reconcile with the deterministic management information. Nothing was recorded.',
      detail,
      unsupported_figures: grounding.unsupportedFigures,
      unsupported_numbers: grounding.unsupportedNarrativeNumbers,
      invented_references: grounding.invented,
    }, 200);
  }
  if (useCase.citations_required === true && permitted.length > 0 && grounding.cited.length === 0) {
    await record('REFUSAL', 'MISSING_CITATIONS', null, gov, fingerprint);
    return unavailable('MISSING_CITATIONS', 'The response did not cite any of the supplied measures or records.');
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
  const scope = (snapshot.scope ?? {}) as Record<string, unknown>;
  const resolvedStart = String(period.start ?? scope.period_start ?? '');
  const resolvedEnd = String(period.end ?? scope.period_end ?? '');
  const subjectKey = useCaseCode === 'EVIDENCE_PACK_SUMMARY'
    ? String(((snapshot.pack ?? {}) as Record<string, unknown>).reference ?? packId ?? '')
    : `MI ${resolvedStart} to ${resolvedEnd}`;

  // 7. Recording — governed RPC only. Review state defaults to NOT_REVIEWED.
  const { data: recordedId, error: recordError } = await adminClient.rpc('conduct_reporting_ai_insight_record', {
    _use_case_code: useCaseCode,
    _subject_key: subjectKey,
    _sector_id: sectorId,
    _regulator_id: regulatorId,
    _window_start: resolvedStart || null,
    _window_end: resolvedEnd || null,
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
    _pack_id: packId,
    _pack_version: packVersion,
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
    disclosure: 'AI suggestion — requires human review',
    subject: { type: useCaseCode === 'EVIDENCE_PACK_SUMMARY' ? 'evidence_pack' : 'management_information', key: subjectKey },
    scope: {
      period_start: resolvedStart,
      period_end: resolvedEnd,
      sectors_in_view: scope.sectors_in_view ?? null,
      sector_scope: scope.sector_scope ?? null,
      entity_population: scope.entity_population ?? null,
    },
    provenance: {
      provider,
      model,
      model_version: modelVersion,
      model_display_name: gov.model_display_name ?? null,
      prompt_template_code: instructionCode,
      prompt_template_version: instructionVersion,
      snapshot_fingerprint: fingerprint,
      source: ALLOWED_SOURCE,
      use_case_version: gov.use_case_version ?? null,
      external_data: 'none',
    },
    advisory: { ...output, use_case: useCaseCode, limitations, confidence },
    figures_reconciled: (output.figures_used as unknown[]) ?? [],
    citations,
  });
});
