// Advisory AI analysis for supervisory modules: examinations, enforcement,
// complaints/market conduct, cross-module intelligence and executive
// workbenches.
//
// Contract (identical to generate-prudential-ai-analysis):
//   - authoritative data is read from the platform's own records
//   - the model INTERPRETS / SUMMARISES / DRAFTS text only
//   - nothing here writes to a supervisory table, changes a status, creates an
//     action, finding, notice, task or workflow transition, or satisfies any
//     control. Output is stored in `ai_insights` for caching and audit only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { logIntegration } from '../_shared/integration-log.ts';
import { requireUserPermission } from '../_shared/authz.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type Module = 'examination' | 'enforcement' | 'complaints' | 'conduct' | 'cross_module' | 'executive';

const MODULE_PERMISSION: Record<Module, [string, string]> = {
  examination: ['prudential_supervision', 'view'],
  enforcement: ['enforcement_management', 'view'],
  complaints: ['complaint_management', 'view'],
  conduct: ['market_conduct', 'view'],
  cross_module: ['prudential_supervision', 'view'],
  executive: ['admin_dashboard', 'view'],
};

interface Spec {
  module: Module;
  title: string;
  instruction: string;
}

const SPECS: Record<string, Spec> = {
  // ---------- Examination / inspection ----------
  examination_brief: {
    module: 'examination',
    title: 'AI examination preparation brief',
    instruction:
      'Summarise what a supervisor should know before this examination: recent supervisory history, unresolved matters, prior findings and their status, and areas with repeated issues. Do not propose a scope decision as final.',
  },
  scope_suggestions: {
    module: 'examination',
    title: 'AI suggested focus areas for scoping',
    instruction:
      'Suggest candidate examination focus areas, each justified by a supplied fact. These are suggestions for the examiner to accept, edit or ignore; the approved scope remains entirely human-authored.',
  },
  data_request_suggestions: {
    module: 'examination',
    title: 'AI suggested information requests',
    instruction:
      'Suggest information/document requests that would close evidence gaps for the recorded scope areas. Never state that any request has been issued.',
  },
  workpaper_summary: {
    module: 'examination',
    title: 'AI workpaper summary',
    instruction:
      'Summarise the recorded workpapers: what has been tested, what conclusions were recorded, what is still in progress and where evidence appears incomplete. Never assert a conclusion a workpaper does not record.',
  },
  finding_draft: {
    module: 'examination',
    title: 'AI draft finding text',
    instruction:
      'Produce draft finding narrative sections (condition, criteria/basis, effect, suggested remediation direction) grounded strictly in the recorded evidence. Output is a draft for the examiner to edit and own; it is not a finding.',
  },
  finding_consistency: {
    module: 'examination',
    title: 'AI consistency review of findings',
    instruction:
      'Review the recorded findings for internal inconsistency, duplication, unsupported severity language or missing linkage between issue and evidence. Report observations only; never change a severity or rating.',
  },
  report_draft: {
    module: 'examination',
    title: 'AI draft examination report sections',
    instruction:
      'Draft narrative report sections (background, work performed, summary of matters, overall observations) using only recorded findings and workpapers. The report remains human-authored and human-approved.',
  },
  management_response_review: {
    module: 'examination',
    title: 'AI review of management responses',
    instruction:
      'Summarise the recorded management responses and note where a response does not address the finding, lacks a committed action or lacks a date. Never accept or reject a response.',
  },

  // ---------- Enforcement ----------
  case_chronology: {
    module: 'enforcement',
    title: 'AI case chronology and summary',
    instruction:
      'Produce a chronological summary of this enforcement case from the recorded events, obligations and evidence, plus a short plain-language case summary.',
  },
  evidence_assessment: {
    module: 'enforcement',
    title: 'AI evidence completeness observations',
    instruction:
      'Describe what the recorded evidence supports and where it appears incomplete or unlinked to an alleged breach. Never conclude that a breach is established or that a sanction is warranted.',
  },
  precedent_comparison: {
    module: 'enforcement',
    title: 'AI comparison with recorded past actions',
    instruction:
      'Compare this case with the supplied past enforcement actions on recorded facts only (action type, breach basis, outcome). Never recommend a specific sanction or amount.',
  },
  enforcement_draft: {
    module: 'enforcement',
    title: 'AI draft notice text',
    instruction:
      'Draft narrative sections for an enforcement notice (background, alleged conduct, basis, matters relied upon, next steps) using only recorded facts. This is drafting assistance; issuance, approval and legal review remain human.',
  },
  sanction_factors: {
    module: 'enforcement',
    title: 'AI aggravating and mitigating factors observed',
    instruction:
      'List factors present in the record that a decision maker may treat as aggravating or mitigating, each tied to a recorded fact. Do not propose a sanction, quantum or outcome.',
  },

  // ---------- Complaints / market conduct ----------
  complaint_classification: {
    module: 'complaints',
    title: 'AI suggested categorisation',
    instruction:
      'Suggest a likely category, product area and conduct theme for this complaint, with the wording that supports each suggestion. Severity, priority and category of record remain system/human controlled — never state them as assigned.',
  },
  complaint_summary: {
    module: 'complaints',
    title: 'AI complaint case summary',
    instruction:
      'Summarise this complaint for a supervisor: what is alleged, what the licensee has said, what evidence exists, what has happened so far and what appears outstanding.',
  },
  similar_complaints: {
    module: 'complaints',
    title: 'AI similar complaints observed',
    instruction:
      'Describe how the supplied related complaints resemble this one (same licensee, product, theme, time window). Never state that cases are duplicates as a decision; duplicate handling stays with the existing process.',
  },
  conduct_recurrence: {
    module: 'conduct',
    title: 'AI recurring conduct pattern observations',
    instruction:
      'Describe recurring conduct themes across the supplied complaint volumes, products and licensees, and note where volumes are too small for a reliable pattern.',
  },
  investigation_assistance: {
    module: 'complaints',
    title: 'AI investigation support notes',
    instruction:
      'From the record, note evidence gaps, unanswered questions and lines of enquiry a case officer may wish to pursue. Never create or assign a task.',
  },
  resolution_draft: {
    module: 'complaints',
    title: 'AI draft response text',
    instruction:
      'Draft response/outcome narrative sections grounded in the recorded facts and resolution notes. The decision, tone and final wording remain the case officer\'s.',
  },
  qa_assistance: {
    module: 'complaints',
    title: 'AI closure quality observations',
    instruction:
      'Note whether the record shows the allegation addressed, evidence considered, a stated outcome and a rationale — and what appears missing. Never approve, reject or pass a QA review.',
  },

  // ---------- Cross-module intelligence ----------
  entity_supervisory_brief: {
    module: 'cross_module',
    title: 'AI entity supervisory brief',
    instruction:
      'Produce a single supervisory brief for this entity across prudential risk, examinations, complaints/conduct and enforcement. Note where signals in different modules point the same way, and where the record is thin.',
  },
  cross_module_patterns: {
    module: 'cross_module',
    title: 'AI cross-module pattern observations',
    instruction:
      'Describe patterns visible across the supplied module summaries — repeated themes, clustering by product or sector, or the same issue recurring after remediation.',
  },
  related_events: {
    module: 'cross_module',
    title: 'AI related supervisory events',
    instruction:
      'Point out recorded events in other modules that a supervisor working this case may want to be aware of, with the reason each is relevant.',
  },
  supervisory_query: {
    module: 'cross_module',
    title: 'AI answer to supervisory question',
    instruction:
      'Answer the supervisor\'s question using ONLY the supplied records. If the records do not contain the answer, say so plainly and list what would be needed. Never estimate or extrapolate a figure.',
  },

  // ---------- Executive ----------
  executive_briefing: {
    module: 'executive',
    title: 'AI executive supervisory briefing',
    instruction:
      'Write a short executive briefing over the supplied portfolio counts and movements: what stands out, where pressure is concentrated, and what appears to be improving.',
  },
  what_changed: {
    module: 'executive',
    title: 'AI change summary',
    instruction:
      'Summarise what changed over the supplied window using the counts and movements provided. Never introduce a figure that is not supplied.',
  },
  suggested_priorities: {
    module: 'executive',
    title: 'AI suggested review priorities',
    instruction:
      'Suggest areas that may warrant executive attention, each justified by a supplied figure. These are suggestions only — no target, action or escalation is created.',
  },
  meeting_brief: {
    module: 'executive',
    title: 'AI supervisory meeting brief',
    instruction:
      'Draft talking points for a supervisory meeting from the supplied figures: position, movement, outstanding matters and open questions.',
  },
};

