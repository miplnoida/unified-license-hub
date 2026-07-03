
# Phase 6 — Close the final Script 1–5 gaps (SHIPPED)

All six items from the assessment table are now in the codebase, tsgo-clean, and RLS-secured. See the progress log below for what changed and where.

## Progress log
- ✅ Gap 1 (Multi-regulator F&P determinations): `fp_determinations.regulator_id` + `uq_fp_det_current_per_regulator` partial-unique index; `FpDeterminationsPanel` derives regulator from the assessment, only supersedes prior current row for the SAME regulator, tags each history row with the regulator badge, and stamps regulator on every audit event.
- ✅ Gap 2 (Sector-specific F&P decision rules): `fp_sector_decision_rules` table with sector + optional sub_sector + optional role_type + JSON `criteria` (min_score, mandatory_checks, disqualifiers, warnings) + rationale template FK; admin CRUD page `/admin/fp-sector-rules`; helper `src/lib/fpSectorRules.ts` with `resolveFpSectorRule` (most-specific-first cascade) + `evaluateFpCriteria` for panels/edge fns to reuse.
- ✅ Gap 3 (Case-centric cross-module audit trail): `src/lib/caseAuditGraph.ts` (one-hop related-entity discovery + timeline aggregator across `audit_logs`, `rule_overrides`, `compliance_audit_logs`, `enforcement_case_events`); `CaseAuditTrail.tsx` at `/admin/case-audit` (search-based) + `/admin/case-audit/:entityType/:entityId` (deep-link); chronological grouped-by-day timeline with diff viewer + JSON export routed through `logExport`.
- ✅ Gap 4 (Prudential early warnings): `v_prudential_early_warnings` view (latest vs previous ratio + 180-day breach count → watch/warning/critical); admin page `/supervision/early-warnings` with level counters, filters, per-row "seed supervisory action", CSV export via `logExport`, manual recompute button; edge fn `evaluate-prudential-early-warnings` reads the view and dispatches `prudential.early_warning` notifications for critical rows (idempotent, cron-invokable).
- ✅ Gap 5 (Security Events surface): `AdminHub` gained a Security Events tile plus tiles for Case Audit Trail, Prudential Early Warnings, and F&P Sector Rules.
- ✅ Gap 6 (Complaint acknowledgement artifact): `ComplaintAcknowledgement.tsx` reusable dialog with print-to-PDF, government branding, reference number, SLA target; auto-shown after every consumer/staff submission on `ComplaintsList`; "Reprint acknowledgement" button on `ComplaintDetail` header; each print writes an `ACK_GENERATED` audit row and an `export_audit_jobs` entry through the central `logExport` helper.

## Verification
- `bunx tsgo --noEmit` → clean.
- Migration applied (added regulator_id + sector rule table + early-warning view + grants). Linter noise reported is pre-existing (search_path warnings on legacy functions, not introduced here).



## Gaps identified

| # | Script / Demo ID | Gap | Current state |
|---|---|---|---|
| 1 | S2 · DEMO-FPA-011 | Multi-regulator F&P determinations (same individual assessed independently by e.g. BOJ vs FSCA, segregated access + audit) | `fp_assessments`/`fp_determinations` have no `regulator_id` scoping; a second regulator cannot record an independent determination for the same person |
| 2 | S2 · DEMO-FPA-010 | Sector-specific F&P decision logic (DTI vs microcredit criteria + rationale) | `decision_rationale_templates` exist globally but F&P assessments never resolve them by sector; no per-sector criteria overlay in `FpDeterminationsPanel` |
| 3 | S5 · DEMO-DPA-005/006 | Case-centric cross-module audit trail (one view that traces licensing → F&P → prudential → conduct → enforcement for a single case/entity) | `ChangeHistoryDrawer` is per-entity only; no unified "Case Audit" page linking across modules |
| 4 | S3 · BR-PS-15 · DEMO-PRUD-010 | Prudential early-warning surface (trend-based supervisory warnings & drill-down) | Ratio calc + breach flag exist; no early-warning inbox / banner tying deteriorating trends to a queue |
| 5 | S5 · DEMO-DPA-009 | Security Events page not surfaced from Admin Hub | Route + page exist (`/admin/security-events`) but no tile → invisible to staff |
| 6 | S4 · DEMO-MCS-003 | Complaint intake acknowledgement artifact (printable/downloadable acknowledgement with reference ID + timestamp for both portal and staff intake) | Complaint IDs generated, but no PDF/HTML ack artifact rendered/downloadable on submission |

## What I will build

### Gap 1 — Multi-regulator F&P determinations
- Migration:
  - Add nullable `regulator_id uuid references public.regulators(id)` to `fp_assessments` and `fp_determinations`.
  - Composite unique index `(individual_id, role_id, regulator_id, active)` so BOJ/FSCA determinations coexist.
  - RLS policy update: viewers scoped to the regulator on their `active_regulator_id` context (plus super_admin/admin unrestricted).
