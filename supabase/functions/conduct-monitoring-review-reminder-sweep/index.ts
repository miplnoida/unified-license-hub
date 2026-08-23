import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};

const WINDOWS = [
  { label: "7d", days: 7 },
  { label: "0d", days: 0 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = requireWorkerInvocation(req);
  if (!gate.ok) return gate.response;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const summary = { scanned: 0, enqueued: 0, skipped: 0, errors: 0 as number };

  try {
    const { data: reviews, error } = await admin
      .from("conduct_monitoring_reviews")
      .select("id, monitoring_id, due_date, status")
      .eq("status", "scheduled");
    if (error) throw new Error(error.message);

    const today = new Date(); today.setUTCHours(0, 0, 0, 0);

    for (const rev of reviews || []) {
      summary.scanned++;
      const due = new Date(`${rev.due_date}T00:00:00Z`);
      const daysLeft = Math.round((due.getTime() - today.getTime()) / 86400000);
      const win = WINDOWS.find((w) => w.days === daysLeft) ?? (daysLeft < 0 ? { label: "overdue", days: daysLeft } : null);
      if (!win) { summary.skipped++; continue; }

      const { data: monitoring } = await admin.from("conduct_post_closure_monitoring")
        .select("id, investigation_id, licensee_id, owner_id, focus_areas").eq("id", rev.monitoring_id).maybeSingle();

      const suffix = `${win.label}:${today.toISOString().slice(0, 10)}`;
      const { data: eventId, error: enqErr } = await admin.rpc("notification_enqueue_event", {
        _event_key: "conduct_investigation.monitoring_review_due",
        _entity_type: "conduct_monitoring_review",
        _entity_id: rev.id,
        _payload: {
          review_id: rev.id,
          monitoring_id: rev.monitoring_id,
          investigation_id: monitoring?.investigation_id,
          licensee_id: monitoring?.licensee_id,
          owner_id: monitoring?.owner_id,
          focus_areas: monitoring?.focus_areas,
          due_date: rev.due_date,
          days_left: daysLeft,
          cta_url: monitoring?.investigation_id ? `/conduct/investigations/${monitoring.investigation_id}` : undefined,
          cta_label: "Open post-closure monitoring review",
        },
        _idempotency_suffix: suffix,
        _reminder_window: win.label,
      });
      if (enqErr) { summary.errors++; console.error("enqueue failed", rev.id, enqErr.message); continue; }
      if (eventId) summary.enqueued++; else summary.skipped++;
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, ...summary }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
