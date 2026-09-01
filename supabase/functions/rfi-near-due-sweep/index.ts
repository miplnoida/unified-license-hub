// RFI Near-Due & Overdue Sweep
// -------------------------------------------------------------------
// Scans open `application_rfis` and dispatches two idempotent
// notifications:
//   - application.rfi_near_due  → due within 48h and not yet notified
//   - application.rfi_overdue   → due_at < now and not yet notified
//
// Idempotency: `near_due_notified_at` / `overdue_notified_at` columns
// on `application_rfis`. Intended to be invoked hourly by pg_cron.
// Returns HTTP 200 with a summary body per project convention.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Rfi = {
  id: string;
  application_id: string;
  due_at: string | null;
  near_due_notified_at: string | null;
  overdue_notified_at: string | null;
  summary: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const __workerGate = requireWorkerInvocation(req);
  if (!__workerGate.ok) return __workerGate.response;

  const startedAt = Date.now();
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const soonWindowMs = 48 * 60 * 60 * 1000; // 48h
  const soonCutoff = new Date(now.getTime() + soonWindowMs).toISOString();
  const nowIso = now.toISOString();

  try {
    const { data: openRfis, error } = await admin
      .from("application_rfis")
      .select("id, application_id, due_at, near_due_notified_at, overdue_notified_at, summary")
      .eq("status", "open")
      .not("due_at", "is", null);

    if (error) throw error;

    let nearDue = 0;
    let overdue = 0;

    for (const rfi of (openRfis ?? []) as Rfi[]) {
      if (!rfi.due_at) continue;
      const dueMs = new Date(rfi.due_at).getTime();

      // Overdue takes precedence
      if (dueMs < now.getTime()) {
        if (rfi.overdue_notified_at) continue;
        await admin.functions.invoke("dispatch-notification-event", {
          body: {
            event_key: "application.rfi_overdue",
            entity_type: "applications",
            entity_id: rfi.application_id,
            payload: {
              rfi_id: rfi.id,
              due_at: rfi.due_at,
              summary: rfi.summary,
            },
          },
        }).catch((e) => console.warn("[rfi-sweep] dispatch overdue failed:", e));

        await admin
          .from("application_rfis")
          .update({ overdue_notified_at: nowIso })
          .eq("id", rfi.id);
        overdue++;
        continue;
      }

      // Near-due window
      if (rfi.due_at <= soonCutoff && !rfi.near_due_notified_at) {
        await admin.functions.invoke("dispatch-notification-event", {
          body: {
            event_key: "application.rfi_near_due",
            entity_type: "applications",
            entity_id: rfi.application_id,
            payload: {
              rfi_id: rfi.id,
              due_at: rfi.due_at,
              summary: rfi.summary,
              hours_remaining: Math.round(
                (dueMs - now.getTime()) / (60 * 60 * 1000),
              ),
            },
          },
        }).catch((e) => console.warn("[rfi-sweep] dispatch near-due failed:", e));

        await admin
          .from("application_rfis")
          .update({ near_due_notified_at: nowIso })
          .eq("id", rfi.id);
        nearDue++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: openRfis?.length ?? 0,
        near_due_dispatched: nearDue,
        overdue_dispatched: overdue,
        duration_ms: Date.now() - startedAt,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[rfi-near-due-sweep] error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message ?? String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
