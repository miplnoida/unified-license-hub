// Advisory AI analysis for prudential risk scoring, ratio/peer analytics and
// risk dashboards.
//
// Strictly advisory: the caller supplies facts that the platform has ALREADY
// computed deterministically (risk score, bands, ratio values, trends, peer
// aggregates, EWI alerts, overdue actions). This function never recomputes a
// metric, never writes to any supervisory table, and never creates actions,
// alerts or workflow transitions. It only produces narrative interpretation
// and stores it in `ai_insights` for caching / audit.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { logIntegration } from '../_shared/integration-log.ts';
import { requireUserPermission } from '../_shared/authz.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const ANALYSIS_TYPES = [
  'risk_interpretation',
  'risk_changes',
  'ewi_priority',
  'trend_commentary',
  'peer_divergence',
  'portfolio_summary',
  'heatmap_movement',
] as const;
type AnalysisType = (typeof ANALYSIS_TYPES)[number];

const TITLES: Record<AnalysisType, string> = {
  risk_interpretation: 'AI risk interpretation',
  risk_changes: 'AI change analysis',
  ewi_priority: 'AI early-warning attention priority',
  trend_commentary: 'AI trend commentary',
  peer_divergence: 'AI peer comparison commentary',
  portfolio_summary: 'AI portfolio supervisory summary',
  heatmap_movement: 'AI risk movement explanation',
};

const INSTRUCTIONS: Record<AnalysisType, string> = {
  risk_interpretation:
    'Explain why this entity\'s risk is at its current level. Identify the main drivers, what is deteriorating and what is improving, and which areas a supervisor may wish to look at first.',
  risk_changes:
    'Explain what changed between the periods provided: score movement, indicators newly triggered or cleared, and metrics that stayed broadly stable.',
  ewi_priority:
    'Rank the supplied early-warning indicators by suggested supervisory attention. Never restate or change a configured severity; express only a suggested attention priority.',
  trend_commentary:
    'Describe the movement in the supplied ratio series: direction, consecutive periods of movement, magnitude, and position relative to thresholds and peer aggregates.',
  peer_divergence:
    'Explain where the entity sits relative to the supplied peer aggregates. If the data does not establish a cause of divergence, say so explicitly.',
  portfolio_summary:
    'Summarise the portfolio: where elevated risk is concentrated, notable movements, clustered deterioration, and areas that may warrant review.',
  heatmap_movement:
    'Explain the supplied deterministic risk classification and its movement using only the component values provided.',
};

const SCHEMA_HINT = `{
  "summary": string,
  "key_observations": [{"text": string, "evidence": [string]}],
  "deteriorating_indicators": [{"text": string, "evidence": [string]}],
  "improving_indicators": [{"text": string, "evidence": [string]}],
  "peer_observations": [{"text": string, "evidence": [string]}],
  "emerging_risks": [{"text": string, "evidence": [string]}],
  "business_impact": [{"text": string, "evidence": [string]}],
  "data_quality": [{"text": string, "evidence": [string]}],
  "suggested_focus_areas": [string],
  "confidence": "high" | "moderate" | "limited",
  "limitations": [string],
  "insufficient_evidence": boolean
}`;

const SYSTEM_PROMPT = `You are a prudential supervision analyst assistant for a financial regulator.
You produce ADVISORY interpretation only. Absolute rules:
- Use ONLY the facts in the supplied JSON. Never invent or estimate a ratio, threshold, peer value, percentile, date, entity, breach or score.
- Never calculate or restate a different value than the one supplied. Never contradict a supplied classification, band, severity or score.
- Emphasise movement and deterioration/improvement rather than restating current values.
- Distinguish fact, correlation and possible interpretation. Never assert a cause the data does not establish; say the cause cannot be established from available data.
- Suggested focus areas are suggestions for a human supervisor only. Never phrase them as decisions taken or actions created.
- Peer information is aggregate only. Never name or infer an individual peer institution.
- If the facts are too thin for a reliable interpretation, set "insufficient_evidence": true and keep the summary short and honest.
- Every observation's "evidence" entries must be short factual strings quoting supplied values.
- "business_impact" is the business point of view: what the supplied movements imply for the institution's
  business model, earnings capacity, funding and capital headroom, its customers and the wider market, and the
  supervisory intensity the position implies. Base every statement on a supplied value; where the record cannot
  support a business reading, state what additional information would be needed.
- "data_quality" is the integrity of the figures being interpreted: internal inconsistencies, period or
  arithmetic mismatches, stale or missing submissions, implausibly round or unchanged values, and how far each
  weakens the observations above. Never assert an error the supplied values do not demonstrate.
Return strict JSON only, matching this shape exactly: ${SCHEMA_HINT}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const gate = await requireUserPermission(req, 'prudential_supervision', 'view');
  if (!gate.ok) return gate.response;
  const userId: string | null = gate.userId ?? null;

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const analysisType = body.analysis_type as AnalysisType;
    const scope = body.scope === 'portfolio' ? 'portfolio' : 'entity';
    const scopeId: string | null = body.scope_id ?? null;
    const periodKey: string | null = body.period_key ?? null;
    const fingerprint: string | null = body.fingerprint ?? null;
    const facts = body.facts;
    const label: string = typeof body.label === 'string' ? body.label.slice(0, 200) : '';
    const force = body.force === true;

    if (!ANALYSIS_TYPES.includes(analysisType)) {
      return json({ ok: false, error: 'Unsupported analysis type' }, 400);
    }
    if (!facts || typeof facts !== 'object') {
      return json({ ok: false, error: 'No supervisory facts supplied' }, 400);
    }
    if (scope === 'entity' && !scopeId) {
      return json({ ok: false, error: 'An entity is required for this analysis' }, 400);
    }

    // Reuse a cached analysis when the deterministic inputs have not changed.
    if (!force && fingerprint) {
      let q = supa
        .from('ai_insights')
        .select('*')
        .eq('module', 'prudential')
        .eq('analysis_type', analysisType)
        .eq('scope', scope)
        .eq('input_fingerprint', fingerprint)
        .order('generated_at', { ascending: false })
        .limit(1);
      q = scopeId ? q.eq('scope_id', scopeId) : q.is('scope_id', null);
      const { data: cachedRows } = await q;
      const cached = cachedRows?.[0];
      if (cached?.id) {
        return json({ ok: true, cached: true, insight: cached });
      }
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return json({ ok: false, error: 'AI analysis is not configured', provider_state: 'NOT_CONFIGURED' });
    }

    const prompt = `${INSTRUCTIONS[analysisType]}

