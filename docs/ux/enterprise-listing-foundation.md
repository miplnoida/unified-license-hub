# Enterprise Listing Foundation — sorting, filtering, paging

Baseline HEAD at start of wave: `03fcb961279d3e26328996a18f2fea9e2f39581e`.

## Shared primitives
`src/components/shared/listing/`
- `sorting.ts` — canonical comparators (text natural, number, date, boolean, risk ordinal, lifecycle-stage ordinal), nulls last in both directions, deterministic secondary sort, `paginate`, `pageCount`, `rangeLabel`.
- `SortableHeader.tsx` — UNSORTED/ASC/DESC cycle, keyboard accessible, `aria-sort`, tooltip, never a link.
- `PaginationBar.tsx` — First/Prev/Page X of Y/Next/Last + page size (10/25/50/100, default 25) + "Showing X–Y of Z".
- `useListingState.ts` — URL persistence of `q`, filters, `sort`, `dir`, `page`, `pageSize`; any filter/search/sort/pageSize change resets to page 1.

## Component upgrades
| Component | Before | After |
|---|---|---|
| `SupervisoryRegister` | sticky identifier + priority columns + mobile cards; no sorting, no paging, no record count | column metadata (`sortable`, `sortKey`, `sortAccessor`, `dataType`, `businessOrder`), sortable identifier, `client`/`server` modes, controlled sort, paging with server `totalCount`, action column never sortable |
| `DataTableShell` | filter Select selected but never applied; array-index row keys; no sorting; page size fixed at 10; dead Export button; no record count | shared toolbar, real filter application (`filterKey`/`filterAccessor`), stable `getRowId`, sortable headers on every column by default, page-size selector, record-count badge, `server` mode, optional `onExport` (button only rendered when wired) |

## AML reference implementation
| Screen | Default sort | Sortable fields | Paging | Total source |
|---|---|---|---|---|
| Assessments | `created_at` desc | reference, type, residual rating, status, period | **Server** (`range` + `count: exact`) | database `count` |
| Supervised entities | residual risk desc | licence, risk, coverage, next review, open work, sector | Client over bounded `aml_portfolio(300)` | dataset length |
| Work queue | read-model order (overdue → priority → due) | reference, work type, priority, due, entity | Client over bounded `supervisory_work_queue(300)` | dataset length |
| Examinations | stage lifecycle asc (open first) | reference, risk, stage, workload, lead examiner | Client over bounded `examinations(300)` | dataset length |
| Findings (card loop view) | severity desc | Sort-by control: severity, status, due date, entity, reference + direction toggle | Client over bounded `supervisory_finding(300)` | dataset length |
| Overview / Risk heatmap | n/a | not applicable (KPIs, matrix axes) | none | n/a |

Assessment workspace: shared `PageHeader` with back navigation, canonical reference, status/residual badges and a refresh action; dimension tables now sortable (Dimension, Weight, Calculated, Judged, Trend/confidence, Evidence) with no pager (small bounded methodology lists) and the redundant inner `overflow-x-auto` removed.

## Backend
- Server paging for the AML assessment register uses PostgREST `count: 'exact'` + `order` + `range` with a whitelisted sort-key map (`AML_ASSESSMENT_SORT_KEYS`); unknown keys fall back to `created_at desc`. No column name is ever interpolated from the browser.
- No certified RPC (`aml_portfolio`, `aml_work_queue`, `supervisory_work_queue`) was modified in this wave.

## System listing inventory
| Class | Count | Notes |
|---|---|---|
| Shared-shell consumers (sorting + paging + count inherited) | 37 files | `DataTableShell` (23), `SupervisoryRegister` (5), `EnterpriseDataGrid` (9) |
| AML reference implementation (fully compliant) | 6 screens | assessments (server-paged), entities, work queue, examinations, findings, assessment workspace |
| Bounded, no pager needed | ~95 files | detail/config/comparison tables, single-record panels, hierarchy views |
| Partial (sorting/paging still to migrate) | ~132 files | bespoke `<Table>` registers not yet on a shared shell |
| Needs real server paging | 4 registers | AML entities, work queue, examinations, findings — bounded fetch today; requires paged RPC contracts (`_page`, `_page_size`, `_sort_key`, `_sort_direction`, `_search`, `_filters`) in a backend wave |
| Custom migration | ~12 files | high-row bespoke workspaces (prudential entity profile, finance panel, entity structure hub, lifecycle config, filing version comparison, management reporting, forms packages, calculation config, escalation manager, thematic review detail, enforcement workspace, filing detail) |
| Functional defects fixed | 1 | `DataTableShell` filter control was selectable but never applied |

System-wide listing migration is **not** complete; this wave establishes the foundation, the AML reference implementation, and automatic uplift for every shared-shell consumer.
