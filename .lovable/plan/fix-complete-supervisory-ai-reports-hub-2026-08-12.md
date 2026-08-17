# Fix & Complete Supervisory AI Reports Hub

Read-only consolidated AI report library — concept unchanged. This is a correctness pass: aggregation, pagination, counts, entity mapping, search, history, freshness, error handling, deep links, naming. No AI generation, no new AI tables, no workflow or review actions added.

## Confirmed current-state findings (verified in code and database)

- `supervisory_ai_reports_list` pages `ai_insights` only (`_limit`/`_offset`, `count(*) over ()` as `total_count`), while `useSupervisoryAiReports.ts` loads Licensing (`application_ai_assessments`) and F&P (`fp_screening_runs`) with `.limit(200)` and no paging. Merged ordering and "latest 25" are therefore not globally correct.
- `insightsTotal` is used only for `hasMore`; the "Reports available" KPI uses `reports.length` (loaded rows), and every other KPI, the Entity dropdown, the Analysis-type dropdown, history grouping and the lifecycle/module sections are all derived from the loaded page only.
- Entity mapping is unsafe: `entityId: r.entity_id ?? (module !== 'examination' ? recordId : null)` treats a complaint/enforcement/application id as an entity id. Licensing rows set `entityId: null`/`entityName: null`.
- Search mismatch: the RPC searches `title`, `analysis_type`, `payload->>'summary'` only; the placeholder promises entity/reference. The client-side filter `!term || r.source === 'ai_insights' ? true : ...` passes every `ai_insights` row because of `||`/ternary precedence.
- Custom `To` is `new Date(customTo).toISOString()` — start-of-day, excluding same-day reports.
- Subject lookups drop query errors (`const { data } = ...` + `Promise.allSettled`), so a failed lookup renders as "Subject not available" / "Freshness unknown".
- `isLoading` is the OR of all three sources, so one slow source blocks the whole page behind skeletons.
- Freshness compares `generated_at` against a single parent record `updated_at` only; F&P is hardcoded `'unknown'`.
- `legacyText()` falls back to `JSON.stringify(item)`.
- Detail drawer shows an error with no retry.
- No URL/deep-link state (`?entity=`, `?module=`, `?report=`) exists.
- `supervisory_ai_reports_list` / `supervisory_ai_report_detail` both gate every row through `can_view_advisory_ai(module, source_modules)` — this stays.
- Data check: `fp_screening_runs` has `run_type` values `manual` (25), `auto` (2), `ai_media` (2); the table holds only counters plus `provider_outcomes` jsonb and `config_snapshot`. `fp_assessments` has no AI narrative column and `ai_insights` holds no Fit & Proper rows. So there is no separate persisted F&P AI narrative — the only AI-ish payload is `provider_outcomes`.
- The page currently has exactly one `DashboardLayout` wrapper (line 226) — verified; no duplicate shell to remove, only indentation to normalize.

## Approach

### 1. One permission-aware read index (backend, read-only)

Add security-definer, read-only SQL functions. No table changes, no writes.

- `supervisory_ai_reports_index(filters..., _limit, _offset)` — a `UNION ALL` over the three existing sources, each row already carrying trusted subject metadata, then filtered, ordered by `generated_at desc` and paged with `count(*) over ()` as `total_count`, plus aggregate counts (`recent_7d`, `outdated`, `limited`) computed over the whole filtered set, not the page.
  - Row authorization per source: `ai_insights` via `can_view_advisory_ai(module, source_modules)`; licensing via the existing `can_read_application(...)` gate; F&P via the existing `can_read_fp_assessment` / `can_read_fp_individual` gates. `report_management` remains route access only — never data authority.
  - Trusted subject/entity resolution inside SQL (never from AI text):
    - prudential / cross_module / conduct / executive → `ai_insights.entity_id`, else `scope_id` when `scope='entity'`
    - examination → `examinations.entity_id`, `examinations.reference`
    - complaints → `complaints.licensee_id`, `complaints.complaint_number`
    - enforcement → `enforcement_actions.entity_id`, `enforcement_actions.case_number`
    - licensing → `applications.application_number` plus entity via the issued `licenses.application_id → holder_id` link, falling back to the canonical applicant/organisation name already used by the application detail page
    - fit_proper → `fp_individuals.full_name`, `fp_assessments.licensee_id`, assessment reference where present
    - entity display name from `licensees.name`
  - `_search` matches title, analysis type, summary **and** the resolved trusted fields (entity name, application number, examination reference, complaint number, enforcement case number, F&P subject) — no AI payload text used for routing.
  - `_entity_id` matches the resolved entity id, so entity filtering works across every lifecycle module, not just entity-scoped `ai_insights`.
  - Freshness computed in SQL from the greatest relevant source timestamp: examination (`examinations`, workpapers, findings, scoping, data requests, management responses), complaint (`complaints`, investigation tasks, evidence, RFIs, correspondence, closure/QA), enforcement (case + events/obligations/evidence), cross-module (entity + contributing source records where `source_records` identifies them), and `input_fingerprint` presence where that is the authoritative staleness marker. F&P stays `unknown` rather than guessed.
  - Normalized outputs at the boundary: `confidence` as `high|moderate|limited|null` (numeric licensing scores mapped here), and one `report_state` of `available|limited|failed|processing`.