- UI (`FitAndProperAssessmentDetail`, `FpDeterminationsPanel`):
  - New "Regulator" selector when opening an assessment; defaults to active regulator.
  - Determinations grouped by regulator; each row shows its own status/outcome; blocking one regulator does not affect the other.
  - Audit log records regulator scope on every action.

### Gap 2 — Sector-specific F&P decision logic
- Migration:
  - `fp_sector_decision_rules` table: `sector_id`, `sub_sector_id?`, `role_type`, `criteria jsonb` (min score, mandatory checks, disqualifiers), `rationale_template_id`, `active`.
  - GRANTs + RLS: regulator staff manage, all authenticated read.
- UI:
  - New admin page `FpSectorDecisionRules.tsx` (tree editor per sector → role) under Fit & Proper admin.
  - `FpDeterminationsPanel` resolves the rule set via `applications.sector_id`/entity sector, renders required checks + auto-fills rationale template; blocking approval when mandatory criteria unmet unless `OverrideReasonDialog` justifies it.
- Helper `src/lib/fpSectorRules.ts` shared between the panel and the AI assessment edge fn so AI proposal also respects sector rules.

### Gap 3 — Case-centric cross-module audit trail
- New page `CaseAuditTrail.tsx` at `/admin/case-audit/:entityType/:entityId?related=…`:
  - Fetches `audit_logs` for the primary entity + every related entity discovered via typed joins (application → license → fp_individual → complaints → enforcement_actions → returns_filed).
  - Merges `rule_overrides`, `compliance_audit_logs`, `return_audit_log`, `conduct_triage_audit_events`, `enforcement_case_events`, `security_event_logs` scoped to the case.
  - Chronological timeline with per-module colour, actor, before/after diff (reuses `DiffViewer`), and a CSV/JSON export routed through `logExport`.
- Helper `src/lib/caseAuditGraph.ts` computes the related-entity graph (safe joins, RLS-friendly).
- Entry points: "Case audit" button next to `HistoryButton` on ApplicationDetail, LicenseDetail, ComplaintDetail, EnforcementDetail, FitAndProperIndividualDetail, ReturnDetail.

### Gap 4 — Prudential early-warning surface
- View `v_prudential_early_warnings` (SQL view):
  - Joins `return_calculated_ratios` + `return_threshold_breaches` + historical trend (3-period moving delta) + `prudential_thresholds` to surface deteriorating ratios per entity.
  - Warning levels: `watch` / `warning` / `critical`.
- New page `PrudentialEarlyWarnings.tsx` under Supervision:
  - Sortable table (entity, ratio, current, delta, level, last seen) with drill-through to `ReturnAnalysis` and "Open supervisory action" button that seeds a `supervisory_plan_actions` row.
  - Auto-generated banner on `PrudentialAnalytics` linking to the queue when the current user's regulator has any `critical` warnings.
- Edge fn `evaluate-prudential-early-warnings` (cron-invokable): recomputes the materialised warning table daily and triggers `notification_event_configs.prudential.early_warning`.

### Gap 5 — Security Events tile
- Add tile to `AdminHub.tsx` under the Security & Audit group: label "Security Events", icon `ShieldAlert`, href `/admin/security-events`, module `settings`.
- Add sidebar link (Admin > Security & Audit) so supervisors don't have to memorise the URL.

### Gap 6 — Complaint acknowledgement artifact
- Reusable `ComplaintAcknowledgement.tsx` (printable HTML + `window.print()` PDF path) rendering complaint ID, submission timestamp, complainant name, subject, channel, SLA target, contact details, regulator branding.
- Wired into:
  - Public complaint portal success screen (already exists) — replaces plain toast with the artifact + download button.
  - Staff intake (`ComplaintDetail` header) — "Reprint acknowledgement" button.
  - `send-correspondence` invocation to email the artifact when the complainant provided an email.
- Every generation writes an `audit_logs` `ACK_GENERATED` row + `logExport` entry (dataset `complaint_acknowledgement`, format `pdf`).

## Cross-cutting

- RLS + GRANTs on every new table / view in the same migration.
- Every new UI mutation writes to `audit_logs`; every gate bypass goes through `OverrideReasonDialog` + `rule_overrides`.
- Vitest for `caseAuditGraph`, `fpSectorRules`, early-warning computation; Playwright smoke for each new admin page.
- Update `.lovable/plan.md`, `docs/FEATURE_DEVELOPMENT_TRACKER.md`, and `mem://index.md` when done.

## Order of work

1. Gap 5 (nav tile — trivial, unblocks visibility).
2. Gap 1 migration + F&P UI (largest schema impact — do early so Gap 2 layers on cleanly).
3. Gap 2 sector rules.
4. Gap 4 early warnings.
5. Gap 3 case-centric audit (depends on other events being written).
6. Gap 6 complaint acknowledgement.

Each step ends with `tsgo` clean + targeted vitest green before moving on.
