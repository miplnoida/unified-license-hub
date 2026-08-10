// SLA Escalation Sweep
// -------------------------------------------------------------------
// Stage-driven sweep over public.sla_stage_instances (Phase 1A).
//
// 1. Every `active` stage whose `due_at` has passed is marked `breached`
//    via sla_stage_mark_breached(), which is itself idempotent (it only
//    transitions active -> breached) and writes the breach event + audit row.
//    A `workflow.sla_breached` notification is emitted exactly once, on the
//    transition returning true.
// 2. Every breached stage is then matched against sla_escalation_tiers
//    (keyed by process_type) and newly-eligible tiers are dispatched.
//    Idempotency: unique (workflow_instance_id, tier) on
//    sla_escalation_dispatches — a 23505 means "already sent, skip".
//
// Legacy behaviour retained: process_type is the workflow entity_type.
// Intended to be invoked by pg_cron every 15 minutes.
// Returns HTTP 200 with a summary body (per project convention).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireWorkerInvocationAsync } from "../_shared/workerAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type StageInstance = {
  id: string;
  process_type: string;
  entity_type: string;
  entity_id: string;
  workflow_instance_id: string | null;
  step_id: string | null;
  stage_name: string | null;
  due_at: string | null;
  state: string;
  first_breach_notified_at: string | null;
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

  const __workerGate = await requireWorkerInvocationAsync(req, "sla-escalation-sweep");
  if (!__workerGate.ok) return __workerGate.response;
  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const nowIso = new Date().toISOString();

  try {
    const STAGE_SELECT =
      "id, process_type, entity_type, entity_id, workflow_instance_id, step_id, stage_name, due_at, state, first_breach_notified_at";

    // 1. Newly overdue active stages -> breached (once).
    const { data: overdueActive, error: overdueErr } = await admin
      .from("sla_stage_instances")
      .select(STAGE_SELECT)
      .eq("state", "active")
      .not("due_at", "is", null)
      .lt("due_at", nowIso);
    if (overdueErr) throw overdueErr;

    let breached = 0;
    for (const stage of (overdueActive ?? []) as StageInstance[]) {
      const { data: didBreach, error: breachErr } = await admin.rpc(
        "sla_stage_mark_breached",
        { _stage_instance_id: stage.id, _reason: "sla_sweep" },
      );
      if (breachErr) {
        console.warn("[sla-escalation-sweep] breach failed:", breachErr);
        continue;
      }
      if (didBreach !== true) continue;
      breached++;

      // Breach notification — emitted only on the state transition.
      try {
        await admin.functions.invoke("dispatch-notification-event", {
          body: {
            event_key: "workflow.sla_breached",
            entity_type: stage.entity_type,
            entity_id: stage.entity_id,
            payload: {
              process_type: stage.process_type,
              stage_name: stage.stage_name,
              sla_deadline: stage.due_at,
              workflow_instance_id: stage.workflow_instance_id,
              stage_instance_id: stage.id,
            },
          },
        });
      } catch (notifyErr) {
        console.warn("[sla-escalation-sweep] breach notify failed:", notifyErr);
      }
    }

    // 2. Escalate breached stages by tier.
    const { data: breachedStages, error: breachedErr } = await admin
      .from("sla_stage_instances")
      .select(STAGE_SELECT)
      .eq("state", "breached")
      .not("due_at", "is", null)
      .not("workflow_instance_id", "is", null);
    if (breachedErr) throw breachedErr;

    const stages = (breachedStages ?? []) as StageInstance[];
    if (stages.length === 0) {
      return respond({
        ok: true,
        scanned: 0,
        breached,
        escalated: 0,
        duration_ms: Date.now() - startedAt,
      });
    }

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

    const instanceIds = stages
      .map((s) => s.workflow_instance_id)
      .filter((id): id is string => !!id);

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

    let escalated = 0;
    let scanned = 0;
    const results: unknown[] = [];

    for (const stage of stages) {
      if (!stage.workflow_instance_id || !stage.due_at) continue;
      scanned++;

      const processType = stage.process_type || stage.entity_type;
      const applicable = tiersByProcess.get(processType);
      if (!applicable || applicable.length === 0) continue;

      const overdueMs = Date.now() - new Date(stage.due_at).getTime();
      const overdueDays = overdueMs / (1000 * 60 * 60 * 24);

      for (const tier of applicable) {
        if (overdueDays < tier.delay_days) continue;
        if (alreadySent.has(`${stage.workflow_instance_id}::${tier.tier}`)) continue;

        const { error: insertErr } = await admin
          .from("sla_escalation_dispatches")
          .insert({
            workflow_instance_id: stage.workflow_instance_id,
            entity_type: stage.entity_type,
            entity_id: stage.entity_id,
            process_type: processType,
            tier: tier.tier,
            recipients: tier.recipients,
            sla_deadline: stage.due_at,
            overdue_by_seconds: Math.floor(overdueMs / 1000),
            metadata: {
              step_id: stage.step_id,
              stage_instance_id: stage.id,
              stage_name: stage.stage_name,
              notify_roles: tier.notify_roles,
            },
          });

        if (insertErr) {
          // Unique violation = another sweep beat us; treat as success.
          if ((insertErr as { code?: string }).code !== "23505") {
            console.warn("[sla-escalation-sweep] insert failed:", insertErr);
          }
          continue;
        }

        alreadySent.add(`${stage.workflow_instance_id}::${tier.tier}`);

        try {
          await admin.functions.invoke("dispatch-notification-event", {
            body: {
              event_key: "workflow.sla_escalation",
              entity_type: stage.entity_type,
              entity_id: stage.entity_id,
              payload: {
                tier: tier.tier,
                process_type: processType,
                stage_name: stage.stage_name,
                sla_deadline: stage.due_at,
                overdue_days: Math.round(overdueDays * 100) / 100,
                notify_roles: tier.notify_roles,
                recipients: tier.recipients,
                workflow_instance_id: stage.workflow_instance_id,
                stage_instance_id: stage.id,
              },
            },
          });
          escalated++;
          results.push({
            workflow_instance_id: stage.workflow_instance_id,
            stage_instance_id: stage.id,
            entity_type: stage.entity_type,
            entity_id: stage.entity_id,
            tier: tier.tier,
          });
        } catch (dispatchErr) {
          console.warn("[sla-escalation-sweep] dispatch failed:", dispatchErr);
        }

        // Stage-level escalation evidence.
        const { error: markErr } = await admin.rpc("sla_stage_mark_escalated", {
          _stage_instance_id: stage.id,
          _tier: tier.tier,
          _recipients: tier.recipients,
        });
        if (markErr) {
          console.warn("[sla-escalation-sweep] mark escalated failed:", markErr);
        }
      }
    }

    return respond({
      ok: true,
      scanned,
      breached,
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
