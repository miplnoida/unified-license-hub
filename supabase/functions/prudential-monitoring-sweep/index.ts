// Scheduled prudential monitoring sweep.
//
// Iterates supervised licensees, finds each entity's latest submitted return,
// and re-runs the same evaluation chain used at submission — server-side
// prudential validation, ratio recompute, breach detection, stress indicator
// evaluation, and risk-score recompute — for ongoing supervision.
//
// Idempotent: `record_return_ratio`, `record_return_breach`, and the stress
// RPC all upsert / dedupe on their natural keys. Writes one
// `prudential_data_feed_logs` row (`feed_type = 'scheduled_sweep'`) per run.
//
// Invocation:
//   - pg_cron POST from an installed cron job (daily), or
//   - "Run sweep now" button on /prudential/dashboard (authenticated).
//
// Failures per-entity never abort the whole batch; they are counted and the
// final log row records `status = 'success'` with a `failed` count in metadata,
// or `status = 'failed'` if the whole run crashes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);

  // Optional auth: cron POSTs with just the anon key; a UI-triggered call
  // carries a real user token. We resolve actor id when possible for audit.
  let actorId: string | null = null;
  const auth = req.headers.get("authorization");
  if (auth) {
    try {
      const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
      const { data } = await userClient.auth.getUser();
      actorId = data?.user?.id ?? null;
    } catch { /* ignore */ }
  }

  // Insert the "started" feed log row up front, then patch it at end with the outcome.
  const startedAt = new Date().toISOString();
  const { data: logRow } = await admin
    .from("prudential_data_feed_logs")
    .insert({
      source: "prudential-monitoring-sweep",
      feed_type: "scheduled_sweep",
      status: "started",
      started_at: startedAt,
      triggered_by: actorId,
    })
    .select()
    .single();
  const logId: string | null = (logRow as any)?.id ?? null;

  const summary = {
    entities_scanned: 0,
    returns_evaluated: 0,
    failed: 0,
    errors: [] as Array<{ entity_id: string; error: string }>,
  };

  try {
    const body = await req.json().catch(() => ({} as any));
    const entityIdFilter: string | undefined = body?.entity_id;

    // Load supervised entities (all active licensees). Restrict to a single
    // entity when the caller passes `entity_id` — used by "Run sweep now"
    // for a single tenant on the dashboard.
    let q = admin.from("licensees").select("id, sector_id").limit(2000);
    if (entityIdFilter) q = q.eq("id", entityIdFilter);
    const { data: licensees, error: licErr } = await q;
    if (licErr) throw licErr;

    const touchedEntities = new Set<string>();

    for (const l of (licensees as any[]) ?? []) {
      summary.entities_scanned += 1;
      // Latest submitted/approved return per entity.
      const { data: latest } = await admin
        .from("returns_filed")
        .select("id, workflow_status, status, submit_date, period_end_date")
        .eq("entity_id", l.id)
        .in("workflow_status", ["VAL", "SUBMITTED", "APPROVED", "REVIEWED"])
        .order("submit_date", { ascending: false, nullsFirst: false })
        .order("period_end_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const latestReturn = latest as any;
      if (!latestReturn?.id) continue;

      try {
        // Delegate to the authoritative single-return evaluator so ratios,
        // breaches, stress events, and downstream escalations run identically
        // to the submission-time chain.
        const invokeHeaders: Record<string, string> = {};
        if (auth) invokeHeaders["Authorization"] = auth;
        await admin.functions.invoke("evaluate-return-prudential", {
          body: {
            return_id: latestReturn.id,
            dispatch_notifications: true,
            context: "scheduled_sweep",
          },
          headers: invokeHeaders,
        });
        summary.returns_evaluated += 1;
        touchedEntities.add(l.id);
      } catch (e) {
        summary.failed += 1;
        summary.errors.push({ entity_id: l.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Recompute composite risk scores for entities whose returns we touched.
    for (const entityId of touchedEntities) {
      try {
        await admin.functions.invoke("risk-score-recompute", { body: { entity_id: entityId } });
      } catch { /* best effort */ }
    }

    if (logId) {
      await admin
        .from("prudential_data_feed_logs")
        .update({
          status: "success",
          row_count: summary.returns_evaluated,
          completed_at: new Date().toISOString(),
          metadata: summary,
        })
        .eq("id", logId);
    }

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...cors, "Content-Type": "application/json" }, status: 200,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (logId) {
      await admin
        .from("prudential_data_feed_logs")
        .update({
          status: "failed", error: message,
          completed_at: new Date().toISOString(),
          metadata: summary,
        })
        .eq("id", logId);
    }
    return new Response(JSON.stringify({ ok: false, error: message, ...summary }), {
      headers: { ...cors, "Content-Type": "application/json" }, status: 200,
    });
  }
});
