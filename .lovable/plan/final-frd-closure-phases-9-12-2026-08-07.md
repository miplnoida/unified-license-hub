# Final FRD Closure — Phases 9–12

Phases 1–8 stay frozen. Below is what the current HEAD actually has, the proven gap, and the work.

## What already exists (verified in this repo)

- Notifications: `notifications`, `notification_dispatch_log`, an outbox + workers (`process-notification-outbox`, `notification-email-retry-worker`, `notification-failure-sweep`, `notification-delivery-webhook`), admin screens (Notification History, Channel Health, Events, Templates), and a per-user preference matrix.
- Exports: `audit_export_jobs` plus the `audit-export` edge function, `record_export_intent` permission gate, and `src/lib/exportAudit.ts` used by client-side downloads.
- Executive dashboard: `SystemicRiskPanels.tsx` renders the systemic risk heatmap and the Twin Peaks panel.

## Proven gaps

1. Delivery truthfulness — the dispatch log's status vocabulary is `queued/processing/sent/delivered/failed/bounced/skipped`. There is no `SENT_TO_PROVIDER` vs `DELIVERED` distinction, no `RETRYING`, `DEAD_LETTER`, or `PROVIDER_NOT_CONFIGURED` state, so a successful API call can read as "Delivered".
2. No immutable rendered-content snapshot guarantee tied to template version on every consequential send.
3. No per-object communication timeline for application / F&P / prudential action / complaint / investigation / enforcement.
4. Data lineage: no lineage viewer, no lineage RPC, no lineage node contract anywhere in `src/` or `supabase/` (only an unrelated mention in ComplianceAuditLogs).
5. Export registry is audit-only: no REQUESTED/GENERATING/COMPLETED/FAILED lifecycle for all governed exports, no scope/period/filters contract enforced server-side, no admin export-history screen driven by it.
6. Prudential heatmap proxy confirmed: the "prudential" column in `SystemicRiskPanels.tsx` counts `conduct_alerts`, and empty cells render "no data" without a truthful INSUFFICIENT_DATA state or a defined severity methodology.

## Phase 9 — Communication lifecycle

- Migration: extend the dispatch log into the canonical communication registry — add module, event code, related object type/id, recipient destination, provider reference id, `requested_at` / `sent_to_provider_at` / `delivered_at` / `failed_at`, failure category, retry count, correlation id, and a `communication_state` enum (QUEUED, SENT_TO_PROVIDER, DELIVERED, FAILED, RETRYING, DEAD_LETTER, PROVIDER_NOT_CONFIGURED). Backfill existing rows to the closest truthful state; keep the legacy `status` column populated so current screens keep working.
- Persist `template_id`, `template_version`, and a frozen `rendered_subject` / `rendered_content` snapshot at send time; historical rows never re-render from the live template.
- Workers: outbox/dispatch sets SENT_TO_PROVIDER (never DELIVERED); `notification-delivery-webhook` promotes to DELIVERED/FAILED from real provider callbacks; missing provider config records PROVIDER_NOT_CONFIGURED; retries set RETRYING with attempt number/time/error category and exhaustion sets DEAD_LETTER.
- Operator surface: dead-letter queue view with attempt history and a resend action, on the existing Notification History / Channel Health admin pages.
- Preferences: mark mandatory regulatory/security event keys non-suppressible server-side so preferences cannot block them.
- New `CommunicationTimeline` component + `communication_timeline(object_type, object_id)` RPC that authorizes through the parent object, mounted on application, F&P assessment, prudential supervisory action, complaint, investigation, and enforcement detail pages.
- Event matrix revalidation across licensing, SLA, F&P, prudential, complaints, investigation, enforcement, supervisory actions — register only missing events, no duplicates.
- Tests (pgTAP + Vitest): queue creation, provider success, provider failure, provider not configured, retry, dead letter, template v1 retention, mandatory bypass, cross-entity RLS denial, direct-ID denial.

## Phase 10 — Lineage + export governance

- Three lineage RPCs, each returning the node contract (object type, id/reference, version, calculated time, actor/system, source record + version, rule + rule version, resulting value/status, source route):
  - Prudential: return version → field value → ratio → threshold evaluation → breach/EWI → CAMELS/assessment → supervisory action.
  - Conduct: complaint/source → alert or surveillance signal → disposition → investigation → finding → enforcement.
  - Fit & Proper: PQ version → screening run/result → assessment → committee decision → determination → condition.
  - Each RPC resolves nodes only from rows the caller can read (no SECURITY DEFINER bypass of source RLS).
- Lineage viewer page + graph/chain component with drill-through links, reachable from prudential entity profile, complaint/investigation, and F&P assessment.
- Export registry: extend `audit_export_jobs` with the REQUESTED/GENERATING/COMPLETED/FAILED lifecycle, role, entity/regulator scope, filters, period range, correlation id, failure reason; route all governed exports (reports, audit, registry downloads) through it via a shared server helper.
- Export endpoints re-check module permission, entity scope, and regulator scope server-side, and apply the existing sensitive-field redaction policy to generated files.
- Admin export-history screen: actor, export type, filters/scope, row count, timestamps, status, failure, file reference where permitted.
- Tests: three lineage chains, inaccessible lineage source, export success/failure, registry entry, direct endpoint denial, redaction.

## Phase 11 — Dashboard residuals

- Replace the heatmap's conduct proxy with a `prudential_sector_risk()` aggregation over genuine prudential evidence: active ratio breaches, severe EWIs, CAMELS/assessment risk, financial-group risk signals, prudential supervisory actions.
- Explicit documented methodology mapping evidence to CRITICAL / HIGH / MEDIUM / LOW, plus INSUFFICIENT_DATA when evidence is absent — never LOW-by-default, never conduct values in a prudential column.
- KPI reconciliation: each executive KPI's drilldown uses the same predicate as the headline number; deterministic-fixture reconciliation tests for licensing, F&P, prudential, conduct, investigation, enforcement, SLA.
- Twin Peaks panel keeps regulator A position, regulator B position, disagreement, aligned, pending coordination as separate values.
- Report/export screens: confirm filters, as-of period, entity, regulator, status, generated timestamp/by, provenance, PDF + CSV/XLSX, and that the export payload equals the filtered dataset on screen, with a Phase 10 registry entry.

## Phase 12 — Revalidation

- Re-walk every FRD row against HEAD on the UI / backend / security / governance / communication / verification axes, scoring only IMPLEMENTED — MANUAL VERIFICATION REQUIRED, PARTIAL, or MISSING; iterate on each PARTIAL/MISSING until both are zero.
- Full regression: TypeScript, production build, Vitest, pgTAP, Deno edge tests, RBAC oracles, RLS persona tests, integration tests — failures classified as new FRD regression / existing debt / environment, with new regressions fixed.
- Deliverables: the final requirement matrix report and a manual verification pack grouped by module (route, persona, preconditions, steps, expected UI, expected DB state, negative/security case).

## Sequencing

Phase 9, then 10, then 11, then 12 — stopping after each phase for your manual verification. No changes to workflow diagnostics or the frozen Phase 1–8 systems unless a Phase 9–12 integration defect proves the dependency.
