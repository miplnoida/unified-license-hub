# F7 — REGULATORY RETURNS — READ-ONLY DISCOVERY

- HEAD: `2ec0051f3cbf4fd534c9ac6ba6831e91e2052848` (F0–F5 CERTIFIED AND FROZEN)
- Date: 2026-08-29
- Mode: READ-ONLY. No migrations, no seeding, no configuration change, no retirement, no product development.

## 1. Canonical vs legacy determination (answered first, as required)

Two spines coexist. Evidence is decisive.

**CANONICAL** — `return_definitions`, `return_definition_forms`, `entity_reporting_obligations`, `reporting_periods`, `return_filings`, `return_filing_versions`, `return_metric_values`, `return_form_validation_rules` + the `returns_*` SECURITY DEFINER family (`returns_derive_entity_obligations`, `returns_generate_periods`, `returns_open_filing`, `returns_submit_filing`, `returns_validate_filing`, `returns_review_filing`, `returns_extract_metrics`, `returns_filing_queue_v2`, `returns_entity_calendar`, `returns_save_definition`, `returns_save_obligation_rule`, `returns_resolve_legacy_filing`, `returns_migrate_legacy_filing`) + UI `src/pages/returns-canonical/*` and `src/pages/entity/returns/canonical/*` via `useWaveC.ts` / `useEntityReturns.ts`.

**LEGACY / DEAD** — `compliance_returns` (**0 rows**), `returns_filed` (**0 rows**), the `compliance_return_*` RPC family, `src/lib/complianceReturnGovernedOps.ts`, and its only consumers `src/pages/compliance/ReturnSubmission.tsx`, `src/pages/compliance/ComplianceReturns.tsx`, `src/pages/entity/returns/FillReturnPage.tsx` — **none of which are route-registered** anywhere in `src/routes/*` or `src/App.tsx`.

Routing already enforces the retirement: `returnsRoutes.tsx:56-61` documents "the legacy external create/fill/view spine is RETIRED"; `/entity/returns/new` → `Navigate`; `/entity/returns/:id/fill|view` → `LegacyReturnFilingRedirect` which resolves server-side via `returns_resolve_legacy_filing` (`LegacyReturnFilingRedirect.tsx:1-9`); `/returns/configuration` → Admin → Regulatory Data Model.

Note: there is **no** function `handle_return_submission` in the database; the submit entry points are `returns_submit_filing` (canonical) and `compliance_return_submit` (legacy/dead).

## 2. Boundary

- **From frozen upstream:** entity/licence identity, entitlement (`returns_entitlement_ok`), taxonomy, shared notification queue (`notification_enqueue_event`).
- **F7 owns:** obligation derivation, definitions/forms/schemas, calendar/periods, filing lifecycle, validation, amendment/resubmission, overdue/late detection, extensions, maker-checker, regulator review/RFI, acceptance/rejection, metrics extraction, filing immutability, evidence, returns audit, notification/escalation triggers, returns reporting.
- **Later modules:** F6 owns late-fee money; F8 owns prudential ratios/thresholds/breach handling consuming `return_metric_values`; enforcement owns sanction.

## 3. Runtime surface manifest

| Route | Component | RPC | Tables | Class |
|---|---|---|---|---|
| `/entity/returns` | `EntityReturnsWorkspace` | `returns_entity_calendar`, `returns_derive_entity_obligations` | `entity_reporting_obligations`, `reporting_periods` | ACTIVE |
| `/entity/returns/filings/:filingId` | `EntityFilingWorkspace` | `returns_open_filing`, `returns_submit_filing`, `returns_filing_detail` | `return_filings`, `return_filing_versions` | ACTIVE |
| `/entity/returns/dashboard` | `EntityReturnsDashboard` | summary | mixed | ACTIVE |
| `/entity/returns/legacy` | `MyReturnsPage` | reads `returns_filed`/`compliance_returns` | 0 rows | LEGACY (history-only, empty) |
| `/entity/returns/new` | `Navigate` | — | — | LEGACY stub |
| `/entity/returns/:id/fill`, `/:id/view` | `LegacyReturnFilingRedirect` | `returns_resolve_legacy_filing` | — | ACTIVE bridge (empty input) |
| `/returns/queue` | `ReturnsFilingQueue` | `returns_filing_queue_v2` | `return_filings(93)` | ACTIVE |
| `/returns/obligations` | `EntityObligationsWorkbench` | `returns_derive_entity_obligations`, `returns_save_obligation_rule` | `entity_reporting_obligations(72)`, `reporting_obligation_rules(54)` | ACTIVE |
| `/returns/calendar` | `EntityReportingCalendar` | `returns_generate_periods` | `reporting_periods(362)` | ACTIVE |
| `/returns/filings/:filingId` | `FilingRouteByAudience` → `FilingDetail` | `returns_review_filing`, `returns_validate_filing` | `return_filing_versions(103)` | ACTIVE |
| `/returns/filings/legacy/:legacyId` | `LegacyReturnFilingRedirect` | `returns_migrate_legacy_filing` | `returns_filed(0)` | ACTIVE bridge |
| `/returns/configuration` | redirect | — | — | consolidated |
| `/admin/returns/due-dates`, `/admin/returns/late-fees` | admin pages (`navigationSnapshot.ts:197-198`) | — | `return_due_dates(0)`, late-fee tables | BROKEN-IN-PRACTICE / UNCONFIGURED |
| (unrouted) `compliance/ReturnSubmission.tsx`, `compliance/ComplianceReturns.tsx`, `entity/returns/FillReturnPage.tsx` | — | `compliance_return_*` | `compliance_returns(0)` | UNREACHABLE / DEAD |
| Reports/metrics | `useApiQueries.ts:72`, `useAdminMetrics.ts:54-55` | `.from('compliance_returns')` | 0 rows | BROKEN-IN-PRACTICE (always reads 0) |

