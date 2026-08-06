import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { logIntegration } from '../_shared/integration-log.ts';
import { requireUserPermission } from "../_shared/authz.ts";
import { invokeIntegration } from '../_shared/integration/invoke.ts';
import { resolveConnection } from '../_shared/connector/runtime.ts';
import {
  mapProviderResult,
  providerCallFor,
  type ProviderCheckType,
} from '../_shared/fp/screeningProvider.ts';


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

type AdverseMediaCategory = 'criminal_history' | 'adverse_media';

type AdverseMediaResult =
  | { ok: true; summary: string; risk: 'low' | 'medium' | 'high'; category: AdverseMediaCategory }
  | { ok: false; reason: string };

// Previously returned `null` on ANY failure (missing key, HTTP error, bad
// JSON) — indistinguishable from a genuine "low risk, nothing found" result,
// so a silently-broken check and a clean subject looked identical downstream.
// Now the caller always gets a definite outcome to act on.
//
// The AI was already asked to search for "criminal investigations" alongside
// fraud/corruption/sanctions, but every hit landed under the generic
// adverse_media check_type regardless of what it actually was — a criminal
// conviction found via media search couldn't feed criminal-history-specific
// sector rules or routing. Now the model also classifies what it found, and
// a criminal-history hit is filed under that check_type instead.
async function callAdverseMediaAI(fullName: string, nationality: string | null): Promise<AdverseMediaResult> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return { ok: false, reason: 'AI gateway not configured (Lovable AI key missing)' };
  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an adverse media analyst. Given a person, respond in strict JSON: {"summary": string (max 300 chars), "risk": "low"|"medium"|"high", "category": "criminal_history"|"adverse_media"}. Use "criminal_history" when the adverse finding is a criminal charge, conviction, arrest, or ongoing criminal investigation; use "adverse_media" for anything else (fraud, corruption, sanctions, regulatory action, reputational issues) that isn\'t itself a criminal matter. If you have no reliable info, return low risk, category "adverse_media", with summary "No adverse media detected in training data.".' },
          { role: 'user', content: `Name: ${fullName}${nationality ? `\nNationality: ${nationality}` : ''}\n\nSearch for adverse media (fraud, corruption, sanctions, criminal investigations).` },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return { ok: false, reason: `AI gateway returned ${res.status}` };
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    return {
      ok: true,
      summary: String(parsed.summary || '').slice(0, 500),
      risk: (parsed.risk === 'high' || parsed.risk === 'medium') ? parsed.risk : 'low',
      category: parsed.category === 'criminal_history' ? 'criminal_history' : 'adverse_media',
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const __authzGate = await requireUserPermission(req, "fit_and_proper", "execute");
  if (!__authzGate.ok) return __authzGate.response;
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
    // Optional: scope this run to a specific set of screening processes (used by
    // automatic screening execution rules). Omitted = run every active config,
    // preserving today's manual "Run Now" behavior.
    const configIds: string[] | undefined = Array.isArray(body.config_ids) && body.config_ids.length ? body.config_ids : undefined;
    if (!assessmentId) {
      return new Response(JSON.stringify({ ok: false, error: 'assessment_id required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const { data: assessment, error: aErr } = await supa.from('fp_assessments').select('id, individual_id, declaration_data').eq('id', assessmentId).maybeSingle();
    if (aErr || !assessment) throw new Error(aErr?.message || 'Assessment not found');

    const { data: person, error: pErr } = await supa.from('fp_individuals').select('id, full_name, nationality, national_id').eq('id', assessment.individual_id).maybeSingle();
    if (pErr || !person) throw new Error(pErr?.message || 'Individual not found');

    let configsQuery = supa.from('fp_screening_configs').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (configIds) configsQuery = configsQuery.in('id', configIds);
    const { data: configs, error: cErr } = await configsQuery;
    if (cErr) throw new Error(cErr.message);
    const activeConfigs = configs ?? [];

    // Create run row (in-progress) with a snapshot of active configs at this instant
    const configSnapshot = activeConfigs.map((c: Any) => ({
      id: c.id, key: c.key, check_type: c.check_type, provider: c.provider,
      severity_default: c.severity_default, sort_order: c.sort_order,
    }));
    const { data: runRow, error: rErr } = await supa.from('fp_screening_runs').insert({
      assessment_id: assessmentId,
      individual_id: person.id,
      run_type: runType,
      status: 'in_progress',
      total_checks: activeConfigs.length,
      total_hits: 0,
      triggered_by: triggeredBy,
      config_snapshot: configSnapshot,
    }).select('id').single();
    if (rErr || !runRow) throw new Error(rErr?.message || 'Failed to create run');

    const decl = (assessment.declaration_data as Any) || {};
    // Legacy shape: declarations submitted via the old hand-coded declaration
    // form stored answers nested under `questionnaire`. Declarations submitted
    // via the new Fit & Proper Declaration form (designed in /admin/forms,
    // form_type='fit_and_proper', see get_fp_declaration_form_public) store a
    // flat object keyed directly by field name instead — evaluateTrigger below
    // checks the new shape first and falls back to the legacy one so
    // historical assessments still re-screen correctly.
    const legacyQ: Record<string, { answer: string; explanation: string }> = decl.questionnaire || {};
    const declStr = JSON.stringify(decl);
    const findings: Any[] = [];

    interface DeclTrigger {
      key: string;
      detailKeys: string[];
      title: string;
      severity: string;
      confidence: number;
      legacyKey?: string;
    }

    // Each entry reads one Yes/No field from PQ09 (Professional Conduct) /
    // PQ011 (Financial Soundness) / PQ014 (Business Affiliations) on the new
    // declaration form and, when answered "Yes", summarises using its
    // "If yes, please provide details" follow-up field(s).
    //
    // PQ014's spec repeats the same "whether in Jamaica or elsewhere..."
    // stem for ~18 different sub-questions about entities the declarant is/was
    // associated with (winding-up, receivership, licence revocation, criminal
    // charges, regulatory censure, etc.) — each is wired individually below
    // rather than only checking the single "director of another FS entity"
    // gate, otherwise the large majority of self-declared adverse history in
    // that tab (and all of PQ011, Financial Soundness) never reaches a
    // check_type and no finding is ever raised for it.
    const TRIGGERS_BY_CHECK_TYPE: Record<string, DeclTrigger[]> = {
      criminal_history: [
        { key: 'pq09_have_you_at_any_time_been_charged_with_or_co', detailKeys: ['pq09_if_charged_please_give_details_of_the_charge', 'pq09_if_convicted_please_detail_the_particulars_o', 'pq09_if_convicted_please_state_the_penalty_impose'], title: 'Self-declared criminal charge or conviction', severity: 'high', confidence: 95, legacyKey: 'criminal_conviction' },
        { key: 'pq09_have_you_ever_been_disqualified_by_a_court_o', detailKeys: ['pq09_if_yes_please_provide_the_details_9'], title: 'Self-declared director disqualification', severity: 'high', confidence: 95, legacyKey: 'director_disqualified' },
        { key: 'pq09_has_suit_ever_been_brought_against_you_in_yo', detailKeys: ['pq09_as_far_as_possible_please_give_full_details'], title: 'Outstanding civil judgment or enforcement order', severity: 'medium', confidence: 85, legacyKey: 'civil_judgment' },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_7', detailKeys: ['pq014_if_yes_please_provide_the_details_11'], title: 'Associated entity has been sued', severity: 'medium', confidence: 80 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_8', detailKeys: ['pq014_if_yes_please_provide_the_details_12'], title: 'Associated entity charged with a criminal offence', severity: 'high', confidence: 95 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_9', detailKeys: ['pq014_if_yes_please_provide_the_details_13'], title: 'Associated entity sanctioned for a criminal offence', severity: 'high', confidence: 95 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_10', detailKeys: ['pq014_if_yes_please_provide_the_details_15'], title: 'Associated entity adjudged to have been conducted imprudently or fraudulently', severity: 'high', confidence: 90 },
      ],
      regulator_watchlist: [
        { key: 'pq09_do_you_hold_or_have_you_ever_held_or_applied', detailKeys: ['pq09_if_any_such_application_was_refused_or_withd'], title: 'Self-declared licence refusal or revocation (personal)', severity: 'medium', confidence: 90, legacyKey: 'license_refused' },
        { key: 'pq09_does_any_company_with_which_you_are_or_have', detailKeys: ['pq09_if_any_such_application_was_refused_or_withd_2'], title: 'Self-declared licence refusal or revocation (associated company)', severity: 'medium', confidence: 85, legacyKey: 'license_revoked' },
        { key: 'pq09_have_you_ever_been_the_subject_of_any_invest', detailKeys: ['pq09_if_yes_please_provide_the_details_3'], title: 'Self-declared disciplinary proceedings (professional body)', severity: 'medium', confidence: 90, legacyKey: 'disciplinary_proceedings' },
        { key: 'pq09_have_you_ever_been_censured_disciplined_or_p', detailKeys: ['pq09_if_yes_please_provide_the_details_5'], title: 'Self-declared disciplinary action (regulatory authority)', severity: 'high', confidence: 90 },
        { key: 'pq09_have_you_ever_been_censured_disciplined_or_p_2', detailKeys: ['pq09_if_yes_please_provide_the_details_6'], title: 'Self-declared disciplinary action (professional body, second instance)', severity: 'high', confidence: 90 },
        { key: 'pq09_have_you_ever_been_censured_disciplined_or_p_3', detailKeys: ['pq09_if_yes_please_provide_the_details_7'], title: 'Self-declared disciplinary action (financial services regulator)', severity: 'high', confidence: 90 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_3', detailKeys: ['pq014_if_yes_please_provide_the_details_7'], title: "Associated entity's licence has been revoked", severity: 'high', confidence: 90 },
        { key: 'pq014_which_has_been_the_subject_of_censure_action', detailKeys: ['pq014_if_yes_please_provide_the_details_14'], title: 'Associated entity subject to censure action by a supervisory/regulatory body', severity: 'high', confidence: 90 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_13', detailKeys: ['pq014_if_yes_please_provide_the_details_18'], title: 'Associated entity placed under temporary/judicial management, statutory censure, or vesting order', severity: 'high', confidence: 90 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_15', detailKeys: ['pq014_if_yes_please_provide_the_details_19'], title: 'Censured/disciplined by a regulatory authority (as manager of an associated entity)', severity: 'high', confidence: 90 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_16', detailKeys: ['pq014_if_yes_please_provide_the_details_20'], title: 'Censured/disciplined by an officially appointed enquiry (as manager of an associated entity)', severity: 'medium', confidence: 85 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_17', detailKeys: ['pq014_if_yes_please_provide_the_details_21'], title: 'Censured/disciplined by a financial services regulator (as manager of an associated entity)', severity: 'high', confidence: 90 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_18', detailKeys: ['pq014_if_yes_please_provide_the_details_22'], title: 'Censured/disciplined by a Court (as manager of an associated entity)', severity: 'medium', confidence: 85 },
      ],
      credit_history: [
        { key: 'pq09_has_a_bankruptcy_petition_ever_been_served_o', detailKeys: ['pq09_if_yes_please_provide_the_details_10'], title: 'Self-declared bankruptcy petition', severity: 'high', confidence: 90, legacyKey: 'bankruptcy' },
        { key: 'pq09_have_you_ever_in_any_jurisdiction_been_adjud', detailKeys: ['pq09_if_yes_please_provide_the_details_11'], title: 'Self-declared bankruptcy / insolvency', severity: 'high', confidence: 95 },
        { key: 'pq09_have_you_ever_in_any_jurisdiction_had_a_rece', detailKeys: ['pq09_if_yes_please_provide_the_details_12'], title: 'Self-declared receiving / administrative order', severity: 'medium', confidence: 90, legacyKey: 'insolvent_director' },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve', detailKeys: ['pq014_if_yes_please_provide_the_details_5'], title: 'Associated entity served with a winding-up petition', severity: 'high', confidence: 90 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_2', detailKeys: ['pq014_if_yes_please_provide_the_details_6'], title: 'Associated entity wound up by a Court', severity: 'high', confidence: 95 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_4', detailKeys: ['pq014_if_yes_please_provide_the_details_8'], title: 'Associated entity placed in receivership', severity: 'high', confidence: 90 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_5', detailKeys: ['pq014_if_yes_please_provide_the_details_9'], title: 'Associated entity entered an arrangement/composition with creditors', severity: 'medium', confidence: 85 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_6', detailKeys: ['pq014_if_yes_please_provide_the_details_10'], title: 'Administrative order made against an associated entity', severity: 'medium', confidence: 85 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_11', detailKeys: ['pq014_if_yes_please_provide_the_details_16'], title: 'Associated entity failed to meet prescribed solvency requirements', severity: 'high', confidence: 90 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_12', detailKeys: ['pq014_if_yes_please_provide_the_details_17'], title: 'Associated entity received government financial assistance to restructure', severity: 'medium', confidence: 80 },
        { key: 'pq014_whether_in_jamaica_or_elsewhere_have_you_eve_14', detailKeys: ['pq014_please_give_details_including_name_of_compan'], title: 'Associated entity became insolvent or went into liquidation', severity: 'high', confidence: 90 },
        { key: 'pq011_has_any_bank_or_other_financial_institution', detailKeys: ['pq011_if_yes_please_provide_the_details'], title: 'Bank/financial institution threatened legal action or declined business over unpaid debts', severity: 'medium', confidence: 80 },
        { key: 'pq011_have_you_your_company_partnership_business_u', detailKeys: ['pq011_if_yes_please_provide_the_details_2'], title: 'Financial services counterparty unwilling to continue transacting', severity: 'medium', confidence: 75 },
        { key: 'pq011_has_any_person_firm_company_or_partnership_b', detailKeys: [], title: 'Third party guaranteed declarant’s indebtedness', severity: 'medium', confidence: 70 },
        { key: 'pq011_are_you_in_your_personal_capacity_or_through', detailKeys: ['pq011_if_yes_please_provide_the_details_4'], title: 'Guaranteeing third-party debts in excess of J$2.5mn', severity: 'medium', confidence: 75 },
        { key: 'pq011_has_any_loan_or_credit_facility_or_part_ther', detailKeys: ['pq011_if_yes_please_provide_full_details_of_the_de', 'pq011_the_circumstances_surrounding_the_action', 'pq011_current_status'], title: 'Loan/credit facility restructured, provided against, or written off for non-payment', severity: 'high', confidence: 90 },
        { key: 'pq011_has_any_financial_institution_which_has_exte', detailKeys: ['pq011_full_details_of_loan_s', 'pq011_reason_for_actions_taken', 'pq011_current_status_2'], title: 'Debt sold/assigned to a collection agency for non-payment', severity: 'high', confidence: 90 },
      ],
      pep: [
        { key: 'pq014_have_you_ever_been_or_are_you_currently_a_di', detailKeys: [], title: 'Director of another financial services entity', severity: 'medium', confidence: 70, legacyKey: 'other_regulated_roles' },
      ],
    };

    function isYes(v: unknown): boolean {
      return typeof v === 'string' && v.trim().toLowerCase() === 'yes';
    }

    function evaluateTrigger(t: DeclTrigger): string | null {
      if (isYes(decl[t.key])) {
        const detail = t.detailKeys
          .map((k) => (typeof decl[k] === 'string' ? decl[k].trim() : ''))
          .filter(Boolean)
          .join(' ');
        return detail || `Self-declared: ${t.title}`;
      }
      if (t.legacyKey) {
        const entry = legacyQ[t.legacyKey];
        if (entry && entry.answer === 'yes') {
          return (entry.explanation || '').trim() || `Self-declared: ${t.legacyKey.replace(/_/g, ' ')}`;
        }
      }
      return null;
    }

    // ── External screening provider stage ────────────────────────────────────
    // Sanctions, PEP and adverse-media checks are executed against the
    // registered provider through the ONE canonical Integration Manager entry
    // point. Fallback is forbidden: a sanctions/AML answer may never be
    // substituted by internal logic. Every outcome (hit / clean /
    // not_configured / failed) is recorded on the run so a broken check can
    // never be mistaken for a clean subject. The keyword and self-declaration
    // logic below still runs alongside it, unchanged.
    const providerOutcomes: Any[] = [];
    const envCache = new Map<string, string | null>();
    async function environmentOf(key: string): Promise<string | null> {
      if (!envCache.has(key)) {
        const conn = await resolveConnection(supa as Any, key);
        envCache.set(key, conn?.environment ?? null);
      }
      return envCache.get(key) ?? null;
    }

    async function runProviderCheck(cfg: Any, base: Any, checkType: ProviderCheckType) {
      const call = providerCallFor(checkType, person as Any, `fp:${runRow.id}:${checkType}`);
      if (!call) return;
      const result = await invokeIntegration(supa as Any, {
        integrationKey: call.integrationKey,
        operation: call.operation,
        sourceModule: 'fit_and_proper',
        businessEvent: `fp.screening.${checkType}`,
        sourceEntityType: 'fp_assessment',
        sourceEntityId: assessmentId!,
        actorId: triggeredBy,
        idempotencyKey: `fp:${runRow.id}:${checkType}`,
        payload: call.payload,
        fallbackPolicy: 'forbid',
        retryQueue: true,
        metadata: { individual_id: person.id, run_id: runRow.id, check_type: checkType },
      });
      const mapped = mapProviderResult({
        checkType,
        integrationKey: call.integrationKey,
        environment: await environmentOf(call.integrationKey),
        result: result as Any,
        base: { ...base, config_id: cfg.id },
        defaultSeverity: cfg.severity_default ?? null,
      });
      providerOutcomes.push(mapped.outcome);
      for (const f of mapped.findings) findings.push(f);
    }

    for (const cfg of activeConfigs) {
      const base = {
        assessment_id: assessmentId,
        individual_id: person.id,
        run_id: runRow.id,
        config_id: cfg.id,
        check_type: cfg.check_type,
        source: cfg.provider || 'internal',
      };

      if (cfg.check_type === 'sanctions' || cfg.check_type === 'pep' || cfg.check_type === 'adverse_media') {
        await runProviderCheck(cfg, base, cfg.check_type as ProviderCheckType);
      }


      if (cfg.check_type === 'sanctions') {
        // Keyword scan across full declaration text + name
        const hits = scan(declStr + ' ' + person.full_name, SANCTIONS_KEYWORDS);
        if (hits.length) {
          findings.push({ ...base, title: `Sanctions keyword match: ${hits.join(', ')}`, severity: cfg.severity_default || 'high', summary: 'Declaration text mentions sanctions-related terms — verify manually.', raw_payload: { keywords: hits }, confidence_score: 85,
            severity_basis: { source: 'keyword_scan', reason: `Declaration text/name matched sanctions-related keyword(s): ${hits.join(', ')}. Not a real sanctions-list check — flagged for manual verification.`, matched_keywords: hits } });
        }

      } else if (cfg.check_type === 'pep') {
        // Keyword scan + declared director/officer role in another regulated entity
        const hits = scan(declStr, PEP_KEYWORDS);
        if (hits.length) {
          findings.push({ ...base, title: `Potential PEP indicator: ${hits.join(', ')}`, severity: cfg.severity_default || 'medium', summary: 'Employment history mentions politically-exposed roles.', raw_payload: { keywords: hits }, confidence_score: 55,
            severity_basis: { source: 'keyword_scan', reason: `Declaration text matched PEP-related keyword(s): ${hits.join(', ')}. Indicative only — verify manually.`, matched_keywords: hits } });
        }
        for (const trig of TRIGGERS_BY_CHECK_TYPE.pep) {
          const exp = evaluateTrigger(trig);
          if (exp) findings.push({ ...base, title: trig.title, severity: cfg.severity_default || trig.severity, summary: exp.slice(0, 300), raw_payload: {}, confidence_score: trig.confidence,
            severity_basis: { source: 'self_declaration', reason: `Declarant answered "Yes" to the declaration question behind "${trig.title}" (base severity: ${trig.severity}).`, question_key: trig.key, base_severity: trig.severity } });
        }

      } else if (cfg.check_type === 'criminal_history') {
        for (const trig of TRIGGERS_BY_CHECK_TYPE.criminal_history) {
          const exp = evaluateTrigger(trig);
          if (exp) findings.push({ ...base, title: trig.title, severity: trig.severity, summary: exp.slice(0, 300), raw_payload: {}, confidence_score: trig.confidence,
            severity_basis: { source: 'self_declaration', reason: `Declarant answered "Yes" to the declaration question behind "${trig.title}" (base severity: ${trig.severity}).`, question_key: trig.key, base_severity: trig.severity } });
        }

      } else if (cfg.check_type === 'credit_history') {
        for (const trig of TRIGGERS_BY_CHECK_TYPE.credit_history) {
          const exp = evaluateTrigger(trig);
          if (exp) findings.push({ ...base, title: trig.title, severity: trig.severity, summary: exp.slice(0, 300), raw_payload: {}, confidence_score: trig.confidence,
            severity_basis: { source: 'self_declaration', reason: `Declarant answered "Yes" to the declaration question behind "${trig.title}" (base severity: ${trig.severity}).`, question_key: trig.key, base_severity: trig.severity } });
        }

      } else if (cfg.check_type === 'regulator_watchlist') {
        for (const trig of TRIGGERS_BY_CHECK_TYPE.regulator_watchlist) {
          const exp = evaluateTrigger(trig);
          if (exp) findings.push({ ...base, title: trig.title, severity: trig.severity, summary: exp.slice(0, 300), raw_payload: {}, confidence_score: trig.confidence,
            severity_basis: { source: 'self_declaration', reason: `Declarant answered "Yes" to the declaration question behind "${trig.title}" (base severity: ${trig.severity}).`, question_key: trig.key, base_severity: trig.severity } });
        }

      } else if (cfg.check_type === 'adverse_media') {
        const ai = await callAdverseMediaAI(person.full_name, person.nationality);
        // Always leave a record — previously a clean ("low risk") result and a
        // silently-failed AI call both produced zero findings, so there was no
        // way to tell "nothing adverse found" from "this check didn't run."
        if (!ai.ok) {
          // source: 'ai' (overriding base.source, which is whatever free-text
          // "provider" the admin typed for this config) so the AI Analysis
          // screen's source.ilike.%ai% filter reliably picks this up even
          // though check_type stays 'adverse_media' either way here.
          findings.push({ ...base, source: 'ai', title: 'Adverse media check could not be completed', severity: cfg.severity_default || 'medium',
            summary: `The AI adverse-media check failed to run (${ai.reason}). No conclusion was reached — re-run screening or verify manually.`,
            raw_payload: { ai_model: 'google/gemini-2.5-flash', error: ai.reason }, confidence_score: 0,
            severity_basis: { source: 'ai_adverse_media', reason: `AI check failed to execute: ${ai.reason}. No adverse-media conclusion is available for this individual.`, model: 'google/gemini-2.5-flash', ai_error: ai.reason } });
        } else {
          const conf = ai.risk === 'high' ? 75 : ai.risk === 'medium' ? 50 : 20;
          const isCriminal = ai.category === 'criminal_history';
          // source: 'ai' (see note above) — matters more here since a
          // criminal_history classification falls outside the AI Analysis
          // screen's check_type allowlist, so it must be reachable by source.
          findings.push({ ...base, check_type: ai.category, source: 'ai',
            title: ai.risk === 'low' ? 'Adverse media check: no indicators found' : (isCriminal ? `Criminal history (media search, ${ai.risk})` : `Adverse media (${ai.risk})`),
            severity: ai.risk, summary: ai.summary, raw_payload: { ai_model: 'google/gemini-2.5-flash' }, confidence_score: conf,
            severity_basis: { source: 'ai_adverse_media', reason: `LLM-assessed ${isCriminal ? 'criminal history' : 'adverse media'} risk: ${ai.risk}. A single AI text completion, not a live third-party media/database search — treat as a lead, not a confirmed hit.`, model: 'google/gemini-2.5-flash', ai_risk: ai.risk, category: ai.category } });
        }
      }
    }

    if (findings.length) {
      // Batch inserts send the UNION of all row keys, so any key that only
      // some rows carry arrives as an explicit NULL for the rest and defeats
      // the column default (this broke NOT NULL resolution_status once the
      // provider stage started emitting richer rows). Normalise explicitly.
      const normalised = findings.map((f: Any) => ({
        resolution_status: 'pending',
        citations: [],
        confidence_score: null,
        ...f,
      }));
      const { error: fErr } = await supa.from('fp_findings').insert(normalised);
      if (fErr) throw new Error(fErr.message);
    }

    await supa.from('fp_screening_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      total_hits: findings.length,
      provider_outcomes: providerOutcomes,
    }).eq('id', runRow.id);


    if (findings.length > 0) {
      await supa.from('fp_assessments').update({ status: 'screening' }).eq('id', assessmentId);
    }

    // Auto-escalate high-severity findings: raise a manual_flag monitoring event and dispatch notification.
    const highSev = findings.filter((f: Any) => f.severity === 'high');
    if (highSev.length > 0) {
      try {
        await supa.from('fp_monitoring_events').insert(highSev.map((f: Any) => ({
          individual_id: person.id,
          event_type: 'manual_flag',
          severity: 'high',
          summary: `High-severity screening finding: ${f.title}`.slice(0, 500),
          detail: { assessment_id: assessmentId, check_type: f.check_type, run_id: runRow.id },
        })));
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/dispatch-notification-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
          body: JSON.stringify({
            event_key: 'fp_high_severity_finding',
            entity_type: 'fp_assessment',
            entity_id: assessmentId,
            payload: { individual_id: person.id, individual_name: person.full_name, high_count: highSev.length, run_id: runRow.id },
          }),
        });
      } catch (e) { console.warn('[fp-screening-run] escalation failed', e); }
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
