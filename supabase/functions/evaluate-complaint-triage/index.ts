// Complaint triage engine v4 (MC-02 convergence).
//
// Body: { complaint_id: string, dry_run?: boolean, triggered_by?: string }
//
// WHAT CHANGED IN v4 — and why it matters
// ---------------------------------------
// The engine is now strictly a RECOMMENDATION producer. It cannot decide a
// complaint's supervisory triage:
//
//  * Rule logic is read from IMMUTABLE PUBLISHED RULE VERSIONS
//    (`conduct_triage_rule_versions`). A rule with no published version in
//    effect is skipped and reported — draft logic is never executed.
//  * The recommendation is recorded through
//    `public.complaint_triage_record_evaluation` (service-role only), which
//    appends to the evaluation ledger and leaves
//    `triage_confirmation_status = 'PENDING_CONFIRMATION'`. A human with
//    `complaint_management.triage` must confirm or override it via
//    `public.complaint_triage_confirm`, which itself requires jurisdiction to
//    have been decided as within / partly within our role.
//  * The function no longer writes severity, priority, assignment or SLA dates
//    onto the complaint. It writes only evaluation metadata (rule pointer,
//    evaluated-at, repeat count, snapshot, last error).
//  * Alerts are raised only from OBJECTIVE facts already on the record
//    (declared support needs, repeat volume, an existing confirmed SLA date,
//    the confirmed conduct-risk category, thematic volume). No alert is raised
//    from an unconfirmed recommendation.
//
// Every invocation still writes a durable row to `conduct_triage_audit_events`
// and a compliance audit entry.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logComplianceAudit } from "../_shared/audit.ts";
import { requireUserPermission } from "../_shared/authz.ts";


const FN_VERSION = "triage.v4";
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

interface Condition { field: string; op: string; value: any }
interface Outputs {
  severity?: string; priority?: string; sla_days?: number;
  consumer_harm?: string; conduct_risk_level?: string; systemic_potential?: string;
  assigned_team?: string;
  conduct_risk_category_code?: string; conduct_risk_category_id?: string;
  recommended_action?: string;
}
interface Rule {
  id: string; name: string; priority_order: number;
  match_mode: 'all' | 'any'; conditions: Condition[]; outputs: Outputs;
  rule_version_id: string; rule_version: number;
}

const HARM_FROM_SEVERITY: Record<string, string> = {
  low: 'LOW', medium: 'MODERATE', high: 'HIGH', critical: 'SEVERE',
};
const HARM_LEVELS = new Set(['LOW', 'MODERATE', 'HIGH', 'SEVERE']);
const RISK_LEVELS = new Set(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);
// The engine may never recommend CONFIRMED_SYSTEMIC — only a human confirms that.
const SYSTEMIC_LEVELS = new Set(['INDIVIDUAL', 'RECURRING', 'POTENTIAL_SYSTEMIC']);
const PRIORITIES = new Set(['p1', 'p2', 'p3', 'p4']);

function getField(field: string, c: any, ageDays: number): any {
  switch (field) {
    case 'complaint_type': return c.complaint_type_id;
    case 'product': return c.product_id;
    case 'channel': return c.channel_id;
    case 'entity':
    case 'licensee': return c.licensee_id;
    case 'customer_type': return c.customer_type;
    case 'customer_vulnerability': return !!c.vulnerability_indicator;
    case 'keywords': return `${c.subject || ''}\n${c.description || ''}`.toLowerCase();
    case 'repeat_count': return c.repeat_complaint_count ?? 0;
    case 'sla_days': return c.sla_days ?? 0;
    case 'sla_due_at': return c.sla_due_at ? new Date(c.sla_due_at).getTime() : null;
    case 'severity': return c.severity;
    case 'priority': return c.priority;
    case 'assigned_team': return c.assigned_team;
    case 'status': return c.status;
    case 'conduct_risk_category': return c.conduct_risk_category_id;
    case 'respondent_match_state': return c.respondent_match_state;
    case 'age_days':
    case 'days_open': return ageDays;
    default: return undefined;
  }
}

