// Scheduled prudential monitoring sweep (canonical — PRU-CANON-001).
//
// Iterates supervised licensees, selects each entity's latest eligible canonical
// filing version (`return_filings` -> `return_filing_versions` ordered by the
// reporting period), and runs the canonical detector
// `_prudential_canonical_detect_run(version_id, trigger_kind, actor)`, which
// owns metric evaluation, threshold warnings/breaches and EWI signals.
//
// No legacy Returns truth (`returns_filed`) and no legacy `prudential_ewi_evaluate`
// call participate in this path; those remain only for historical compatibility
// elsewhere.
//
// Idempotent: the detector dedupes on its natural keys and records one
// `prudential_detection_runs` row per version evaluated. Writes one
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
import { requireWorkerOrPrudentialUser } from "../_shared/prudentialSweepAuth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });


  const __workerGate = await requireWorkerOrPrudentialUser(req, "prudential-monitoring-sweep");
  if (!__workerGate.ok) return __workerGate.response!;
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);

  // Optional auth: cron POSTs with just the anon key; a UI-triggered call
  // carries a real user token. We resolve actor id when possible for audit.
  let actorId: string | null = __workerGate.actorId;
  const auth = req.headers.get("authorization");
  if (auth) {
    try {
      const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
      const { data } = await userClient.auth.getUser();
      actorId = data?.user?.id ?? actorId;
    } catch { /* ignore */ }
  }

  // Read trigger up-front so we can log it and short-circuit dupes.
  const preBody = await req.clone().json().catch(() => ({} as any));
  const trigger: 'scheduled' | 'manual' = preBody?.trigger === 'scheduled' ? 'scheduled' : 'manual';

  // Duplicate-run guard: skip if another run started in the last 15 min and is still marked started
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: running } = await admin
    .from('prudential_data_feed_logs')
    .select('id')
    .eq('source', 'prudential-monitoring-sweep')
    .eq('status', 'started')
    .gt('started_at', fifteenMinAgo)
    .limit(1)
    .maybeSingle();
  if (running) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'already_running' }), {
      headers: { ...cors, 'Content-Type': 'application/json' }, status: 200,
    });
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
      metadata: { trigger },
    })
    .select()
    .single();
  const logId: string | null = (logRow as any)?.id ?? null;


  const summary = {
    entities_scanned: 0,
    // Canonical terminology: one canonical filing version evaluated per entity.
    canonical_versions_evaluated: 0,
    // Retained for existing dashboard readers (same count as above).
    returns_evaluated: 0,
    detection_runs: [] as string[],
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
      try {
        // Latest eligible canonical filing version for this entity. Eligibility
        // follows the canonical detector's own rule set (ACCEPTED, SUBMITTED,
        // UNDER_REVIEW); ordering is by reporting period, then version.
        const { data: versions, error: vErr } = await admin
          .from("return_filing_versions")
          .select(
            "id, version_number, status, created_at, return_filings!inner(id, entity_id, reporting_periods(period_end))",
          )
          .eq("return_filings.entity_id", l.id)
          .in("status", ["ACCEPTED", "SUBMITTED", "UNDER_REVIEW"])
          .limit(200);
        if (vErr) throw vErr;

        const rows = ((versions as any[]) ?? []).map((v) => ({
          id: v.id as string,
          version_number: v.version_number as number,
          period_end: v.return_filings?.reporting_periods?.period_end ?? null,
          created_at: v.created_at as string,
        }));
        rows.sort((a, b) => {
          const pa = a.period_end ?? "";
          const pb = b.period_end ?? "";
          if (pa !== pb) return pa < pb ? 1 : -1;
          if (a.version_number !== b.version_number) return b.version_number - a.version_number;
          return a.created_at < b.created_at ? 1 : -1;
        });
        const latest = rows[0];
        if (!latest) continue;

        const { data: run, error: detErr } = await admin.rpc("_prudential_canonical_detect_run", {
          _return_filing_version_id: latest.id,
          _trigger_kind: trigger === "scheduled" ? "scheduled_sweep" : "manual_sweep",
          _actor: actorId,
        });
        if (detErr) throw detErr;

        summary.canonical_versions_evaluated += 1;
        summary.returns_evaluated += 1;
        const runId = (run as any)?.detection_run_id ?? (run as any)?.run_id ?? null;
        if (runId) summary.detection_runs.push(runId);
        touchedEntities.add(l.id);
      } catch (e) {
        summary.failed += 1;
        summary.errors.push({ entity_id: l.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Recompute composite risk scores for entities whose filings we evaluated.
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
          metadata: { trigger, ...summary },
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
          metadata: { trigger, ...summary },
        })
        .eq("id", logId);
    }
    return new Response(JSON.stringify({ ok: false, error: message, ...summary }), {
      headers: { ...cors, "Content-Type": "application/json" }, status: 200,
    });
  }
});
