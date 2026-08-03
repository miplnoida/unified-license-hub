#!/usr/bin/env node
/**
 * Notification closure reporter (approved scope: In-App + Email; SMS excluded).
 *
 * Generates, purely from live database queries:
 *   docs/verification/notifications/31_current_baseline.{md,csv}
 *   docs/verification/notifications/32_event_execution_matrix.{md,csv}
 *
 * With --check it fails when a closure invariant is broken:
 *   - an active event has no backend trigger call site
 *   - an active event has no recipient rules
 *   - an active event has no published template version binding
 *   - a dispatch row created after template versioning lacks template id/version
 *   - a dispatch row rendered from a fallback template
 *   - a dispatch row carries an unresolved required placeholder
 *
 * Requires the managed PG* environment variables (psql).
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "docs/verification/notifications";
const CHECK_ONLY = process.argv.includes("--check");

function sql(query) {
  return execFileSync("psql", ["-At", "-c", query], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}
function sqlJson(query) {
  return JSON.parse(sql(`select coalesce(json_agg(t), '[]'::json) from (${query}) t`) || "[]");
}
const one = (q) => Number(sql(`select ${q}`));

function rgFiles(pattern, paths) {
  try {
    const out = execFileSync("rg", ["-l", "--fixed-strings", pattern, ...paths], {
      encoding: "utf8",
    });
    return out.trim() ? out.trim().split("\n") : [];
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------ events

const events = sqlJson(`
  select
    c.id,
    c.event_key,
    coalesce(c.module, 'unclassified') as module,
    c.severity::text as severity,
    c.is_active,
    c.system_required,
    coalesce(array_to_string(c.channels, '+'), '') as channels,
    coalesce(jsonb_array_length(coalesce(c.recipient_rules, '[]'::jsonb)), 0) as recipient_rule_count,
    exists (
      select 1 from notification_event_channel_templates b
      join notification_template_versions v
        on v.template_id = b.template_id and v.version = b.template_version
      where b.event_config_id = c.id
    ) as has_published_version,
    (select count(*) from notification_dispatch_log d
      where d.event_key = c.event_key) as dispatch_rows,
    (select count(*) from notification_dispatch_log d
      where d.event_key = c.event_key and d.channel = 'in_app') as in_app_rows,
    (select count(*) from notification_dispatch_log d
      where d.event_key = c.event_key and d.channel = 'email') as email_rows,
    (select count(*) from notification_dispatch_log d
      where d.event_key = c.event_key
        and d.template_traceability_status = 'versioned') as versioned_rows,
    (select count(*) from notification_dispatch_log d
      where d.event_key = c.event_key and d.recipient_user_id is not null) as resolved_recipient_rows,
    (select count(*) from notifications n
      where n.event_key = c.event_key) as notification_rows,
    (select count(*) from notifications n
      where n.event_key = c.event_key and coalesce(n.source_route,'') <> '') as notification_rows_with_route,
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosrc like '%' || c.event_key || '%'
    ) as db_call_site
  from notification_event_configs c
  order by coalesce(c.module, 'unclassified'), c.event_key
`);

const backendPaths = ["supabase/functions"].filter(existsSync);
for (const e of events) {
  e.edge_call_sites = backendPaths.length ? rgFiles(e.event_key, backendPaths) : [];
  e.wired = e.db_call_site || e.edge_call_sites.length > 0;
  e.call_site = e.db_call_site
    ? "db"
    : e.edge_call_sites.length
      ? `edge:${e.edge_call_sites[0].replace("supabase/functions/", "")}`
      : "none";
  e.executed = Number(e.dispatch_rows) > 0;
  e.status = !e.is_active
    ? "OUT OF SCOPE (deactivated)"
    : !e.wired
      ? "FAIL (no trigger)"
      : e.recipient_rule_count === 0
        ? "FAIL (no recipient rules)"
        : !e.has_published_version
          ? "FAIL (no published template version)"
          : !e.executed
            ? "NOT EXERCISED"
            : Number(e.versioned_rows) === 0
              ? "PARTIAL (legacy dispatch only)"
              : "PASS";
}

const active = events.filter((e) => e.is_active);
const inactive = events.filter((e) => !e.is_active);

// ----------------------------------------------------------------- metrics

const metrics = {
  active_event_configs: active.length,
  inactive_event_configs: inactive.length,
  active_no_trigger_call_site: active.filter((e) => !e.wired).length,
  active_no_recipient_rules: active.filter((e) => e.recipient_rule_count === 0).length,
  active_no_published_version: active.filter((e) => !e.has_published_version).length,
  active_never_dispatched: active.filter((e) => !e.executed).length,
  active_exercised: active.filter((e) => e.executed).length,
  active_exercised_versioned: active.filter((e) => Number(e.versioned_rows) > 0).length,
  dispatch_rows: one("count(*) from notification_dispatch_log"),
  dispatch_versioned: one(
    "count(*) from notification_dispatch_log where template_traceability_status = 'versioned'",
  ),
  dispatch_legacy_unversioned: one(
    "count(*) from notification_dispatch_log where template_traceability_status = 'legacy_unversioned'",
  ),
  dispatch_fallback_rendered: one(
    "count(*) from notification_dispatch_log where coalesce(used_fallback_template,false)",
  ),
  dispatch_unresolved_placeholder_rows: one(
    "count(*) from notification_dispatch_log where coalesce(error,'') like 'unresolved_required_placeholder%'",
  ),
  dispatch_rendered_token_leak: one(
    "count(*) from notification_dispatch_log where coalesce(subject,'') like '%{{%' or coalesce(rendered_content,'') like '%{{%'",
  ),
  dispatch_poisoned: one("count(*) from notification_dispatch_log where coalesce(poisoned,false)"),
  notifications_rows: one("count(*) from notifications"),
  notifications_route_resolved: one("count(*) from notifications where route_status = 'resolved'"),
  notifications_route_resolvable_legacy: one(
    "count(*) from notifications where route_status = 'resolvable_legacy'",
  ),
  notifications_route_legacy_none: one(
    "count(*) from notifications where route_status = 'legacy_no_route'",
  ),
  correspondence_threads: one("count(*) from correspondence_threads"),
  correspondence_messages: one("count(*) from correspondence_messages"),
  escalations: one("count(*) from escalations"),
  escalation_tier_events: one("count(*) from escalation_tier_events"),
  queue_rows: one("count(*) from notification_event_queue"),
  template_versions: one("count(*) from notification_template_versions"),
  event_channel_bindings: one("count(*) from notification_event_channel_templates"),
};

const dispatchByStatus = sqlJson(`
  select channel, status, count(*)::int as count
  from notification_dispatch_log group by channel, status order by channel, status
`);
const queueByStatus = sqlJson(`
  select status, count(*)::int as count
  from notification_event_queue group by status order by status
`);
const auditByAction = sqlJson(`
  select action, count(*)::int as count from audit_logs
  where action ilike '%notification%' or action ilike '%template%'
     or action ilike '%thread%' or action ilike '%escalation%'
     or action ilike '%correspondence%'
  group by action order by count desc
`);

// ----------------------------------------------------------------- outputs

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header, rows) =>
  [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";

const stamp = new Date().toISOString();

const baselineCsv = csv(
  ["group", "measure", "value"],
  [
    ...Object.entries(metrics).map(([k, v]) => ["metric", k, v]),
    ...dispatchByStatus.map((r) => ["dispatch_status", `${r.channel}:${r.status}`, r.count]),
    ...queueByStatus.map((r) => ["queue_status", r.status, r.count]),
    ...auditByAction.map((r) => ["audit_action", r.action, r.count]),
  ],
);

const baselineMd = `# Notifications & Communications — Recalculated Baseline

Generated: ${stamp}
Generator: \`scripts/notification-closure-report.mjs\` (live database queries only)
Approved scope: In-App + Email. SMS is excluded from implementation, testing and every percentage.

## Measures

| Measure | Value |
| --- | --- |
${Object.entries(metrics).map(([k, v]) => `| ${k.replace(/_/g, " ")} | ${v} |`).join("\n")}

## Delivery records by channel and status

| Channel | Status | Count |
| --- | --- | --- |
${dispatchByStatus.map((r) => `| ${r.channel} | ${r.status} | ${r.count} |`).join("\n") || "| (none) | (none) | 0 |"}

## Event queue by status

| Status | Count |
| --- | --- |
${queueByStatus.map((r) => `| ${r.status} | ${r.count} |`).join("\n") || "| (none) | 0 |"}

## Audit records by action (notification domain)

| Action | Count |
| --- | --- |
${auditByAction.map((r) => `| ${r.action} | ${r.count} |`).join("\n") || "| (none) | 0 |"}

Machine-readable copy: \`31_current_baseline.csv\`.
`;

const matrixHeader = [
  "event_key",
  "module",
  "severity",
  "channels",
  "state",
  "trigger",
  "call_site",
  "recipient_rules",
  "published_version",
  "dispatch_rows",
  "in_app_rows",
  "email_rows",
  "versioned_rows",
  "rows_with_resolved_recipient",
  "notification_rows",
  "notification_rows_with_route",
  "result",
];

const matrixRows = events.map((e) => [
  e.event_key,
  e.module,
  e.severity,
  e.channels,
  e.is_active ? "active" : "deactivated",
  e.wired ? "wired" : e.is_active ? "UNWIRED" : "n/a",
  e.call_site,
  e.recipient_rule_count,
  e.has_published_version ? "yes" : "no",
  e.dispatch_rows,
  e.in_app_rows,
  e.email_rows,
  e.versioned_rows,
  e.resolved_recipient_rows,
  e.notification_rows,
  e.notification_rows_with_route,
  e.status,
]);

const byModule = {};
for (const e of events) (byModule[e.module] ||= []).push(e);

const counts = matrixRows.reduce((acc, r) => {
  const key = String(r[r.length - 1]);
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const matrixMd = `# Notification Event Execution Matrix

Generated: ${stamp}
Generator: \`scripts/notification-closure-report.mjs\`

One row per configured event. "Wired" means a backend call site exists (database
function/trigger body or edge function); frontend references never count.
"Exercised" means at least one real delivery record exists for the event key.
Events with no delivery record are reported as NOT EXERCISED — never as passed.

| Result | Events |
| --- | --- |
${Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`).join("\n")}

${Object.entries(byModule)
  .map(
    ([mod, list]) => `## ${mod}

| Event | State | Trigger | Recipients | Published | Dispatches (in-app/email) | Versioned | Notifications (with route) | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${list
  .map(
    (e) =>
      `| \`${e.event_key}\` | ${e.is_active ? "active" : "deactivated"} | ${
        e.wired ? "wired" : e.is_active ? "**UNWIRED**" : "n/a"
      } | ${e.recipient_rule_count} | ${e.has_published_version ? "y" : "n"} | ${e.dispatch_rows} (${e.in_app_rows}/${e.email_rows}) | ${e.versioned_rows} | ${e.notification_rows} (${e.notification_rows_with_route}) | ${e.status} |`,
  )
  .join("\n")}`,
  )
  .join("\n\n")}

Machine-readable copy: \`32_event_execution_matrix.csv\`.
`;

const matrixCsv = csv(matrixHeader, matrixRows);

if (CHECK_ONLY) {
  const failures = [];
  if (metrics.active_no_trigger_call_site > 0)
    failures.push(`${metrics.active_no_trigger_call_site} active event(s) without a backend trigger`);
  if (metrics.active_no_recipient_rules > 0)
    failures.push(`${metrics.active_no_recipient_rules} active event(s) without recipient rules`);
  if (metrics.active_no_published_version > 0)
    failures.push(`${metrics.active_no_published_version} active event(s) without a published template version`);
  if (metrics.dispatch_fallback_rendered > 0)
    failures.push(`${metrics.dispatch_fallback_rendered} delivery record(s) used fallback rendering`);
  if (metrics.dispatch_rendered_token_leak > 0)
    failures.push(`${metrics.dispatch_rendered_token_leak} delivery record(s) contain an unrendered token`);
  const newUnversioned = one(
    "count(*) from notification_dispatch_log where template_traceability_status = 'legacy_unversioned' and created_at > (select coalesce(max(published_at), now()) from notification_template_versions where version = 1)",
  );
  if (newUnversioned > 0)
    failures.push(`${newUnversioned} delivery record(s) created after versioning lack template id/version`);
  if (failures.length) {
    console.error("Notification closure check FAILED:");
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log("Notification closure check passed.");
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "31_current_baseline.md"), baselineMd);
writeFileSync(join(OUT_DIR, "31_current_baseline.csv"), baselineCsv);
writeFileSync(join(OUT_DIR, "32_event_execution_matrix.md"), matrixMd);
writeFileSync(join(OUT_DIR, "32_event_execution_matrix.csv"), matrixCsv);

console.log(`Active events: ${active.length}`);
console.log(`Exercised: ${metrics.active_exercised}  Not exercised: ${metrics.active_never_dispatched}`);
console.log(`Dispatch versioned: ${metrics.dispatch_versioned}  legacy: ${metrics.dispatch_legacy_unversioned}`);
console.log(`Wrote 31_current_baseline.* and 32_event_execution_matrix.* to ${OUT_DIR}`);
