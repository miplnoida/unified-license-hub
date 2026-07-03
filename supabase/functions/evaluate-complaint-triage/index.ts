// Complaint triage engine v2.
//
// Body: { complaint_id: string, dry_run?: boolean, triggered_by?: string }
//
// Loads the target complaint, recomputes 12-month repeat count, evaluates
// active triage rules in priority_order (first-match wins), persists the
// matched outputs onto the complaint, and generates duplicate-safe
// conduct_alerts.
//
// Every invocation — match, no-match, dry-run, and failure — writes a
// durable audit row via log_compliance_audit_as_actor.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { logComplianceAudit } from "../_shared/audit.ts";

const FN_VERSION = "triage.v2";

interface Condition { field: string; op: string; value: any }
interface Outputs {
  severity?: string; priority?: string; sla_days?: number;
  assigned_team?: string; conduct_risk_category_code?: string;
  generate_alert_kind?: string; recommended_action?: string;
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
    case 'entity': return c.licensee_id;
    case 'customer_type': return c.customer_type;
    case 'customer_vulnerability': return !!c.vulnerability_indicator;
    case 'keywords': return `${c.subject || ''}\n${c.description || ''}`.toLowerCase();
    case 'repeat_count': return c.repeat_complaint_count ?? 0;
    case 'sla_days': return c.sla_days ?? 0;
    case 'severity': return c.severity;
    case 'priority': return c.priority;
    case 'assigned_team': return c.assigned_team;
    case 'age_days': return ageDays;
    default: return undefined;
  }
}

function asArray(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).toLowerCase());
  if (typeof v === 'string') return v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return [];
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
    case 'gte': return Number(actual) >= Number(v);
    case 'lte': return Number(actual) <= Number(v);
    case 'is_true': return !!actual;
    case 'is_false': return !actual;
    case 'is_empty': return actual === null || actual === undefined || actual === '' || (Array.isArray(actual) && actual.length === 0);
    case 'is_not_empty': return !(actual === null || actual === undefined || actual === '' || (Array.isArray(actual) && actual.length === 0));
    default: return false;
  }
}