function asArray(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).toLowerCase());
  if (typeof v === 'string') return v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return [];
}
function isEmpty(a: any) {
  return a === null || a === undefined || a === '' || (Array.isArray(a) && a.length === 0);
}

function checkCond(cond: Condition, c: any, ageDays: number): boolean {
  const actual = getField(cond.field, c, ageDays);
  const v = cond.value;
  switch (cond.op) {
    case 'eq': return String(actual ?? '') === String(v ?? '');
    case 'neq': return String(actual ?? '') !== String(v ?? '');
    case 'in': return asArray(v).includes(String(actual ?? '').toLowerCase());
    case 'not_in': return !asArray(v).includes(String(actual ?? '').toLowerCase());
    case 'contains_any': {
      if (typeof actual !== 'string') return false;
      return asArray(v).some((k) => actual.includes(k));
    }
    case 'contains_all': {
      if (typeof actual !== 'string') return false;
      const kws = asArray(v);
      return kws.length > 0 && kws.every((k) => actual.includes(k));
    }
    case 'gte': return actual != null && Number(actual) >= Number(v);
    case 'lte': return actual != null && Number(actual) <= Number(v);
    case 'gt': return actual != null && Number(actual) > Number(v);
    case 'lt': return actual != null && Number(actual) < Number(v);
    case 'is_true': return !!actual;
    case 'is_false': return !actual;
    case 'is_empty': return isEmpty(actual);
    case 'is_not_empty': return !isEmpty(actual);
    default: return false;
  }
}

