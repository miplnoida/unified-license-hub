import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const summary = { scanned: 0, marked_overdue: 0, alerts_created: 0 };

  // 1. Mark overdue on conduct_actions (the trigger conduct_action_overdue_alert also fires)
  const { data: overdue, error } = await supa.from('conduct_actions')
    .select('id, title, due_date, status, source_module, source_id, entity_id')
    .lt('due_date', new Date().toISOString())
    .in('status', ['open', 'in_progress']);
  if (error) return json({ ok: false, error: error.message }, 500);

  summary.scanned = (overdue || []).length;
  for (const a of overdue || []) {
    const { error: uErr } = await supa.from('conduct_actions').update({ status: 'overdue' }).eq('id', a.id);
    if (uErr) continue;
    summary.marked_overdue++;
    // Alert idempotent
    const dedupeKey = `action_overdue:${a.id}`;
    const { data: existing } = await supa.from('conduct_alerts').select('id').eq('dedupe_key', dedupeKey).maybeSingle();
    if (!existing) {
      const { data: al } = await supa.from('conduct_alerts').insert({
        dedupe_key: dedupeKey,
        kind: 'action_overdue',
        source: 'overdue-action-sweep',
        generated_by: 'system',
        severity: 'medium',
        title: `Overdue action: ${a.title}`,
        detail: { conduct_action_id: a.id, source_module: a.source_module, source_id: a.source_id },
        status: 'open',
        licensee_id: a.entity_id ?? null,
      }).select('id').maybeSingle();
      if (al?.id) summary.alerts_created++;
    }
  }

  // 2. Mirror overdue for thematic review actions (they cascade to conduct_actions via trigger)
  await supa.from('thematic_review_actions')
    .update({ status: 'overdue' })
    .lt('due_date', new Date().toISOString())
    .in('status', ['open', 'in_progress']);

  return json({ ok: true, ...summary });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
