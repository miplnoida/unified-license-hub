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
  // cross_module is gated per source (see SOURCE_PERMISSION) — never by one
  // broad permission, because its facts come from several modules.
  cross_module: ['', ''],
  executive: ['admin_dashboard', 'view'],
};

/**
 * Per-source authorization. Service-role access is a technical necessity, never
 * authorization: every source below is resolved against the caller's own
 * permissions through the platform's `has_permission` before any query runs.
 */
export type SourceModule =
  | 'prudential'
  | 'examinations'
  | 'complaints'
  | 'conduct'
  | 'enforcement'
  | 'supervisory_actions'
  | 'licensing'
  | 'fit_and_proper';

const SOURCE_PERMISSION: Record<SourceModule, Array<[string, string]>> = {
  prudential: [['prudential_supervision', 'view']],
  examinations: [['prudential_supervision', 'view'], ['inspection_management', 'view']],
  complaints: [['complaint_management', 'view']],
  conduct: [['market_conduct', 'view']],
  enforcement: [['enforcement_management', 'view']],
  supervisory_actions: [['prudential_supervision', 'view']],
  licensing: [['license_management', 'view'], ['application_management', 'view']],
  fit_and_proper: [['fit_proper_assessment', 'view']],
};

async function hasPerm(
  supa: any,
  userId: string,
  module: string,
  action: string,
): Promise<boolean> {
  try {
    const { data, error } = await supa.rpc('has_permission', {
      _user_id: userId,
      _module: module,
      _action: action,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

/** The source modules this user may receive information from. */
async function resolvePermittedSources(
  supa: any,
  userId: string,
): Promise<SourceModule[]> {
  const sources = Object.keys(SOURCE_PERMISSION) as SourceModule[];
  const results = await Promise.all(
    sources.map(async (s) => {
      for (const [m, a] of SOURCE_PERMISSION[s]) {
        if (await hasPerm(supa, userId, m, a)) return s;
      }
      return null;
    }),
  );
  return results.filter((s): s is SourceModule => s !== null);
}



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
  "business_impact": [{"text": string, "evidence": [string]}],
  "data_quality": [{"text": string, "evidence": [string]}],
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
- "business_impact" is the business point of view: what the supplied figures and events mean commercially and
  prudentially — effect on the entity's business model, earnings, capital or liquidity position, its customers
  and the market, the plausibility of the trend against the entity's stated business, and the supervisory
  effort the position implies. Never invent a figure to support a business reading; where the record cannot
  support one, say plainly what would be needed.
- "data_quality" is the integrity of the information being interpreted: internal consistency of the supplied
  figures, arithmetic or period mismatches visible in the data, stale, missing or unusually round values,
  gaps between related records, and how far each weakens the conclusions above. Never assert an error that
  the supplied values do not demonstrate.
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

/** Application-controlled evidence reference (never derived from model text). */
export interface EvidenceRef {
  label: string;
  kind?: string;
  id?: string | null;
}

const MAX_TEXT = 2000;
const MAX_ITEMS = 25;

const str = (v: unknown, max = MAX_TEXT): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

const strList = (v: unknown, max = MAX_ITEMS): string[] =>
  Array.isArray(v)
    ? v.map((x) => str(x, 600)).filter((x): x is string => !!x).slice(0, max)
    : [];

function observations(v: unknown): Array<{ text: string; evidence?: string[] }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ text: string; evidence?: string[] }> = [];
  for (const item of v.slice(0, MAX_ITEMS)) {
    const text = typeof item === 'string' ? str(item) : str((item as any)?.text);
    if (!text) continue;
    const ev = strList((item as any)?.evidence, 6);
    out.push(ev.length ? { text, evidence: ev } : { text });
  }
  return out;
}

/**
 * Validate and sanitise the model's structured output. Unexpected keys are
 * dropped, types are coerced or discarded and sizes are capped, so malformed
 * output can never crash the UI. Evidence references are resolved only against
 * the application-supplied facts — model text never yields a route or link.
 */
function sanitizePayload(raw: unknown, trusted: EvidenceRef[]): Record<string, any> {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, any> = {};

  const summary = str(src.summary, 4000);
  if (summary) out.summary = summary;

  for (const key of ['facts', 'interpretation', 'suggested_focus_areas', 'limitations'] as const) {
    const list = strList(src[key]);
    if (list.length) out[key] = list;
  }

  for (const key of ['key_observations', 'chronology', 'issues', 'risks', 'gaps'] as const) {
    const list = observations(src[key]);
    if (list.length) out[key] = list;
  }

  if (Array.isArray(src.draft_sections)) {
    const sections = src.draft_sections
      .slice(0, 12)
      .map((s: any) => {
        const heading = str(s?.heading, 200);
        const text = str(s?.text, 6000);
        return heading && text ? { heading, text } : null;
      })
      .filter((s): s is { heading: string; text: string } => !!s);
    if (sections.length) out.draft_sections = sections;
  }

  out.confidence = ['high', 'moderate', 'limited'].includes(String(src.confidence))
    ? String(src.confidence)
    : 'limited';
  if (src.insufficient_evidence === true) out.insufficient_evidence = true;

  // Trusted evidence only: the label/id pairs the platform itself supplied,
  // kept when the model actually referred to them.
  if (trusted.length) {
    const blob = JSON.stringify(out).toLowerCase();
    const refs = trusted
      .filter((t) => blob.includes(t.label.toLowerCase()) || blob.includes(String(t.label.split(' ').pop()).toLowerCase()))
      .slice(0, 12)
      .map((t) => ({ label: t.label, kind: t.kind ?? null, id: t.id ?? null }));
    if (refs.length) out.evidence_refs = refs;
  }

  return out;
}

function hasAnyContent(p: Record<string, any>): boolean {
  if (p.summary) return true;
  return ['facts', 'interpretation', 'suggested_focus_areas', 'key_observations', 'chronology', 'issues', 'risks', 'gaps', 'draft_sections']
    .some((k) => Array.isArray(p[k]) && p[k].length > 0);
}



async function assembleFacts(
  supa: any,
  userId: string,
  module: Module,
  analysisType: string,
  scope: string,
  scopeId: string | null,
  extra: { question?: string | null; context?: unknown },
  sources: SourceModule[],
  /** Caller-scoped client. Required for the executive canonical snapshot so RLS,
   *  regulator scoping and entity-assignment restrictions all still apply. */
  authClient?: any,
): Promise<{ facts: Record<string, unknown>; used: SourceModule[]; evidence: EvidenceRef[] }> {
  const can = (s: SourceModule) => sources.includes(s);
  const used = new Set<SourceModule>();
  const evidence: EvidenceRef[] = [];
  const facts: Record<string, unknown> = { module, analysis_type: analysisType };
  if (extra.question) facts.supervisor_question = String(extra.question).slice(0, 1000);
  const ctx = (extra.context && typeof extra.context === 'object' ? extra.context : {}) as Record<string, unknown>;
  if (Object.keys(ctx).length) facts.screen_context = ctx;

  if (module === 'examination' && scopeId) {
    if (!can('examinations')) return { facts, used: [], evidence };
    used.add('examinations');
    const [exam, scoping, findings, workpapers, requests] = await Promise.all([
      supa.from('examinations').select(
        'id, entity_id, reference, title, examination_type, stage, risk_rating, overall_conclusion, period_under_review_start, period_under_review_end, fieldwork_start, fieldwork_end, updated_at',
      ).eq('id', scopeId).maybeSingle(),
      supa.from('examination_scoping').select(
        'objectives, risk_focus_areas, legal_basis, scope_exclusions, methodology, approved_at',
      ).eq('examination_id', scopeId),
      supa.from('examination_findings').select(
        'id, reference, title, category, severity, status, criteria_breached, observation, root_cause, recommendation, entity_response, target_date',
      ).eq('examination_id', scopeId),
      supa.from('examination_workpapers').select(
        'reference, area, procedure_performed, evidence_reference, conclusion, status, reviewed_at, review_notes',
      ).eq('examination_id', scopeId),
      supa.from('examination_data_requests').select(
        'item_no, title, description, status, due_date, received_at, entity_response',
      ).eq('examination_id', scopeId),
    ]);
    const exRow = exam.data as Record<string, unknown> | null;
    facts.examination = exRow ? { ...exRow, id: undefined, entity_id: undefined } : null;
    facts.scoping = (scoping.data ?? []).slice(0, 5);
    facts.findings = pick(findings.data as any[], [
      'reference', 'title', 'category', 'severity', 'status', 'criteria_breached', 'observation',
      'root_cause', 'recommendation', 'entity_response', 'target_date',
    ]);
    facts.workpapers = workpapers.data ?? [];
    facts.information_requests = requests.data ?? [];
    for (const f of (findings.data ?? []) as any[]) {
      if (f?.id && f?.reference) {
        evidence.push({ label: `Finding ${f.reference}`, kind: 'examination_finding', id: f.id });
      }
    }
    if (exRow?.reference) {
      evidence.push({ label: `Examination ${exRow.reference}`, kind: 'examination', id: scopeId });
    }
    const entityId = (exRow as any)?.entity_id ?? null;
    if (entityId) {
      const priorExams = await supa
        .from('examinations')
        .select('reference, title, examination_type, stage, risk_rating, fieldwork_end')
        .eq('entity_id', entityId).neq('id', scopeId)
        .order('created_at', { ascending: false }).limit(10);
      facts.prior_examinations = priorExams.data ?? [];
      if (can('supervisory_actions')) {
        used.add('supervisory_actions');
        const actions = await supa
          .from('prudential_actions')
          .select('action_reference, title, action_type, severity, status, due_date')
          .eq('entity_id', entityId)
          .order('created_at', { ascending: false }).limit(25);
        facts.open_supervisory_actions = actions.data ?? [];
      }
    }
  }

  if (module === 'enforcement' && scopeId) {
    if (!can('enforcement')) return { facts, used: [], evidence };
    used.add('enforcement');
    const [action, events, evidenceRows, obligations] = await Promise.all([
      supa.from('enforcement_actions').select(
        'id, entity_id, case_number, enforcement_type, status, description, findings, date_opened, notice_issued_at, response_received_at, response_summary, decision_at, decision_outcome, decision_rationale, penalty_amount, penalty_currency, monitoring_state, non_compliance_flag, non_compliance_note, updated_at',
      ).eq('id', scopeId).maybeSingle(),
      supa.from('enforcement_case_events').select('event_type, note, created_at')
        .eq('case_id', scopeId).order('created_at').limit(60),
      supa.from('enforcement_compliance_evidence').select(
        'description, evidence_type, accepted, submitted_at, review_note',
      ).eq('case_id', scopeId),
      supa.from('enforcement_obligations').select('obligation, detail, status, deadline, breach_note')
        .eq('case_id', scopeId),
    ]);
    const row = action.data as Record<string, unknown> | null;
    facts.case = row ? { ...row, id: undefined, entity_id: undefined } : null;
    facts.case_events = events.data ?? [];
    facts.evidence = evidenceRows.data ?? [];
    facts.obligations = obligations.data ?? [];
    if (row?.case_number) {
      evidence.push({ label: `Case ${row.case_number}`, kind: 'enforcement_action', id: scopeId });
    }

    if (analysisType === 'precedent_comparison') {
      // Historical precedent must respect the caller's own visibility rules:
      // assignment-only regulators see only their mapped entities.
      let assignmentOnly = false;
      try {
        const { data } = await supa.rpc('is_assignment_only_regulator', { _user_id: userId });
        assignmentOnly = data === true;
      } catch {
        assignmentOnly = true; // fail closed
      }
      const { data: others } = await supa
        .from('enforcement_actions')
        .select('entity_id, case_number, enforcement_type, status, decision_outcome, decision_at')
        .neq('id', scopeId)
        .order('created_at', { ascending: false })
        .limit(40);
      let permitted = (others ?? []) as any[];
      if (assignmentOnly) {
        const allowed: any[] = [];
        for (const o of permitted) {
          if (!o.entity_id) continue;
          const { data: ok } = await supa.rpc('user_has_entity_assignment', {
            _user_id: userId,
            _licensee_id: o.entity_id,
          });
          if (ok === true) allowed.push(o);
        }
        permitted = allowed;
      }
      facts.past_actions_on_record = permitted
        .slice(0, 15)
        .map(({ entity_id: _e, ...rest }) => rest);
    }
  }

  if ((module === 'complaints' || module === 'conduct') && scopeId && scope === 'record') {
    const need: SourceModule = module === 'conduct' ? 'conduct' : 'complaints';
    if (!can(need)) return { facts, used: [], evidence };
    used.add(need);
    // Explicit columns only — complainant name, address, phone, email and
    // identity-document fields are never read into memory or sent to the model.
    const [complaint, evidenceRows, tasks, rfis, corr] = await Promise.all([
      supa.from('complaints').select(
        'id, licensee_id, complaint_number, subject, description, status, severity, priority, customer_type, created_at, updated_at, sla_due_at, acknowledged_at, resolved_at, closed_at, closure_reason, closure_category, investigation_notes, resolution, resolution_notes, findings, repeat_complaint_count, vulnerability_indicator',
      ).eq('id', scopeId).maybeSingle(),
      supa.from('complaint_evidence').select('label, description, created_at').eq('complaint_id', scopeId).limit(40),
      supa.from('complaint_investigation_tasks').select('title, description, status, due_date, completed_at')
        .eq('complaint_id', scopeId).limit(40),
      supa.from('complaint_rfis').select('summary, status, due_at, submitted_at, closure_notes, approval_state')
        .eq('complaint_id', scopeId).limit(40),
      supa.from('complaint_correspondence').select('direction, subject, created_at')
        .eq('complaint_id', scopeId).order('created_at').limit(30),
    ]);
    const row = complaint.data as Record<string, unknown> | null;
    facts.complaint = row ? { ...row, id: undefined, licensee_id: undefined } : null;
    facts.evidence = evidenceRows.data ?? [];
    facts.case_work = tasks.data ?? [];
    facts.information_requests = rfis.data ?? [];
    facts.correspondence = corr.data ?? [];
    if (row?.complaint_number) {
      evidence.push({ label: `Complaint ${row.complaint_number}`, kind: 'complaint', id: scopeId });
    }

    const licenseeId = (row as any)?.licensee_id ?? null;
    if (licenseeId && ['similar_complaints', 'conduct_recurrence'].includes(analysisType)) {
      const { data: related } = await supa
        .from('complaints')
        .select('id, complaint_number, subject, status, severity, priority, created_at, closure_category')
        .eq('licensee_id', licenseeId)
        .neq('id', scopeId)
        .order('created_at', { ascending: false })
        .limit(40);
      facts.other_complaints_same_licensee = (related ?? []).map(({ id: _i, ...rest }: any) => rest);
      for (const r of (related ?? []) as any[]) {
        if (r?.id && r?.complaint_number) {
          evidence.push({ label: `Complaint ${r.complaint_number}`, kind: 'complaint', id: r.id });
        }
      }
    }
  }

  // ---------- Market conduct: portfolio-level pattern analysis ----------
  // Entity-level conduct: recorded conduct history for one licensee.
  if (module === 'conduct' && scopeId && scope === 'entity') {
    if (!can('conduct') && !can('complaints')) return { facts, used: [], evidence };
    used.add(can('conduct') ? 'conduct' : 'complaints');
    const [comps, alerts, invs, acts] = await Promise.all([
      supa.from('complaints').select(
        'id, complaint_number, subject, status, severity, priority, customer_type, vulnerability_indicator, closure_category, repeat_complaint_count, created_at, resolved_at, sla_due_at',
      ).eq('licensee_id', scopeId).order('created_at', { ascending: false }).limit(200),
      supa.from('conduct_alerts').select('title, kind, severity, status, created_at')
        .eq('licensee_id', scopeId).order('created_at', { ascending: false }).limit(100),
      supa.from('conduct_investigations').select('allegation, status, priority, severity, created_at')
        .eq('licensee_id', scopeId).order('created_at', { ascending: false }).limit(50),
      supa.from('conduct_actions').select('title, action_type, status, due_date, created_at')
        .eq('entity_id', scopeId).order('created_at', { ascending: false }).limit(50),
    ]);
    const list = (comps.data ?? []) as any[];
    facts.complaints = list.map(({ id: _i, ...rest }) => rest);
    facts.conduct_alerts = alerts.data ?? [];
    facts.investigations = invs.data ?? [];
    facts.conduct_actions = acts.data ?? [];
    facts.totals = {
      complaints: list.length,
      open: list.filter((r) => !['closed', 'resolved'].includes(String(r.status))).length,
      repeat: list.filter((r) => (r.repeat_complaint_count ?? 0) >= 3).length,
      vulnerable_customers: list.filter((r) => r.vulnerability_indicator).length,
    };
    for (const r of list.slice(0, 20)) {
      if (r?.id && r?.complaint_number) {
        evidence.push({ label: `Complaint ${r.complaint_number}`, kind: 'complaint', id: r.id });
      }
    }
    facts.available_sources = [...used];
  }

  if (module === 'conduct' && !scopeId) {
    if (!can('conduct') && !can('complaints')) return { facts, used: [], evidence };
    used.add(can('conduct') ? 'conduct' : 'complaints');
    const filters = (ctx.filters && typeof ctx.filters === 'object' ? ctx.filters : {}) as Record<string, string>;
    const days = Math.min(Math.max(Number(filters.days ?? ctx.days ?? 90) || 90, 7), 730);
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    let q = supa
      .from('complaints')
      .select(
        'complaint_number, subject, status, severity, priority, customer_type, vulnerability_indicator, closure_category, product_id, channel_id, conduct_risk_category_id, licensee_id, created_at, resolved_at, sla_due_at',
      )
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(600);
    for (const [key, col] of [
      ['product_id', 'product_id'],
      ['channel_id', 'channel_id'],
      ['category_id', 'conduct_risk_category_id'],
      ['licensee_id', 'licensee_id'],
      ['severity', 'severity'],
      ['priority', 'priority'],
      ['customer_type', 'customer_type'],
    ] as Array<[string, string]>) {
      const v = filters[key];
      if (v && v !== 'all') q = q.eq(col, v);
    }
    const { data: rows } = await q;
    const list = (rows ?? []) as any[];

    const tally = (fn: (r: any) => string | null) => {
      const out: Record<string, number> = {};
      for (const r of list) {
        const k = fn(r);
        if (!k) continue;
        out[k] = (out[k] ?? 0) + 1;
      }
      return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 15));
    };

    const nameOf = (map: unknown, id: string | null) => {
      if (!id) return null;
      const m = (map && typeof map === 'object' ? map : {}) as Record<string, string>;
      return m[id] ?? id;
    };
    const labelMaps = (ctx.labels && typeof ctx.labels === 'object' ? ctx.labels : {}) as Record<string, unknown>;

    facts.window_days = days;
    facts.applied_filters = filters;
    facts.totals = {
      complaints_in_window: list.length,
      open: list.filter((r) => !['closed', 'resolved'].includes(String(r.status))).length,
      vulnerable_customers: list.filter((r) => r.vulnerability_indicator).length,
      sla_breached: list.filter((r) => r.sla_due_at && !r.resolved_at && new Date(r.sla_due_at) < new Date()).length,
    };
    facts.by_product = tally((r) => nameOf(labelMaps.products, r.product_id));
    facts.by_channel = tally((r) => nameOf(labelMaps.channels, r.channel_id));
    facts.by_risk_category = tally((r) => nameOf(labelMaps.categories, r.conduct_risk_category_id));
    facts.by_licensee = tally((r) => nameOf(labelMaps.licensees, r.licensee_id));
    facts.by_severity = tally((r) => (r.severity ? String(r.severity) : null));
    facts.by_closure_category = tally((r) => (r.closure_category ? String(r.closure_category) : null));
    facts.by_month = tally((r) => String(r.created_at ?? '').slice(0, 7) || null);
    facts.complaint_subjects_sample = list.slice(0, 60).map((r) => ({
      complaint_number: r.complaint_number,
      subject: r.subject,
      severity: r.severity,
      status: r.status,
      created_at: r.created_at,
    }));
    if (ctx.on_screen_aggregates) facts.on_screen_aggregates = ctx.on_screen_aggregates;
  }

  if (module === 'cross_module' && scopeId) {
    // Per-source authorization. A source the caller cannot view is not queried,
    // not counted and not referred to — the model is simply never told it exists.
    if (can('licensing') || can('prudential')) {
      const { data } = await supa
        .from('licensees')
        .select('id, name, status, sector_id, category_id, systemic_importance')
        .eq('id', scopeId)
        .maybeSingle();
      facts.entity = data ? { ...data, id: undefined } : null;
      used.add(can('licensing') ? 'licensing' : 'prudential');
    }
    if (can('prudential')) {
      used.add('prudential');
      const { data } = await supa
        .from('entity_risk_scores')
        .select('score, band, period_key, computed_at, components')
        .eq('entity_id', scopeId)
        .order('computed_at', { ascending: false })
        .limit(4);
      facts.risk_scores = data ?? [];
    }
    if (can('examinations')) {
      used.add('examinations');
      const { data } = await supa
        .from('examinations')
        .select('reference, title, examination_type, stage, risk_rating, fieldwork_end')
        .eq('entity_id', scopeId)
        .order('created_at', { ascending: false })
        .limit(10);
      facts.examinations = data ?? [];
    }
    if (can('complaints') || can('conduct')) {
      used.add(can('complaints') ? 'complaints' : 'conduct');
      const { data } = await supa
        .from('complaints')
        .select('id, complaint_number, subject, status, severity, priority, created_at')
        .eq('licensee_id', scopeId)
        .order('created_at', { ascending: false })
        .limit(25);
      facts.complaints = (data ?? []).map(({ id: _i, ...rest }: any) => rest);
      for (const r of (data ?? []) as any[]) {
        if (r?.id && r?.complaint_number) {
          evidence.push({ label: `Complaint ${r.complaint_number}`, kind: 'complaint', id: r.id });
        }
      }
    }
    if (can('enforcement')) {
      used.add('enforcement');
      const { data } = await supa
        .from('enforcement_actions')
        .select('id, case_number, enforcement_type, status, decision_outcome, decision_at')
        .eq('entity_id', scopeId)
        .order('created_at', { ascending: false })
        .limit(10);
      facts.enforcement_actions = (data ?? []).map(({ id: _i, ...rest }: any) => rest);
      for (const r of (data ?? []) as any[]) {
        if (r?.id && r?.case_number) {
          evidence.push({ label: `Case ${r.case_number}`, kind: 'enforcement_action', id: r.id });
        }
      }
    }
    if (can('supervisory_actions')) {
      used.add('supervisory_actions');
      const { data } = await supa
        .from('prudential_actions')
        .select('action_reference, title, action_type, severity, status, due_date')
        .eq('entity_id', scopeId)
        .order('created_at', { ascending: false })
        .limit(25);
      facts.supervisory_actions = data ?? [];
    }
    facts.available_sources = [...used];
    facts.coverage_note =
      'Only the supervisory sources listed in available_sources were supplied. Do not speculate about, refer to, count or imply the existence of any other source.';
  }

  if (module === 'executive') {
    // The canonical executive snapshot is the ONLY source of executive figures.
    // It is produced server-side under the caller's own permissions, so the model
    // can never be handed a figure the caller is not entitled to see, and can
    // never be handed a browser-computed number as if it were a system fact.
    const windowDays = Math.min(Math.max(Number(ctx.window_days ?? 30) || 30, 1), 3650);
    const sectorId = typeof ctx.sector_id === 'string' && ctx.sector_id !== 'all' ? ctx.sector_id : null;
    const client = authClient ?? supa;

    const { data: snapshot, error: snapErr } = await client.rpc('executive_dashboard_snapshot', {
      _window_days: windowDays,
      _sector_id: sectorId,
    });
    if (snapErr) throw new Error(`executive snapshot unavailable: ${snapErr.message}`);

    facts.executive_snapshot = snapshot;
    facts.snapshot_fingerprint = (snapshot as any)?.fingerprint ?? null;
    facts.window = {
      label: `${windowDays} days`,
      window_days: windowDays,
      since: (snapshot as any)?.window?.since ?? null,
      sector_filter: sectorId,
    };
    facts.figure_authority =
      'Every figure in executive_snapshot is a recorded system fact calculated by the platform. Quote them exactly. Never recompute, round, extrapolate or invent a figure, and never introduce a metric that is not present in executive_snapshot.';

    // Period-on-period comparison, only where a prior snapshot genuinely exists.
    const prior = (ctx.comparison && typeof ctx.comparison === 'object' ? ctx.comparison : null) as
      | Record<string, unknown>
      | null;
    if (prior) {
      facts.comparison_snapshot = prior;
      facts.comparison_note =
        'comparison_snapshot is a previously captured snapshot of the same scope. Describe movement only where both snapshots contain the figure.';
    } else {
      facts.comparison_note =
        'No prior snapshot exists for this scope. State plainly that a period-on-period comparison cannot be calculated. Do not infer movement.';
    }

    const unavailable = (snapshot as any)?.unavailable_sources ?? [];
    if (Array.isArray(unavailable) && unavailable.length) {
      facts.sources_not_visible_to_caller = unavailable;
      facts.sources_not_visible_note =
        'These sources are outside the caller\'s permissions. Do not comment on, count or imply anything about them.';
    }

    evidence.push({ kind: 'executive_snapshot', id: String((snapshot as any)?.fingerprint ?? 'unknown') } as EvidenceRef);
    for (const s of sources) used.add(s);
    facts.available_sources = [...used];
  }


  return { facts, used: [...used], evidence };
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
  const gate = await requireUserPermission(req, permModule || undefined, permAction || undefined);
  if (!gate.ok) return gate.response;
  const userId: string = gate.userId;

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Service-role access below is a technical requirement, never authorization:
  // the caller's own permissions decide which sources may be read.
  const permittedSources = await resolvePermittedSources(supa, userId);
  if (module === 'cross_module' && permittedSources.length === 0) {
    return json({ ok: false, error: 'Forbidden' }, 403);
  }

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

    // Reuse a stored analysis only when the underlying record has not moved on
    // AND every source that fed it is one this caller may see today.
    if (!force && fingerprint) {
      let q = supa
        .from('ai_insights')
        .select('*')
        .eq('module', module)
        .eq('analysis_type', analysisType)
        .eq('input_fingerprint', fingerprint)
        .containedBy('source_modules', permittedSources)
        .order('generated_at', { ascending: false })
        .limit(1);
      q = scopeId ? q.eq('scope_id', scopeId) : q.is('scope_id', null);
      const { data: cachedRows } = await q;
      const cached = cachedRows?.[0];
      // Legacy cross-module rows carry no source metadata — never reuse them.
      const legacyCrossModule =
        module === 'cross_module' && (cached?.source_modules ?? []).length === 0;
      if (cached?.id && !legacyCrossModule) {
        return json({ ok: true, cached: true, insight: { ...cached, source_records: undefined } });
      }
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return json({ ok: false, error: 'AI analysis is not configured', provider_state: 'NOT_CONFIGURED' });
    }

    let facts: Record<string, unknown>;
    let usedSources: SourceModule[] = [];
    let trustedEvidence: EvidenceRef[] = [];
    try {
      const assembled = await assembleFacts(
        supa,
        userId,
        module,
        analysisType,
        scope,
        scopeId,
        { question: body.question ?? null, context: body.context ?? null },
        permittedSources,
        gate.authClient,
      );
      facts = assembled.facts;
      usedSources = assembled.used;
      trustedEvidence = assembled.evidence;
    } catch (e) {
      return json({
        ok: false,
        error: 'Could not read the supervisory record for analysis',
        provider_state: 'PROVIDER_FAILURE',
        detail: (e as Error)?.message,
      });
    }

    if (module === 'cross_module' && usedSources.length === 0) {
      return json({ ok: false, error: 'Forbidden' }, 403);
    }

    const prompt = `${spec.instruction}

Subject: ${label || 'Supervisory record'}
Period / window: ${periodKey ?? 'not specified'}

Platform records (authoritative, do not alter). These are the only records available for this analysis; say nothing about anything outside them:
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
      const rawParsed = JSON.parse(raw);
      // Model output is never trusted merely because it parses.
      parsed = sanitizePayload(rawParsed, trustedEvidence);
      providerState = parsed.insufficient_evidence === true
        ? 'INSUFFICIENT_DATA'
        : hasAnyContent(parsed)
          ? 'SUCCESS'
          : 'INSUFFICIENT_DATA';
    } catch (e) {
      failure = (e as Error)?.message ?? String(e);
    }

    await logIntegration(supa as any, {
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

    const confidence = String(parsed.confidence ?? 'limited');
    const payload = parsed;

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
        source_modules: usedSources,
        source_records: facts,
        citations: payload.evidence_refs ?? [],
        provider: 'lovable-ai-gateway',
        model: MODEL,
        provider_state: providerState,
        confidence: confidence === 'high' ? 0.9 : confidence === 'moderate' ? 0.6 : 0.3,
        explanation: typeof payload.summary === 'string' ? payload.summary.slice(0, 4000) : null,
        review_status: 'pending',
        generated_by: userId,
      })
      .select(
        'id, title, module, analysis_type, payload, provider_state, model, period_key, input_fingerprint, generated_at, feedback, source_modules',
      )
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
