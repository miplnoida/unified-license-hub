# Reports & Analytics — Production Completion Plan

This is a large multi-area task. I'll deliver it in 5 phases, each ending in a working build. I will not duplicate the existing module — only extend `src/pages/reports/*`, `supabase/functions/*`, and add migrations.

## Phase 1 — Backend schema, RLS, types

1. Migration: create `report_definitions`, `report_runs`, `report_run_rows`, `report_run_files`, `report_schedules` (upgrade existing), `report_logs` (upgrade existing), `report_favorites`, `report_templates`, with indexes + `updated_at` triggers.
2. Preserve existing `reports`, `report_schedules`, `report_logs` data:
   - If old `reports` table exists, keep it; add a one-time backfill into `report_runs` (best-effort), and create a compatibility view `reports_compat` for read-only legacy access.
   - For `report_schedules`/`report_logs`: add missing columns idempotently (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
3. RLS using existing helpers (`has_role`, dynamic permissions). Admin/report_management = full; owner = own rows; logs insertable by self, readable by admin.
4. Update `src/pages/reports/types.ts` with full type set.

## Phase 2 — Server-side generator + domain logic

1. `supabase/functions/generate-report/index.ts`:
   - Auth via `getClaims`, allowlist of sources, preview/generate modes, row caps (100/10000), redaction, filter application, selected columns, group by, sort.
   - Writes `report_runs` + chunked `report_run_rows`, inserts `report_logs` `generated`.
2. Per-slug specialized generators (aging buckets, SLA breach, expiry windows, overdue defaulters, compliance scorecard, revenue trends, complaint resolution).
3. `src/pages/reports/services/reportService.ts`: prefer edge function; fallback to client query for preview only. Map old `reports` rows into history view.

## Phase 3 — Scheduler + Run Now + Email placeholder

1. `supabase/functions/run-scheduled-reports/index.ts`: pull due schedules, invoke generator, update `last_run_at/next_run_at/last_status`, log actions, increment retries.
2. `calculateNextRunAt` shared util (server + client) with unit tests.
3. Wire **Run Now** in `ReportSchedules.tsx` (invokes scheduled runner with `scheduleId`).
4. Email: if a `send-notification` function exists, call it with summary + signed download URL; else mark `generated_email_pending` and surface UI badge "Email integration pending". Add cron setup comment in migration.

## Phase 4 — UI completion

1. **AdHocReportBuilder**: real filter dropdowns (Regulator, Sector/Sub-sector, Service, Licensee, Status enums, SLA, Payment status, Risk) loaded from existing master data hooks; gracefully hide unsupported. Sort direction asc/desc. Pass `selectedColumns/groupBy/sortBy` through to generator.
2. **ReportLibrary**: filter by `module` against `useUserDynamicPermissions`/`has_permission`; admin bypass. Backend favorites via `report_favorites` with localStorage fallback. "Favorites" filter.
3. **Saved Templates**: tab in builder, save/load/delete against `report_templates`.
4. **ReportPreviewDialog**: render filters, selected columns, group by, sort by, summary cards, paginated table, drilldown "Open source record" for known sources. Export buttons log to `report_logs`.
5. **PDF / Print**: implement printable export via dedicated print stylesheet + `window.print()`, button labeled "Print / PDF". (No new heavy deps.)
6. **ReportsOverview** drilldowns: clicking KPI/segment opens preview dialog with pre-filtered run via generator.
7. **ReportHistory**: read from `report_runs` (with legacy `reports` fallback); add status/category/date filters; show duration/error.

## Phase 5 — Tests + cleanup

- Vitest: `calculateNextRunAt`, `sanitizeCsvValue`, `flattenRecord`, `selectedColumns` filter, slug uniqueness, permission filter, source allowlist rejection.
- Build pass.

## Technical Notes

- No new npm deps. PDF via print stylesheet.
- All edge functions: CORS via `npm:@supabase/supabase-js@2/cors`, JWT validated in code, zod-style validation manual.
- Row storage: chunked inserts into `report_run_rows` (1000/batch) to avoid timeouts; for >5k rows produce CSV file into `storage` bucket `report-exports` and reference from `report_run_files`.
- Storage bucket `report-exports` (private) created via `storage_create_bucket`; signed URLs 24h.
- Compatibility: old `reports` rows surfaced in history via `unionAll` mapper in `useReports` hook; new generation always goes through `report_runs`.

## Out of scope (explicit)
- Real SMTP/email provider wiring beyond existing notification infra.
- Supabase cron auto-provisioning — instructions added in migration comments.
- Heavy charting changes on Overview (drilldowns added; layout preserved).

Shipping in that order keeps the app building after each phase. Ready to proceed if you approve.
