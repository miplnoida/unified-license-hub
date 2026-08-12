# Supervisory AI Reports Hub

One internal page that consolidates AI analyses already generated across the supervisory lifecycle. Read-only: view, search, filter, compare, then jump to the authoritative source module. No new AI generation, no workflow actions, no changes to existing AI panels.

## What exists today (verified)

- `ai_insights` holds the newer advisory analyses. Current rows cover prudential (risk interpretation, trend commentary, peer divergence, EWI priority, heatmap movement, portfolio summary), examination, enforcement, complaints, cross-module and executive analysis types.
- Licensing application AI lives in a separate table `application_ai_assessments`, read through `can_read_application(...)` and blocked for external users.
- Fit & Proper AI/screening output lives in `fp_screening_runs` / `fp_assessments` (read via `can_read_fp_assessment` / `can_read_fp_individual`), surfaced by the existing `/fpa/ai-analysis` page. It is not in `ai_insights`.
- Presentation helpers already exist: `src/lib/ai/advisoryAi.ts` (payload shape, section order, confidence labels, disclaimer, fingerprint), `src/lib/prudential/advisoryAi.ts`, `src/lib/licensing/aiAssessmentLabels.ts`, `src/lib/fp/providerStates.ts`.
- An older, narrower page already exists at `/analytics/ai-insights` ("AI Insights Hub") — it is a review/accept-reject queue over `ai_insights`, not a lifecycle report hub. It stays as is.

Security note verified against live policies: `ai_insights` has a permissive `SELECT` policy that allows any holder of `report_management.view` (or `executive_oversight.receive_ils`) to read **every** insight regardless of module, alongside the stricter `can_view_advisory_ai(module, source_modules)` policy. Relying on RLS alone would therefore let a prudential-only-plus-reporting user see complaint/enforcement reports, which the hub must not do.

## Approach

1. **Server-side read gate.** Add a read-only `security definer` RPC (e.g. `supervisory_ai_reports_page`) that returns summary rows from `ai_insights` filtered per row by the existing `can_view_advisory_ai(module, source_modules)` — stricter than the permissive policy, reusing the hardened cross-module source-isolation logic unchanged. It returns summary fields only (id, module, analysis_type, scope, scope_id, entity_id, object_type/id, period_key, generated_at, generated_by, provider_state, input_fingerprint, feedback, payload summary/confidence/limitations flags) plus a total count for pagination. Full payload is fetched per report on open.
2. **Licensing adapter.** Query `application_ai_assessments` directly (RLS already application-scoped) with the same date/entity/search filters, joined to the application reference/entity name. No migration of that data.
3. **Fit & Proper adapter.** Query the existing screening/assessment AI records under their current FPA visibility rules; no admin shortcut. If a reliable per-run AI summary is not exposed by current policies for list use, the F&P section reports "not integrated" in the completion report rather than being force-fitted.
4. **Normalization layer** `src/lib/ai/reportHub.ts`: `SupervisoryAiReport` view model, module/lifecycle label maps, analysis-type friendly labels, freshness derivation (stored fingerprint vs. unknown → "Current" / "May be outdated"), badge derivation (Advisory, Limited evidence, Flagged for review), and deterministic `sourceRoute` builders from module + record type + id using existing routes (`/applications/:id`, `/prudential/entities/:id`, `/prudential/examinations/:id`, `/complaints/:id`, `/enforcement/:id`, `/conduct/entities/:id`, executive dashboard).
5. **Data hook** `src/hooks/useSupervisoryAiReports.ts`: one query per source (insights / licensing / F&P) so each source has independent loading/empty/error state; merges, dedupes by persistent record id, sorts newest first, paginates (25/page with "Load more"). Partial failure shows a per-section "reports could not be loaded — Try again" instead of zero counts. Modules the user is not authorized for produce no rows, no counts and no labels.
6. **Page** `src/pages/analytics/SupervisoryAiReports.tsx` with components under `src/components/ai-reports/`: `AiReportCard`, `AiReportDetail` (drawer reusing the existing payload section helpers), `AiReportFilters`, `AiLifecycleView`, `AiEntityTimeline`.

## Page behaviour

- Header: "Supervisory AI Reports" + concise advisory disclaimer (advisory only; official decisions remain in source modules).
- Overview counts (available / generated this week / may be outdated / limited evidence) computed only from authorized rows, plus per-module counts.
- Search: entity name, application number, examination reference, complaint number, enforcement case number, report title (plain text/database search).
- Filters: module, entity, analysis type, generated date (Today / 7 / 30 days / custom / all), confidence, freshness, provider state; optional "Include failed analyses" for admin-type users, off by default.
- View toggle: **Lifecycle** (Licensing & Entry → Prudential → Examination & Inspection → Market Conduct & Complaints → Enforcement → Cross-module → Executive) and **By module**.
- Cards: title, source-module badge, entity/record subject, generated timestamp, freshness + confidence badges, one-line summary, `View report` and `Open <source record>`.
- Latest per subject + analysis type marked "Latest" with "View previous versions (n)" expanding history; nothing deleted.
- Detail drawer: title, source module, subject, generated date, period, summary, key observations, issues/risks, evidence, suggested focus areas, draft sections, confidence, limitations, freshness explanation with "Open source to refresh", and existing feedback status. No generate/refresh button, no workflow actions.
- Entity mode: selecting an entity shows its reports grouped by supervisory area plus an optional chronological "Related supervisory AI reports for this entity" timeline (no causal claims).
- Deep links: `?entity=`, `?module=`, `?report=`, `?type=`.
- Empty state is permission-aware and never names inaccessible modules.
- Responsive card/list layout, labelled filters, keyboard-accessible drawer, non-color-only badges.

## Navigation & route

- Route `/analytics/ai-reports` added to `src/routes/dashboardRoutes.tsx` with lazy loading, internal-only guard and a module gate consistent with existing analytics routes.
- One nav item "Supervisory AI Reports" added to the analytics/intelligence area of `src/config/navigation.tsx`, internal roles only — not added anywhere else, not exposed to applicant/licensee portals.
- Existing `/analytics/ai-insights` page and every module AI panel remain untouched.

## Technical notes

- Only backend change is the read-only RPC + grants; no table changes, no data migration, no writes to any supervisory table. Optional feedback write reuses the existing `ai_insights` feedback update path.
- No AI generation is invoked from this page; feature flags stay authoritative for the source modules.
- Verification: TypeScript, lint, existing tests, plus manual checks for route guard, menu visibility, module/entity/date filtering, staleness badges, history expansion, source links, partial-failure state and a prudential-only persona seeing no complaint/enforcement reports or counts.
