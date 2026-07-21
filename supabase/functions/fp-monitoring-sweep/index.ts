import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { logIntegration } from '../_shared/integration-log.ts';
import { requireUserPermission } from "../_shared/authz.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

const DEFAULT_RECHECK_DAYS = 30;
const REMINDER_LOOKAHEAD_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const __authzGate = await requireUserPermission(req, "fit_and_proper", "execute");
  if (!__authzGate.ok) return __authzGate.response;
  const started = Date.now();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supa = createClient(supabaseUrl, serviceKey);

  async function dispatchNotification(event_key: string, entity_type: string, entity_id: string, payload: Any) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/dispatch-notification-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        body: JSON.stringify({ event_key, entity_type, entity_id, payload }),
      });
    } catch (e) { console.warn('[fp-monitoring-sweep] notify failed', event_key, e); }
  }

  const summary = { scanned: 0, rescreened: 0, alerts: 0, reminders: 0, errors: 0 };

  try {
    let recheckDays = DEFAULT_RECHECK_DAYS;
    const { data: rt } = await supa.from('report_runtime_config').select('value').eq('key', 'fp_monitoring_recheck_days').maybeSingle();
    if (rt?.value != null) {
      const n = Number((rt.value as Any)?.days ?? rt.value);
      if (Number.isFinite(n) && n > 0) recheckDays = n;
    }
    const cutoff = new Date(Date.now() - recheckDays * 86400 * 1000).toISOString();

    // Individuals with a current APPROVED or CONDITIONAL determination
    const { data: dets, error: dErr } = await supa.from('fp_determinations')
      .select('id, individual_id, assessment_id, outcome, determined_at')
      .eq('is_current', true)
      .in('outcome', ['approved', 'conditional']);
    if (dErr) throw new Error(dErr.message);

    for (const det of dets ?? []) {
      summary.scanned++;
      try {
        // Latest screening run for this individual
        const { data: lastRun } = await supa.from('fp_screening_runs')
          .select('id, completed_at, run_type')
          .eq('individual_id', det.individual_id)
          .order('completed_at', { ascending: false, nullsFirst: false })
          .limit(1).maybeSingle();

        if (lastRun?.completed_at && lastRun.completed_at > cutoff) continue; // not due yet

        // Trigger a new screening run against the assessment tied to the current determination
        const invokeRes = await fetch(`${supabaseUrl}/functions/v1/fp-screening-run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
          body: JSON.stringify({ assessment_id: det.assessment_id, run_type: 'monitoring' }),
        });
        const invokeJson = await invokeRes.json().catch(() => ({}));
        if (!invokeJson?.ok || !invokeJson.run_id) {
          summary.errors++;
          continue;
        }
        summary.rescreened++;

        // Pull findings from the new run and raise monitoring events for medium/high
        const { data: newFindings } = await supa.from('fp_findings')
          .select('id, severity, title, summary, check_type, config_id')
          .eq('run_id', invokeJson.run_id);

        const escalations = (newFindings ?? []).filter((f: Any) => f.severity === 'high' || f.severity === 'medium');
        if (escalations.length) {
          const events = escalations.map((f: Any) => ({
            individual_id: det.individual_id,
            determination_id: det.id,
            // event_type must be one of the allowed CHECK values; use recheck_hit for any hit.
            event_type: 'recheck_hit',
            severity: f.severity,
            summary: `[${f.check_type}] ${f.title || f.summary}`.slice(0, 500),
            detail: { finding_id: f.id, run_id: invokeJson.run_id, check_type: f.check_type },
          }));
          const { error: eErr, data: inserted } = await supa.from('fp_monitoring_events').insert(events).select('id');
          if (!eErr) {
            summary.alerts += escalations.length;
            for (const ev of inserted ?? []) {
              await dispatchNotification('fp_monitoring_alert', 'fp_monitoring_event', ev.id, {
                individual_id: det.individual_id, determination_id: det.id, severity: 'high',
              });
            }
          }
        } else {
          // Log a clean recheck outcome (informational; single event per sweep)
          await supa.from('fp_monitoring_events').insert({
            individual_id: det.individual_id,
            determination_id: det.id,
            event_type: 'recheck_ok',
            severity: 'low',
            summary: 'Recheck completed with no adverse findings',
            detail: { run_id: invokeJson.run_id },
          });
        }
      } catch (inner) {
        summary.errors++;
        console.error('[fp-monitoring-sweep] individual error', det.individual_id, inner);
      }
    }

    // Sweep overdue conditions → condition_overdue events (dedupe by finding existing unacknowledged event per condition)
    const today = new Date().toISOString().slice(0, 10);
    const { data: overdueConds } = await supa.from('fp_conditions')
      .select('id, individual_id, determination_id, category, description, due_date, overdue_at, status, monitoring_owner')
      .eq('status', 'open')
      .lt('due_date', today);

    for (const c of overdueConds ?? []) {
      try {
        // Stamp overdue_at if the lifecycle trigger hasn't yet
        if (!c.overdue_at) {
          await supa.from('fp_conditions').update({ overdue_at: new Date().toISOString() }).eq('id', c.id);
        }
        const { data: existing } = await supa.from('fp_monitoring_events')
          .select('id, acknowledged_at')
          .eq('individual_id', c.individual_id)
          .eq('event_type', 'condition_overdue')
          .contains('detail', { condition_id: c.id })
          .is('acknowledged_at', null)
          .limit(1).maybeSingle();
        if (existing) continue;
        const daysOverdue = Math.max(1, Math.floor((Date.now() - new Date(c.due_date).getTime()) / 86400000));
        const severity = daysOverdue > 30 ? 'high' : daysOverdue > 7 ? 'medium' : 'low';
        const { data: mIns, error: mErr } = await supa.from('fp_monitoring_events').insert({
          individual_id: c.individual_id,
          determination_id: c.determination_id,
          event_type: 'condition_overdue',
          severity,
          summary: `Condition overdue by ${daysOverdue} day(s): ${(c.description || c.category).slice(0, 200)}`,
          detail: { condition_id: c.id, due_date: c.due_date, days_overdue: daysOverdue },
        }).select('id').single();
        if (!mErr) {
          summary.alerts++;
          await dispatchNotification('fp_condition_overdue', 'fp_condition', c.id, {
            individual_id: c.individual_id, days_overdue: daysOverdue, severity, monitoring_owner: c.monitoring_owner ?? null,
          });
        }
      } catch (inner) {
        summary.errors++;
        console.error('[fp-monitoring-sweep] condition error', c.id, inner);
      }
    }

    // Reminder sweep for conditions due within N days that haven't been reminded yet.
    const lookahead = new Date(Date.now() + REMINDER_LOOKAHEAD_DAYS * 86400 * 1000).toISOString().slice(0, 10);
    const { data: soonConds } = await supa.from('fp_conditions')
      .select('id, individual_id, determination_id, description, due_date, reminder_sent_at, status, monitoring_owner')
      .eq('status', 'open')
      .gte('due_date', today)
      .lte('due_date', lookahead)
      .is('reminder_sent_at', null);

    for (const c of soonConds ?? []) {
      try {
        await supa.from('fp_monitoring_events').insert({
          individual_id: c.individual_id,
          determination_id: c.determination_id,
          event_type: 'condition_due',
          severity: 'low',
          summary: `Condition due on ${c.due_date}: ${(c.description || '').slice(0, 200)}`,
          detail: { condition_id: c.id, due_date: c.due_date, reminder: true },
        });
        await supa.from('fp_conditions').update({ reminder_sent_at: new Date().toISOString() }).eq('id', c.id);
        await dispatchNotification('fp_condition_reminder', 'fp_condition', c.id, {
          individual_id: c.individual_id, due_date: c.due_date, monitoring_owner: c.monitoring_owner ?? null,
        });
        summary.reminders++;
      } catch (inner) {
        summary.errors++;
        console.error('[fp-monitoring-sweep] reminder error', c.id, inner);
      }
    }

    await logIntegration(supa as Any, {
      direction: 'outbound',
      integrationKey: 'fp-monitoring-sweep',
      status: 'success',
      requestSummary: `Recheck window ${recheckDays}d — scanned ${summary.scanned}`,
      responseSummary: `Rescreened ${summary.rescreened}, alerts ${summary.alerts}, reminders ${summary.reminders}, errors ${summary.errors}`,
      durationMs: Date.now() - started,
    });

    return new Response(JSON.stringify({ ok: true, ...summary, recheck_days: recheckDays }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[fp-monitoring-sweep]', msg);
    await logIntegration(supa as Any, {
      direction: 'outbound',
      integrationKey: 'fp-monitoring-sweep',
      status: 'failure',
      error: msg,
      durationMs: Date.now() - started,
    });
    return new Response(JSON.stringify({ ok: false, error: msg, ...summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
