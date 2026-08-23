import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};

const WINDOWS = [
  { label: "3d", days: 3 },
  { label: "0d", days: 0 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = requireWorkerInvocation(req);
  if (!gate.ok) return gate.response;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const summary = { scanned: 0, enqueued: 0, skipped: 0, errors: 0 as number };

  try {
    const { data: rfis, error } = await admin
      .from("complaint_rfis")
      .select("id, complaint_id, licensee_id, raised_by, due_at, status, approval_state")
      .not("due_at", "is", null)
      .eq("status", "open")
      .eq("approval_state", "dispatched");
    if (error) throw new Error(error.message);

    const today = new Date(); today.setUTCHours(0, 0, 0, 0);

    for (const rfi of rfis || []) {
      summary.scanned++;
      const due = new Date(rfi.due_at as string); due.setUTCHours(0, 0, 0, 0);
      const daysLeft = Math.round((due.getTime() - today.getTime()) / 86400000);
      const win = WINDOWS.find((w) => w.days === daysLeft) ?? (daysLeft < 0 ? { label: "overdue", days: daysLeft } : null);
      if (!win) { summary.skipped++; continue; }

      const { data: complaint } = await admin.from("complaints")
        .select("id, complaint_number, investigator_id").eq("id", rfi.complaint_id).maybeSingle();

      const suffix = `${win.label}:${today.toISOString().slice(0, 10)}`;
      const { data: eventId, error: enqErr } = await admin.rpc("notification_enqueue_event", {
        _event_key: "complaint.rfi_due_reminder",
        _entity_type: "complaint_rfi",
        _entity_id: rfi.id,
        _payload: {
          rfi_id: rfi.id,
          complaint_id: rfi.complaint_id,
          complaint_number: complaint?.complaint_number,
          licensee_id: rfi.licensee_id,
          raised_by: rfi.raised_by,
          investigator_id: complaint?.investigator_id,
          due_at: rfi.due_at,
          days_left: daysLeft,
          cta_url: `/complaints/${rfi.complaint_id}`,
          cta_label: "Open complaint RFI",
        },
        _idempotency_suffix: suffix,
        _reminder_window: win.label,
      });
      if (enqErr) { summary.errors++; console.error("enqueue failed", rfi.id, enqErr.message); continue; }
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
