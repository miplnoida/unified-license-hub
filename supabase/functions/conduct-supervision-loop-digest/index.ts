// Weekly unresolved-risk digest for the Supervision Loop dashboard (MCS-MON-002).
//
// Aggregates the same unresolved supervisory risks shown on
// /conduct/supervision-loop and dispatches one notification event carrying the
// summary, so conduct supervisors are prompted even if nobody opens the board.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireWorkerInvocationAsync } from '../_shared/workerAuth.ts';

// deno-lint-ignore no-explicit-any
type Any = any;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const gate = await requireWorkerInvocationAsync(req, 'conduct-supervision-loop-digest');
  if (!gate.ok) return gate.response;

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data, error } = await supa.rpc('conduct_supervision_unresolved_risks', {
      _entity_id: null,
      _sector_id: null,
    });
    if (error) throw new Error(error.message);

    const risks = (data as Any[]) ?? [];
    if (risks.length === 0) {
      return json({ ok: true, risks: 0, dispatched: false });
    }

    const bySeverity: Record<string, number> = {};
    for (const r of risks) {
      const s = String(r.severity ?? 'unknown');
      bySeverity[s] = (bySeverity[s] ?? 0) + 1;
    }

    const top = risks.slice(0, 15).map((r) => ({
      entity: r.entity,
      severity: r.severity,
      reason: r.reason,
      link: r.target_href,
    }));

    let dispatched = false;
    try {
      await supa.functions.invoke('dispatch-notification-event', {
        body: {
          event_key: 'conduct_supervision_unresolved_risk_digest',
          entity_type: 'conduct_supervision_loop',
          entity_id: null,
          payload: {
            total: risks.length,
            by_severity: bySeverity,
            items: top,
            dashboard_url: '/conduct/supervision-loop',
            generated_at: new Date().toISOString(),
          },
        },
      });
      dispatched = true;
    } catch (_e) {
      // Delivery failures are handled by the notification pipeline's own retries.
    }

    return json({ ok: true, risks: risks.length, by_severity: bySeverity, dispatched });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
