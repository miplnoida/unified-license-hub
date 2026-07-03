# Script 1–5 coverage confirmation & manual verification guide

## Coverage summary (based on codebase inspection, no changes made)

All 12 Script-1 items, 10 Script-2 items, and the Script-3/4/5 items listed in the worksheets map to shipped code. The last six gaps tracked in `.lovable/plan.md` (Phase 6) — multi-regulator F&P, sector F&P rules, cross-module case audit, prudential early warnings, Security Events tile, and complaint acknowledgement artifact — are all in the tree and DB. Nothing is demo-stub only.

| Script | Demo IDs | Where it lives |
|---|---|---|
| S1 Licensing | ULRA-001…012 | Applicant portal + `ApplicationDetail`, `SufficiencyPanel`, `ConfigurableDecisionActions`, `TwinPeaksPanel`, `LicenseActionDialog`, workflow engine, `audit_logs` |
| S2 Fit & Proper | FPA-001…011 | `FitAndProperIndividualDetail`, `FpScreeningPanel`, `FpDeterminationsPanel` (regulator-scoped), `FpSectorDecisionRules`, `FpPopulationTrends`, `fp-cycle-scheduler` + `fp-ai-media-ingest` edge fns |
| S3 Prudential | PRUD-001…010 + BR-PS-15 | `ReturnReviewPanel`, `ReturnValidationAndRatiosPanel`, `PrudentialAnalytics`, `PrudentialEarlyWarnings` view + page + cron edge fn |
| S4 Market Conduct | MCS-001…010 | `ComplaintsList`, `ComplaintDetail`, `ConductClassificationCard`, `TriageHistoryCard`, `ComplaintAcknowledgement`, thematic-review module |
| S5 Dashboards/Audit | DPA-001…010 | `ExecutiveDashboard` + `DashboardInsightsCard`, `CaseAuditTrail`, `SecurityEvents`, `exportAudit`, `ChangeHistoryDrawer` |

TS build is clean; every new table has GRANTs + RLS in its migration.

## Manual verification — step by step

Run these against the preview URL. Use a super-admin login unless noted.

### Script 1 — Unified Licensing
1. Applicant portal → **Start new application**, pick a license type, save → confirm draft appears in "My Applications" with a status of Draft and a timestamp (DEMO-ULRA-001).
2. Switch license type in the same draft → dynamic fields change; leave a required field blank → validation blocks submit; upload a doc → version appears in the document panel (DEMO-ULRA-002).
3. Submit → toast shows reference number; check `/applications` staff queue for the new row (DEMO-ULRA-003, 004).
4. Staff → open the application → **Issue RFI**, then log back as applicant and respond → SLA pauses/resumes; audit entries appear in the History drawer (DEMO-ULRA-005).
5. Route to Analyst → auto AI assessment runs; open Legal tab as a Legal-only role, then as non-Legal (should be denied) (DEMO-ULRA-006/007).
6. Approver → open consolidated view → issue Approve / Conditional / Reject; open the generated certificate and notification log (DEMO-ULRA-008/009).
7. On an issued license: **Renew**, then **Revoke** with justification; run **Bulk intake** from the admin tools; open the History drawer for full lineage (DEMO-ULRA-010).
8. Navigate `/admin/case-audit/application/<id>` → confirm the chronological cross-module timeline (DEMO-ULRA-011).
9. In `ApplicationDetail`, open the **Twin Peaks** tab; record a Prudential flag then a Conduct flag → interdependency + conditional clearance shows for both regulators (DEMO-ULRA-012).

### Script 2 — Fit & Proper
1. Trigger F&P from (a) new licence, (b) role change on an entity, (c) periodic cycle button in `/fit-and-proper`, (d) ad-hoc "New assessment" — four rows appear in the individual's initiation log (DEMO-FPA-001).
2. Create one individual, link two entities + two roles → single profile, multiple role rows (DEMO-FPA-002).
3. Try to open the individual as a user without F&P role → denial toast + entry in `/admin/security-events` (DEMO-FPA-003).
4. Individual completes declarations → assessor sees notification bell; log shown under Notifications tab (DEMO-FPA-004).
5. `FpScreeningPanel` → **Run screening** → automated results + flags render; upload manual evidence and link (DEMO-FPA-005/006).
6. Force an adverse finding → severity classification + escalation routing shows in history (DEMO-FPA-007).
7. Open **Population Trends** page (`/fit-and-proper/population-trends`) and the historic comparison on the individual (DEMO-FPA-008).
8. Open `/admin/fp-sector-rules` → create a DTI-vs-microcredit rule; return to a determination — mandatory checks + rationale template auto-load (DEMO-FPA-010).
9. Switch active regulator (top-right switcher), open the same individual → record a second determination; both remain "current" for their own regulator with badges + independent audit (DEMO-FPA-011).

### Script 3 — Prudential
1. Licensee portal → open a return, save draft, submit → auto ratios computed on the review panel (PRUD-001–004).
2. Regulator side → `ReturnReviewPanel` shows validation results, breach flags, threshold history; add reviewer comment (PRUD-005–007).
3. `/supervision/prudential-analytics` → confirm charts + drill-down (PRUD-008/009).
4. `/supervision/early-warnings` → click **Recompute**; verify watch/warning/critical counts, filter by regulator, use **Seed supervisory action** on a critical row → new item in `supervisory_plan_actions`; export CSV → row appears in `audit_export_jobs` (PRUD-010 / BR-PS-15).

### Script 4 — Market Conduct
1. Public complaint portal → submit → **acknowledgement dialog** opens automatically; click **Print / Save as PDF** → PDF has reference number, timestamp, SLA (DEMO-MCS-003).
2. Staff `/complaints` → new intake also shows the acknowledgement; open a complaint → **Reprint acknowledgement** header button works; each print writes an ACK_GENERATED row in the History drawer (DEMO-MCS-003).
3. Investigation tab → add correspondence, tasks, evidence, close case → audit trail complete (DEMO-MCS-004–010).
4. Thematic review module → create review, attach entities/products, add findings + actions.

### Script 5 — Dashboards / Reporting / Audit
1. `/dashboard/executive` → `DashboardInsightsCard` renders AI narrative + severity; thumbs up/down persist (DEMO-DPA-001–004).
2. `/admin` (Admin Hub) → confirm tiles for **Security Events**, **Case Audit Trail**, **Prudential Early Warnings**, **F&P Sector Rules** (DEMO-DPA-009).
3. `/admin/security-events` → filter by event type + date, export CSV.
4. `/admin/case-audit` → search by entity ID, open timeline, use diff viewer, export JSON — row in `audit_export_jobs` (DEMO-DPA-005/006).
5. Any list view → export CSV/PDF → `/admin/audit-exports` shows the row with file hash + filters (DEMO-DPA-007/008).
6. Open any entity → **History** button → `ChangeHistoryDrawer` shows before/after diffs across modules (DEMO-DPA-010).

## If any step fails
Note the Demo ID + screenshot and reply "gap on DEMO-XYZ-###" — I will then switch to build mode and patch just that scenario.
