import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireWorkerOrPrudentialUser } from "../_shared/prudentialSweepAuth.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const __workerGate = await requireWorkerOrPrudentialUser(req, 'overdue-action-sweep');
  if (!__workerGate.ok) return __workerGate.response!;
  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const trigger: 'scheduled' | 'manual' = body?.trigger === 'scheduled' ? 'scheduled' : 'manual';

  // Resolve actor for audit
  let actorId: string | null = __workerGate.actorId;
  const auth = req.headers.get('authorization');
  if (auth) {
    try {
      const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
      const userClient = createClient(Deno.env.get('SUPABASE_URL')!, anon, { global: { headers: { Authorization: auth } } });
      const { data } = await userClient.auth.getClaims(auth.replace(/^Bearer\s+/i, '').trim());
      actorId = (data?.claims?.sub as string | undefined) ?? actorId;
    } catch { /* ignore */ }
  }

  // Duplicate-run guard: skip if another run started in the last 15 min and is still marked started
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: running } = await supa
    .from('prudential_data_feed_logs')
    .select('id, started_at')
    .eq('source', 'overdue-action-sweep')
    .eq('status', 'started')
    .gt('started_at', fifteenMinAgo)
    .limit(1)
    .maybeSingle();
  if (running) {
    return json({ ok: true, skipped: true, reason: 'already_running' });
  }

  // Start feed log
  const startedAt = new Date().toISOString();
  const { data: logRow } = await supa.from('prudential_data_feed_logs').insert({
    source: 'overdue-action-sweep',
    feed_type: 'overdue_action_sweep',
    status: 'started',
    started_at: startedAt,
    triggered_by: actorId,
    metadata: { trigger },
  }).select().single();
  const logId: string | null = (logRow as any)?.id ?? null;

  const summary = { scanned: 0, marked_overdue: 0, alerts_created: 0 };

  try {
    // 1. Mark overdue on conduct_actions
    const { data: overdue, error } = await supa.from('conduct_actions')
      .select('id, title, due_date, status, source_module, source_id, entity_id')
      .lt('due_date', new Date().toISOString())
      .in('status', ['open', 'in_progress']);
    if (error) throw error;

    summary.scanned = (overdue || []).length;
    for (const a of overdue || []) {
      const { error: uErr } = await supa.from('conduct_actions').update({ status: 'overdue' }).eq('id', a.id);
      if (uErr) throw uErr;
      summary.marked_overdue++;
      // The database trigger atomically creates/deduplicates the overdue alert.
      // Do not insert a second alert using a different dedupe-key format here.
    }

    // 2. Mirror overdue for thematic review actions
    await supa.from('thematic_review_actions')
      .update({ status: 'overdue' })
      .lt('due_date', new Date().toISOString())
      .in('status', ['open', 'in_progress']);

    if (logId) {
      await supa.from('prudential_data_feed_logs').update({
        status: 'success',
        row_count: summary.marked_overdue,
        completed_at: new Date().toISOString(),
        metadata: { trigger, ...summary },
      }).eq('id', logId);
    }

    return json({ ok: true, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (logId) {
      await supa.from('prudential_data_feed_logs').update({
        status: 'failed', error: message,
        completed_at: new Date().toISOString(),
        metadata: { trigger, ...summary },
      }).eq('id', logId);
    }
    return json({ ok: false, error: message, ...summary });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
