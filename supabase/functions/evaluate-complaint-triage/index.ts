// Complaint triage engine.
//
// Body: { complaint_id: string, dry_run?: boolean }
//
// Loads the target complaint, evaluates each active triage rule in
// priority order, and applies the first matching rule's outputs to the
// complaint (or returns them if dry_run). Also generates conduct_alerts
// for critical severity, vulnerable customers, and repeat complaints.
//
// All writes are audit-logged via the compliance_audit_logs table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

interface Condition { field: string; op: string; value: any }
interface Outputs {
  severity?: string; priority?: string; sla_days?: number;
  assigned_team?: string; conduct_risk_category_code?: string;
}
interface Rule { id: string; name: string; priority_order: number; match_mode: 'all' | 'any'; conditions: Condition[]; outputs: Outputs }

function get(field: string, c: any) {
  switch (field) {
    case 'complaint_type': return c.complaint_type_id;
    case 'product': return c.product_id;
    case 'channel': return c.channel_id;
    case 'entity': return c.licensee_id;
    case 'customer_type': return c.customer_type;
    case 'customer_vulnerability': return !!c.vulnerability_indicator;
    case 'keywords': return `${c.subject || ''}\n${c.description || ''}`.toLowerCase();
    case 'repeat_count': return c.repeat_complaint_count ?? 0;
    default: return undefined;
  }
}

function checkCond(cond: Condition, c: any): boolean {
  const actual = get(cond.field, c);
  const v = cond.value;
  switch (cond.op) {
    case 'eq': return String(actual ?? '') === String(v ?? '');
    case 'in': return Array.isArray(v) && v.map(String).includes(String(actual ?? ''));
    case 'contains_any':
      if (typeof actual !== 'string' || !Array.isArray(v)) return false;
      return v.some((k: string) => actual.includes(String(k).toLowerCase()));
    case 'gte': return Number(actual) >= Number(v);
    case 'lte': return Number(actual) <= Number(v);
    case 'is_true': return !!actual;
    default: return false;
  }
}

function evaluate(rule: Rule, c: any): boolean {
  const conds = rule.conditions || [];
  if (conds.length === 0) return true;
  if (rule.match_mode === 'any') return conds.some(x => checkCond(x, c));
  return conds.every(x => checkCond(x, c));
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;
  const cors = buildCorsHeaders(req);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { complaint_id, dry_run } = await req.json();
    if (!complaint_id) return new Response(JSON.stringify({ error: 'complaint_id required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const { data: complaint, error: cErr } = await supabase.from('complaints').select('*').eq('id', complaint_id).maybeSingle();
    if (cErr || !complaint) throw new Error(cErr?.message || 'Complaint not found');

    const { data: rules } = await supabase.from('conduct_triage_rules')
      .select('id, name, priority_order, match_mode, conditions, outputs')
      .eq('active', true)
      .order('priority_order');

    let matched: Rule | null = null;
    for (const r of (rules || []) as Rule[]) {
      if (evaluate(r, complaint)) { matched = r; break; }
    }

    let categoryId: string | null = null;
    if (matched?.outputs?.conduct_risk_category_code) {
      const { data: cat } = await supabase.from('conduct_risk_categories').select('id').eq('code', matched.outputs.conduct_risk_category_code).maybeSingle();
      categoryId = cat?.id || null;
    }

    const update: Record<string, any> = { triage_source: matched ? 'auto' : 'manual', triage_rule_id: matched?.id || null };
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

    if (dry_run) {
      return new Response(JSON.stringify({ complaint_id, matched_rule: matched, would_update: update }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (matched) {
      const { error: uErr } = await supabase.from('complaints').update(update).eq('id', complaint_id);
      if (uErr) throw uErr;
    }

    // Alert generation
    const alerts: any[] = [];
    const finalSeverity = update.severity ?? complaint.severity;
    if (finalSeverity === 'critical') {
      alerts.push({
        complaint_id, licensee_id: complaint.licensee_id, product_id: complaint.product_id,
        channel_id: complaint.channel_id, conduct_risk_category_id: update.conduct_risk_category_id ?? complaint.conduct_risk_category_id,
        kind: 'critical_severity', severity: 'critical', title: `Critical complaint: ${complaint.subject?.slice(0, 80) || complaint.complaint_number}`,
        detail: { rule: matched?.name },
      });
    }
    if (complaint.vulnerability_indicator) {
      alerts.push({
        complaint_id, licensee_id: complaint.licensee_id, product_id: complaint.product_id,
        channel_id: complaint.channel_id, conduct_risk_category_id: update.conduct_risk_category_id ?? complaint.conduct_risk_category_id,
        kind: 'vulnerable_customer', severity: 'high', title: `Vulnerable customer complaint (${complaint.complaint_number})`,
        detail: { notes: complaint.vulnerability_notes || null },
      });
    }
    if ((complaint.repeat_complaint_count ?? 0) >= 3) {
      alerts.push({
        complaint_id, licensee_id: complaint.licensee_id, product_id: complaint.product_id,
        channel_id: complaint.channel_id, conduct_risk_category_id: update.conduct_risk_category_id ?? complaint.conduct_risk_category_id,
        kind: 'repeat_complaint', severity: 'high', title: `Repeat complainant (${complaint.repeat_complaint_count} in 12m)`,
        detail: { repeat_count: complaint.repeat_complaint_count },
      });
    }
    if (alerts.length) {
      await supabase.from('conduct_alerts').insert(alerts);
    }

    return new Response(JSON.stringify({
      complaint_id, matched_rule: matched, updated: update, alerts_created: alerts.length,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