function evaluateRule(rule: Rule, c: any, ageDays: number): { matched: boolean; conditionResults: any[] } {
  const conds = rule.conditions || [];
  const conditionResults = conds.map((x) => ({ ...x, matched: checkCond(x, c, ageDays) }));
  if (conds.length === 0) return { matched: true, conditionResults };
  const matched = rule.match_mode === 'any'
    ? conditionResults.some((x) => x.matched)
    : conditionResults.every((x) => x.matched);
  return { matched, conditionResults };
}

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;
  const cors = buildCorsHeaders(req);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let complaint_id: string | null = null;
  let dry_run = false;
  let triggered_by: string | undefined;
  let actorId: string | null = null;

  const writeTriageAudit = async (row: Record<string, any>) => {
    try {
      await supabase.from('conduct_triage_audit_events').insert({
        complaint_id,
        actor_id: actorId,
        triggered_by: triggered_by ?? null,
        dry_run,
        function_version: FN_VERSION,
        ...row,
      });
    } catch (err) {
      console.warn('[triage] audit insert failed', (err as any)?.message ?? err);
    }
  };

  try {
    const body = await req.json().catch(() => ({}));
    complaint_id = body?.complaint_id ?? null;
    dry_run = !!body?.dry_run;
    triggered_by = body?.triggered_by;
    if (!complaint_id || typeof complaint_id !== 'string') {
      return new Response(JSON.stringify({ success: false, error: 'complaint_id required' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Two legitimate callers:
    //  1) staff retrying/refreshing the recommendation from the UI (Bearer JWT),
    //  2) internal server-side auto-triage on intake (service-role key).
    const authHeader = req.headers.get('authorization') ?? '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isServiceCall = !!bearer && !!serviceRoleKey && bearer === serviceRoleKey;

    if (!isServiceCall) {
      // Centralised JWT + module gate (module.action authority in Postgres).
      const gate = await requireUserPermission(req, 'complaint_management', 'workflow_action');
      if (!gate.ok) return gate.response;
      actorId = gate.userId;

      // Narrow, operation-specific authority on top of the module gate.
      const requiredAction = triggered_by === 'intake' ? 'create' : 'retry_triage';
      const { data: allowed, error: permErr } = await supabase.rpc('has_complaint_perm', {
        _user_id: actorId, _action: requiredAction,
      });
      if (permErr || allowed !== true) {
        return new Response(JSON.stringify({ success: false, error: 'forbidden' }), {
          status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
    }


    const { data: complaint, error: cErr } = await supabase
      .from('complaints').select('*').eq('id', complaint_id).maybeSingle();
    if (cErr || !complaint) throw new Error(cErr?.message || 'Complaint not found');

    // 12-month repeat volume (objective fact).
    const since12m = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
    let repeatCount = 0;
    if (complaint.complainant_id || complaint.email) {
      let rq = supabase.from('complaints')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since12m).neq('id', complaint.id);
      if (complaint.complainant_id) rq = rq.eq('complainant_id', complaint.complainant_id);
      else if (complaint.email) rq = rq.eq('email', complaint.email);
      const { count } = await rq;
      repeatCount = count ?? 0;
    }

    const { data: primaryRespondent } = await supabase
      .from('complaint_respondents')
      .select('match_state, licensee_id')
      .eq('complaint_id', complaint_id)
      .order('is_primary', { ascending: false })
      .limit(1).maybeSingle();

    const { data: supportRow } = await supabase
      .from('complaint_vulnerability_assessments')
      .select('support_required, staff_support_required, staff_review_state')
      .eq('complaint_id', complaint_id).maybeSingle();

    const supportDeclared = !!(supportRow?.support_required ?? complaint.vulnerability_indicator);

    const enriched = {
      ...complaint,
      repeat_complaint_count: repeatCount,
      respondent_match_state: primaryRespondent?.match_state ?? null,
      vulnerability_indicator: supportDeclared,
    };
    const ageDays = Math.floor(
      (Date.now() - new Date(complaint.created_at || Date.now()).getTime()) / (24 * 3600 * 1000),
    );

    // ---- Rule logic comes ONLY from published, in-effect rule versions ----
    const today = new Date().toISOString().slice(0, 10);
    const { data: activeRules } = await supabase.from('conduct_triage_rules')
      .select('id, name, priority_order')
      .eq('active', true)
      .order('priority_order');

    const rules: Rule[] = [];
    const skipped: Array<{ id: string; name: string; reason: string }> = [];
    for (const r of activeRules || []) {
      const { data: versions } = await supabase.from('conduct_triage_rule_versions')
        .select('id, version, status, match_mode, conditions, outputs, priority_order, effective_from, effective_to')
        .eq('rule_id', r.id)
        .eq('status', 'PUBLISHED')
        .order('version', { ascending: false });
      const inEffect = (versions || []).find((v: any) =>
        (!v.effective_from || v.effective_from <= today) &&
        (!v.effective_to || v.effective_to >= today));
      if (!inEffect) {
        skipped.push({ id: r.id, name: r.name, reason: 'no_published_version_in_effect' });
        continue;
      }
      rules.push({
        id: r.id, name: r.name,
        priority_order: inEffect.priority_order ?? r.priority_order,
        match_mode: (inEffect.match_mode ?? 'all') as 'all' | 'any',
        conditions: (inEffect.conditions ?? []) as Condition[],
        outputs: (inEffect.outputs ?? {}) as Outputs,
        rule_version_id: inEffect.id,
        rule_version: inEffect.version,
      });
    }
    rules.sort((a, b) => (a.priority_order ?? 0) - (b.priority_order ?? 0));

    const evaluatedSummary: any[] = [];
    let matched: Rule | null = null;
    for (const r of rules) {
      const { matched: hit, conditionResults } = evaluateRule(r, enriched, ageDays);
      evaluatedSummary.push({
        id: r.id, name: r.name, rule_version: r.rule_version,
        matched: hit, conditions: conditionResults,
      });
      if (hit && !matched) matched = r;
    }

    // ---- Build the RECOMMENDATION (never applied as a decision) ----
    let recommendedCategoryId: string | null = matched?.outputs?.conduct_risk_category_id ?? null;
    if (!recommendedCategoryId && matched?.outputs?.conduct_risk_category_code) {
      const { data: cat } = await supabase.from('conduct_risk_categories')
        .select('id').eq('code', matched.outputs.conduct_risk_category_code).maybeSingle();
      recommendedCategoryId = cat?.id ?? null;
    }

    const o = matched?.outputs ?? {};
    const harmRaw = String(o.consumer_harm ?? HARM_FROM_SEVERITY[String(o.severity ?? '').toLowerCase()] ?? '').toUpperCase();
    const riskRaw = String(o.conduct_risk_level ?? '').toUpperCase();
    const sysRaw = String(o.systemic_potential ?? '').toUpperCase();
    const priorityRaw = String(o.priority ?? '').toLowerCase();

    const recommendation: Record<string, any> = {
      consumer_harm: HARM_LEVELS.has(harmRaw) ? harmRaw : null,
      priority: PRIORITIES.has(priorityRaw) ? priorityRaw : null,
      conduct_risk_level: RISK_LEVELS.has(riskRaw) ? riskRaw : null,
      systemic_potential: SYSTEMIC_LEVELS.has(sysRaw) ? sysRaw
        : (repeatCount >= 3 ? 'RECURRING' : null),
      sla_days: typeof o.sla_days === 'number' ? o.sla_days : null,
      recommended_team: o.assigned_team ?? null,
      recommended_conduct_risk_category_id: recommendedCategoryId,
      recommended_action: o.recommended_action ?? null,
      rule_id: matched?.id ?? null,
      rule_name: matched?.name ?? null,
      rule_version: matched?.rule_version ?? null,
      rule_version_id: matched?.rule_version_id ?? null,
      decided_by_human: false,
      requires_human_confirmation: true,
      basis: matched ? 'published_rule_version' : 'no_rule_matched',
    };

    // Evaluation metadata only. Nothing here decides harm, priority, risk,
    // assignment or SLA — those are set by the human confirmation RPC.
    const evaluatedAt = new Date().toISOString();
    const metaUpdate: Record<string, any> = {
      triage_source: matched ? 'auto_recommendation' : (complaint.triage_source ?? 'manual'),
      triage_rule_id: matched?.id ?? null,
      triage_evaluated_at: evaluatedAt,
      repeat_complaint_count: repeatCount,
      triage_last_error: null,
      triage_result_snapshot: {
        inputs: {
          complaint_type_id: complaint.complaint_type_id, product_id: complaint.product_id,
          channel_id: complaint.channel_id, licensee_id: complaint.licensee_id,
          customer_type: complaint.customer_type,
          support_declared: supportDeclared,
          respondent_match_state: primaryRespondent?.match_state ?? null,
          respondent_regulated: !!primaryRespondent?.licensee_id,
          repeat_complaint_count: repeatCount, age_days: ageDays, status: complaint.status,
        },
        matched_rule: matched
          ? { id: matched.id, name: matched.name, version: matched.rule_version, priority_order: matched.priority_order }
          : null,
        recommendation,
        rules_evaluated: rules.length,
        rules_skipped: skipped,
        evaluated_at: evaluatedAt,
        function_version: FN_VERSION,
      },
    };

    // ---- Alerts: objective facts only ----
    const isOpen = !['resolved', 'closed', 'rejected'].includes((complaint.status || '').toLowerCase());
    const confirmedCategoryId = complaint.conduct_risk_category_id ?? null;
    let categorySeverityHint: string | null = null;
    if (confirmedCategoryId) {
      const { data: catRow } = await supabase.from('conduct_risk_categories')
        .select('severity_hint').eq('id', confirmedCategoryId).maybeSingle();
      categorySeverityHint = catRow?.severity_hint ?? null;
    }

    type PlannedAlert = {
      kind: string; severity: string; title: string; detail: any;
      dedupeParts: string[]; source: string;
      window_start?: string; window_end?: string;
      product_id?: string | null; channel_id?: string | null;
      category_id?: string | null; licensee_id?: string | null;
    };
    const plannedAlerts: PlannedAlert[] = [];

    // Confirmed severity on the record (never the recommendation).
    if ((complaint.severity || '').toLowerCase() === 'critical') plannedAlerts.push({
      kind: 'critical_severity', severity: 'critical',
      title: `Critical complaint: ${(complaint.subject || complaint.complaint_number || '').slice(0, 80)}`,
      detail: { complaint_number: complaint.complaint_number, basis: 'confirmed_severity' },
      dedupeParts: [complaint_id, 'critical_severity'], source: 'triage_engine',
    });
    if (supportDeclared) plannedAlerts.push({
      kind: 'vulnerable_customer', severity: 'high',
      title: `Support needs declared (${complaint.complaint_number})`,
      detail: {
        declared_by_complainant: !!supportRow?.support_required,
        staff_review_state: supportRow?.staff_review_state ?? 'pending',
      },
      dedupeParts: [complaint_id, 'vulnerable_customer'], source: 'triage_engine',
    });
    if (repeatCount >= 3) plannedAlerts.push({
      kind: 'repeat_complaint', severity: 'high',
      title: `Repeat complainant (${repeatCount} in 12m)`,
      detail: { repeat_count: repeatCount },
      dedupeParts: [complaint_id, 'repeat_complaint'], source: 'triage_engine',
    });

    // SLA alerts only against a due date already confirmed on the record.
    const slaDueIso = complaint.sla_due_at ?? null;
    if (slaDueIso && isOpen) {
      const dueMs = new Date(slaDueIso).getTime();
      const createdMs = new Date(complaint.created_at || Date.now()).getTime();
      const totalMs = dueMs - createdMs;
      const remaining = dueMs - Date.now();
      if (remaining <= 0) {
        plannedAlerts.push({
          kind: 'sla_breach', severity: 'high',
          title: `SLA breached for ${complaint.complaint_number}`,
          detail: { sla_due_at: slaDueIso, breached_by_hours: Math.round(-remaining / 3600000) },
          dedupeParts: [complaint_id, 'sla_breach'], source: 'triage_engine',
        });
      } else if (totalMs > 0 && remaining <= totalMs * 0.2) {
        plannedAlerts.push({
          kind: 'sla_at_risk', severity: 'medium',
          title: `SLA at risk for ${complaint.complaint_number}`,
          detail: { sla_due_at: slaDueIso, remaining_hours: Math.round(remaining / 3600000) },
          dedupeParts: [complaint_id, 'sla_at_risk'], source: 'triage_engine',
        });
      }
    }

    // Confirmed high-risk category on the record.
    if (confirmedCategoryId && (categorySeverityHint === 'high' || categorySeverityHint === 'critical')) {
      plannedAlerts.push({
        kind: 'high_risk_category', severity: categorySeverityHint,
        title: `High-risk conduct category on ${complaint.complaint_number}`,
        detail: { category_id: confirmedCategoryId, severity_hint: categorySeverityHint, basis: 'confirmed_category' },
        dedupeParts: [complaint_id, 'high_risk_category', confirmedCategoryId], source: 'triage_engine',
        category_id: confirmedCategoryId,
      });
    }

    // Thematic volume (per configured dimension threshold).
    const { data: thresholds } = await supabase.from('conduct_alert_thresholds')
      .select('*').eq('kind', 'thematic_spike').eq('active', true);
    for (const th of thresholds || []) {
      const windowDays = th.window_days;
      const threshold = th.threshold_count;
      // No configured window/threshold => no invented spike rule.
      if (!windowDays || !threshold) continue;
      const windowStart = new Date(Date.now() - windowDays * 24 * 3600 * 1000).toISOString();
      const dimensions: Array<{ col: string; val: string | null; label: string }> = [
        { col: 'product_id', val: complaint.product_id, label: 'product' },
        { col: 'channel_id', val: complaint.channel_id, label: 'channel' },
        { col: 'conduct_risk_category_id', val: confirmedCategoryId, label: 'category' },
        { col: 'licensee_id', val: complaint.licensee_id, label: 'licensee' },
      ];
      for (const d of dimensions) {
        if (!d.val) continue;
        const { count } = await supabase.from('complaints')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', windowStart)
          .eq(d.col, d.val);
        if ((count ?? 0) >= threshold) {
          plannedAlerts.push({
            kind: 'thematic_spike',
            severity: th.severity ?? 'medium',
            title: `Thematic volume on ${d.label} (${count} complaints in ${windowDays}d)`,
            detail: {
              window_days: windowDays, threshold_count: threshold, actual_count: count,
              dimension: d.label, [d.col]: d.val,
            },
            dedupeParts: ['thematic_spike', d.label, d.val, windowStart.slice(0, 10)],
            source: 'thematic_sweep',
            window_start: windowStart, window_end: new Date().toISOString(),
            product_id: d.col === 'product_id' ? d.val : null,
            channel_id: d.col === 'channel_id' ? d.val : null,
            category_id: d.col === 'conduct_risk_category_id' ? d.val : null,
            licensee_id: d.col === 'licensee_id' ? d.val : null,
          });
        }
      }
    }

    const auditBase = {
      matched_rule_id: matched?.id ?? null,
      matched_rule_name: matched?.name ?? null,
      rules_evaluated: rules.length,
      evaluated_summary: evaluatedSummary,
      input_snapshot: metaUpdate.triage_result_snapshot?.inputs ?? null,
      old_values: {
        severity: complaint.severity, priority: complaint.priority,
        consumer_harm: complaint.consumer_harm, conduct_risk_level: complaint.conduct_risk_level,
        systemic_potential: complaint.systemic_potential,
        triage_confirmation_status: complaint.triage_confirmation_status,
      },
      new_values: metaUpdate,
      applied_outputs: recommendation,
      alerts_generated: plannedAlerts.map((a) => ({ kind: a.kind, severity: a.severity, title: a.title })),
    };

    if (dry_run) {
      await writeTriageAudit({ outcome: 'dry_run', ...auditBase });
      await logComplianceAudit(supabase, {
        actorId: actorId ?? SYSTEM_ACTOR, actionType: 'UPDATE',
        objectType: 'complaint', objectId: complaint_id,
        beforeValue: complaint, afterValue: metaUpdate,
        metadata: {
          function: 'evaluate-complaint-triage', version: FN_VERSION, dry_run: true,
          triggered_by, matched_rule_id: matched?.id ?? null, rules_evaluated: rules.length,
          planned_alerts: plannedAlerts.map((a) => a.kind),
        },
      });
      return new Response(JSON.stringify({
        success: true, dry_run: true, complaint_id,
        matched_rule: matched, recommendation,
        rules_evaluated: rules.length, rules_skipped: skipped,
        would_generate_alerts: plannedAlerts, evaluated_summary: evaluatedSummary,
      }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Persist evaluation metadata (no triage decision fields).
    const { error: uErr } = await supabase.from('complaints').update(metaUpdate).eq('id', complaint_id);
    if (uErr) throw uErr;

    // Record the recommendation in the append-only ledger. The RPC leaves the
    // complaint PENDING_CONFIRMATION; only a human can confirm or override.
    let evaluationId: string | null = null;
    let recordError: string | null = null;
    const { data: recorded, error: recErr } = await supabase.rpc('complaint_triage_record_evaluation', {
      _complaint_id: complaint_id,
      _payload: {
        source: triggered_by === 'intake' ? 'auto' : 'auto_retry',
        consumer_harm: recommendation.consumer_harm,
        priority: recommendation.priority,
        conduct_risk_level: recommendation.conduct_risk_level,
        systemic_potential: recommendation.systemic_potential,
        sla_days: recommendation.sla_days,
        rule_id: recommendation.rule_id,
        rule_version_id: recommendation.rule_version_id,
        rule_version: recommendation.rule_version,
        output_snapshot: recommendation,
      },
    });
    if (recErr) {
      recordError = recErr.message;
      await supabase.from('complaints')
        .update({ triage_last_error: `record_evaluation: ${recErr.message}`.slice(0, 500) })
        .eq('id', complaint_id);
    } else {
      evaluationId = (recorded as any)?.evaluation_id ?? null;
    }

    // Alerts (race-safe: SELECT-then-INSERT against the partial unique index).
    const alertsCreated: Array<{ id: string; kind: string }> = [];
    const alertsSkipped: Array<{ kind: string; dedupe_key: string }> = [];
    for (const a of plannedAlerts) {
      const dedupe = await sha1Hex(a.dedupeParts.join(':'));
      const { data: existing } = await supabase
        .from('conduct_alerts')
        .select('id')
        .eq('dedupe_key', dedupe)
        .neq('status', 'closed')
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        alertsSkipped.push({ kind: a.kind, dedupe_key: dedupe });
        continue;
      }
      const row: any = {
        complaint_id: a.kind === 'thematic_spike' ? null : complaint_id,
        licensee_id: a.licensee_id ?? complaint.licensee_id ?? null,
        product_id: a.product_id ?? complaint.product_id ?? null,
        channel_id: a.channel_id ?? complaint.channel_id ?? null,
        conduct_risk_category_id: a.category_id ?? confirmedCategoryId ?? null,
        regulator_id: complaint.regulator_id ?? null,
        kind: a.kind, severity: a.severity, title: a.title, detail: a.detail,
        triage_rule_id: matched?.id ?? null,
        dedupe_key: dedupe, status: 'open',
        source: a.source, generated_by: a.source === 'thematic_sweep' ? 'thematic_sweep' : 'triage_engine',
        window_start: a.window_start ?? null, window_end: a.window_end ?? null,
      };
      const { data: ins, error: insErr } = await supabase
        .from('conduct_alerts').insert(row).select('id').maybeSingle();
      if (insErr) {
        alertsSkipped.push({ kind: a.kind, dedupe_key: dedupe });
        continue;
      }
      if (ins?.id) alertsCreated.push({ id: ins.id, kind: a.kind });
    }

    await writeTriageAudit({
      outcome: recordError ? 'error' : (matched ? 'matched' : 'no_match'),
      error_message: recordError,
      ...auditBase,
      alerts_generated: alertsCreated,
    });
    await logComplianceAudit(supabase, {
      actorId: actorId ?? SYSTEM_ACTOR, actionType: 'UPDATE',
      objectType: 'complaint', objectId: complaint_id,
      beforeValue: complaint, afterValue: metaUpdate,
      metadata: {
        function: 'evaluate-complaint-triage', version: FN_VERSION, triggered_by,
        matched_rule_id: matched?.id ?? null, matched_rule_version: matched?.rule_version ?? null,
        rules_evaluated: rules.length, rules_skipped: skipped,
        evaluation_id: evaluationId, recommendation_only: true,
        alerts_created: alertsCreated.map((a) => a.kind),
      },
    });

    return new Response(JSON.stringify({
      success: !recordError,
      complaint_id,
      recommendation_only: true,
      evaluation_id: evaluationId,
      error: recordError,
      matched_rule: matched ? { id: matched.id, name: matched.name, version: matched.rule_version } : null,
      recommendation,
      rules_evaluated: rules.length,
      rules_skipped: skipped,
      alerts_created: alertsCreated,
      alerts_skipped: alertsSkipped,
    }), { status: recordError ? 500 : 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = (err as any)?.message ?? String(err);
    console.error('[triage] error', message);
    if (complaint_id && !dry_run) {
      try {
        await supabase.from('complaints')
          .update({ triage_last_error: message.slice(0, 500), triage_evaluated_at: new Date().toISOString() })
          .eq('id', complaint_id);
      } catch { /* non-fatal */ }
    }
    await writeTriageAudit({ outcome: 'error', error_message: message });
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