Permissions: internal routes gated by `ModuleRoute module="returns_management"`; external by `PortalRoute area="returns"` with `can_view_status` / `can_submit_returns`. Legacy naming leak: `scopeCapabilities.ts:73` exposes a `compliance_returns` scope option.

## 4. Live census

Canonical populated: `return_metric_values` 1717 · `reporting_periods` 362 · `return_filing_versions` 103 · `return_filings` 93 (latest 2026-08-25) · `entity_reporting_obligations` 72 · `return_threshold_breaches` 71 · `return_filing_validation_results` 55 · `reporting_obligation_rules` 54 · `return_definition_forms` 38 · `return_definitions` 24 · `return_form_validation_rules` 19 · `return_templates` 7 · `return_filing_requests` 6 · `return_config_forms` 5 · `return_filing_form_requirements` 4 · `return_configs` 4/`return_configurations` 2 · `return_types` 4.

Empty (0 rows): `compliance_returns`, `returns_filed`, `return_requests`, `return_audit_log`, `return_data_revisions`, `return_form_data`, `return_documents`, `return_due_dates`, `return_cutoff_config`, `return_edit_requests`, `return_comments`, `return_notifications_log`, `return_notification_templates`, `return_validation_rules`, `return_validation_rule_versions`, `return_form_versions`, `return_calculated_ratios`, `return_consolidated_analysis`, `return_upload_attempts`, `return_upload_imports`, `return_template_downloads`, `returns_legacy_mappings`, `return_threshold_breach_acknowledgements`.

`return_workflow_status` enum (`TEMP,WIP,SUB,VAL,TBR,REJ`) is used by exactly one column — `returns_filed.workflow_status` — therefore dormant.

Verified this pass: `returns_open_filing`, `returns_submit_filing`, `returns_review_filing` contain audit text but **contain no `notification_enqueue_event` / `notif_enqueue` call**; `returns_validate_filing` contains neither.

## 5. Industry / regulatory feature matrix

| Capability | Class | Evidence |
|---|---|---|
| Obligation creation | BUILT+PROVEN | `returns_derive_entity_obligations`, 72 obligations, 54 rules |
| Definitions / forms / schemas | BUILT+PROVEN | 24 definitions, 38 definition-forms |
| Reporting calendar | BUILT+PROVEN | 362 periods |
| Filing creation / draft / submission | BUILT+PROVEN | 93 filings / 103 versions live |
| Validation | PARTIAL | `returns_validate_filing` + 19 form rules + 55 results; `return_validation_rules*` duplicate tables empty |
| Amendments / resubmission | BUILT-NOT-PROVEN | `resubmit_return`, `request_return_edit`, `decide_return_edit_request`; `return_edit_requests` 0 rows |
| Overdue / late filing detection | PARTIAL | admin surfaces exist; `return_due_dates` 0 rows |
| Extensions | MISSING-TRACK-A | no extension table or RPC found in live catalog |
| Maker-checker | BUILT+PROVEN | submit vs `returns_review_filing` separation |
| Regulator review / RFI | BUILT-NOT-PROVEN | `returns_review_filing`, `return_comments`(0), `return_filing_requests`(6) |
| Acceptance / rejection | BUILT+PROVEN | `returns_review_filing(_action)`, `perform_return_workflow_transition` |
| Metrics extraction | BUILT+PROVEN | `returns_extract_metrics`, 1717 metric values |
| Data integrity / immutability | BUILT+PROVEN | versioned `return_filing_versions`, `trg_snapshot_return_on_submit` |
| Entity/licence applicability | BUILT+PROVEN | `returns_obligation_scope`, `returns_entitlement_ok` |
| Evidence / attachments | BUILT-NOT-PROVEN | `return_documents` 0 rows |
| Audit | PARTIAL | canonical RPCs reference audit; `return_audit_log`/`return_data_revisions` 0 rows |
| Notification / escalation hooks | MISSING-TRACK-A | every returns notification trigger keys off empty `returns_filed`; canonical submit/review RPCs enqueue nothing |
| Reporting / analytics | PARTIAL | `returns_filing_trend`, `returns_supervisory_summary`, `returns_metric_series`; `return_calculated_ratios`/`return_consolidated_analysis` 0 rows |