const SCHEMA_HINT = `{
  "summary": string,
  "key_observations": [{"text": string, "evidence": [string]}],
  "chronology": [{"text": string, "evidence": [string]}],
  "issues": [{"text": string, "evidence": [string]}],
  "risks": [{"text": string, "evidence": [string]}],
  "gaps": [{"text": string, "evidence": [string]}],
  "suggested_focus_areas": [string],
  "draft_sections": [{"heading": string, "text": string}],
  "confidence": "high" | "moderate" | "limited",
  "limitations": [string],
  "insufficient_evidence": boolean
}`;

const SYSTEM_PROMPT = `You are a supervisory analyst assistant for a financial services regulator.
You produce ADVISORY interpretation, summarisation and draft text only. Absolute rules:
- Use ONLY the facts in the supplied JSON. Never invent or estimate a value, date, name, count, breach, rating or outcome.
- Never contradict a supplied status, severity, rating, classification or decision, and never state that any decision, approval, issuance, action or workflow step has been taken.
- Distinguish fact, correlation and possible interpretation. If a cause is not established by the record, say so.
- Draft text is a starting point for a human author. Never present it as approved, issued or final.
- Suggestions are for human consideration only. Never phrase them as actions created or obligations imposed.
- Omit sections that do not apply rather than padding them.
- If the record is too thin for a reliable conclusion, set "insufficient_evidence": true and keep the summary short and honest.
- Every "evidence" entry must be a short factual string quoting a supplied value.
Return strict JSON only, matching this shape exactly: ${SCHEMA_HINT}`;

