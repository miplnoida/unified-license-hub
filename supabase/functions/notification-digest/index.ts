import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface DigestItem {
  category: string;
  title: string;
  detail?: string;
  link?: string;
  occurred_at: string;
}

async function collectItems(userId: string, since: string, categories: Record<string, boolean>) {
  const items: DigestItem[] = [];

  if (categories.breaches) {
    const { data } = await supabase
      .from("return_threshold_breaches")
      .select("id, breach_type, severity, detected_at, ratio_name")
      .gte("detected_at", since)
      .limit(50);
    for (const b of data ?? []) {
      items.push({
        category: "breaches",
        title: `${b.severity ?? "Breach"}: ${b.ratio_name ?? b.breach_type}`,
        detail: b.breach_type,
        link: `/supervision/breaches`,
        occurred_at: b.detected_at,
      });
    }
  }

  if (categories.enforcement) {
    const { data } = await supabase
      .from("enforcement_actions")
      .select("id, case_number, action_type, status, created_at")
      .gte("created_at", since)
      .limit(50);
    for (const e of data ?? []) {
      items.push({
        category: "enforcement",
        title: `${e.case_number ?? "Case"} — ${e.action_type}`,
        detail: `Status: ${e.status}`,
        link: `/enforcement/${e.id}`,
        occurred_at: e.created_at,
      });
    }
  }

  if (categories.complaints) {
    const { data } = await supabase
      .from("complaints")
      .select("id, complaint_number, subject, status, created_at")
      .gte("created_at", since)
      .limit(50);
    for (const c of data ?? []) {
      items.push({
        category: "complaints",
        title: `${c.complaint_number ?? "Complaint"}: ${c.subject ?? ""}`,
        detail: `Status: ${c.status}`,
        link: `/complaints/${c.id}`,
        occurred_at: c.created_at,
      });
    }
  }

  if (categories.returns) {
    const { data } = await supabase
      .from("returns_filed")
      .select("id, status, submitted_at, created_at")
      .gte("created_at", since)
      .limit(50);
    for (const r of data ?? []) {
      items.push({
        category: "returns",
        title: `Return ${r.status}`,
        link: `/returns/${r.id}`,
        occurred_at: r.submitted_at ?? r.created_at,
      });
    }
  }

  if (categories.fit_and_proper) {
    const { data } = await supabase
      .from("fp_monitoring_events")
      .select("id, event_type, severity, detected_at, individual_id")
      .gte("detected_at", since)
      .limit(50);
    for (const f of data ?? []) {
      items.push({
        category: "fit_and_proper",
        title: `${f.severity ?? "Alert"}: ${f.event_type}`,
        link: `/fit-and-proper/${f.individual_id}`,
        occurred_at: f.detected_at,
      });
    }
  }

  return items.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)).slice(0, 100);
}

function renderHtml(name: string, items: DigestItem[]) {
  const grouped: Record<string, DigestItem[]> = {};
  for (const i of items) (grouped[i.category] ||= []).push(i);
  const sections = Object.entries(grouped)
    .map(([cat, list]) => `
      <h3 style="margin:16px 0 6px;color:#1E3A8A;text-transform:capitalize">${cat.replace(/_/g, " ")}</h3>
      <ul style="padding-left:18px;margin:0">
        ${list.map((i) => `<li style="margin:4px 0"><strong>${i.title}</strong>${i.detail ? ` — <span style="color:#475569">${i.detail}</span>` : ""}</li>`).join("")}
      </ul>`)
    .join("");
  return `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:auto;padding:16px">
    <h2 style="color:#1E3A8A">Your daily regulatory digest</h2>
    <p>Hello ${name || "there"}, here is a summary of the last 24 hours (${items.length} item${items.length === 1 ? "" : "s"}).</p>
    ${items.length ? sections : "<p>No new activity in your selected categories.</p>"}
    <p style="margin-top:24px;color:#64748b;font-size:12px">Manage your preferences in Profile → Notifications.</p>
  </div>`;
}

async function sendDigestFor(userId: string, prefs: any) {
  const enabledCats = Object.entries(prefs.categories ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k) as string[];
  if (!enabledCats.length) return { skipped: true, reason: "no categories" };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const catMap: Record<string, boolean> = {};
  for (const c of enabledCats) catMap[c] = true;
  const items = await collectItems(userId, since, catMap);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  const channel = prefs.channels?.email ? "email" : prefs.channels?.in_app ? "in_app" : null;
  if (!channel) return { skipped: true, reason: "no channel" };

  let status = "sent";
  let error: string | null = null;

  try {
    if (channel === "email" && profile?.email) {
      await supabase.functions.invoke("send-notification", {
        body: {
          to: profile.email,
          subject: `Daily digest — ${items.length} update${items.length === 1 ? "" : "s"}`,
          html: renderHtml(profile.full_name ?? "", items),
          channel: "email",
        },
      });
    } else {
      await supabase.from("notifications").insert({
        user_id: userId,
        title: `Daily digest — ${items.length} updates`,
        message: items.slice(0, 5).map((i) => i.title).join("; "),
        type: "digest",
      });
    }
  } catch (e) {
    status = "failed";
    error = (e as Error).message;
  }

  await supabase.from("notification_digest_log").insert({
    user_id: userId,
    item_count: items.length,
    categories_included: enabledCats,
    channel,
    status,
    error_message: error,
    payload: { items: items.slice(0, 20) },
  });

  return { sent: status === "sent", item_count: items.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });


  const __workerGate = requireWorkerInvocation(req);
  if (!__workerGate.ok) return __workerGate.response;
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const userId: string | undefined = body.user_id;

    let query = supabase.from("notification_preferences").select("user_id, channels, categories, digest_enabled, digest_time");
    if (userId) query = query.eq("user_id", userId);
    else query = query.eq("digest_enabled", true);

    const { data: prefsList, error } = await query;
    if (error) throw error;

    const results: any[] = [];
    for (const p of prefsList ?? []) {
      const r = await sendDigestFor(p.user_id, p);
      results.push({ user_id: p.user_id, ...r });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
