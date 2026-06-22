// Scheduled (daily via pg_cron) — dispatches license expiry reminders.
//
// For each active license, if valid_until - today matches any window in
// REMINDER_WINDOWS, dispatch `license.expiring_soon` (or `license.expired` for the
// 0-day window). Each (license, window) pair is dispatched at most once thanks to
// the dedupe key (event_key + entity_id + recipient + channel + reminder_window).
//
// Trigger manually for testing:
//   POST /functions/v1/license-expiry-reminders   body: {}              (all windows)
//   POST /functions/v1/license-expiry-reminders   body: {"window":"30d"} (one)
//   POST /functions/v1/license-expiry-reminders   body: {"license_id":"...","window":"7d"}
//
// Returns 200 with a summary; never throws to caller.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Window = { label: string; days: number; event: "license.expiring_soon" | "license.expired" };

interface Policy {
  reminder_days: number[];
  grace_period_days: number;
  auto_notify_officer: boolean;
}

interface Rule extends Policy {
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
}

const DEFAULT_POLICY: Policy = {
  reminder_days: [30, 15, 7, 1],
  grace_period_days: 30,
  auto_notify_officer: true,
};

function normalizePolicy(raw: any, fallback: Policy): Policy {
  if (!raw || typeof raw !== "object") return fallback;
  const reminder = Array.isArray(raw.reminder_days)
    ? raw.reminder_days.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n >= 0)
    : fallback.reminder_days;
  return {
    reminder_days: reminder.length ? reminder : fallback.reminder_days,
    grace_period_days: Number.isFinite(Number(raw.grace_period_days))
      ? Math.max(0, Number(raw.grace_period_days))
      : fallback.grace_period_days,
    auto_notify_officer:
      typeof raw.auto_notify_officer === "boolean" ? raw.auto_notify_officer : fallback.auto_notify_officer,
  };
}

