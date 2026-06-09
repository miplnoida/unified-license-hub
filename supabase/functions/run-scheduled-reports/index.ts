// Scheduled report runner. Reuses the shared report-generator so manual + scheduled
// runs produce identical results. Resolves schedule source from explicit source or
// the report definition slug; never uses a slug as a table name.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  corsHeaders, executeQuery, persistRun, resolveScheduleSource,
} from '../_shared/report-generator.ts';

type Freq = 'daily' | 'weekly' | 'monthly' | 'quarterly';

function nextRunAt(freq: Freq, from = new Date()): Date {
  const d = new Date(from);
  if (freq === 'daily') d.setDate(d.getDate() + 1);
  else if (freq === 'weekly') d.setDate(d.getDate() + 7);
  else if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (freq === 'quarterly') d.setMonth(d.getMonth() + 3);
  d.setHours(7, 0, 0, 0);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let scheduleId: string | null = null;
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    scheduleId = body?.scheduleId || null;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  const nowIso = new Date().toISOString();
  let q = admin.from('report_schedules').select('*').eq('is_active', true);
  if (scheduleId) q = q.eq('id', scheduleId);
  else q = q.lte('next_run_at', nowIso);

  const { data: schedules, error: schedErr } = await q;
  if (schedErr) {
    return new Response(JSON.stringify({ ok: false, error: schedErr.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results: any[] = [];
  for (const s of schedules || []) {
    const freq = (s.schedule_type as Freq) || 'weekly';
    await admin.from('report_logs').insert({
      schedule_id: s.id,
      action: 'schedule_run_started',
      report_name: s.report_name,
      executed_by: s.created_by,
    });

    try {
      const source = resolveScheduleSource(s);
      if (!source) {
        throw new Error(`Cannot resolve source for schedule (slug=${s.report_slug || 'none'}, source=${s.source || 'none'})`);
      }

      const result = await executeQuery(admin, {
        source,
        filters: s.filters_json || {},
        reportSlug: s.report_slug || undefined,
        selectedColumns: s.selected_columns || [],
        groupBy: s.group_by || undefined,
        sortBy: s.sort_by || undefined,
        sortDir: (s.sort_dir as 'asc' | 'desc') || 'asc',
      });

      const { run } = await persistRun(admin, {
        userId: s.created_by,
        reportSlug: s.report_slug || undefined,
        reportName: s.report_name || s.report_slug || 'Scheduled Report',
        category: 'Scheduled',
        source,
        filters: s.filters_json || {},
        selectedColumns: s.selected_columns || [],
        groupBy: s.group_by || undefined,
        sortBy: s.sort_by || undefined,
        sortDir: (s.sort_dir as 'asc' | 'desc') || 'asc',
        result,
        scheduleId: s.id,
      });

      // Best-effort email
      let lastStatus = 'completed';
      try {
        if ((s.recipients || []).length > 0) {
          const notif = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': serviceKey,
              'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              to: s.recipients,
              subject: `Scheduled Report: ${s.report_name || s.report_slug}`,
              body: `Your scheduled report has ${result.rows.length} records. Sign in to view.`,
            }),
          });
          if (!notif.ok) lastStatus = 'generated_email_pending';
        }
      } catch {
        lastStatus = 'generated_email_pending';
      }

      const next = nextRunAt(freq).toISOString();
      await admin.from('report_schedules').update({
        last_run_at: nowIso,
        next_run_at: next,
        last_status: lastStatus,
        last_error: null,
        retry_count: 0,
      }).eq('id', s.id);

      results.push({ id: s.id, status: lastStatus, rows: result.rows.length, runId: run?.id });
    } catch (e: any) {
      const errMsg = String(e?.message || e);
      await admin.from('report_schedules').update({
        last_run_at: nowIso,
        last_status: 'failed',
        last_error: errMsg,
        retry_count: (s.retry_count || 0) + 1,
      }).eq('id', s.id);
      await admin.from('report_logs').insert({
        schedule_id: s.id,
        action: 'schedule_run_failed',
        report_name: s.report_name,
        executed_by: s.created_by,
        error_message: errMsg,
      });
      results.push({ id: s.id, status: 'failed', error: errMsg });
    }
  }

  return new Response(JSON.stringify({ ok: true, ran: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