Subject: ${label || (scope === 'portfolio' ? 'Supervised portfolio' : 'Supervised entity')}
Reporting period: ${periodKey ?? 'not specified'}

Platform-calculated facts (authoritative, do not alter):
${JSON.stringify(facts).slice(0, 24000)}`;

    const started = Date.now();
    let parsed: Record<string, unknown> | null = null;
    let providerState = 'PROVIDER_FAILURE';
    let failure: string | null = null;
    const model = 'google/gemini-omni-1.1-flash';

    try {
      const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      if (res.status === 429) {
        providerState = 'RATE_LIMITED';
        throw new Error('AI service is busy — please try again shortly');
      }
      if (res.status === 402) {
        providerState = 'PROVIDER_FAILURE';
        throw new Error('AI credits exhausted for this workspace');
      }
      if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const raw = (await res.json())?.choices?.[0]?.message?.content ?? '{}';
      parsed = JSON.parse(raw);
      providerState = parsed?.insufficient_evidence === true ? 'INSUFFICIENT_DATA' : 'SUCCESS';
    } catch (e) {
      failure = (e as Error)?.message ?? String(e);
    }

    await logIntegration(supa, {
      direction: 'outbound',
      integrationKey: `ai-gateway.prudential-${analysisType}`,
      status: failure ? 'failure' : 'success',
      entityType: scope === 'portfolio' ? 'regulator' : 'licensee',
      entityId: scopeId,
      error: failure ?? undefined,
      durationMs: Date.now() - started,
    });

    if (failure || !parsed) {
      return json({ ok: false, error: failure ?? 'AI analysis failed', provider_state: providerState });
    }

    const confidence = ['high', 'moderate', 'limited'].includes(String(parsed.confidence))
      ? String(parsed.confidence)
      : 'limited';

    const { data: inserted, error: insertError } = await supa
      .from('ai_insights')
      .insert({
        title: TITLES[analysisType],
        module: 'prudential',
        insight_kind: 'advisory',
        analysis_type: analysisType,
        scope,
        scope_id: scopeId,
        period_key: periodKey,
        input_fingerprint: fingerprint,
        entity_id: scope === 'entity' ? scopeId : null,
        object_type: scope === 'entity' ? 'licensee' : 'portfolio',
        object_id: scopeId,
        payload: { ...parsed, confidence },
        source_records: facts,
        citations: [],
        provider: 'lovable-ai-gateway',
        model,
        provider_state: providerState,
        confidence: confidence === 'high' ? 0.9 : confidence === 'moderate' ? 0.6 : 0.3,
        explanation: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 4000) : null,
        review_status: 'pending',
        generated_by: userId,
      })
      .select('*')
      .maybeSingle();

    if (insertError) {
      // Storage failure must not lose the analysis — return it unsaved.
      return json({
        ok: true,
        cached: false,
        persisted: false,
        insight: {
          id: null,
          title: TITLES[analysisType],
          analysis_type: analysisType,
          payload: { ...parsed, confidence },
          provider_state: providerState,
          model,
          period_key: periodKey,
          input_fingerprint: fingerprint,
          generated_at: new Date().toISOString(),
        },
      });
    }

    return json({ ok: true, cached: false, persisted: true, insight: inserted });
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message ?? 'AI analysis failed' });
  }
});