## 6. Finite gap register

| ID | Sev | Gap | Evidence | Canonical remediation |
|---|---|---|---|---|
| GAP-F7-01 | CRITICAL | Canonical filing lifecycle emits no notifications | `returns_submit_filing`/`_review_filing` contain no enqueue; triggers bound to `returns_filed`(0) | Wire canonical RPCs/triggers to the existing shared notification queue — do not build a second queue |
| GAP-F7-02 | CRITICAL | Legacy `compliance_return_*` spine still callable while dead | `complianceReturnGovernedOps.ts`, unrouted pages, live RPCs | Retire spine and revoke EXECUTE (remediation pass, not now) |
| GAP-F7-03 | HIGH | Admin metrics/reports read empty legacy `compliance_returns` | `useApiQueries.ts:72`, `useAdminMetrics.ts:54-55` | Repoint to canonical `returns_entity_filing_history`/`return_filings` |
| GAP-F7-04 | HIGH | No filing extension capability | catalog sweep for `extension` tables → none | Governed extension request/decision with authority + audit; deadline recomputation |
| GAP-F7-05 | HIGH | Returns audit ledgers empty | `return_audit_log`, `return_data_revisions` 0 rows | Prove canonical audit target; consolidate to one audit surface |
| GAP-F7-06 | HIGH | Overdue/late detection unproven | `return_due_dates` 0 rows, `return_cutoff_config` 0 rows | Confirm canonical due-date source (periods) and retire duplicate tables |
| GAP-F7-07 | MEDIUM | Duplicate validation-rule tables | `return_validation_rules(0)` vs `return_form_validation_rules(19)` | Declare canonical; retire duplicate |
| GAP-F7-08 | MEDIUM | Evidence/attachment path unexercised | `return_documents` 0 rows | Prove upload → filing-version binding |
| GAP-F7-09 | MEDIUM | Amendment/edit-request path unexercised | `return_edit_requests` 0 rows | Prove end-to-end amendment with versioning |
| GAP-F7-10 | MEDIUM | RFI on filings unexercised | `return_comments` 0 rows | Prove RFI issue/response cycle |
| GAP-F7-11 | MEDIUM | Bespoke returns workflow parallel to shared approval engine | no reference to `approval_*` in returns functions | Document as accepted architecture or converge; do not duplicate further |
| GAP-F7-12 | LOW | Legacy naming leak in RBAC scope options | `scopeCapabilities.ts:73` | Rename to canonical module scope |
| GAP-F7-13 | LOW | Analytics caches unused | `return_calculated_ratios`, `return_consolidated_analysis` 0 rows | Decide canonical vs retire (coordinate with F8) |
| GAP-F7-14 | LOW | Dormant `return_workflow_status` enum + `returns_filed` | single dormant column | Retire with GAP-F7-02 |

Track-A PRODUCT GAP count: **11** (01–10, 12). BCR: 0 explicit (late-fee policy sits in F6). Downstream/coordination: 11, 13, 14.

## 7. Frozen-contract dependencies

- Returns functions contain **no** direct references to `applications`, `licenses`, `approval_*`, or `audit_logs` inserts (text-searched) — coupling is via `entity_id` / `license_id` FKs (notably on legacy `compliance_returns`) and via `returns_entitlement_ok`.
- Shared notification primitive `notification_enqueue_event` is referenced only by legacy-table triggers.
- F8 consumes F7 output: `tg_prudential_detect_on_acceptance` / `_prudential_canonical_detect_run(_return_filing_version_id …)` fire off `return_filing_versions` acceptance. **Any change to filing-version acceptance semantics affects F8.**

## 8. Verdict input

Canonical spine is live and populated; the material risks are the silent notification path and the still-callable dead legacy spine.
