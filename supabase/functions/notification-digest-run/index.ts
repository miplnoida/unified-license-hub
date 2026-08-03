// Period-aware notification digest worker (hourly / daily).
//
// Eligibility, duplicate prevention and run bookkeeping all live in the
// database (`notification_digest_build` / `notification_digest_mark`) so the
// same rules are enforced for any caller. This worker only renders and sends.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface DigestItem {
  id: string;
  title: string;
  preview: string | null;
  module: string | null;
  severity: string | null;
  route: string | null;
  created_at: string;
}

interface DigestRun {
  run_id: string;
  user_id: string;
  channel: string;
  period: "hourly" | "daily";
  period_start: string;
  period_end: string;
  item_count: number;
  items: DigestItem[];
  recipient_email: string | null;
  recipient_name: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

function renderText(run: DigestRun): string {
  const label = run.period === "hourly" ? "hourly" : "daily";
  const lines = run.items.map(
    (i) => `- ${i.title}${i.preview ? `: ${i.preview}` : ""}`,
  );
  return [
    `Hello ${run.recipient_name || "there"},`,
    "",
    `Your ${label} notification digest contains ${run.item_count} update${run.item_count === 1 ? "" : "s"}.`,
    "",
    ...lines,
    "",
    "Open the Notification Centre to view the full details.",
    "Manage what you receive in Settings > Notifications.",
  ].join("\n");
}

function renderHtml(run: DigestRun): string {
  const label = run.period === "hourly" ? "Hourly" : "Daily";
  const grouped: Record<string, DigestItem[]> = {};
  for (const i of run.items) (grouped[i.module || "General"] ||= []).push(i);
  const sections = Object.entries(grouped)
    .map(
      ([mod, list]) => `
      <h3 style="margin:16px 0 6px;color:#1E3A8A;text-transform:capitalize">${escapeHtml(mod.replace(/_/g, " "))}</h3>
      <ul style="padding-left:18px;margin:0">
        ${list
          .map(
            (i) =>
              `<li style="margin:4px 0"><strong>${escapeHtml(i.title)}</strong>${
                i.preview ? ` — <span style="color:#475569">${escapeHtml(i.preview)}</span>` : ""
              }</li>`,
          )
          .join("")}
      </ul>`,
    )
    .join("");
  return `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:auto;padding:16px">
    <h2 style="color:#1E3A8A">${label} notification digest</h2>
    <p>Hello ${escapeHtml(run.recipient_name || "there")}, here ${run.item_count === 1 ? "is" : "are"} ${run.item_count} update${run.item_count === 1 ? "" : "s"} from your notifications.</p>
    ${sections}
    <p style="margin-top:24px;color:#64748b;font-size:12px">Critical and high urgency notifications are always delivered immediately and are never included in a digest. Manage your preferences in Settings &rarr; Notifications.</p>
  </div>`;
}

async function deliver(run: DigestRun) {
  if (run.channel !== "email") {
    await supabase.rpc("notification_digest_mark", {
      _run_id: run.run_id,
      _status: "skipped",
      _error: `unsupported channel: ${run.channel}`,
    });
    return { run_id: run.run_id, status: "skipped" };
  }

  if (!run.recipient_email) {
    await supabase.rpc("notification_digest_mark", {
      _run_id: run.run_id,
      _status: "skipped",
      _error: "recipient has no email address",
    });
    return { run_id: run.run_id, status: "skipped" };
  }

  try {
    const { data, error } = await supabase.functions.invoke("send-notification", {
      body: {
        to: run.recipient_email,
        subject: `${run.period === "hourly" ? "Hourly" : "Daily"} digest — ${run.item_count} update${run.item_count === 1 ? "" : "s"}`,
        text: renderText(run),
        html: renderHtml(run),
        channel: "email",
      },
    });
    if (error) throw new Error(error.message);
    if (data && data.success === false) throw new Error(data.error || "email delivery failed");

    await supabase.rpc("notification_digest_mark", {
      _run_id: run.run_id,
      _status: "sent",
    });
    return { run_id: run.run_id, status: "sent", item_count: run.item_count };
  } catch (e) {
    const message = (e as Error).message;
    console.error("digest_delivery_failed", { run_id: run.run_id, message });
    // Marking failed releases the items so the next scheduled run retries them.
    await supabase.rpc("notification_digest_mark", {
      _run_id: run.run_id,
      _status: "failed",
      _error: message,
    });
    return { run_id: run.run_id, status: "failed", error: message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = requireWorkerInvocation(req);
  if (!gate.ok) return gate.response;

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const period: string = body.period ?? "daily";
    if (period !== "hourly" && period !== "daily") {
      return new Response(JSON.stringify({ error: `invalid_period: ${period}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase.rpc("notification_digest_build", {
      _period: period,
      _period_start: body.period_start ?? null,
      _channel: body.channel ?? "email",
    });
    if (error) throw new Error(error.message);

    const runs = ((data as { runs?: DigestRun[] })?.runs ?? []) as DigestRun[];
    const results = [];
    for (const run of runs) results.push(await deliver(run));

    return new Response(
      JSON.stringify({
        period,
        period_start: (data as { period_start?: string })?.period_start,
        processed: results.length,
        sent: results.filter((r) => r.status === "sent").length,
        failed: results.filter((r) => r.status === "failed").length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("notification_digest_run_error", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
