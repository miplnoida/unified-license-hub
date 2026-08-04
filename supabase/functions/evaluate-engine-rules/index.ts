// Unified Rule Engine runner (ADM-RE-003 Rule Tester + real scheduled execution).
//
// Modes:
//   { dry_run: true, rule_id, mode, version, entity_id, overrides, limit, label }
//        → sandbox. Requires rule_engine/edit permission. Writes ONLY an
//          engine_rule_tests row (+ its RULE_TEST_RUN audit row). No alerts,
//          tasks, notifications, workflows, risk rows or suppression writes,
//          and no change to engine_rules.trigger_count / last_triggered_at.
//   { rule_id?, source_event_id? }
//        → real execution. Worker-authenticated (pg_cron / service role /
//          worker token). Exactly-once per
//          source_event + rule + version + entity + action index.
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
  explainConditions,
  overrideCandidate,
  renderTemplate,
} from '../_shared/ruleEngineEval.ts';

const TEST_MODES = ['current_snapshot', 'historical_replay', 'batch', 'override'] as const;
type TestMode = (typeof TEST_MODES)[number];

const isUniqueViolation = (e: Any) =>
  String(e?.code || '') === '23505' || /duplicate key value/i.test(String(e?.message || ''));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const dryRun: boolean = !!body?.dry_run;
  const ruleId: string | undefined = body?.rule_id;
  const sampleLimit: number = Math.min(Number(body?.limit || 25), 100);
  const mode: TestMode = TEST_MODES.includes(body?.mode) ? body.mode : 'current_snapshot';
  const versionReq: string | number | undefined = body?.version; // 'draft' | 'active' | number
  const entityFilter: string | null = body?.entity_id || null;
  const overrides: Record<string, unknown> = body?.overrides && typeof body.overrides === 'object' ? body.overrides : {};
  const asOf: string | null = body?.as_of || null;
  const correlationId: string = body?.correlation_id || crypto.randomUUID();
  const sourceEventId: string | null = body?.source_event_id || null;

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

  const startedAt = Date.now();
  const summary = {
    dry_run: dryRun,
    mode: dryRun ? mode : (body?.on_demand ? 'on_demand' : 'scheduled'),
    correlation_id: correlationId,
    source_event_id: sourceEventId,
    rules_evaluated: 0,
    candidates: 0,
    matched: 0,
    unmatched: 0,
    suppressed: 0,
    alerts_created: 0,
    tasks_created: 0,
    notifications_queued: 0,
    workflows_started: 0,
    risk_updates: 0,
    duplicates_skipped: 0,
    errors: [] as string[],
    results: [] as Any[],
    duration_ms: 0,
  };

  try {
    let rules: Any[] = [];
    if (dryRun && ruleId) {
      rules = [await loadRuleForTest(supa, ruleId, versionReq)];
    } else {
      let q = supa.from('engine_rules').select('*');
      if (ruleId) q = q.eq('id', ruleId);
      else q = q.eq('status', 'active');
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      rules = (data as Any[]) || [];
      if (!ruleId) rules = rules.filter((r) => isWithinEffectiveDates(r, asOf));
    }

    for (const rule of rules) {
      summary.rules_evaluated++;

      // ---------------- SANDBOX (no production writes) ----------------
      if (dryRun) {
        let candidates: Candidate[] = [];
        let evalError: string | null = null;
        try {
          candidates = mode === 'override' && Object.keys(overrides).length
            ? [overrideCandidate(rule, overrides)]
            : await evaluateRule(supa, rule);
        } catch (e) {
          evalError = (e as Error).message;
          summary.errors.push(`${rule.rule_code}: ${evalError}`);
        }

        if (entityFilter) candidates = candidates.filter((c) => c.entity_id === entityFilter);
        const cap = mode === 'batch' ? sampleLimit : Math.min(sampleLimit, 25);
        const shown = candidates.slice(0, cap);
        const matchedCount = candidates.filter((c) => c.matched).length;

        summary.candidates += candidates.length;
        summary.matched += matchedCount;
        summary.unmatched += candidates.length - matchedCount;

        const preview: Any[] = [];
        for (const cand of shown) {
          const entityKey = cand.entity_id || cand.entity_label || 'global';
          preview.push({
            entity_id: cand.entity_id,
            entity_label: cand.entity_label,
            entity_key: entityKey,
            matched: cand.matched,
            metrics: cand.metrics,
            reason: cand.reason,
            conditions: explainConditions(rule, cand.metrics || {}),
            suppression: await suppressionPreview(supa, rule, entityKey, asOf),
            would_do: cand.matched ? plannedActions(rule, cand) : [],
          });
        }

        summary.results.push({
          rule_id: rule.id,
          rule_code: rule.rule_code,
          rule_name: rule.name,
          version: rule.version,
          effective_from: rule.effective_from ?? null,
          effective_to: rule.effective_to ?? null,
          executable_as_of: isWithinEffectiveDates(rule, asOf),
          on_action_failure: rule.on_action_failure ?? 'continue',
          candidates: candidates.length,
          matched: matchedCount,
          unmatched: candidates.length - matchedCount,
          error: evalError,
          preview,
        });
        continue;
      }

      // ---------------- REAL EXECUTION ----------------
      if (!isWithinEffectiveDates(rule, asOf)) {
        summary.results.push({ rule_id: rule.id, rule_code: rule.rule_code, skipped: 'outside_effective_dates' });
        continue;
      }

      const execVersion: number = Number(rule.active_version ?? rule.version);
      let candidates: Candidate[] = [];
      try {
        candidates = await evaluateRule(supa, rule);
      } catch (e) {
        summary.errors.push(`${rule.rule_code}: ${(e as Error).message}`);
        continue;
      }

      summary.candidates += candidates.length;
      const matches = candidates.filter((c) => c.matched);
      summary.matched += matches.length;
      summary.unmatched += candidates.length - matches.length;

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

        const execStart = Date.now();
        const { data: exec, error: exErr } = await supa.from('engine_rule_executions').insert({
          rule_id: rule.id,
          version: execVersion,
          run_mode: body?.on_demand ? 'on_demand' : 'scheduled',
          entity_id: cand.entity_id,
          entity_label: cand.entity_label,
          entity_key: entityKey,
          matched: cand.matched,
          suppressed,
          metrics: cand.metrics,
          reason: cand.reason,
          actions_taken: [],
          correlation_id: correlationId,
          source_event_id: sourceEventId,
        }).select('id').single();

        if (exErr) {
          if (isUniqueViolation(exErr)) {
            summary.duplicates_skipped++;
            continue; // exactly-once: this source event already produced this execution
          }
          summary.errors.push(`exec:${rule.rule_code}:${exErr.message}`);
          continue;
        }
        const executionId = (exec as Any).id as string;

        if (!cand.matched || suppressed) {
          await supa.from('engine_rule_executions')
            .update({ duration_ms: Date.now() - execStart }).eq('id', executionId);
          continue;
        }

        const taken: Any[] = [];
        const vars = {
          metric: Object.keys(cand.metrics || {})[0] ?? '',
          entity: cand.entity_label ?? '',
          entity_name: cand.entity_label ?? '',
          value: Object.values(cand.metrics || {})[0] ?? '',
          rule_code: rule.rule_code,
          rule_name: rule.name,
        };

        const actions = ((rule.actions || []) as Any[]);
        const failurePolicy = String(rule.on_action_failure || 'continue');

        for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
          const action = actions[actionIndex];
          const idem = {
            rule_id: rule.id,
            version: execVersion,
            source_event_id: sourceEventId,
            action_index: actionIndex,
            correlation_id: correlationId,
          };
          let status = 'succeeded';
          let result: Any = {};
          let errText: string | null = null;

          try {
            switch (action.type) {
              case 'generate_alert': {
                const title = renderTemplate(action.template || rule.name, vars);
                const { data: alert, error: aErr } = await supa.from('engine_rule_alerts').insert({
                  ...idem,
                  execution_id: executionId,
                  entity_id: cand.entity_id,
                  severity: rule.severity,
                  title,
                  detail: { reason: cand.reason, metrics: cand.metrics, rule_code: rule.rule_code },
                }).select('id').single();
                if (aErr) {
                  if (isUniqueViolation(aErr)) {
                    status = 'skipped_duplicate';
                    summary.duplicates_skipped++;
                    result = { reason: 'alert already created for this source event and action' };
                    break;
                  }
                  throw new Error(aErr.message);
                }
                summary.alerts_created++;
                result = { alert_id: (alert as Any)?.id, title };
                taken.push({ type: 'generate_alert', action_index: actionIndex, alert_id: (alert as Any)?.id, title });
                await supa.rpc('notification_enqueue_event', {
                  _event_key: 'engine_rule_alert_generated',
                  _entity_type: 'engine_rule_alert',
                  _entity_id: (alert as Any)?.id ?? null,
                  _payload: { alert_title: title, rule_code: rule.rule_code, entity_name: cand.entity_label },
                  _idempotency_suffix: `${executionId}:${actionIndex}`,
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
                  _idempotency_suffix: `${executionId}:${actionIndex}`,
                });
                summary.notifications_queued++;
                result = { event_key: action.event_key };
                taken.push({ type: 'send_notification', action_index: actionIndex, event_key: action.event_key });
                break;
              }
              case 'create_task': {
                const due = action.due_in_days
                  ? new Date(Date.now() + Number(action.due_in_days) * 86400_000).toISOString().slice(0, 10)
                  : null;
                const { data: task, error: tErr } = await supa.from('engine_rule_tasks').insert({
                  ...idem,
                  execution_id: executionId,
                  entity_id: cand.entity_id,
                  title: renderTemplate(action.template || `Follow up: ${rule.name}`, vars),
                  assigned_role: action.assigned_role,
                  due_date: due,
                }).select('id').single();
                if (tErr) {
                  if (isUniqueViolation(tErr)) {
                    status = 'skipped_duplicate';
                    summary.duplicates_skipped++;
                    result = { reason: 'task already created for this source event and action' };
                    break;
                  }
                  throw new Error(tErr.message);
                }
                summary.tasks_created++;
                result = { task_id: (task as Any)?.id, due_date: due };
                taken.push({ type: 'create_task', action_index: actionIndex, task_id: (task as Any)?.id, due_date: due });
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
                  result = { band };
                  taken.push({ type: 'update_risk_status', action_index: actionIndex, band });
                } else {
                  status = 'skipped';
                  result = { reason: 'no entity to score' };
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
                  result = { instance_id: (inst as Any)?.id };
                  taken.push({ type: 'initiate_workflow', action_index: actionIndex, instance_id: (inst as Any)?.id });
                } else {
                  status = 'skipped';
                  result = { reason: 'workflow_not_published' };
                  taken.push({ type: 'initiate_workflow', action_index: actionIndex, skipped: 'workflow_not_published' });
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
                  metadata: {
                    rule_code: rule.rule_code, entity_id: cand.entity_id,
                    reason: cand.reason, metrics: cand.metrics, correlation_id: correlationId,
                  },
                });
                taken.push({ type: 'log_ewi_event', action_index: actionIndex });
                break;
              }
              default:
                status = 'skipped';
                result = { reason: 'unknown_action' };
                taken.push({ type: action.type, action_index: actionIndex, skipped: 'unknown_action' });
            }
          } catch (e) {
            status = 'failed';
            errText = (e as Error).message;
            summary.errors.push(`action:${rule.rule_code}:${action.type}:${errText}`);
            taken.push({ type: action.type, action_index: actionIndex, error: errText });
          }

          const { error: arErr } = await supa.from('engine_rule_action_results').insert({
            execution_id: executionId,
            rule_id: rule.id,
            version: execVersion,
            action_index: actionIndex,
            action_type: action.type,
            status,
            result,
            error: errText,
            correlation_id: correlationId,
          });
          if (arErr && isUniqueViolation(arErr)) summary.duplicates_skipped++;

          if (status === 'failed' && failurePolicy === 'stop') {
            summary.errors.push(`action_chain_stopped:${rule.rule_code}:index_${actionIndex}`);
            break;
          }
        }

        await supa.from('engine_rule_executions').update({
          actions_taken: taken,
          duration_ms: Date.now() - execStart,
        }).eq('id', executionId);

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

    summary.duration_ms = Date.now() - startedAt;

    if (dryRun && ruleId) {
      const first = summary.results[0];
      const passed = summary.errors.length === 0 && summary.candidates > 0;
      const { data: testId, error: tErr } = await supa.rpc('engine_rule_record_test_run', {
        _payload: {
          rule_id: ruleId,
          run_by: userId,
          run_mode: mode,
          target_version: first?.version ?? null,
          passed,
          evaluated: summary.candidates,
          matched: summary.matched,
          duration_ms: summary.duration_ms,
          correlation_id: correlationId,
          label: body?.label ?? null,
          error: summary.errors.length ? summary.errors.join('; ') : null,
          params: {
            mode, version: versionReq ?? 'current', entity_id: entityFilter,
            overrides, as_of: asOf, limit: sampleLimit,
            ...(body?.params ?? {}),
          },
          results: first ? [first] : [],
        },
      });
      if (tErr) summary.errors.push(`test_record: ${tErr.message}`);
      return json({ ok: true, passed, test_id: testId ?? null, run_by: userId, ...summary });
    }

    return json({ ok: true, ...summary });
  } catch (e) {
    summary.duration_ms = Date.now() - startedAt;
    return json({ ok: false, error: (e as Error).message, ...summary });
  }
});

