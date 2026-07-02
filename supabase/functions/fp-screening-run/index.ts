import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { logIntegration } from '../_shared/integration-log.ts';

// deno-lint-ignore no-explicit-any
type Any = any;

const SANCTIONS_KEYWORDS = ['sanction', 'ofac', 'un list', 'eu list', 'asset freeze', 'terror'];
const PEP_KEYWORDS = ['president', 'prime minister', 'minister', 'governor', 'senator', 'ambassador', 'central bank', 'state-owned'];
const ADVERSE_KEYWORDS = ['fraud', 'money laundering', 'bribery', 'corruption', 'embezzle', 'investigation', 'convicted', 'charged'];

function scan(text: string, keywords: string[]): string[] {
  const hits: string[] = [];
  const lower = (text || '').toLowerCase();
  for (const k of keywords) if (lower.includes(k)) hits.push(k);
  return hits;
}

async function callAdverseMediaAI(fullName: string, nationality: string | null): Promise<{ summary: string; risk: 'low' | 'medium' | 'high' } | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return null;
  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an adverse media analyst. Given a person, respond in strict JSON: {"summary": string (max 300 chars), "risk": "low"|"medium"|"high"}. If you have no reliable info, return low risk with summary "No adverse media detected in training data.".' },
          { role: 'user', content: `Name: ${fullName}${nationality ? `\nNationality: ${nationality}` : ''}\n\nSearch for adverse media (fraud, corruption, sanctions, criminal investigations).` },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    return { summary: String(parsed.summary || '').slice(0, 500), risk: (parsed.risk === 'high' || parsed.risk === 'medium') ? parsed.risk : 'low' };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const started = Date.now();

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const assessmentId: string | undefined = body.assessment_id;
    const runType: string = body.run_type || 'manual';
    const triggeredBy: string | null = body.triggered_by || null;
    if (!assessmentId) {
      return new Response(JSON.stringify({ ok: false, error: 'assessment_id required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const { data: assessment, error: aErr } = await supa.from('fp_assessments').select('id, individual_id, declaration_data').eq('id', assessmentId).maybeSingle();
    if (aErr || !assessment) throw new Error(aErr?.message || 'Assessment not found');

    const { data: person, error: pErr } = await supa.from('fp_individuals').select('id, full_name, nationality, national_id').eq('id', assessment.individual_id).maybeSingle();
    if (pErr || !person) throw new Error(pErr?.message || 'Individual not found');

    const { data: configs, error: cErr } = await supa.from('fp_screening_configs').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (cErr) throw new Error(cErr.message);
    const activeConfigs = configs ?? [];

    // Create run row (in-progress)
    const { data: runRow, error: rErr } = await supa.from('fp_screening_runs').insert({
      assessment_id: assessmentId,
      individual_id: person.id,
      run_type: runType,
      status: 'in_progress',
      total_checks: activeConfigs.length,
      total_hits: 0,
      triggered_by: triggeredBy,
    }).select('id').single();
    if (rErr || !runRow) throw new Error(rErr?.message || 'Failed to create run');

    const decl = (assessment.declaration_data as Any) || {};
    const declStr = JSON.stringify(decl);
    const findings: Any[] = [];

    for (const cfg of activeConfigs) {
      const base = {
        assessment_id: assessmentId,
        individual_id: person.id,
        run_id: runRow.id,
        config_id: cfg.id,
        check_type: cfg.check_type,
        source: cfg.provider || 'internal',
      };

      if (cfg.check_type === 'sanctions') {
        const hits = scan(declStr + ' ' + person.full_name, SANCTIONS_KEYWORDS);
        if (hits.length) findings.push({ ...base, title: `Sanctions keyword match: ${hits.join(', ')}`, severity: cfg.severity_default || 'high', summary: 'Declaration text mentions sanctions-related terms — verify manually.', raw_payload: { keywords: hits } });
      } else if (cfg.check_type === 'pep') {
        const hits = scan(declStr, PEP_KEYWORDS);
        if (hits.length) findings.push({ ...base, title: `Potential PEP indicator: ${hits.join(', ')}`, severity: cfg.severity_default || 'medium', summary: 'Employment history mentions politically-exposed roles.', raw_payload: { keywords: hits } });
      } else if (cfg.check_type === 'criminal') {
        const cr = String(decl.criminal_record || '').trim();
        if (cr && cr.toLowerCase() !== 'none' && cr.toLowerCase() !== 'n/a') {
          findings.push({ ...base, title: 'Self-declared criminal history', severity: cfg.severity_default || 'high', summary: cr.slice(0, 300), raw_payload: {} });
        }
        if (decl.disqualifications) findings.push({ ...base, title: 'Self-declared director disqualification', severity: 'high', summary: 'Individual reported prior disqualification.', raw_payload: {} });
      } else if (cfg.check_type === 'financial') {
        const fs = String(decl.financial_soundness || '').trim();
        if (fs && fs.toLowerCase() !== 'none' && fs.toLowerCase() !== 'n/a') {
          findings.push({ ...base, title: 'Self-declared financial issue', severity: cfg.severity_default || 'medium', summary: fs.slice(0, 300), raw_payload: {} });
        }
        if (decl.bankruptcy) findings.push({ ...base, title: 'Self-declared bankruptcy / insolvency', severity: 'high', summary: 'Individual reported bankruptcy or insolvency.', raw_payload: {} });
      } else if (cfg.check_type === 'regulator_watchlist') {
        const rh = String(decl.regulatory_history || '').trim();
        if (rh && rh.toLowerCase() !== 'none' && rh.toLowerCase() !== 'n/a') {
          findings.push({ ...base, title: 'Self-declared regulatory history', severity: cfg.severity_default || 'medium', summary: rh.slice(0, 300), raw_payload: {} });
        }
        if (decl.disciplinary) findings.push({ ...base, title: 'Self-declared disciplinary action', severity: 'medium', summary: 'Prior disciplinary action reported.', raw_payload: {} });
      } else if (cfg.check_type === 'adverse_media') {
        const ai = await callAdverseMediaAI(person.full_name, person.nationality);
        if (ai && ai.risk !== 'low') {
          findings.push({ ...base, title: `Adverse media (${ai.risk})`, severity: ai.risk === 'high' ? 'high' : 'medium', summary: ai.summary, raw_payload: { ai_model: 'google/gemini-2.5-flash' } });
        }
      }
    }

    if (findings.length) {
      const { error: fErr } = await supa.from('fp_findings').insert(findings);
      if (fErr) throw new Error(fErr.message);
    }

    await supa.from('fp_screening_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      total_hits: findings.length,
    }).eq('id', runRow.id);

    if (findings.length > 0) {
      await supa.from('fp_assessments').update({ status: 'screening' }).eq('id', assessmentId);
    }

    await logIntegration(supa as Any, {
      direction: 'outbound',
      integrationKey: 'fp-screening-run',
      status: 'success',
      entityType: 'fp_assessment',
      entityId: assessmentId,
      actorId: triggeredBy,
      requestSummary: `Ran ${activeConfigs.length} checks on ${person.full_name}`,
      responseSummary: `${findings.length} findings`,
      durationMs: Date.now() - started,
    });

    return new Response(JSON.stringify({ ok: true, run_id: runRow.id, total_checks: activeConfigs.length, total_hits: findings.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[fp-screening-run]', msg);
    await logIntegration(supa as Any, {
      direction: 'outbound',
      integrationKey: 'fp-screening-run',
      status: 'failure',
      error: msg,
      durationMs: Date.now() - started,
    });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
