import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { logIntegration } from '../_shared/integration-log.ts';

// deno-lint-ignore no-explicit-any
type Any = any;

const DEFAULT_RECHECK_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const started = Date.now();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supa = createClient(supabaseUrl, serviceKey);

  const summary = { scanned: 0, rescreened: 0, alerts: 0, errors: 0 };

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
            event_type: `screening.${f.check_type}`,
            severity: f.severity,
            summary: `[${f.check_type}] ${f.title || f.summary}`.slice(0, 500),
            detail: { finding_id: f.id, run_id: invokeJson.run_id },
          }));
          const { error: eErr } = await supa.from('fp_monitoring_events').insert(events);
          if (!eErr) summary.alerts += escalations.length;
        }
      } catch (inner) {
        summary.errors++;
        console.error('[fp-monitoring-sweep] individual error', det.individual_id, inner);
      }
    }

    await logIntegration(supa as Any, {
      direction: 'outbound',
      integrationKey: 'fp-monitoring-sweep',
      status: 'success',
      requestSummary: `Recheck window ${recheckDays}d — scanned ${summary.scanned}`,
      responseSummary: `Rescreened ${summary.rescreened}, alerts ${summary.alerts}, errors ${summary.errors}`,
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
