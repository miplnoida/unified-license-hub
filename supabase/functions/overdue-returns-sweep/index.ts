// Overdue-return notification sweep.
// Finds returns_filed rows whose due date has passed and are still in
// draft/pending state, and dispatches a `return.overdue` notification.
// Intended to be called on a schedule (e.g. daily via pg_cron + pg_net).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const __workerGate = requireWorkerInvocation(req);
  if (!__workerGate.ok) return __workerGate.response;
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service);

    const nowIso = new Date().toISOString().slice(0, 10);
    const { data: overdue = [], error } = await admin
      .from("returns_filed")
      .select("id, unique_id, entity_id, on_behalf_of_licensee_id, sector_id, subsector_id, return_configuration_id, due_date, period_end_date, workflow_status")
      .lte("due_date", nowIso)
      .in("workflow_status", ["TEMP", "WIP", "TBR"]);
    if (error) throw error;

    let dispatched = 0;
    for (const r of (overdue as any[])) {
      const licenseeId = r.on_behalf_of_licensee_id || r.entity_id;
      try {
        await admin.functions.invoke("dispatch-notification-event", {
          body: {
            event_key: "return.overdue",
            entity_type: "return",
            entity_id: r.id,
            reminder_window: nowIso, // daily dedupe window
            payload: {
              return_id: r.id,
              unique_id: r.unique_id,
              due_date: r.due_date,
              licensee_id: licenseeId,
              entity_id: r.entity_id,
              sector_id: r.sector_id,
              subsector_id: r.subsector_id,
              period_end: r.period_end_date,
              cta_url: `/returns/${r.id}`,
              cta_label: "Open return",
            },
          },
        });
        dispatched++;
      } catch (_) { /* best effort */ }
    }


    return new Response(JSON.stringify({ ok: true, scanned: overdue.length, dispatched }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
