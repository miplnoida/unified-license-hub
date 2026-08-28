// F4-B (GAP-F4-08) — licensing provisioning outbox worker.
//
// Post-approval provisioning (portal access for the licensee, licence
// certificate generation) used to depend on a best-effort HTTP call made right
// after the approval transaction committed. If that call failed, the work was
// silently lost and had to be repaired by hand.
//
// Approval now enqueues one row per task in `licensing_provisioning_outbox`
// inside the approval transaction. This worker claims due tasks
// (`licensing_provisioning_claim`, service-role only), executes them, and
// reports the outcome (`licensing_provisioning_complete`), which applies
// exponential backoff and dead-letters after `max_attempts`.
//
// Every task is idempotent:
//   - portal_access       -> approve-pre-licensee re-checks state and reuses the
//                            existing auth user / entity mapping
//   - license_certificate -> generate-license-certificate creates a new version
//                            only when the licence exists
//
// Invocation is restricted to service-role / worker credentials.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireWorkerInvocationAsync } from "../_shared/workerAuth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OutboxRow = {
  id: string;
  application_id: string;
  task_key: "portal_access" | "license_certificate";
  license_id: string | null;
  attempts: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const gate = await requireWorkerInvocationAsync(req, "licensing-provisioning-worker");
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
  const limit = Number((body as Record<string, unknown>)?.limit ?? 10);

  const { data: claimed, error: claimError } = await admin.rpc("licensing_provisioning_claim", {
    _limit: Number.isFinite(limit) ? limit : 10,
  });

  if (claimError) {
    console.error("licensing_provisioning_claim failed:", claimError.message);
    return new Response(JSON.stringify({ ok: false, error: "claim_failed" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const rows = (claimed ?? []) as OutboxRow[];
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    let success = false;
    let errorText: string | null = null;

    try {
      if (row.task_key === "portal_access") {
        const res = await admin.functions.invoke("approve-pre-licensee", {
          body: { application_id: row.application_id, comments: "Automated post-approval provisioning" },
        });
        if (res.error) {
          errorText = res.error.message || "approve-pre-licensee failed";
        } else if ((res.data as Record<string, unknown> | null)?.error) {
          errorText = String((res.data as Record<string, unknown>).error);
        } else {
          success = true;
        }
      } else if (row.task_key === "license_certificate") {
        let licenseId = row.license_id;
        if (!licenseId) {
          const { data: lic } = await admin
            .from("licenses")
            .select("id")
            .eq("application_id", row.application_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          licenseId = (lic as { id?: string } | null)?.id ?? null;
        }
        if (!licenseId) {
          errorText = "No licence exists for this application yet";
        } else {
          const res = await admin.functions.invoke("generate-license-certificate", {
            body: { mode: "generate", license_id: licenseId },
          });
          if (res.error) {
            errorText = res.error.message || "generate-license-certificate failed";
          } else if ((res.data as Record<string, unknown> | null)?.error) {
            errorText = String((res.data as Record<string, unknown>).error);
          } else {
            success = true;
          }
        }
      } else {
        errorText = `Unknown task_key: ${row.task_key}`;
      }
    } catch (e) {
      errorText = e instanceof Error ? e.message : "unexpected worker error";
    }

    const { data: completion } = await admin.rpc("licensing_provisioning_complete", {
      _id: row.id,
      _success: success,
      _error: errorText,
    });

    results.push({
      task_id: row.id,
      application_id: row.application_id,
      task_key: row.task_key,
      success,
      status: (completion as Record<string, unknown> | null)?.status ?? null,
    });
  }

  return new Response(
    JSON.stringify({ ok: true, claimed: rows.length, results }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