const MODEL = 'google/gemini-3.5-flash';

/** Trim a row set to the fields the model needs. */
function pick<T extends Record<string, unknown>>(rows: T[] | null | undefined, fields: string[], limit = 40) {
  return (rows ?? []).slice(0, limit).map((r) => {
    const out: Record<string, unknown> = {};
    for (const f of fields) if (r[f] !== undefined && r[f] !== null) out[f] = r[f];
    return out;
  });
}

async function assembleFacts(
  supa: ReturnType<typeof createClient>,
  module: Module,
  analysisType: string,
  scopeId: string | null,
  extra: { question?: string | null; context?: unknown },
): Promise<Record<string, unknown>> {
  const facts: Record<string, unknown> = { module, analysis_type: analysisType };
  if (extra.question) facts.supervisor_question = String(extra.question).slice(0, 1000);
  if (extra.context && typeof extra.context === 'object') facts.screen_context = extra.context;

  if (module === 'examination' && scopeId) {
    const [exam, scoping, findings, workpapers, requests] = await Promise.all([
      supa.from('examinations').select('*').eq('id', scopeId).maybeSingle(),
      supa.from('examination_scoping').select('*').eq('examination_id', scopeId),
      supa.from('examination_findings').select('*').eq('examination_id', scopeId),
      supa.from('examination_workpapers').select('*').eq('examination_id', scopeId),
      supa.from('examination_data_requests').select('*').eq('examination_id', scopeId),
    ]);
    const exRow = exam.data as Record<string, unknown> | null;
    facts.examination = exRow
      ? pick([exRow], [
          'reference', 'title', 'examination_type', 'stage', 'risk_rating', 'overall_conclusion',
          'period_under_review_start', 'period_under_review_end', 'fieldwork_start', 'fieldwork_end',
        ])[0]
      : null;
    facts.scoping = pick(scoping.data as any[], [
      'objectives', 'risk_focus_areas', 'legal_basis', 'scope_exclusions', 'methodology', 'approved_at',
    ], 5);
    facts.findings = pick(findings.data as any[], [
      'reference', 'title', 'category', 'severity', 'status', 'criteria_breached', 'observation',
      'root_cause', 'recommendation', 'entity_response', 'target_date',
    ]);
    facts.workpapers = pick(workpapers.data as any[], [
      'reference', 'area', 'procedure_performed', 'evidence_reference', 'conclusion', 'status',
      'reviewed_at', 'review_notes',
    ]);
    facts.information_requests = pick(requests.data as any[], [
      'item_no', 'title', 'description', 'status', 'due_date', 'received_at', 'entity_response',
    ]);
    const entityId = (exRow as any)?.entity_id ?? null;
    if (entityId) {
      const [priorExams, actions] = await Promise.all([
        supa.from('examinations').select('reference, title, examination_type, stage, risk_rating, fieldwork_end')
          .eq('entity_id', entityId).neq('id', scopeId).order('created_at', { ascending: false }).limit(10),
        supa.from('prudential_actions').select('action_reference, title, action_type, severity, status, due_date')
          .eq('entity_id', entityId).order('created_at', { ascending: false }).limit(25),
      ]);
      facts.prior_examinations = priorExams.data ?? [];
      facts.open_supervisory_actions = actions.data ?? [];
    }
  }

  if (module === 'enforcement' && scopeId) {
    const [action, events, evidence, obligations] = await Promise.all([
      supa.from('enforcement_actions').select('*').eq('id', scopeId).maybeSingle(),
      supa.from('enforcement_case_events').select('*').eq('case_id', scopeId).order('created_at'),
      supa.from('enforcement_compliance_evidence').select('*').eq('case_id', scopeId),
      supa.from('enforcement_obligations').select('*').eq('case_id', scopeId),
    ]);
    const row = action.data as Record<string, unknown> | null;
    facts.case = row
      ? pick([row], [
          'case_number', 'enforcement_type', 'status', 'description', 'findings', 'date_opened',
          'notice_issued_at', 'response_received_at', 'response_summary', 'decision_at',
          'decision_outcome', 'decision_rationale', 'penalty_amount', 'penalty_currency',
          'monitoring_state', 'non_compliance_flag', 'non_compliance_note',
        ])[0]
      : null;
    facts.case_events = pick(events.data as any[], ['event_type', 'note', 'created_at'], 60);
    facts.evidence = pick(evidence.data as any[], [
      'description', 'evidence_type', 'accepted', 'submitted_at', 'review_note',
    ]);
    facts.obligations = pick(obligations.data as any[], ['obligation', 'detail', 'status', 'deadline', 'breach_note']);
    if (analysisType === 'precedent_comparison') {
      const { data: others } = await supa
        .from('enforcement_actions')
        .select('case_number, enforcement_type, status, description, decision_outcome, decision_at, penalty_amount')
        .neq('id', scopeId)
        .order('created_at', { ascending: false })
        .limit(15);
      facts.past_actions_on_record = others ?? [];
    }
  }

  if ((module === 'complaints' || module === 'conduct') && scopeId) {
    const [complaint, evidence, tasks, rfis, corr] = await Promise.all([
      supa.from('complaints').select('*').eq('id', scopeId).maybeSingle(),
      supa.from('complaint_evidence').select('*').eq('complaint_id', scopeId),
      supa.from('complaint_investigation_tasks').select('*').eq('complaint_id', scopeId),
      supa.from('complaint_rfis').select('*').eq('complaint_id', scopeId),
      supa.from('complaint_correspondence').select('*').eq('complaint_id', scopeId).order('created_at').limit(30),
    ]);
    const row = complaint.data as Record<string, unknown> | null;
    facts.complaint = row
      ? pick([row], [
          'complaint_number', 'subject', 'description', 'status', 'severity', 'priority', 'customer_type',
          'created_at', 'sla_due_at', 'acknowledged_at', 'resolved_at', 'closed_at', 'closure_reason',
          'closure_category', 'investigation_notes', 'resolution', 'resolution_notes', 'findings',
          'repeat_complaint_count', 'vulnerability_indicator', 'vulnerability_notes',
        ])[0]
      : null;
    facts.evidence = pick(evidence.data as any[], ['label', 'description', 'created_at']);
    facts.case_work = pick(tasks.data as any[], ['title', 'description', 'status', 'due_date', 'completed_at']);
    facts.information_requests = pick(rfis.data as any[], [
      'summary', 'status', 'due_at', 'submitted_at', 'closure_notes', 'approval_state',
    ]);
    facts.correspondence = pick(corr.data as any[], ['direction', 'subject', 'created_at'], 30);

    const licenseeId = (row as any)?.licensee_id ?? null;
    if (licenseeId && ['similar_complaints', 'conduct_recurrence'].includes(analysisType)) {
      const { data: related } = await supa
        .from('complaints')
        .select('complaint_number, subject, status, severity, priority, created_at, closure_category')
        .eq('licensee_id', licenseeId)
        .neq('id', scopeId)
        .order('created_at', { ascending: false })
        .limit(40);
      facts.other_complaints_same_licensee = related ?? [];
    }
  }

  if (module === 'cross_module' && scopeId) {
    const [licensee, risk, complaints, exams, enf, actions] = await Promise.all([
      supa.from('licensees').select('id, name, status, sector_id, category_id, systemic_importance').eq('id', scopeId).maybeSingle(),
      supa.from('entity_risk_scores').select('score, band, period_key, computed_at, components').eq('entity_id', scopeId).order('computed_at', { ascending: false }).limit(4),
      supa.from('complaints').select('complaint_number, subject, status, severity, priority, created_at').eq('licensee_id', scopeId).order('created_at', { ascending: false }).limit(25),
      supa.from('examinations').select('reference, title, examination_type, stage, risk_rating, fieldwork_end').eq('entity_id', scopeId).order('created_at', { ascending: false }).limit(10),
      supa.from('enforcement_actions').select('case_number, enforcement_type, status, decision_outcome, decision_at').eq('entity_id', scopeId).order('created_at', { ascending: false }).limit(10),
      supa.from('prudential_actions').select('action_reference, title, action_type, severity, status, due_date').eq('entity_id', scopeId).order('created_at', { ascending: false }).limit(25),
    ]);
    facts.entity = licensee.data ?? null;
    facts.risk_scores = risk.data ?? [];
    facts.complaints = complaints.data ?? [];
    facts.examinations = exams.data ?? [];
    facts.enforcement_actions = enf.data ?? [];
    facts.supervisory_actions = actions.data ?? [];
  }

  if (module === 'executive') {
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const counts: Record<string, unknown> = {};
    const tables: Array<[string, string]> = [
      ['complaints', 'complaints'],
      ['examinations', 'examinations'],
      ['enforcement_actions', 'enforcement_actions'],
      ['escalations', 'escalations'],
      ['prudential_actions', 'supervisory_actions'],
    ];
    for (const [table, key] of tables) {
      const total = await supa.from(table).select('id', { count: 'exact', head: true });
      const recent = await supa.from(table).select('id', { count: 'exact', head: true }).gte('created_at', since);
      counts[key] = { total: total.count ?? 0, last_90_days: recent.count ?? 0 };
    }
    facts.portfolio_counts = counts;
    const { data: bands } = await supa
      .from('entity_risk_scores')
      .select('band, entity_id, computed_at')
      .order('computed_at', { ascending: false })
      .limit(400);
    const bandCounts: Record<string, number> = {};
    const seen = new Set<string>();
    for (const r of (bands ?? []) as any[]) {
      if (seen.has(r.entity_id)) continue;
      seen.add(r.entity_id);
      const b = r.band ?? 'unrated';
      bandCounts[b] = (bandCounts[b] ?? 0) + 1;
    }
    facts.entities_by_risk_band = bandCounts;
  }

  return facts;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const analysisType = String(body.analysis_type ?? '');
  const spec = SPECS[analysisType];
  if (!spec) return json({ ok: false, error: 'Unsupported analysis type' }, 400);

  const module = spec.module;
  const [permModule, permAction] = MODULE_PERMISSION[module];
  const gate = await requireUserPermission(req, permModule, permAction);
  if (!gate.ok) return gate.response;
  const userId: string | null = gate.userId ?? null;

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const scopeRaw = String(body.scope ?? 'record');
    const scope = ['record', 'entity', 'portfolio'].includes(scopeRaw) ? scopeRaw : 'record';
    const scopeId: string | null = body.scope_id ?? null;
    const periodKey: string | null = body.period_key ?? null;
    const fingerprint: string | null = body.fingerprint ?? null;
    const label: string = typeof body.label === 'string' ? body.label.slice(0, 200) : '';
    const force = body.force === true;

    if (scope !== 'portfolio' && !scopeId) {
      return json({ ok: false, error: 'A record is required for this analysis' }, 400);
    }

    // Reuse a stored analysis when the underlying record has not moved on.
    if (!force && fingerprint) {
      let q = supa
        .from('ai_insights')
        .select('*')
        .eq('module', module)
        .eq('analysis_type', analysisType)
        .eq('input_fingerprint', fingerprint)
        .order('generated_at', { ascending: false })
        .limit(1);
      q = scopeId ? q.eq('scope_id', scopeId) : q.is('scope_id', null);
      const { data: cachedRows } = await q;
      const cached = cachedRows?.[0];
      if (cached?.id) return json({ ok: true, cached: true, insight: cached });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return json({ ok: false, error: 'AI analysis is not configured', provider_state: 'NOT_CONFIGURED' });
    }

    let facts: Record<string, unknown>;
    try {
      facts = await assembleFacts(supa, module, analysisType, scopeId, {
        question: body.question ?? null,
        context: body.context ?? null,
      });
    } catch (e) {
      return json({
        ok: false,
        error: 'Could not read the supervisory record for analysis',
        provider_state: 'PROVIDER_FAILURE',
        detail: (e as Error)?.message,
      });
    }

    const prompt = `${spec.instruction}

Subject: ${label || 'Supervisory record'}
Period / window: ${periodKey ?? 'not specified'}

Platform records (authoritative, do not alter):
${JSON.stringify(facts).slice(0, 28000)}`;

    const started = Date.now();
    let parsed: Record<string, unknown> | null = null;
    let providerState = 'PROVIDER_FAILURE';
    let failure: string | null = null;

    try {
      const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
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
      integrationKey: `ai-gateway.${module}-${analysisType}`,
      status: failure ? 'failure' : 'success',
      entityType: module,
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
    const payload = { ...parsed, confidence };

    const { data: inserted, error: insertError } = await supa
      .from('ai_insights')
      .insert({
        title: spec.title,
        module,
        insight_kind: 'advisory',
        analysis_type: analysisType,
        scope,
        scope_id: scopeId,
        period_key: periodKey,
        input_fingerprint: fingerprint,
        object_type: module,
        object_id: scopeId,
        payload,
        source_records: facts,
        citations: [],
        provider: 'lovable-ai-gateway',
        model: MODEL,
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
          analysis_type: analysisType,
          payload,
          provider_state: providerState,
          model: MODEL,
          period_key: periodKey,
          input_fingerprint: fingerprint,
          generated_at: new Date().toISOString(),
        },
      });
    }

    return json({ ok: true, cached: false, persisted: true, insight: inserted });
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message ?? 'AI analysis failed' }, 500);
  }
});