function json(payload: Any) {
  return new Response(JSON.stringify(payload), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isWithinEffectiveDates(rule: Any, asOf: string | null): boolean {
  const at = asOf ? new Date(asOf) : new Date();
  if (rule.effective_from && new Date(rule.effective_from) > at) return false;
  if (rule.effective_to && new Date(`${rule.effective_to}T23:59:59Z`) < at) return false;
  return true;
}

/**
 * Resolves which version of the rule the tester should exercise:
 *   'draft' / undefined → the current editable row
 *   'active'            → the version marked active on the rule
 *   <number>            → that historical snapshot
 * Historical versions are read from the immutable engine_rule_versions store.
 */
async function loadRuleForTest(supa: Any, ruleId: string, version: string | number | undefined): Promise<Any> {
  const { data: row, error } = await supa.from('engine_rules').select('*').eq('id', ruleId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error('rule_not_found');

  let wanted: number | null = null;
  if (typeof version === 'number') wanted = version;
  else if (version === 'active') wanted = (row as Any).active_version ?? null;

  if (!wanted || wanted === (row as Any).version) return row;

  const { data: snap } = await supa.from('engine_rule_versions')
    .select('snapshot, version').eq('rule_id', ruleId).eq('version', wanted).maybeSingle();
  if (!snap) throw new Error(`version_not_found:${wanted}`);
  return { ...(row as Any), ...((snap as Any).snapshot || {}), id: ruleId, version: (snap as Any).version };
}

async function suppressionPreview(supa: Any, rule: Any, entityKey: string, asOf: string | null): Promise<Any> {
  const { data, error } = await supa.rpc('engine_rule_suppression_state', {
    _rule_id: rule.id, _entity_key: entityKey, _at: asOf || new Date().toISOString(),
  });
  if (error) return { error: error.message };
  return data;
}

function plannedActions(rule: Any, cand: Candidate): Any[] {
  const vars = {
    metric: Object.keys(cand.metrics || {})[0] ?? '',
    entity: cand.entity_label ?? '',
    value: Object.values(cand.metrics || {})[0] ?? '',
    rule_code: rule.rule_code,
    rule_name: rule.name,
  };
  return ((rule.actions || []) as Any[]).map((a, i) => {
    const base = { action_index: i, type: a.type, on_failure: rule.on_action_failure ?? 'continue' };
    switch (a.type) {
      case 'generate_alert':
        return { ...base, severity: rule.severity, alert_text: renderTemplate(a.template || rule.name, vars) };
      case 'send_notification':
        return { ...base, event_key: a.event_key, recipient_role: a.recipient_role };
      case 'create_task':
        return {
          ...base, assigned_role: a.assigned_role,
          due_date: a.due_in_days ? new Date(Date.now() + Number(a.due_in_days) * 86400_000).toISOString().slice(0, 10) : null,
          title: renderTemplate(a.template || `Follow up: ${rule.name}`, vars),
        };
      case 'update_risk_status':
        return { ...base, band: a.risk_status || rule.severity };
      case 'initiate_workflow':
        return { ...base, workflow_id: a.workflow_id, workflow_name: a.workflow_name };
      default:
        return base;
    }
  });
}
