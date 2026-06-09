// Scheduled report runner. Picks active schedules that are due, runs them,
// updates next_run_at / last_status, and logs the result.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

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

  // Optional single-schedule manual trigger
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
    });
    try {
      // Inline minimal generator (read source, basic filters, persist run+rows)
      const source: string = s.source || s.report_slug || '';
      const filters = s.filters_json || {};
      const table = source === 'users' ? 'profiles' : source;
      const { data: rows, error: qErr } = await admin
        .from(table).select('*').limit(10000);
      if (qErr) throw qErr;

      const safeRows = (rows || []).map((r: any) => {
        const o: any = {};
        for (const k of Object.keys(r || {})) {
          if (['password', 'password_hash', 'token', 'secret'].includes(k.toLowerCase())) continue;
          o[k] = r[k];
        }
        return o;
      });

      const ins = await admin.from('reports').insert({
        name: s.report_name || s.report_slug || 'Scheduled Report',
        category: 'Scheduled',
        report_type: 'predefined',
        query_config: { source, filters, scheduled: true },
        filters_json: filters,
        source,
        report_slug: s.report_slug || null,
        selected_columns: s.selected_columns || [],
        group_by: s.group_by,
        sort_by: s.sort_by,
        result_summary: { total: safeRows.length },
        result_count: safeRows.length,
        status: 'ready',
        created_by: s.created_by,
        generated_at: nowIso,
        started_at: nowIso,
        completed_at: new Date().toISOString(),
      }).select('*').single();
      if (ins.error) throw ins.error;

      // Persist rows
      for (let i = 0; i < safeRows.length; i += 1000) {
        const slice = safeRows.slice(i, i + 1000).map((r: any, idx: number) => ({
          report_run_id: ins.data.id,
          row_index: i + idx,
          row_data: r,
        }));
        await admin.from('report_run_rows').insert(slice);
      }

      // Email delivery: best-effort via existing send-notification edge function.
      // If unavailable, mark generated_email_pending so UI signals manual handoff.
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
              body: `Your scheduled report has ${safeRows.length} records. Sign in to view.`,
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

      await admin.from('report_logs').insert({
        schedule_id: s.id,
        report_id: ins.data.id,
        action: 'schedule_run_completed',
        report_name: s.report_name,
        record_count: safeRows.length,
        metadata: { last_status: lastStatus },
      });

      results.push({ id: s.id, status: lastStatus, rows: safeRows.length });
    } catch (e: any) {
      await admin.from('report_schedules').update({
        last_run_at: nowIso,
        last_status: 'failed',
        last_error: String(e?.message || e),
        retry_count: (s.retry_count || 0) + 1,
      }).eq('id', s.id);
      await admin.from('report_logs').insert({
        schedule_id: s.id,
        action: 'schedule_run_failed',
        report_name: s.report_name,
        error_message: String(e?.message || e),
      });
      results.push({ id: s.id, status: 'failed', error: String(e?.message || e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, ran: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