- `supervisory_ai_report_facets(same filters)` — distinct authorized entities (id + name) and analysis types with counts, so filter dropdowns never depend on the current page.
- `supervisory_ai_report_versions(_source, _module, _analysis_type, _subject_key)` — full authorized version history for one logical report, independent of list paging. Logical identity = source + module + analysis type + scope/record (+ period/portfolio scope for portfolio analyses so unrelated portfolio reports are not grouped by a null record id).
- `supervisory_ai_report_detail` kept as-is; licensing and F&P detail keep reading their own RLS-protected tables.
- `GRANT EXECUTE ... TO authenticated` on each new function; no `anon` grants.

Explicit trade-off: one union index gives correct cross-source chronology, totals and paging, but it cannot fail per source. So the UI reports which sources are included (from a small `supervisory_ai_report_sources()` availability call) and shows list-level retry; genuinely independent progressive loading remains for facets, subject-dependent metadata, history and detail. This will be stated in the completion report as a deliberate deviation from "one query per source".

### 2. Hook rewrite (`useSupervisoryAiReports.ts`)

- `useInfiniteQuery` over the index RPC; pages **accumulate** (page 1 + 2 + 3), de-duplicated by `source + id`, keeping server order. Button label "Load older reports" then behaves as named.
- Counts come from the RPC (`total_count`, `recent_7d`, `outdated`, `limited`, per-module) — never `reports.length`. While a page is loading, KPIs show `Calculating…`; if the index or facets call failed, KPIs show `Counts incomplete`.
- Module filter narrows the source set inside the RPC, so choosing Examination does not scan Licensing/F&P.
- Client-side filtering reduced to nothing that can distort counts; the confusing `!term || source === ...` expression is deleted (search is server-side; any residual predicate is written as an explicit `if (!term) return true;` block).
- Date semantics: `from` = local start of day, `to` = **exclusive next-day boundary** (`generated_at < nextDay`), computed from local calendar dates. Applies to Today / 7 / 30 / custom.
- Separate `useReportFacets`, `useReportVersions`, `useReportSubjects` queries with real error surfaces: `isError` distinguishes "lookup failed → Try again" from "genuinely unavailable".
- `retry(...)` invalidates the exact active query keys (index, facets, versions, detail).

### 3. Page (`SupervisoryAiReports.tsx`)

- Progressive rendering: render loaded reports as soon as the first page resolves; skeletons only for the section actually loading.
- Accumulating "Load older reports" with a loaded/total indicator (`Showing 50 of 143`).
- Filters (entity, analysis type) populated from facets. Freshness/confidence options static and normalized.
- Default range stays Last 30 days but the header states "Showing reports prepared in the last 30 days" with a one-click "All available"; the heading no longer implies full history while filtered.
- Empty states split: "No reports match the current filters. [Clear filters]" vs "No AI reports have been generated yet."
- Flagged reports get a visible "Flagged for review" badge and are not presented as ordinary current advisory reports; review status is displayed read-only with an optional link to AI Insight Review. No Accept/Reject/Escalate here.
- URL state: `?entity=`, `?module=`, `?type=`, `?range=/from=/to=`, `?report=` — filters initialize from the URL and update it; opening a report deep link opens the drawer, and an unauthorized id yields the same neutral "not available" state as a missing one (no existence leak). No AI payload text in URLs.
- Layout: keep the single `DashboardLayout` wrapper and fix the indentation of its children; confirm against a sibling analytics page that there is no nested shell or double scroll container.

### 4. Detail drawer

- `Try again` inside the drawer on detail failure, with `Open source record` still available; a failed load never renders as an empty completed report.
- History list fed by `supervisory_ai_report_versions` (cross-page), labelled Latest / Previous with dates.
- `legacyText()` no longer falls back to `JSON.stringify`: unknown legacy shapes render "Additional technical details are available in the source record."; raw JSON only inside a collapsed advanced section.
- F&P detail renders the safe humanized parts of `provider_outcomes` (provider, checked-on, outcome/status, match counts) instead of only "X matches across Y checks", with no raw provider JSON, and keeps "Open Fit & Proper analysis". The Hub will label this source honestly as adverse-media screening analysis, since no separate F&P AI narrative exists in the database.
- Assignment-only users: check the existing assignment-aware authorization model and allow AI reports for records assigned to them rather than blanket-disabling the source; access is only ever granted through the existing assignment checks, never widened.

### 5. Naming

- `/analytics/ai-insights` page title and nav label change from "AI Insights Hub" to **AI Insight Review** ("Review, accept, reject or escalate AI insights requiring human disposition"). Its review workflow is untouched.
- Supervisory AI Reports keeps its single nav entry under Analytics & Reports with the subtitle "View AI analyses and reports across supervisory modules."

## Verification

- Type-check and lint; existing vitest suite.
- pgTAP-style SQL checks for the new read functions: per-module authorization (Prudential+Examination+Complaints without Enforcement sees no enforcement rows, counts, entities or history; Licensing-only persona sees only licensing), total counts vs paged rows, entity filter across modules, complaint/enforcement id never resolving as entity id.
- Browser checks: pagination accumulation with no duplicates and stable ordering; entity search "ABC Bank" style across lifecycle; searches by application number / examination reference / complaint number / enforcement case number; single-day custom range including 00:00, midday and 23:59 reports; index/facet/subject/detail failure states each showing retry without a perpetual page loader; deep links; drawer history across pages; no raw JSON.
- Completion report covering: root causes, pagination strategy, count derivation, history mechanics, per-module entity mapping, licensing and F&P subject mapping, the actual F&P AI storage source, search implementation, date semantics, partial-loading behaviour, freshness strategy, Reports vs Review distinction, permission tests, and any remaining limitations.
