// P04 A.13 — governed licence expiry / lapse sweep (service-role job).
//
// The regulatory logic lives entirely in `public.license_expiry_sweep_run()`,
// which is service-role only: it refuses execution when `auth.uid()` is set, so
// the browser can never run it. This function is the only privileged execution
// path (pg_cron POST, or an internal supervisor triggering a run).
//
// Idempotency is server-side, not job-timing based:
//   - automatic lapse flips `licenses.status` to `expired`, so the licence
//     leaves the eligible population immediately;
//   - officer-confirmed expiry inserts a matter only when no open expiry matter
//     exists for that licence.
// Running the sweep twice therefore produces no duplicate matter, decision or
// lifecycle event.
//
// Every run writes one `license_expiry_sweep_runs` row (run id, started/finished
// at, initiator, eligible / auto-expired / review-created / skipped counts,
// errors) plus an audit log entry.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireWorkerInvocationAsync } from "../_shared/workerAuth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const gate = await requireWorkerInvocationAsync(req, "license-expiry-sweep");
  if (!gate.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: "Unauthorized worker invocation" }),
      { status: 401, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const limit = Number.isFinite(Number(body?.limit)) ? Number(body.limit) : 200;

  const { data, error } = await admin.rpc("license_expiry_sweep_run", { _limit: limit });

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ ok: true, run: data }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