function evaluateRule(rule: Rule, c: any, ageDays: number): boolean {
  const conds = rule.conditions || [];
  if (conds.length === 0) return true;
  if (rule.match_mode === 'any') return conds.some((x) => checkCond(x, c, ageDays));
  return conds.every((x) => checkCond(x, c, ageDays));
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

    // Best-effort actor id from JWT (verify_jwt is off; header is optional)
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
        actorId = user?.id ?? null;
      } catch { /* ignore */ }
    }

    const { data: complaint, error: cErr } = await supabase.from('complaints').select('*').eq('id', complaint_id).maybeSingle();
    if (cErr || !complaint) throw new Error(cErr?.message || 'Complaint not found');

    // Recompute 12-month repeat count based on complainant + entity/product/category
    const since12m = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
    let repeatCount = 0;
    if (complaint.complainant_id || complaint.email) {
      let rq = supabase.from('complaints').select('id', { count: 'exact', head: true }).gte('created_at', since12m).neq('id', complaint.id);
      if (complaint.complainant_id) rq = rq.eq('complainant_id', complaint.complainant_id);
      else if (complaint.email) rq = rq.eq('email', complaint.email);
      const { count } = await rq;
      repeatCount = count ?? 0;
    }
    const enriched = { ...complaint, repeat_complaint_count: repeatCount };
    const ageDays = Math.floor((Date.now() - new Date(complaint.created_at || Date.now()).getTime()) / (24 * 3600 * 1000));

    const { data: rulesData } = await supabase.from('conduct_triage_rules')
      .select('id, name, priority_order, match_mode, conditions, outputs')
      .eq('active', true)
      .order('priority_order');
    const rules = ((rulesData || []) as Rule[]);

    let matched: Rule | null = null;
    for (const r of rules) {
      if (evaluateRule(r, enriched, ageDays)) { matched = r; break; }
    }

    // Resolve category id if the matched rule specifies a code
    let categoryId: string | null = null;
    if (matched?.outputs?.conduct_risk_category_code) {
      const { data: cat } = await supabase.from('conduct_risk_categories')
        .select('id').eq('code', matched.outputs.conduct_risk_category_code).maybeSingle();
      categoryId = cat?.id ?? null;
    }

    // Build update payload
    const update: Record<string, any> = {
      triage_source: matched ? 'auto' : (complaint.triage_source ?? 'manual'),
      triage_rule_id: matched?.id ?? null,
      triage_evaluated_at: new Date().toISOString(),
      repeat_complaint_count: repeatCount,
      triage_last_error: null,
    };
    if (matched) {
      const o = matched.outputs || {};
      if (o.severity) update.severity = o.severity;
      if (o.priority) update.priority = o.priority;
      if (o.assigned_team) update.assigned_team = o.assigned_team;
      if (o.sla_days) {
        update.sla_days = o.sla_days;
        const base = new Date(complaint.created_at || Date.now());
        update.sla_due_at = new Date(base.getTime() + o.sla_days * 24 * 3600 * 1000).toISOString();
      }
      if (categoryId) update.conduct_risk_category_id = categoryId;
    }
    update.triage_result_snapshot = {
      inputs: {
        complaint_type_id: complaint.complaint_type_id, product_id: complaint.product_id,
        channel_id: complaint.channel_id, licensee_id: complaint.licensee_id,
        customer_type: complaint.customer_type, vulnerability_indicator: !!complaint.vulnerability_indicator,
        severity: complaint.severity, priority: complaint.priority, assigned_team: complaint.assigned_team,
        repeat_complaint_count: repeatCount, sla_days: complaint.sla_days, age_days: ageDays,
      },
      matched_rule: matched ? { id: matched.id, name: matched.name, priority_order: matched.priority_order } : null,
      outputs: matched?.outputs ?? null,
      rules_evaluated: rules.length,
      evaluated_at: update.triage_evaluated_at,
      function_version: FN_VERSION,
    };

    // Plan alerts
    const finalSeverity = update.severity ?? complaint.severity;
    const finalCategory = update.conduct_risk_category_id ?? complaint.conduct_risk_category_id;
    const plannedAlerts: Array<{ kind: string; severity: string; title: string; detail: any }> = [];
    if (finalSeverity === 'critical') plannedAlerts.push({ kind: 'critical_severity', severity: 'critical', title: `Critical complaint: ${(complaint.subject || complaint.complaint_number || '').slice(0, 80)}`, detail: { rule: matched?.name } });
    if (complaint.vulnerability_indicator) plannedAlerts.push({ kind: 'vulnerable_customer', severity: 'high', title: `Vulnerable customer complaint (${complaint.complaint_number})`, detail: { notes: complaint.vulnerability_notes || null } });
    if (repeatCount >= 3) plannedAlerts.push({ kind: 'repeat_complaint', severity: 'high', title: `Repeat complainant (${repeatCount} in 12m)`, detail: { repeat_count: repeatCount } });
    // SLA
    if (update.sla_due_at) {
      const dueMs = new Date(update.sla_due_at).getTime();
      const remaining = dueMs - Date.now();
      if (remaining <= 0) plannedAlerts.push({ kind: 'sla_breach', severity: 'high', title: `SLA breached for ${complaint.complaint_number}`, detail: { sla_due_at: update.sla_due_at } });
      else if (remaining <= 24 * 3600 * 1000) plannedAlerts.push({ kind: 'sla_at_risk', severity: 'medium', title: `SLA at risk (<24h) for ${complaint.complaint_number}`, detail: { sla_due_at: update.sla_due_at } });
    }
    // Rule-requested alert
    if (matched?.outputs?.generate_alert_kind) {
      plannedAlerts.push({
        kind: matched.outputs.generate_alert_kind,
        severity: (update.severity ?? complaint.severity ?? 'medium'),
        title: `${matched.name} triggered on ${complaint.complaint_number}`,
        detail: { rule_id: matched.id, recommended_action: matched.outputs.recommended_action || null },
      });
    }

    // Dry-run: audit only, don't persist
    if (dry_run) {
      await logComplianceAudit(supabase, {
        actorId: actorId ?? '00000000-0000-0000-0000-000000000000',
        actionType: 'UPDATE',
        objectType: 'complaint',
        objectId: complaint_id,
        beforeValue: complaint,
        afterValue: update,
        metadata: {
          function: 'evaluate-complaint-triage', version: FN_VERSION, dry_run: true,
          triggered_by: triggered_by ?? 'unknown',
          matched_rule_id: matched?.id ?? null, matched_rule_name: matched?.name ?? null,
          rules_evaluated: rules.length, planned_alerts: plannedAlerts.map((a) => a.kind),
        },
      });
      return new Response(JSON.stringify({
        success: true, dry_run: true, complaint_id, matched_rule: matched,
        would_update: update, would_generate_alerts: plannedAlerts,
      }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Persist
    const { error: uErr } = await supabase.from('complaints').update(update).eq('id', complaint_id);
    if (uErr) throw uErr;

    // Alerts with dedupe
    const alertsCreated: string[] = [];
    for (const a of plannedAlerts) {
      const dedupe = await sha1Hex(`${complaint_id}:${a.kind}:${matched?.id ?? 'none'}`);
      const row: any = {
        complaint_id, licensee_id: complaint.licensee_id, product_id: complaint.product_id,
        channel_id: complaint.channel_id, conduct_risk_category_id: finalCategory,
        kind: a.kind, severity: a.severity, title: a.title, detail: a.detail,
        triage_rule_id: matched?.id ?? null, dedupe_key: dedupe, status: 'open',
      };
      const { data, error } = await supabase.from('conduct_alerts')
        .upsert(row, { onConflict: 'dedupe_key', ignoreDuplicates: true })
        .select('id').maybeSingle();
      if (!error && data?.id) alertsCreated.push(data.id);
    }

    await logComplianceAudit(supabase, {
      actorId: actorId ?? '00000000-0000-0000-0000-000000000000',
      actionType: matched ? 'UPDATE' : 'ACCESS_DENIED', // ACCESS_DENIED is the only "info" slot; use UPDATE for both to stay uniform
      objectType: 'complaint',
      objectId: complaint_id,
      beforeValue: complaint,
      afterValue: update,
      metadata: {
        function: 'evaluate-complaint-triage', version: FN_VERSION, dry_run: false,
        triggered_by: triggered_by ?? 'unknown',
        matched_rule_id: matched?.id ?? null, matched_rule_name: matched?.name ?? null,
        rules_evaluated: rules.length, alerts_created: alertsCreated.length,
        alerts_kinds: plannedAlerts.map((a) => a.kind),
      },
    });

    return new Response(JSON.stringify({
      success: true, complaint_id, matched_rule: matched, updated: update,
      alerts_created: alertsCreated.length, rules_evaluated: rules.length,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    try {
      if (complaint_id) {
        await supabase.from('complaints').update({ triage_last_error: msg.slice(0, 500) }).eq('id', complaint_id);
      }
      await logComplianceAudit(supabase, {
        actorId: actorId ?? '00000000-0000-0000-0000-000000000000',
        actionType: 'INTEGRATION_EVENT',
        objectType: 'complaint',
        objectId: complaint_id,
        metadata: {
          function: 'evaluate-complaint-triage', version: FN_VERSION,
          triggered_by: triggered_by ?? 'unknown', dry_run,
          outcome: 'failed', error_message: msg, stack: (e?.stack || '').split('\n').slice(0, 5).join('\n'),
        },
      });
    } catch { /* swallow */ }
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
