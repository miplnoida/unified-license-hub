import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { logIntegration } from '../_shared/integration-log.ts';
import { requireUserPermission } from "../_shared/authz.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

// Given an individual + optional assessment, call Lovable AI Gateway to
// produce adverse-media findings with citations and per-hit confidence scores.
// Persist each hit as a fp_finding row with source='ai' and citations jsonb.
// Analyst still has to accept/reject each row (via FpScreeningPanel triage).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const __authzGate = await requireUserPermission(req, "fit_and_proper", "configure");
  if (!__authzGate.ok) return __authzGate.response;
  const started = Date.now();

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const individualId: string | undefined = body.individual_id;
    let assessmentId: string | null = body.assessment_id ?? null;
    const triggeredBy: string | null = body.triggered_by ?? null;
    if (!individualId) {
      return new Response(JSON.stringify({ ok: false, error: 'individual_id required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }

    const { data: person, error: pErr } = await supa.from('fp_individuals')
      .select('id, full_name, nationality, national_id, date_of_birth')
      .eq('id', individualId).maybeSingle();
    if (pErr || !person) throw new Error(pErr?.message || 'Individual not found');

    // If no assessment supplied, use latest.
    if (!assessmentId) {
      const { data: latest } = await supa.from('fp_assessments')
        .select('id').eq('individual_id', individualId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      assessmentId = latest?.id ?? null;
    }
    if (!assessmentId) throw new Error('No assessment context — open an assessment first.');

    // Create the run row up front (before the AI call) so every outcome —
    // including "no API key configured" or a failed AI call — leaves a
    // durable trace in the Screening Run Log. Previously those failure paths
    // returned before any row was ever inserted, so a genuinely broken check
    // and a clean "no adverse media found" result looked identical: nothing
    // on screen either way.
    const { data: runRow, error: rErr } = await supa.from('fp_screening_runs').insert({
      assessment_id: assessmentId,
      individual_id: individualId,
      run_type: 'ai_media',
      status: 'in_progress',
      total_checks: 1,
      total_hits: 0,
      triggered_by: triggeredBy,
      config_snapshot: [{ key: 'ai_media_ingest', check_type: 'adverse_media', provider: 'lovable_ai' }],
    }).select('id').single();
    if (rErr || !runRow) throw new Error(rErr?.message || 'Failed to create run');

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      const msg = 'AI media scan is not configured (Lovable AI key missing). Ask an admin to enable the AI gateway.';
      await supa.from('fp_screening_runs').update({
        status: 'failed', completed_at: new Date().toISOString(), error: msg,
      }).eq('id', runRow.id);
      return new Response(JSON.stringify({ ok: false, error: msg, run_id: runRow.id, total_hits: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    const prompt = `You are an adverse-media analyst producing regulator-grade evidence.
Person: ${person.full_name}${person.nationality ? `, nationality ${person.nationality}` : ''}${person.date_of_birth ? `, DOB ${person.date_of_birth}` : ''}.
Search reputable public sources for adverse media (fraud, corruption, sanctions, criminal charges, regulatory action). Respond in strict JSON:
{"findings":[{"title":string,"summary":string(<=400 chars),"confidence":number(0-100),"severity":"low"|"medium"|"high","category":"criminal_history"|"adverse_media","citations":[{"source_url":string,"excerpt":string(<=300 chars),"published_at":string|null}]}]}
Set category to "criminal_history" for a criminal charge, conviction, arrest, or ongoing criminal investigation; use "adverse_media" for anything else (fraud, corruption, sanctions, regulatory action, reputational issues) that isn't itself a criminal matter.
Only return findings you can cite. If none, return {"findings":[]}.`;

    let rawFindings: Any[] = [];
    try {
      const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'Return strict JSON only. Never invent sources.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      if (!aiRes.ok) throw new Error(`AI gateway ${aiRes.status}`);
      const aiData = await aiRes.json();
      const raw = aiData.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(raw);
      rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
    } catch (aiErr) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      await supa.from('fp_screening_runs').update({
        status: 'failed', completed_at: new Date().toISOString(), error: msg,
      }).eq('id', runRow.id);
      return new Response(JSON.stringify({ ok: false, error: `AI media scan failed: ${msg}`, run_id: runRow.id, total_hits: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    const inserts = rawFindings.map((f) => {
      const confidence = Number.isFinite(f.confidence) ? Math.max(0, Math.min(100, Number(f.confidence))) : 50;
      const severity = ['low', 'medium', 'high'].includes(f.severity) ? f.severity : (confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low');
      // Every hit was previously filed under the generic adverse_media
      // check_type regardless of what it actually was — a criminal
      // conviction found via media search couldn't feed criminal-history-
      // specific sector rules or routing. The model now classifies each hit.
      const checkType = f.category === 'criminal_history' ? 'criminal_history' : 'adverse_media';
      const citations = Array.isArray(f.citations) ? f.citations.slice(0, 10).map((c: Any) => ({
        source_url: String(c.source_url || '').slice(0, 500),
        excerpt: String(c.excerpt || '').slice(0, 400),
        published_at: c.published_at || null,
      })).filter((c: Any) => c.source_url) : [];
      return {
        assessment_id: assessmentId,
        individual_id: individualId,
        run_id: runRow.id,
        check_type: checkType,
        source: 'ai',
        title: String(f.title || (checkType === 'criminal_history' ? 'Criminal history hit' : 'Adverse media hit')).slice(0, 240),
        summary: String(f.summary || '').slice(0, 500),
        severity,
        confidence_score: confidence,
        citations,
        raw_payload: { ai_model: 'google/gemini-2.5-flash', category: checkType },
      };
    });

    if (inserts.length) {
      const { error: fErr } = await supa.from('fp_findings').insert(inserts);
      if (fErr) {
        await supa.from('fp_screening_runs').update({
          status: 'failed', completed_at: new Date().toISOString(), error: fErr.message,
        }).eq('id', runRow.id);
        throw new Error(fErr.message);
      }
    }

    await supa.from('fp_screening_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      total_hits: inserts.length,
    }).eq('id', runRow.id);

    await logIntegration(supa as Any, {
      direction: 'outbound',
      integrationKey: 'fp-ai-media-ingest',
      status: 'success',
      entityType: 'fp_assessment',
      entityId: assessmentId,
      actorId: triggeredBy,
      requestSummary: `AI media scan on ${person.full_name}`,
      responseSummary: `${inserts.length} findings`,
      durationMs: Date.now() - started,
    });

    return new Response(JSON.stringify({ ok: true, run_id: runRow.id, total_hits: inserts.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[fp-ai-media-ingest]', msg);
    await logIntegration(supa as Any, {
      direction: 'outbound',
      integrationKey: 'fp-ai-media-ingest',
      status: 'failure',
      error: msg,
      durationMs: Date.now() - started,
    });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  }
});
