import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";
import { requireUserPermission } from "../_shared/authz.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Scheduled/worker invocation OR an authenticated user holding the
  // market_conduct.run_conduct_analytics permission (governed on-demand run).
  let executedBy: string | null = null;
  const __workerGate = requireWorkerInvocation(req);
  if (!__workerGate.ok) {
    const __userGate = await requireUserPermission(req, 'market_conduct', 'run_conduct_analytics');
    if (!__userGate.ok) return __workerGate.response;
    executedBy = __userGate.userId;
  }
  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const onlyRuleId: string | undefined = body?.rule_id;
  const onDemand: boolean = !!body?.on_demand;

  const summary = { evaluated: 0, matched: 0, results_written: 0, alerts_created: 0, errors: [] as string[] };


  try {
    let query = supa.from('conduct_monitoring_rules').select('*').eq('active', true);
    if (onlyRuleId) query = query.eq('id', onlyRuleId);
    else if (!onDemand) query = query.neq('frequency', 'on_demand');
    const { data: rules, error } = await query;
    if (error) throw new Error(error.message);

    for (const rule of (rules as Any[]) || []) {
      summary.evaluated++;
      // Start a run-log row for auditability
      const { data: runRow } = await supa.from('conduct_monitoring_rule_runs')
        .insert({ rule_id: rule.id, status: 'started', executed_by: executedBy }).select('id').maybeSingle();

      let ruleMatched = 0;
      let ruleAlerts = 0;
      try {
        const evaluations = await evaluateRule(supa, rule);
        for (const ev of evaluations) {
          if (ev.matched) { summary.matched++; ruleMatched++; }

          const { data: resRow, error: rErr } = await supa.from('conduct_monitoring_results')
            .insert({
              rule_id: rule.id,
              entity_id: ev.entity_id ?? null,
              product_id: ev.product_id ?? null,
              thematic_review_id: ev.thematic_review_id ?? null,
              matched: ev.matched,
              metrics: ev.metrics,
              notes: ev.notes ?? null,
              risk_delta_applied: ev.matched ? Number(rule.risk_delta || 0) : 0,
            })
            .select('id').single();
          if (rErr) { summary.errors.push(`result:${rule.id}:${rErr.message}`); continue; }
          summary.results_written++;

          if (ev.matched) {
            const dedupeDay = new Date().toISOString().slice(0, 10);
            const dedupeKey = `mon:${rule.id}:${ev.entity_id || 'g'}:${ev.product_id || 'x'}:${dedupeDay}`;
            const { data: existing } = await supa.from('conduct_alerts')
              .select('id').eq('dedupe_key', dedupeKey).maybeSingle();
            if (!existing) {
              const { data: alert, error: aErr } = await supa.from('conduct_alerts').insert({
                dedupe_key: dedupeKey,
                kind: 'rule_triggered',
                source: 'evaluate-conduct-monitoring',
                generated_by: 'triage_engine',
                severity: rule.risk_delta >= 15 ? 'high' : rule.risk_delta >= 8 ? 'medium' : 'low',
                title: `Rule triggered: ${rule.name}`,
                detail: { rule_id: rule.id, licensee_id: ev.entity_id, product_id: ev.product_id, metrics: ev.metrics },
                status: 'open',
                licensee_id: ev.entity_id ?? null,
                product_id: ev.product_id ?? null,
                monitoring_result_id: (resRow as Any).id,
                rule_version: rule.current_version ?? 1,
                threshold_value: rule.threshold_value ?? null,
                rule_snapshot: { code: rule.code, name: rule.name, rule_type: rule.rule_type, definition: rule.definition },
                explanation: `Detected ${ev.metrics?.count} matching complaints against a threshold of ${ev.metrics?.threshold} within ${ev.metrics?.window_days} days.`,
              }).select('id').maybeSingle();
              if (aErr) summary.errors.push(`alert:${rule.id}:${aErr.message}`);
              if (alert?.id) {
                summary.alerts_created++;
                ruleAlerts++;
                await supa.from('conduct_monitoring_results').update({ alert_id: alert.id }).eq('id', (resRow as Any).id);


                // Fire notification event (best-effort)
                try {
                  await supa.functions.invoke('dispatch-notification-event', {
                    body: {
                      event_key: 'conduct_monitoring_rule_triggered',
                      entity_type: 'conduct_alert',
                      entity_id: alert.id,
                      payload: { rule_name: rule.name, entity_id: ev.entity_id, alert_id: alert.id },
                    },
                  });
                } catch { /* swallow */ }
              }
            }
          }
        }
        if (runRow?.id) {
          await supa.from('conduct_monitoring_rule_runs').update({
            status: 'success', completed_at: new Date().toISOString(),
            matched_count: ruleMatched, alerts_created: ruleAlerts,
          }).eq('id', runRow.id);
        }
      } catch (e) {
        summary.errors.push(`rule:${rule.id}:${(e as Error).message}`);
        if (runRow?.id) {
          await supa.from('conduct_monitoring_rule_runs').update({
            status: 'failed', completed_at: new Date().toISOString(),
            matched_count: ruleMatched, alerts_created: ruleAlerts,
            error: (e as Error).message,
          }).eq('id', runRow.id);
        }
      }
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

// ---------------- Rule evaluation ----------------
async function evaluateRule(supa: Any, rule: Any) {
  const defn = rule.definition || {};
  const windowDays: number = Number(defn.window_days ?? 30);
  const threshold: number = Number(defn.threshold ?? 5);
  const since = new Date(Date.now() - windowDays * 86400 * 1000).toISOString();

  switch (rule.rule_type) {
    case 'complaint_volume': return await evalComplaintVolume(supa, rule, since, threshold, defn);
    case 'complaint_upheld_rate': return await evalUpheldRate(supa, rule, since, threshold, defn);
    case 'sla_breach_rate': return await evalSlaBreach(supa, rule, since, threshold, defn);
    case 'repeat_offender': return await evalRepeatOffender(supa, rule, since, threshold, defn);
    default: return [{ matched: false, entity_id: null, product_id: null, metrics: { note: 'unsupported rule_type' }, notes: null }];
  }
}

async function evalComplaintVolume(supa: Any, rule: Any, since: string, threshold: number, defn: Any) {
  // Scoped complaint-volume evaluation.
  //   definition.licensee_ids     -> restrict to these entities
  //   definition.complaint_type_id-> restrict to one complaint type
  //   definition.product_id       -> restrict to one product
  //   definition.group_by_product -> count per (entity, product) instead of per entity
  let q = supa.from('complaints').select('licensee_id, product_id, id').gte('created_at', since);
  const licenseeIds: string[] | undefined = Array.isArray(defn.licensee_ids) && defn.licensee_ids.length
    ? defn.licensee_ids : undefined;
  if (licenseeIds) q = q.in('licensee_id', licenseeIds);
  if (defn.complaint_type_id) q = q.eq('complaint_type_id', defn.complaint_type_id);
  if (defn.product_id) q = q.eq('product_id', defn.product_id);
  const { data } = await q;

  const groupByProduct = !!defn.group_by_product;
  const counts = new Map<string, number>();
  for (const c of (data as Any[]) || []) {
    if (!c.licensee_id) continue;
    const key = groupByProduct ? `${c.licensee_id}|${c.product_id ?? ''}` : `${c.licensee_id}|`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const out: Any[] = [];
  for (const [key, n] of counts) {
    const [ent, prod] = key.split('|');
    out.push({
      matched: n >= threshold,
      entity_id: ent,
      product_id: prod || null,
      metrics: {
        count: n,
        threshold,
        window_days: defn.window_days ?? 30,
        scoped: { complaint_type_id: defn.complaint_type_id ?? null, product_id: defn.product_id ?? null, group_by_product: groupByProduct },
      },
    });
  }
  if (out.length === 0) out.push({ matched: false, entity_id: null, product_id: null, metrics: { count: 0, threshold } });
  return out;
}


async function evalUpheldRate(supa: Any, rule: Any, since: string, threshold: number, _defn: Any) {
  const { data } = await supa.from('complaints').select('licensee_id, status, resolution').gte('created_at', since);
  const stats = new Map<string, { total: number; upheld: number }>();
  for (const c of (data as Any[]) || []) {
    if (!c.licensee_id) continue;
    const s = stats.get(c.licensee_id) || { total: 0, upheld: 0 };
    s.total++;
    if (c.status === 'resolved' && (c.resolution === 'upheld' || c.resolution === 'partially_upheld')) s.upheld++;
    stats.set(c.licensee_id, s);
  }
  const out: Any[] = [];
  for (const [ent, s] of stats) {
    if (s.total < 3) continue;
    const rate = s.upheld / s.total;
    out.push({ matched: rate >= threshold, entity_id: ent, metrics: { total: s.total, upheld: s.upheld, rate, threshold } });
  }
  return out.length ? out : [{ matched: false, entity_id: null, metrics: {} }];
}

async function evalSlaBreach(supa: Any, rule: Any, since: string, threshold: number, _defn: Any) {
  const { data } = await supa.from('complaints').select('licensee_id, sla_due_at, status, resolved_at').gte('created_at', since);
  const stats = new Map<string, { total: number; breached: number }>();
  for (const c of (data as Any[]) || []) {
    if (!c.licensee_id || !c.sla_due_at) continue;
    const s = stats.get(c.licensee_id) || { total: 0, breached: 0 };
    s.total++;
    const finished = c.resolved_at ? new Date(c.resolved_at) : new Date();
    if (finished > new Date(c.sla_due_at)) s.breached++;
    stats.set(c.licensee_id, s);
  }
  const out: Any[] = [];
  for (const [ent, s] of stats) {
    if (s.total < 3) continue;
    const rate = s.breached / s.total;
    out.push({ matched: rate >= threshold, entity_id: ent, metrics: { total: s.total, breached: s.breached, rate, threshold } });
  }
  return out.length ? out : [{ matched: false, entity_id: null, metrics: {} }];
}

async function evalRepeatOffender(supa: Any, rule: Any, since: string, threshold: number, defn: Any) {
  const { data } = await supa.from('enforcement_actions').select('licensee_id, id').gte('created_at', since);
  const counts = new Map<string, number>();
  for (const e of (data as Any[]) || []) {
    if (!e.licensee_id) continue;
    counts.set(e.licensee_id, (counts.get(e.licensee_id) || 0) + 1);
  }
  const out: Any[] = [];
  for (const [ent, n] of counts) {
    out.push({ matched: n >= threshold, entity_id: ent, metrics: { count: n, threshold, window_days: defn.window_days ?? 30 } });
  }
  return out.length ? out : [{ matched: false, entity_id: null, metrics: {} }];
}
