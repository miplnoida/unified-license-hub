// SLA Escalation Sweep
// -------------------------------------------------------------------
// Scans every active workflow_instance whose current approval_action is
// past its sla_deadline. For each overdue instance it looks up the
// matching sla_escalation_tiers (keyed by process_type) and, if the
// overdue duration passes tier.delay_days AND that tier has not already
// fired for this instance, dispatches the escalation notification.
//
// Idempotency is enforced by inserting a row into
// sla_escalation_dispatches (unique (workflow_instance_id, tier)) — a
// unique-violation is treated as "already sent, skip".
//
// Intended to be invoked by pg_cron every 15 minutes.
// Returns HTTP 200 with a summary body (per project convention).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type WorkflowInstance = {
  id: string;
  entity_type: string;
  entity_id: string;
  current_step_id: string | null;
  status: string;
  started_at: string;
};

type LatestAction = {
  workflow_instance_id: string;
  sla_deadline: string | null;
  step_id: string | null;
  action_type: string | null;
};

type SlaTier = {
  process_type: string;
  tier: number;
  delay_days: number;
  recipients: string | null;
  notify_roles: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });


  const __workerGate = requireWorkerInvocation(req);
  if (!__workerGate.ok) return __workerGate.response;
  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const nowIso = new Date().toISOString();

  try {
    // 1. Load active workflow instances.
    const { data: instances, error: instErr } = await admin
      .from("workflow_instances")
      .select("id, entity_type, entity_id, current_step_id, status, started_at")
      .eq("status", "active");

    if (instErr) throw instErr;
    if (!instances || instances.length === 0) {
      return respond({ ok: true, scanned: 0, escalated: 0 });
    }

    // 2. Load the latest open approval_action per instance to find sla_deadline.
    const instanceIds = instances.map((i: WorkflowInstance) => i.id);
    const { data: openActions, error: actErr } = await admin
      .from("approval_actions")
      .select("workflow_instance_id, sla_deadline, step_id, action_type, created_at")
      .in("workflow_instance_id", instanceIds)
      .is("responded_at", null)
      .not("sla_deadline", "is", null)
      .lt("sla_deadline", nowIso)
      .order("created_at", { ascending: false });

    if (actErr) throw actErr;

    const latestByInstance = new Map<string, LatestAction>();
    for (const a of openActions ?? []) {
      if (!latestByInstance.has(a.workflow_instance_id)) {
        latestByInstance.set(a.workflow_instance_id, a as LatestAction);
      }
    }

    // 3. Load all active escalation tiers up-front and index by process_type.
    const { data: tiers, error: tierErr } = await admin
      .from("sla_escalation_tiers")
      .select("process_type, tier, delay_days, recipients, notify_roles")
      .order("tier", { ascending: true });
    if (tierErr) throw tierErr;

    const tiersByProcess = new Map<string, SlaTier[]>();
    for (const t of (tiers ?? []) as SlaTier[]) {
      const arr = tiersByProcess.get(t.process_type) ?? [];
      arr.push(t);
      tiersByProcess.set(t.process_type, arr);
    }

    // 4. Load already-dispatched (instance,tier) pairs so we can skip them.
    const { data: dispatched, error: dispErr } = await admin
      .from("sla_escalation_dispatches")
      .select("workflow_instance_id, tier")
      .in("workflow_instance_id", instanceIds);
    if (dispErr) throw dispErr;

    const alreadySent = new Set(
      (dispatched ?? []).map(
        (d: { workflow_instance_id: string; tier: number }) =>
          `${d.workflow_instance_id}::${d.tier}`,
      ),
    );

    // 5. Walk each overdue instance and dispatch newly-eligible tiers.
    let escalated = 0;
    let scanned = 0;
    const results: unknown[] = [];

    for (const inst of instances as WorkflowInstance[]) {
      const openAction = latestByInstance.get(inst.id);
      if (!openAction || !openAction.sla_deadline) continue;
      scanned++;

      const processType = inst.entity_type; // process_type keyed by entity_type
      const applicable = tiersByProcess.get(processType);
      if (!applicable || applicable.length === 0) continue;

      const overdueMs =
        Date.now() - new Date(openAction.sla_deadline).getTime();
      const overdueDays = overdueMs / (1000 * 60 * 60 * 24);

      for (const tier of applicable) {
        if (overdueDays < tier.delay_days) continue;
        if (alreadySent.has(`${inst.id}::${tier.tier}`)) continue;

        // Attempt idempotent insert first — unique(workflow_instance_id,tier)
        // guarantees only one dispatch even under a concurrent invocation.
        const { error: insertErr } = await admin
          .from("sla_escalation_dispatches")
          .insert({
            workflow_instance_id: inst.id,
            entity_type: inst.entity_type,
            entity_id: inst.entity_id,
            process_type: processType,
            tier: tier.tier,
            recipients: tier.recipients,
            sla_deadline: openAction.sla_deadline,
            overdue_by_seconds: Math.floor(overdueMs / 1000),
            metadata: {
              step_id: openAction.step_id,
              notify_roles: tier.notify_roles,
            },
          });

        if (insertErr) {
          // Unique violation = another sweep beat us; treat as success.
          if ((insertErr as { code?: string }).code !== "23505") {
            console.warn(
              "[sla-escalation-sweep] insert failed:",
              insertErr,
            );
          }
          continue;
        }

        // Dispatch the escalation notification. Event key is generic; each
        // process/domain can add its own recipient rules in
        // notification_event_configs.
        try {
          await admin.functions.invoke("dispatch-notification-event", {
            body: {
              event_key: "workflow.sla_escalation",
              entity_type: inst.entity_type,
              entity_id: inst.entity_id,
              payload: {
                tier: tier.tier,
                process_type: processType,
                sla_deadline: openAction.sla_deadline,
                overdue_days: Math.round(overdueDays * 100) / 100,
                notify_roles: tier.notify_roles,
                recipients: tier.recipients,
                workflow_instance_id: inst.id,
              },
            },
          });
          escalated++;
          results.push({
            workflow_instance_id: inst.id,
            entity_type: inst.entity_type,
            entity_id: inst.entity_id,
            tier: tier.tier,
          });
        } catch (dispatchErr) {
          console.warn(
            "[sla-escalation-sweep] dispatch failed:",
            dispatchErr,
          );
        }
      }
    }

    return respond({
      ok: true,
      scanned,
      escalated,
      duration_ms: Date.now() - startedAt,
      results,
    });
  } catch (error) {
    console.error("[sla-escalation-sweep] error:", error);
    // Return 200 with error body per project convention.
    return respond({
      ok: false,
      error: (error as Error).message ?? String(error),
    });
  }
});

function respond(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
