// Complaint triage engine v3.
//
// Body: { complaint_id: string, dry_run?: boolean, triggered_by?: string }
//
// - Recomputes 12-month repeat count.
// - Evaluates active triage rules in priority_order (first match wins).
// - Persists matched outputs onto the complaint.
// - Captures triage_original_values on first auto-triage for the override trail.
// - Generates duplicate-safe conduct_alerts:
//     critical_severity, vulnerable_customer, repeat_complaint,
//     sla_breach, sla_at_risk, high_risk_category, rule_triggered,
//     thematic_spike (window-based via conduct_alert_thresholds).
// - Writes a durable audit row to conduct_triage_audit_events for every
//   invocation (matched, no_match, dry_run, error) AND a compliance audit
//   entry for cross-module traceability.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logComplianceAudit } from "../_shared/audit.ts";
import { requireUserPermission } from "../_shared/authz.ts";

const FN_VERSION = "triage.v3";
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

interface Condition { field: string; op: string; value: any }
interface Outputs {
  severity?: string; priority?: string; sla_days?: number;
  assigned_team?: string; conduct_risk_category_code?: string;
  conduct_risk_category_id?: string;
  generate_alert_kind?: string; alert_severity?: string;
  alert_title?: string; alert_detail?: any;
  recommended_action?: string;
}
interface Rule {
  id: string; name: string; priority_order: number;
  match_mode: 'all' | 'any'; conditions: Condition[]; outputs: Outputs;
}

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
      const kws = asArray(v);
      return kws.some((k) => actual.includes(k));
    }
    case 'contains_all': {
      if (typeof actual !== 'string') return false;
      const kws = asArray(v);
      return kws.length > 0 && kws.every((k) => actual.includes(k));
    }
    case 'gte': return actual != null && Number(actual) >= Number(v);
    case 'lte': return actual != null && Number(actual) <= Number(v);
    case 'gt':  return actual != null && Number(actual) >  Number(v);
    case 'lt':  return actual != null && Number(actual) <  Number(v);
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

  const __authzGate = await requireUserPermission(req, "complaint_management", "workflow_action");
  if (!__authzGate.ok) return __authzGate.response;
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

    // Authenticate the caller. The function is invoked from two contexts:
    //  1) End-users retrying triage from the UI — must present a Bearer JWT.
    //  2) Internal service callers (server-side auto-triage on intake) — must
    //     present the service-role key via the standard Supabase headers.
    // Anything else is rejected 401.
    const authHeader = req.headers.get('authorization') ?? '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isServiceCall = !!bearer && !!serviceRoleKey && bearer === serviceRoleKey;

    if (!isServiceCall) {
      if (!bearer) {
        return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      const { data: claims, error: claimsErr } = await supabase.auth.getClaims(bearer);
      if (claimsErr || !claims?.claims?.sub) {
        return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      actorId = claims.claims.sub as string;

      // Authorize: caller needs complaint_management.retry_triage (or fallback
      // to complaint_management.create for the intake path).
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

    // 12-month repeat count
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
    const enriched = { ...complaint, repeat_complaint_count: repeatCount };
    const ageDays = Math.floor(
      (Date.now() - new Date(complaint.created_at || Date.now()).getTime()) / (24 * 3600 * 1000),
    );

    const { data: rulesData } = await supabase.from('conduct_triage_rules')
      .select('id, name, priority_order, match_mode, conditions, outputs')
      .eq('active', true)
      .order('priority_order');
    const rules = ((rulesData || []) as Rule[]);

    const evaluatedSummary: any[] = [];
    let matched: Rule | null = null;
    for (const r of rules) {
      const { matched: hit, conditionResults } = evaluateRule(r, enriched, ageDays);
      evaluatedSummary.push({ id: r.id, name: r.name, matched: hit, conditions: conditionResults });
      if (hit && !matched) matched = r;
    }

    // Resolve category id if rule specifies code
    let resolvedCategoryId: string | null = matched?.outputs?.conduct_risk_category_id ?? null;
    if (!resolvedCategoryId && matched?.outputs?.conduct_risk_category_code) {
      const { data: cat } = await supabase.from('conduct_risk_categories')
        .select('id').eq('code', matched.outputs.conduct_risk_category_code).maybeSingle();
      resolvedCategoryId = cat?.id ?? null;
    }

    // Build update payload
    const update: Record<string, any> = {
      triage_source: matched ? 'auto' : (complaint.triage_source ?? 'manual'),
      triage_rule_id: matched?.id ?? null,
      triage_evaluated_at: new Date().toISOString(),
      repeat_complaint_count: repeatCount,
      triage_last_error: null,
    };
    const appliedOutputs: Record<string, any> = {};

    // Severity is fully system-assigned. When no rule matches (or the matched
    // rule sets no severity) fall back to the configured default severity from
    // complaint_intake_rules so a complaint is never left without one.
    if (!matched?.outputs?.severity) {
      const { data: sevRule } = await supabase
        .from('complaint_intake_rules')
        .select('default_severity, regulator_id')
        .not('default_severity', 'is', null)
        .order('regulator_id', { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      const fallbackSeverity = sevRule?.default_severity ?? 'medium';
      if (complaint.severity !== fallbackSeverity) {
        update.severity = fallbackSeverity;
      }
      appliedOutputs.severity_source = 'configured_default';
      appliedOutputs.severity = fallbackSeverity;
    }

    if (matched) {
      const o = matched.outputs || {};
      if (o.severity) { update.severity = o.severity; appliedOutputs.severity = o.severity; }
      if (o.priority) { update.priority = o.priority; appliedOutputs.priority = o.priority; }
      if (o.assigned_team) {
        // On retry/manual re-run the workflow engine owns routing — do NOT overwrite the assignee.
        if (triggered_by === 'intake' || !complaint.assigned_team) {
          update.assigned_team = o.assigned_team;
          appliedOutputs.assigned_team = o.assigned_team;
        } else {
          appliedOutputs.assigned_team_skipped = { reason: 'workflow_owned', triggered_by, current: complaint.assigned_team };
        }
      }
      if (o.sla_days) {
        update.sla_days = o.sla_days;
        const base = new Date(complaint.created_at || Date.now());
        update.sla_due_at = new Date(base.getTime() + o.sla_days * 24 * 3600 * 1000).toISOString();
        appliedOutputs.sla_days = o.sla_days;
        appliedOutputs.sla_due_at = update.sla_due_at;
      }
      if (resolvedCategoryId) {
        update.conduct_risk_category_id = resolvedCategoryId;
        appliedOutputs.conduct_risk_category_id = resolvedCategoryId;
      }
    }

    // Capture originals for override trail on FIRST auto-triage only
    if (matched && !complaint.triage_original_values) {
      update.triage_original_values = {
        captured_at: update.triage_evaluated_at,
        rule_id: matched.id,
        rule_name: matched.name,
        values: {
          severity: update.severity ?? complaint.severity ?? null,
          priority: update.priority ?? complaint.priority ?? null,
          assigned_team: update.assigned_team ?? complaint.assigned_team ?? null,
          sla_days: update.sla_days ?? complaint.sla_days ?? null,
          sla_due_at: update.sla_due_at ?? complaint.sla_due_at ?? null,
          conduct_risk_category_id: resolvedCategoryId ?? complaint.conduct_risk_category_id ?? null,
          product_id: complaint.product_id ?? null,
          channel_id: complaint.channel_id ?? null,
        },
      };
    }

    update.triage_result_snapshot = {
      inputs: {
        complaint_type_id: complaint.complaint_type_id, product_id: complaint.product_id,
        channel_id: complaint.channel_id, licensee_id: complaint.licensee_id,
        customer_type: complaint.customer_type,
        vulnerability_indicator: !!complaint.vulnerability_indicator,
        severity: complaint.severity, priority: complaint.priority,
        assigned_team: complaint.assigned_team,
        repeat_complaint_count: repeatCount, sla_days: complaint.sla_days,
        age_days: ageDays, status: complaint.status,
      },
      matched_rule: matched ? { id: matched.id, name: matched.name, priority_order: matched.priority_order } : null,
      outputs: appliedOutputs,
      rules_evaluated: rules.length,
      evaluated_at: update.triage_evaluated_at,
      function_version: FN_VERSION,
    };

    // Category severity_hint lookup for high_risk_category alert
    const finalCategoryId = update.conduct_risk_category_id ?? complaint.conduct_risk_category_id ?? null;
    let categorySeverityHint: string | null = null;
    if (finalCategoryId) {
      const { data: catRow } = await supabase.from('conduct_risk_categories')
        .select('severity_hint').eq('id', finalCategoryId).maybeSingle();
      categorySeverityHint = catRow?.severity_hint ?? null;
    }

    // Plan alerts
    const finalSeverity = update.severity ?? complaint.severity;
    const isOpen = !['resolved', 'closed', 'rejected'].includes((complaint.status || '').toLowerCase());

    type PlannedAlert = {
      kind: string; severity: string; title: string; detail: any;
      dedupeParts: string[]; source: string;
      window_start?: string; window_end?: string;
      product_id?: string | null; channel_id?: string | null;
      category_id?: string | null; licensee_id?: string | null;
    };
    const plannedAlerts: PlannedAlert[] = [];

    if (finalSeverity === 'critical') plannedAlerts.push({
      kind: 'critical_severity', severity: 'critical',
      title: `Critical complaint: ${(complaint.subject || complaint.complaint_number || '').slice(0, 80)}`,
      detail: { rule: matched?.name, complaint_number: complaint.complaint_number },
      dedupeParts: [complaint_id, 'critical_severity'], source: 'triage_engine',
    });
    if (complaint.vulnerability_indicator) plannedAlerts.push({
      kind: 'vulnerable_customer', severity: 'high',
      title: `Vulnerable customer complaint (${complaint.complaint_number})`,
      detail: { notes: complaint.vulnerability_notes || null },
      dedupeParts: [complaint_id, 'vulnerable_customer'], source: 'triage_engine',
    });
    if (repeatCount >= 3) plannedAlerts.push({
      kind: 'repeat_complaint', severity: 'high',
      title: `Repeat complainant (${repeatCount} in 12m)`,
      detail: { repeat_count: repeatCount },
      dedupeParts: [complaint_id, 'repeat_complaint'], source: 'triage_engine',
    });

    // SLA-based
    const slaDueIso = update.sla_due_at ?? complaint.sla_due_at ?? null;
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

    // High-risk category
    if (finalCategoryId && (categorySeverityHint === 'high' || categorySeverityHint === 'critical')) {
      plannedAlerts.push({
        kind: 'high_risk_category', severity: categorySeverityHint,
        title: `High-risk conduct category on ${complaint.complaint_number}`,
        detail: { category_id: finalCategoryId, severity_hint: categorySeverityHint },
        dedupeParts: [complaint_id, 'high_risk_category', finalCategoryId], source: 'triage_engine',
        category_id: finalCategoryId,
      });
    }

    // Rule-requested alert (map to rule_triggered by default)
    if (matched?.outputs?.generate_alert_kind) {
      const kindRaw = matched.outputs.generate_alert_kind;
      const allowed = new Set(['repeat_complaint','vulnerable_customer','critical_severity','thematic_spike','sla_breach','sla_at_risk','rule_triggered','high_risk_category']);
      const kind = allowed.has(kindRaw) ? kindRaw : 'rule_triggered';
      plannedAlerts.push({
        kind,
        severity: matched.outputs.alert_severity ?? (update.severity ?? complaint.severity ?? 'medium'),
        title: matched.outputs.alert_title ?? `${matched.name} triggered on ${complaint.complaint_number}`,
        detail: matched.outputs.alert_detail ?? { rule_id: matched.id, recommended_action: matched.outputs.recommended_action || null },
        dedupeParts: [complaint_id, kind, matched.id], source: 'triage_rule',
      });
    }

    // Thematic spike (per active dimension) via conduct_alert_thresholds
    const { data: thresholds } = await supabase.from('conduct_alert_thresholds')
      .select('*').eq('kind', 'thematic_spike').eq('active', true);
    for (const th of thresholds || []) {
      const windowDays = th.window_days ?? 30;
      const threshold = th.threshold_count ?? 5;
      const windowStart = new Date(Date.now() - windowDays * 24 * 3600 * 1000).toISOString();
      const dimensions: Array<{ col: string; val: string | null; label: string }> = [
        { col: 'product_id', val: complaint.product_id, label: 'product' },
        { col: 'channel_id', val: complaint.channel_id, label: 'channel' },
        { col: 'conduct_risk_category_id', val: finalCategoryId, label: 'category' },
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
            title: `Thematic spike on ${d.label} (${count} complaints in ${windowDays}d)`,
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

    // Dry-run: audit only, don't persist
    if (dry_run) {
      await writeTriageAudit({
        outcome: 'dry_run',
        matched_rule_id: matched?.id ?? null,
        matched_rule_name: matched?.name ?? null,
        rules_evaluated: rules.length,
        evaluated_summary: evaluatedSummary,
        input_snapshot: update.triage_result_snapshot?.inputs ?? null,
        old_values: {
          severity: complaint.severity, priority: complaint.priority,
          assigned_team: complaint.assigned_team, sla_days: complaint.sla_days,
          sla_due_at: complaint.sla_due_at, conduct_risk_category_id: complaint.conduct_risk_category_id,
        },
        new_values: update,
        applied_outputs: appliedOutputs,
        alerts_generated: plannedAlerts.map((a) => ({ kind: a.kind, severity: a.severity, title: a.title })),
      });
      await logComplianceAudit(supabase, {
        actorId: actorId ?? SYSTEM_ACTOR, actionType: 'UPDATE',
        objectType: 'complaint', objectId: complaint_id,
        beforeValue: complaint, afterValue: update,
        metadata: { function: 'evaluate-complaint-triage', version: FN_VERSION, dry_run: true, triggered_by, matched_rule_id: matched?.id ?? null, rules_evaluated: rules.length, planned_alerts: plannedAlerts.map((a) => a.kind) },
      });
      return new Response(JSON.stringify({
        success: true, dry_run: true, complaint_id, matched_rule: matched,
        would_update: update, would_generate_alerts: plannedAlerts,
        rules_evaluated: rules.length, evaluated_summary: evaluatedSummary,
      }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Persist complaint
    const { error: uErr } = await supabase.from('complaints').update(update).eq('id', complaint_id);
    if (uErr) throw uErr;

    // Alerts (race-safe: SELECT-then-INSERT against partial unique index on open dedupe_key)
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
        conduct_risk_category_id: a.category_id ?? finalCategoryId ?? null,
        regulator_id: complaint.regulator_id ?? null,
        kind: a.kind, severity: a.severity, title: a.title, detail: a.detail,
        triage_rule_id: matched?.id ?? null,
        dedupe_key: dedupe, status: 'open',
        source: a.source, generated_by: a.source === 'thematic_sweep' ? 'thematic_sweep' : 'triage_engine',
        window_start: a.window_start ?? null, window_end: a.window_end ?? null,
      };
      const { data, error } = await supabase.from('conduct_alerts')
        .insert(row)
        .select('id').maybeSingle();
      if (error) {
        if ((error as any).code === '23505') {
          alertsSkipped.push({ kind: a.kind, dedupe_key: dedupe });
        } else {
          console.warn('[triage] alert insert failed', error.message);
        }
        continue;
      }
      if (data?.id) alertsCreated.push({ id: data.id, kind: a.kind });
    }

    const outcome = matched ? 'matched' : 'no_match';
    await writeTriageAudit({
      outcome,
      matched_rule_id: matched?.id ?? null,
      matched_rule_name: matched?.name ?? null,
      rules_evaluated: rules.length,
      evaluated_summary: evaluatedSummary,
      input_snapshot: update.triage_result_snapshot?.inputs ?? null,
      old_values: {
        severity: complaint.severity, priority: complaint.priority,
        assigned_team: complaint.assigned_team, sla_days: complaint.sla_days,
        sla_due_at: complaint.sla_due_at, conduct_risk_category_id: complaint.conduct_risk_category_id,
      },
      new_values: update,
      applied_outputs: appliedOutputs,
      alerts_generated: alertsCreated,
      alerts_skipped: alertsSkipped,
    });
    await logComplianceAudit(supabase, {
      actorId: actorId ?? SYSTEM_ACTOR, actionType: 'UPDATE',
      objectType: 'complaint', objectId: complaint_id,
      beforeValue: complaint, afterValue: update,
      metadata: {
        function: 'evaluate-complaint-triage', version: FN_VERSION,
        dry_run: false, triggered_by, matched_rule_id: matched?.id ?? null,
        matched_rule_name: matched?.name ?? null, rules_evaluated: rules.length,
        alerts_created: alertsCreated.length, alert_kinds: alertsCreated.map((a) => a.kind),
        alerts_skipped: alertsSkipped.length,
      },
    });

    return new Response(JSON.stringify({
      success: true, complaint_id, matched_rule: matched, updated: update,
      alerts_created: alertsCreated.length, alerts: alertsCreated,
      rules_evaluated: rules.length,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    const msg = e?.message ?? String(e);
    try {
      if (complaint_id) {
        await supabase.from('complaints').update({ triage_last_error: msg.slice(0, 500) }).eq('id', complaint_id);
      }
      await writeTriageAudit({
        outcome: 'error',
        rules_evaluated: 0,
        error_message: msg,
      });
      await logComplianceAudit(supabase, {
        actorId: actorId ?? SYSTEM_ACTOR, actionType: 'INTEGRATION_EVENT',
        objectType: 'complaint', objectId: complaint_id,
        metadata: {
          function: 'evaluate-complaint-triage', version: FN_VERSION,
          triggered_by, dry_run, outcome: 'failed', error_message: msg,
          stack: (e?.stack || '').split('\n').slice(0, 5).join('\n'),
        },
      });
    } catch { /* swallow */ }
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
