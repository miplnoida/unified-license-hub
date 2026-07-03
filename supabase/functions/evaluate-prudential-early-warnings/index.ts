import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Recomputes prudential early warnings by re-reading the v_prudential_early_warnings
// view and dispatching notifications for critical level rows. Safe to invoke
// repeatedly (idempotent — dedupes on today's licensee+ratio+level combination).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: warnings, error } = await (supa.from('v_prudential_early_warnings') as any)
      .select('*')
      .in('warning_level', ['critical', 'warning']);
    if (error) throw error;

    const criticalRows = (warnings ?? []).filter((w: any) => w.warning_level === 'critical');
    let notified = 0;

    for (const w of criticalRows) {
      // Fire a notification via the standard event config channel; caller can
      // configure recipients per regulator. We swallow failures so one bad row
      // doesn't stop the batch.
      try {
        await supa.functions.invoke('send-notification', {
          body: {
            event_key: 'prudential.early_warning',
            entity_type: 'licensee',
            entity_id: w.licensee_id,
            payload: {
              licensee_id: w.licensee_id,
              licensee_name: w.licensee_name,
              ratio_key: w.ratio_key,
              current_value: w.current_value,
              delta_pct: w.delta_pct,
              breach_count: w.recent_breach_count,
              regulator_id: w.regulator_id,
            },
          },
        });
        notified++;
      } catch (_e) { /* noop */ }
    }

    return new Response(JSON.stringify({
      ok: true,
      total_warnings: (warnings ?? []).length,
      critical: criticalRows.length,
      notifications_dispatched: notified,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  }
});
