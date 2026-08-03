// Unified Rule Engine runner (ADM-RE-003 sandbox + real scheduled execution).
//
// Modes:
//   { dry_run: true, rule_id }  → sandbox. Requires rule_engine/edit permission,
//                                 writes ONLY an engine_rule_tests row.
//   { rule_id? }                → real execution. Worker-authenticated
//                                 (pg_cron / service role / worker token).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireWorkerInvocation } from '../_shared/workerAuth.ts';
import { requireUserPermission } from '../_shared/authz.ts';
import {
  Any,
  bandToScore,
  Candidate,
  currentPeriodKey,
  evaluateRule,
  renderTemplate,
} from '../_shared/ruleEngineEval.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const dryRun: boolean = !!body?.dry_run;
  const ruleId: string | undefined = body?.rule_id;
  const sampleLimit: number = Math.min(Number(body?.limit || 25), 100);

  let userId: string | null = null;
  if (dryRun) {
    const gate = await requireUserPermission(req, 'rule_engine', 'edit');
    if (!gate.ok) return gate.response;
    userId = gate.userId;
  } else {
    const gate = requireWorkerInvocation(req);
    if (!gate.ok) return gate.response;
  }

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const summary = {
    dry_run: dryRun,
    rules_evaluated: 0,
    candidates: 0,
    matched: 0,
    suppressed: 0,
    alerts_created: 0,
    tasks_created: 0,
    notifications_queued: 0,
    workflows_started: 0,
    risk_updates: 0,
    errors: [] as string[],
    results: [] as Any[],
  };

  try {
    let q = supa.from('engine_rules').select('*');
    if (ruleId) q = q.eq('id', ruleId);
    else q = q.eq('status', 'active');
    const { data: rules, error } = await q;
    if (error) throw new Error(error.message);

    for (const rule of (rules as Any[]) || []) {
      summary.rules_evaluated++;
      let candidates: Candidate[] = [];
      try {
        candidates = await evaluateRule(supa, rule);
      } catch (e) {
        summary.errors.push(`${rule.rule_code}: ${(e as Error).message}`);
        if (dryRun) {
          await supa.rpc('engine_rule_record_test', {
            _rule_id: rule.id, _params: body?.params ?? {}, _results: [],
            _evaluated: 0, _matched: 0, _passed: false, _error: (e as Error).message,
          });
        }
        continue;
      }

      summary.candidates += candidates.length;
      const matches = candidates.filter((c) => c.matched);
      summary.matched += matches.length;

      if (dryRun) {
        const preview = candidates.slice(0, sampleLimit).map((c) => ({
          entity_id: c.entity_id,
          entity_label: c.entity_label,
          matched: c.matched,
          metrics: c.metrics,
          reason: c.reason,
          would_do: c.matched ? plannedActions(rule, c) : [],
        }));
        summary.results.push({ rule_id: rule.id, rule_code: rule.rule_code, preview });
        continue;
      }

      for (const cand of candidates) {
        const entityKey = cand.entity_id || cand.entity_label || 'global';
        let suppressed = false;

        if (cand.matched && Number(rule.suppression_days) > 0 && rule.severity !== 'critical') {
          const { data: sup } = await supa.from('engine_rule_suppressions')
            .select('*').eq('rule_id', rule.id).eq('entity_key', entityKey).maybeSingle();
          if (sup && new Date((sup as Any).suppressed_until).getTime() > Date.now()) {
            suppressed = true;
            summary.suppressed++;
            await supa.from('engine_rule_suppressions').update({
              suppressed_count: Number((sup as Any).suppressed_count || 0) + 1,
              last_suppressed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', (sup as Any).id);
          }
        }

        const { data: exec, error: exErr } = await supa.from('engine_rule_executions').insert({
          rule_id: rule.id,
          version: rule.version,
          run_mode: body?.on_demand ? 'on_demand' : 'scheduled',
          entity_id: cand.entity_id,
          entity_label: cand.entity_label,
          matched: cand.matched,
          suppressed,
          metrics: cand.metrics,
          reason: cand.reason,
          actions_taken: [],
        }).select('id').single();
        if (exErr) { summary.errors.push(`exec:${rule.rule_code}:${exErr.message}`); continue; }
        const executionId = (exec as Any).id as string;

        if (!cand.matched || suppressed) continue;

        const taken: Any[] = [];
        const vars = {
          metric: Object.keys(cand.metrics || {})[0] ?? '',
          entity: cand.entity_label ?? '',
          entity_name: cand.entity_label ?? '',
          value: Object.values(cand.metrics || {})[0] ?? '',
          rule_code: rule.rule_code,
          rule_name: rule.name,
        };

        for (const action of (rule.actions || []) as Any[]) {
          try {
            switch (action.type) {
              case 'generate_alert': {
                const title = renderTemplate(action.template || rule.name, vars);
                const { data: alert } = await supa.from('engine_rule_alerts').insert({
                  rule_id: rule.id, execution_id: executionId, entity_id: cand.entity_id,
                  severity: rule.severity, title,
                  detail: { reason: cand.reason, metrics: cand.metrics, rule_code: rule.rule_code },
                }).select('id').single();
                summary.alerts_created++;
                taken.push({ type: 'generate_alert', alert_id: (alert as Any)?.id, title });
                await supa.rpc('notification_enqueue_event', {
                  _event_key: 'engine_rule_alert_generated',
                  _entity_type: 'engine_rule_alert',
                  _entity_id: (alert as Any)?.id ?? null,
                  _payload: { alert_title: title, rule_code: rule.rule_code, entity_name: cand.entity_label },
                  _idempotency_suffix: executionId,
                });
                summary.notifications_queued++;
                break;
              }
              case 'send_notification': {
                await supa.rpc('notification_enqueue_event', {
                  _event_key: action.event_key,
                  _entity_type: 'engine_rule',
                  _entity_id: rule.id,
                  _payload: {
                    rule_code: rule.rule_code, rule_name: rule.name,
                    entity_name: cand.entity_label, entity_id: cand.entity_id,
                    recipient_role: action.recipient_role ?? null, reason: cand.reason,
                  },
                  _idempotency_suffix: executionId,
                });
                summary.notifications_queued++;
                taken.push({ type: 'send_notification', event_key: action.event_key });
                break;
              }
              case 'create_task': {
                const due = action.due_in_days
                  ? new Date(Date.now() + Number(action.due_in_days) * 86400_000).toISOString().slice(0, 10)
                  : null;
                const { data: task } = await supa.from('engine_rule_tasks').insert({
                  rule_id: rule.id, execution_id: executionId, entity_id: cand.entity_id,
                  title: renderTemplate(action.template || `Follow up: ${rule.name}`, vars),
                  assigned_role: action.assigned_role, due_date: due,
                }).select('id').single();
                summary.tasks_created++;
                taken.push({ type: 'create_task', task_id: (task as Any)?.id, due_date: due });
                break;
              }
              case 'update_risk_status': {
                if (cand.entity_id) {
                  const band = action.risk_status || rule.severity;
                  await supa.from('entity_risk_scores')
                    .update({ is_current: false }).eq('entity_id', cand.entity_id).eq('is_current', true);
                  await supa.from('entity_risk_scores').insert({
                    entity_id: cand.entity_id,
                    period_key: currentPeriodKey(),
                    score: bandToScore(band),
                    band,
                    components: { source: 'rule_engine', rule_code: rule.rule_code, reason: cand.reason },
                    weights: {},
                    is_current: true,
                  });
                  summary.risk_updates++;
                  taken.push({ type: 'update_risk_status', band });
                }
                break;
              }
              case 'initiate_workflow': {
                const { data: wf } = await supa.from('approval_workflows')
                  .select('id, current_published_version_id').eq('id', action.workflow_id).maybeSingle();
                if ((wf as Any)?.current_published_version_id) {
                  const { data: inst } = await supa.from('workflow_instances').insert({
                    workflow_id: action.workflow_id,
                    workflow_version_id: (wf as Any).current_published_version_id,
                    entity_type: 'engine_rule_match',
                    entity_id: cand.entity_id,
                    status: 'active',
                  }).select('id').single();
                  summary.workflows_started++;
                  taken.push({ type: 'initiate_workflow', instance_id: (inst as Any)?.id });
                } else {
                  taken.push({ type: 'initiate_workflow', skipped: 'workflow_not_published' });
                }
                break;
              }
              case 'log_ewi_event': {
                await supa.from('prudential_data_feed_logs').insert({
                  source: 'rule-engine',
                  feed_type: 'ewi_event',
                  status: 'success',
                  row_count: 1,
                  started_at: new Date().toISOString(),
                  completed_at: new Date().toISOString(),
                  metadata: { rule_code: rule.rule_code, entity_id: cand.entity_id, reason: cand.reason, metrics: cand.metrics },
                });
                taken.push({ type: 'log_ewi_event' });
                break;
              }
              default:
                taken.push({ type: action.type, skipped: 'unknown_action' });
            }
          } catch (e) {
            summary.errors.push(`action:${rule.rule_code}:${action.type}:${(e as Error).message}`);
            taken.push({ type: action.type, error: (e as Error).message });
          }
        }

        await supa.from('engine_rule_executions').update({ actions_taken: taken }).eq('id', executionId);

        if (Number(rule.suppression_days) > 0) {
          const until = new Date(Date.now() + Number(rule.suppression_days) * 86400_000).toISOString();
          await supa.from('engine_rule_suppressions').upsert({
            rule_id: rule.id, entity_key: entityKey, suppressed_until: until, updated_at: new Date().toISOString(),
          }, { onConflict: 'rule_id,entity_key' });
        }

        const firstFire = !rule.last_triggered_at;
        await supa.from('engine_rules').update({
          last_triggered_at: new Date().toISOString(),
          trigger_count: Number(rule.trigger_count || 0) + 1,
        }).eq('id', rule.id);
        rule.trigger_count = Number(rule.trigger_count || 0) + 1;
        rule.last_triggered_at = new Date().toISOString();

        if (firstFire) {
          await supa.rpc('notification_enqueue_event', {
            _event_key: 'admin_rule_first_fire',
            _entity_type: 'engine_rule',
            _entity_id: rule.id,
            _payload: { rule_code: rule.rule_code, rule_name: rule.name, entity_name: cand.entity_label },
          });
          summary.notifications_queued++;
        }
      }
    }

    if (dryRun && ruleId) {
      const first = summary.results[0];
      const matched = summary.matched;
      const evaluated = summary.candidates;
      // A test passes when the rule executed cleanly against real-shaped data.
      const passed = summary.errors.length === 0 && evaluated > 0;
      const { error: tErr } = await supa.rpc('engine_rule_record_test', {
        _rule_id: ruleId,
        _params: { limit: sampleLimit, ...(body?.params ?? {}) },
        _results: first?.preview ?? [],
        _evaluated: evaluated,
        _matched: matched,
        _passed: passed,
        _error: summary.errors.length ? summary.errors.join('; ') : null,
      });
      if (tErr) summary.errors.push(`test_record: ${tErr.message}`);
      return new Response(JSON.stringify({ ok: true, passed, run_by: userId, ...summary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, ...summary }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function plannedActions(rule: Any, cand: Candidate): Any[] {
  const vars = {
    metric: Object.keys(cand.metrics || {})[0] ?? '',
    entity: cand.entity_label ?? '',
    value: Object.values(cand.metrics || {})[0] ?? '',
    rule_code: rule.rule_code,
    rule_name: rule.name,
  };
  return ((rule.actions || []) as Any[]).map((a) => {
    switch (a.type) {
      case 'generate_alert':
        return { type: a.type, severity: rule.severity, alert_text: renderTemplate(a.template || rule.name, vars) };
      case 'send_notification':
        return { type: a.type, event_key: a.event_key, recipient_role: a.recipient_role };
      case 'create_task':
        return {
          type: a.type, assigned_role: a.assigned_role,
          due_date: a.due_in_days ? new Date(Date.now() + Number(a.due_in_days) * 86400_000).toISOString().slice(0, 10) : null,
          title: renderTemplate(a.template || `Follow up: ${rule.name}`, vars),
        };
      case 'update_risk_status':
        return { type: a.type, band: a.risk_status || rule.severity };
      case 'initiate_workflow':
        return { type: a.type, workflow_id: a.workflow_id, workflow_name: a.workflow_name };
      default:
        return { type: a.type };
    }
  });
}
