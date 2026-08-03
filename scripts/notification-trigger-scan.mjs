#!/usr/bin/env node
/**
 * Notification trigger + configuration scanner.
 *
 * Single source of truth for:
 *  - docs/verification/notifications/20_current_baseline.{md,csv}
 *  - docs/verification/notifications/21_trigger_matrix.{md,csv}
 *
 * A notification event is only considered "wired" when a real business call
 * site exists: a database function/trigger body referencing the event key, or
 * an edge-function / server-side call site referencing it. Frontend-only
 * references are recorded separately and never count as backend wiring.
 *
 * Requires the managed PG* environment variables (psql) to be present.
 * Usage: node scripts/notification-trigger-scan.mjs [--check]
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "docs/verification/notifications";
const CHECK_ONLY = process.argv.includes("--check");

function sql(query) {
  const raw = execFileSync("psql", ["-At", "-c", query], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return raw.trim();
}

function sqlJson(query) {
  const out = sql(`select coalesce(json_agg(t), '[]'::json) from (${query}) t`);
  return JSON.parse(out || "[]");
}

function rgCount(pattern, paths) {
  try {
    const out = execFileSync(
      "rg",
      ["-l", "--fixed-strings", pattern, ...paths],
      { encoding: "utf8" },
    );
    return out.trim() ? out.trim().split("\n") : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- event scan

const events = sqlJson(`
  select
    c.id,
    c.event_key,
    coalesce(c.module, 'unclassified') as module,
    c.severity::text as severity,
    c.category::text as category,
    c.is_active,
    c.system_required,
    c.allow_mute,
    coalesce(c.delivery_frequency, 'immediate') as delivery_frequency,
    coalesce(jsonb_array_length(coalesce(c.recipient_rules, '[]'::jsonb)), 0) as recipient_rule_count,
    coalesce(c.recipient_rules, '[]'::jsonb)::text as recipient_rules,
    coalesce(array_to_string(c.channels, ','), '') as channels,
    exists (
      select 1 from notification_event_channel_templates b
      where b.event_config_id = c.id and b.channel = 'in_app'
    ) as has_in_app_binding,
    exists (
      select 1 from notification_event_channel_templates b
      where b.event_config_id = c.id and b.channel = 'email'
    ) as has_email_binding,
    exists (
      select 1
      from notification_event_channel_templates b
      join notification_template_versions v
        on v.template_id = b.template_id and v.version = b.template_version
      where b.event_config_id = c.id
    ) as has_published_version,
    exists (
      select 1 from notification_dispatch_log d where d.event_key = c.event_key
    ) as ever_dispatched,
    (
      select count(*) from notification_dispatch_log d where d.event_key = c.event_key
    ) as dispatch_count,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosrc like '%' || c.event_key || '%'
    ) as db_call_site,
    (
      select coalesce(string_agg(distinct p.proname, ' '), '')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosrc like '%' || c.event_key || '%'
    ) as db_functions
  from notification_event_configs c
  order by coalesce(c.module, 'unclassified'), c.event_key
`);

const backendPaths = ["supabase/functions"].filter(existsSync);
const frontendPaths = ["src"].filter(existsSync);

for (const e of events) {
  e.edge_call_sites = backendPaths.length ? rgCount(e.event_key, backendPaths) : [];
  e.frontend_call_sites = frontendPaths.length ? rgCount(e.event_key, frontendPaths) : [];
  e.wired = e.db_call_site || e.edge_call_sites.length > 0;
  e.call_site = e.db_call_site
    ? `db:${e.db_functions.split(" ").filter(Boolean).slice(0, 3).join(",")}`
    : e.edge_call_sites.length
      ? `edge:${e.edge_call_sites.map((p) => p.replace("supabase/functions/", "")).slice(0, 2).join(",")}`
      : e.frontend_call_sites.length
        ? `frontend-only:${e.frontend_call_sites.length}`
        : "none";
}

const active = events.filter((e) => e.is_active);
const inactive = events.filter((e) => !e.is_active);

// -------------------------------------------------------------- other counts

const one = (q) => Number(sql(`select ${q}`));

const metrics = {
  active_event_configs: active.length,
  inactive_event_configs: inactive.length,
  active_no_trigger_call_site: active.filter((e) => !e.wired).length,
  active_wired_never_dispatched: active.filter((e) => e.wired && !e.ever_dispatched).length,
  active_invalid_recipient_rules: active.filter((e) => e.recipient_rule_count === 0).length,
  active_no_in_app_binding: active.filter(
    (e) => e.channels.includes("in_app") && !e.has_in_app_binding,
  ).length,
  active_no_email_binding: active.filter(
    (e) => e.channels.includes("email") && !e.has_email_binding,
  ).length,
  active_no_published_version: active.filter((e) => !e.has_published_version).length,
  dispatch_rows: one("count(*) from notification_dispatch_log"),
  dispatch_null_template_id: one("count(*) from notification_dispatch_log where template_id is null"),
  dispatch_null_template_version: one(
    "count(*) from notification_dispatch_log where template_version is null",
  ),
  dispatch_fallback_rendered: one(
    "count(*) from notification_dispatch_log where coalesce(used_fallback_template,false)",
  ),
  dispatch_unresolved_placeholders: one(
    "count(*) from notification_dispatch_log where coalesce(subject,'') like '%{{%' or coalesce(rendered_content::text,'') like '%{{%'",
  ),
  notifications_rows: one("count(*) from notifications"),
  notifications_missing_source_route: one(
    "count(*) from notifications where coalesce(action_url,'') = ''",
  ),
  correspondence_threads: one("count(*) from correspondence_threads"),
  correspondence_messages: one("count(*) from correspondence_messages"),
  escalations: one("count(*) from escalations"),
  escalation_tier_events: one("count(*) from escalation_tier_events"),
  queue_rows: one("count(*) from notification_event_queue"),
  queue_pending: one("count(*) from notification_event_queue where status = 'pending'"),
  queue_dead: one("count(*) from notification_event_queue where status = 'dead'"),
  dispatch_poisoned: one("count(*) from notification_dispatch_log where coalesce(poisoned,false)"),
  template_versions: one("count(*) from notification_template_versions"),
  event_channel_bindings: one("count(*) from notification_event_channel_templates"),
};

const emailByStatus = sqlJson(`
  select status, count(*)::int as count
  from notification_dispatch_log where channel = 'email'
  group by status order by status
`);

const auditByAction = sqlJson(`
  select action, count(*)::int as count
  from audit_logs
  where action ilike '%notification%' or action ilike '%template%'
     or action ilike '%thread%' or action ilike '%escalation%'
     or action ilike '%correspondence%'
  group by action order by count desc
`);

// ------------------------------------------------------------------- outputs

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(header, rows) {
  return [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";
}

const stamp = new Date().toISOString();

const baselineRows = [
  ...Object.entries(metrics).map(([k, v]) => ["metric", k, v]),
  ...emailByStatus.map((r) => ["email_status", r.status, r.count]),
  ...auditByAction.map((r) => ["audit_action", r.action, r.count]),
];

const baselineCsv = csv(["group", "measure", "value"], baselineRows);

const baselineMd = `# Notifications & Communications — Measured Baseline

Generated: ${stamp}
Generator: \`scripts/notification-trigger-scan.mjs\` (queries the live database; no figures copied from earlier documents)
Approved scope: In-App + Email. SMS is excluded from implementation, testing and all percentages.

## Configuration and wiring

| Measure | Value |
| --- | --- |
${Object.entries(metrics)
  .map(([k, v]) => `| ${k.replace(/_/g, " ")} | ${v} |`)
  .join("\n")}

## Email delivery records by status

| Status | Count |
| --- | --- |
${emailByStatus.map((r) => `| ${r.status} | ${r.count} |`).join("\n") || "| (none) | 0 |"}

## Audit records by action (notification domain)

| Action | Count |
| --- | --- |
${auditByAction.map((r) => `| ${r.action} | ${r.count} |`).join("\n") || "| (none) | 0 |"}

## Active events with no backend trigger call site

${
  active.filter((e) => !e.wired).length === 0
    ? "None. Every active event has a verified backend call site."
    : active
        .filter((e) => !e.wired)
        .map((e) => `- \`${e.event_key}\` (${e.module}) — call site: ${e.call_site}`)
        .join("\n")
}

Machine-readable copy: \`20_current_baseline.csv\`.
`;

const matrixRows = events.map((e) => [
  e.event_key,
  e.module,
  e.is_active ? "active" : "deactivated",
  e.wired ? "wired" : e.is_active ? "UNWIRED" : "n/a",
  e.call_site,
  e.recipient_rule_count,
  e.has_in_app_binding ? "yes" : "no",
  e.has_email_binding ? "yes" : "no",
  e.has_published_version ? "yes" : "no",
  e.ever_dispatched ? "yes" : "no",
  e.dispatch_count,
]);

const matrixCsv = csv(
  [
    "event_key",
    "module",
    "state",
    "trigger",
    "call_site",
    "recipient_rules",
    "in_app_binding",
    "email_binding",
    "published_version",
    "executed",
    "dispatch_rows",
  ],
  matrixRows,
);

const byModule = {};
for (const e of events) (byModule[e.module] ||= []).push(e);

const matrixMd = `# Notification Trigger Matrix (authoritative)

Generated: ${stamp}
Generator: \`scripts/notification-trigger-scan.mjs\`

"Wired" means a backend call site exists (database function/trigger body or edge
function). Frontend-only references never count as wiring.

| Measure | Value |
| --- | --- |
| Active events | ${active.length} |
| Active events wired | ${active.filter((e) => e.wired).length} |
| Active events unwired | ${metrics.active_no_trigger_call_site} |
| Active events executed at least once | ${active.filter((e) => e.ever_dispatched).length} |
| Active events wired but not yet executed | ${metrics.active_wired_never_dispatched} |
| Deactivated (out of approved scope) | ${inactive.length} |

${Object.entries(byModule)
  .map(
    ([mod, list]) => `## ${mod}

| Event | State | Trigger | Call site | Recipients | In-app | Email | Published | Executed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${list
  .map(
    (e) =>
      `| \`${e.event_key}\` | ${e.is_active ? "active" : "deactivated"} | ${
        e.wired ? "wired" : e.is_active ? "**UNWIRED**" : "n/a"
      } | ${e.call_site} | ${e.recipient_rule_count} | ${e.has_in_app_binding ? "y" : "n"} | ${
        e.has_email_binding ? "y" : "n"
      } | ${e.has_published_version ? "y" : "n"} | ${e.ever_dispatched ? "y" : "n"} |`,
  )
  .join("\n")}`,
  )
  .join("\n\n")}

Machine-readable copy: \`21_trigger_matrix.csv\`.
`;

if (CHECK_ONLY) {
  const failures = [];
  if (metrics.active_no_trigger_call_site > 0) {
    failures.push(
      `${metrics.active_no_trigger_call_site} active event(s) have no backend trigger call site`,
    );
  }
  if (metrics.active_invalid_recipient_rules > 0) {
    failures.push(`${metrics.active_invalid_recipient_rules} active event(s) have no recipient rules`);
  }
  if (metrics.active_no_published_version > 0) {
    failures.push(
      `${metrics.active_no_published_version} active event(s) have no published template version`,
    );
  }
  if (metrics.dispatch_fallback_rendered > 0) {
    failures.push(`${metrics.dispatch_fallback_rendered} dispatch row(s) used fallback rendering`);
  }
  const existing = existsSync(join(OUT_DIR, "21_trigger_matrix.csv"))
    ? readFileSync(join(OUT_DIR, "21_trigger_matrix.csv"), "utf8")
    : "";
  if (existing && existing !== matrixCsv) {
    failures.push("21_trigger_matrix.csv is stale — re-run scripts/notification-trigger-scan.mjs");
  }
  if (failures.length) {
    console.error("Notification trigger matrix check FAILED:");
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log("Notification trigger matrix check passed.");
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "20_current_baseline.md"), baselineMd);
writeFileSync(join(OUT_DIR, "20_current_baseline.csv"), baselineCsv);
writeFileSync(join(OUT_DIR, "21_trigger_matrix.md"), matrixMd);
writeFileSync(join(OUT_DIR, "21_trigger_matrix.csv"), matrixCsv);

console.log(`Active events: ${active.length}`);
console.log(`Unwired active events: ${metrics.active_no_trigger_call_site}`);
console.log(`Wired but never executed: ${metrics.active_wired_never_dispatched}`);
console.log(`Deactivated: ${inactive.length}`);
console.log(`Wrote baseline + trigger matrix to ${OUT_DIR}`);
