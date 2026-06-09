# Make Reports & Analytics Fully Dynamic

Refactor the existing `src/pages/reports/*` module so every tab reads from database metadata instead of hardcoded frontend constants. No new module — patch in place. Existing constants stay as fallback/seed only.

## 1. Database Migration (one new migration)

New metadata tables (RLS enabled, GRANTs included, idempotent `create table if not exists` + `insert ... on conflict do update`):

- **report_sources** — datasets (source_key, table_name, module, safe_columns[], default_columns[], sensitive_columns[], max_preview_rows, supports_ad_hoc, supports_scheduling, source_routes jsonb)
- **report_filters** — filter definitions per source (filter_key, label, filter_type, column_name, operator, options_source, options_static, options_table/value/label, depends_on_filter)
- **report_status_options** — status/option values per source+filter
- **report_definitions** — extend existing or create; adds `source_key`, `query_config`, `filter_config`, `required_computed_columns`, `export_formats[]`, `report_type`
- **report_dashboard_layouts** — `executive-overview` default
- **report_dashboard_widgets** — KPI/chart metadata with metric_config, query_config, chart_config, drilldown_report_slug, drilldown_filters
- **report_option_sets** — schedule_frequency, export_format, sort_direction, date_preset, report_run_status
- **report_runtime_config** — feature flags

RLS: read for authenticated users with report module access (via existing `has_role`/permission helper); write for `admin`/`super_admin`. No `USING (true)`.

Seed data:
- All current `REPORT_DEFINITIONS` from `reportDefinitions.ts` → `report_definitions`
- All 8 sources currently in `ReportSource` union → `report_sources` with safe_columns matching current `COLUMN_OPTIONS_BY_SOURCE`
- Current `STATUS_OPTIONS_BY_SOURCE` → `report_status_options`
- All 8 KPIs + 6 charts from `ReportsOverview.tsx` → `report_dashboard_widgets` under `executive-overview` layout
- Option sets for frequency/export/sort/date preset/run status
- Common filters (preset, dateFrom/To, status) + per-source filters listed in spec

## 2. Frontend Metadata Layer

New files:
- `src/pages/reports/services/reportMetadataService.ts` — DB fetchers with static-fallback on empty/error
- `src/pages/reports/hooks/useReportMetadata.ts` — React Query hooks (`useReportSources`, `useReportDefinitions`, `useReportFilters`, `useReportOptions`, `useDashboardWidgets`, `useReportMetadataBundle`)

Fallback strategy: if a query throws or returns empty, return the existing static constant. Single warning logged in dev.

## 3. Refactor Components

- **ReportLibrary.tsx** — `useReportDefinitions()`; derive categories from data; permission filter via `hasModuleAccess(def.module)`; favorites keyed by slug.
- **AdHocReportBuilder.tsx** — replace `SOURCES` with `useReportSources()`; render filter controls from `useReportFilters(source)`; status dropdowns from `report_status_options`; date presets / sort dir from option sets; columns from `source.safe_columns`. Dependent filters (subSector ← sector) honored via `depends_on_filter`.
- **ReportsOverview.tsx** — replace entire hardcoded grid with `<ReportWidgetRenderer>` map over `useDashboardWidgets('executive-overview')`. New widget components:
  - `components/widgets/ReportWidgetRenderer.tsx`
  - `components/widgets/KpiWidget.tsx`
  - `components/widgets/ChartWidget.tsx` (bar/pie/line/area via `chart_config.kind`)
  - `components/widgets/TableWidget.tsx`
  - `hooks/useWidgetData.ts` — runs widget via shared report-generator (count/sum/group-by metric_config); drilldown calls existing `generateReport()` with widget's `drilldown_report_slug` + `drilldown_filters`.
- **ReportHistory.tsx** — status filter from `report_option_sets.report_run_status` (fallback to derived); export buttons from `export_format` option set.
- **ReportSchedules.tsx** — frequency/export options from option sets; report selector merges `report_definitions` + history + templates.
- **ReportPreviewDialog.tsx** — column labels from source metadata; summary cards iterate `summary` keys dynamically; "Open record" link uses `report_sources.source_routes`.

## 4. Backend (Edge Functions)

`supabase/functions/_shared/report-generator.ts`:
- Add `loadReportSource(sourceKey)`, `loadReportDefinition(slug)`, `loadReportFilters(sourceKey)` — query metadata tables with service-role client.
- `ALLOWED_SOURCES`, `REPORT_SLUG_SOURCE_MAP`, `COLUMN_OPTIONS_BY_SOURCE` become **fallback only** — DB metadata wins.
- `applyConfiguredFilters()` validates each requested filter against `report_filters` rows; unknown filters silently dropped.
- `getEffectiveColumnsFromMetadata()` intersects requested columns with `safe_columns`, strips `sensitive_columns`, adds `required_computed_columns`.
- Specialized `decorate()` slug processors (app-sla, lic-expiry, ret-overdue, fee-trend) kept as a registry — still callable when `definition.query_config.processor` names them.

New Edge Function `supabase/functions/run-report-widget/index.ts`:
- Input: `{ widgetId }` or `{ layoutKey, widgetKey }`.
- Loads widget metadata, validates source/columns, runs aggregation per `metric_config` (`{ type: 'count'|'sum'|'avg'|'ratio'|'group_by_month'|'group_by_status', column?, filters? }`), returns `{ value, series }`.
- RBAC: same `userCanRunReports` check as `generate-report`.

`generate-report/index.ts`: switch source/column/filter validation to DB-backed helpers; behavior preserved for existing callers.

## 5. Tests

Extend `src/test/reportsModule.test.ts`:
- Metadata service falls back to static when DB empty.
- Categories derive from definitions array.
- Filter validation rejects unknown keys.
- Sensitive columns stripped even when requested.
- Source validation rejects unknown source_key.
- Widget data hook returns expected shape for count/sum/group metric configs.

## 6. Out of Scope (explicit)

- No admin CRUD UI for metadata this pass — service-layer functions only with TODO marker.
- No removal of fallback constants.
- No route changes, no permission model changes.

## Technical notes

- Migration uses `if not exists` everywhere; seeds use `on conflict (...) do update set ...` so it's idempotent on re-run.
- All new tables get `GRANT SELECT ON ... TO authenticated; GRANT ALL ... TO service_role;` immediately after `CREATE TABLE` and before `ENABLE ROW LEVEL SECURITY`.
- React Query keys namespaced `['reports','metadata', ...]` with 5min staleTime since metadata changes rarely.
- Widget aggregation runs client-side via existing `supabase` client for read-only counts (avoids needing the new edge function for v1); edge function added for future server-side enforcement and listed as preferred path in code comments.
- Existing `reportDefinitions.ts`, `STATUS_OPTIONS_BY_SOURCE`, `COLUMN_OPTIONS_BY_SOURCE` remain importable as fallback re-exports.

## Acceptance verification

- `npm run build` clean.
- `vitest` suite (existing 33 + ~6 new) green.
- Manual: `/reports` Overview/Library/Builder/History/Schedules render from seeded metadata; deactivating a `report_definitions` row hides it without code change; adding a row to `report_dashboard_widgets` adds a card.

Commit message: `Make Reports & Analytics fully dynamic`