function resolvePolicy(def: Policy, rules: Rule[], lic: { sector_id: any; sub_sector_id: any; category_id: any }): Policy {
  const matches = rules
    .filter((r) => !r.sector_id || r.sector_id === lic.sector_id)
    .filter((r) => !r.sub_sector_id || r.sub_sector_id === lic.sub_sector_id)
    .filter((r) => !r.category_id || r.category_id === lic.category_id)
    .map((r) => ({
      r,
      score: (r.category_id ? 4 : 0) + (r.sub_sector_id ? 2 : 0) + (r.sector_id ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  return matches.length ? matches[0].r : def;
}

function buildWindows(reminderDays: number[]): Window[] {
  const uniq = Array.from(new Set(reminderDays.filter((d) => Number.isFinite(d) && d >= 0))).sort((a, b) => b - a);
  const out: Window[] = uniq.map((d) => ({ label: `${d}d`, days: d, event: "license.expiring_soon" }));
  out.push({ label: "0d", days: 0, event: "license.expired" });
  return out;
}

function dateOnly(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const summary: Record<string, any> = { scanned: 0, dispatched: 0, skipped: 0, errors: 0, by_window: {} as Record<string, number> };
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    let reqBody: any = {};
    try { reqBody = await req.json(); } catch { /* allow empty */ }

    // Load admin-configured expiry policy (new shape: { default, rules }).
    // Falls back to legacy flat shape and finally to DEFAULT_POLICY.
    let defaultPolicy: Policy = DEFAULT_POLICY;
    let rules: Rule[] = [];
    try {
      const { data: cfgRow } = await admin
        .from("site_settings")
        .select("value")
        .eq("key", "license_expiry")
        .maybeSingle();
      const cfg: any = cfgRow?.value;
      const hasNewShape = cfg && typeof cfg === "object" && (cfg.default || cfg.rules);
      defaultPolicy = hasNewShape
        ? normalizePolicy(cfg.default, DEFAULT_POLICY)
        : normalizePolicy(cfg, DEFAULT_POLICY);
      if (Array.isArray(cfg?.rules)) {
        rules = cfg.rules.map((r: any) => ({
          sector_id: r?.sector_id || null,
          sub_sector_id: r?.sub_sector_id || null,
          category_id: r?.category_id || null,
          ...normalizePolicy(r, defaultPolicy),
        }));
      }
    } catch (e) {
      console.warn("license_expiry config load failed, using defaults", e);
    }

    // Union of all reminder days across default + every rule, so we cover every
    // possible scheduling window in a single sweep. Per-license matching below
    // decides whether each license actually qualifies for that window.
    const allReminderDays = Array.from(new Set([...defaultPolicy.reminder_days, ...rules.flatMap((r) => r.reminder_days)]));
    const allWindows = buildWindows(allReminderDays);
    const windows = reqBody?.window
      ? allWindows.filter((w) => w.label === reqBody.window)
      : allWindows;
    const explicitLicenseId: string | undefined = reqBody?.license_id;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (const win of windows) {
      const target = new Date(today);
      target.setUTCDate(target.getUTCDate() + win.days);
      const targetDate = target.toISOString().slice(0, 10);

      let q = admin
        .from("licenses")
        .select("id, license_number, license_type, holder_id, valid_until, status, sector_id, sub_sector_id, category_id")
        .not("valid_until", "is", null)
        .gte("valid_until", `${targetDate}T00:00:00Z`)
        .lt("valid_until", `${targetDate}T23:59:59Z`);

      // For expiry-day window only target still-active licenses.
      if (win.event === "license.expired") {
        q = q.in("status", ["active", "suspended"]);
      } else {
        q = q.eq("status", "active");
      }
      if (explicitLicenseId) q = q.eq("id", explicitLicenseId);

      const { data: licenses, error } = await q;
      if (error) {
        console.error("license-expiry-reminders query failed", win.label, error.message);
        summary.errors++;
        continue;
      }

      summary.by_window[win.label] = 0;

      for (const lic of licenses || []) {
        // Skip licenses whose resolved policy doesn't include this window.
        const policy = resolvePolicy(defaultPolicy, rules, lic);
        if (win.event === "license.expiring_soon" && !policy.reminder_days.includes(win.days)) {
          continue;
        }
        summary.scanned++;

        // Resolve recipient user(s) for this license.
        const { data: recipients } = await admin.rpc("license_recipients_for_holder", {
          _license_id: lic.id,
        });
        const recipientList: Array<{ user_id: string; email: string | null }> = (recipients || []) as any;

        if (recipientList.length === 0) {
          summary.skipped++;
          continue;
        }

        // Dispatch one event per recipient — recipient_rules in the event config use
        // {type:"payload_user", key:"holder_user_id"} so we pass each user via payload.
        for (const r of recipientList) {
          try {
            const resp = await admin.functions.invoke("dispatch-notification-event", {
              body: {
                event_key: win.event,
                entity_type: "license",
                entity_id: lic.id,
                reminder_window: win.label,
                payload: {
                  license_id: lic.id,
                  license_number: lic.license_number,
                  license_type: lic.license_type,
                  valid_until: dateOnly(lic.valid_until),
                  days_until_expiry: win.days,
                  reason: win.event === "license.expired" ? "expired" : "expiring_soon",
                  holder_user_id: r.user_id,
                },
              },
            });
            if (resp?.error) {
              console.error("dispatch invoke error", lic.id, win.label, resp.error);
              summary.errors++;
            } else {
              summary.dispatched++;
              summary.by_window[win.label]++;
            }
          } catch (e: any) {
            console.error("dispatch failed", lic.id, win.label, e?.message || e);
            summary.errors++;
          }
        }



        // Also dispatch officer-targeted event (recipient rules resolve via sector_regulators / supervisor role).
        if (notifyOfficer && win.event === "license.expiring_soon") {
          try {
            await admin.functions.invoke("dispatch-notification-event", {
              body: {
                event_key: "license.expiring_soon_officer",
                entity_type: "license",
                entity_id: lic.id,
                reminder_window: `${win.label}-officer`,
                payload: {
                  license_id: lic.id,
                  license_number: lic.license_number,
                  license_type: lic.license_type,
                  valid_until: dateOnly(lic.valid_until),
                  days_until_expiry: win.days,
                },
              },
            });
          } catch (e: any) {
            console.error("officer dispatch failed", lic.id, win.label, e?.message || e);
          }
        }
      }
    }



    return new Response(JSON.stringify({ ok: true, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("license-expiry-reminders fatal", e?.message || e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e), ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
