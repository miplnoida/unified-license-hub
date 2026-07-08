## Goal
Configure prudential thresholds/ratios per the **Risk_Indicators_Description_and_Thresholds** spreadsheet (Deposit-taking Institutions sheet) and verify every SCRIPT 3 – Prudential Supervision feature works end-to-end for the demo entity **New FinCorp Commercial Bank Limited** using its 16 already-approved (VAL) returns and 1 in-progress (WIP) 2026 Q1 return. No changes to unrelated functionality.

## Current-state findings (read-only investigation)
1. `prudential_ratios` and `prudential_thresholds` are **empty** for every `return_configurations` row. Nothing to evaluate today.
2. FinCorp's 17 filed returns have `returns_filed.return_configuration_id = NULL`. The `evaluate-return-prudential` edge function filters ratios/thresholds by that FK, so **no evaluation can run** for these returns even after seeding until the FK is linked.
3. FinCorp submitted data lives in **two form templates**:
   - Balance Sheet — `59ebe8fc-b5dd-476c-8d6e-2004855227ff`
   - P&L — `7ac713bf-4866-4570-988e-8cf3cbd2369d`
   Ratio formulas therefore need tokens of the form `<formId>.<fieldName>` referencing those UUIDs (evaluator supports this grammar).
4. `return_configurations` currently has no Commercial Bank row.

## Plan (build-mode work)

### Step 1 — Create a "Commercial Bank Quarterly Prudential" return_configuration
Migration: insert one row in `return_configurations` (sector = Commercial Bank, frequency = quarterly). This becomes the anchor for ratios/thresholds.

### Step 2 — Backfill FinCorp returns
Data update: set `returns_filed.return_configuration_id = <new cfg>` for the 17 FinCorp returns (2022 Q1 → 2026 Q1). No other rows touched.

### Step 3 — Seed the 13 DTI prudential ratios (formulas)
Insert into `prudential_ratios` keyed to the new config, using the actual form field IDs from Balance Sheet & P&L. Field mapping already confirmed:

| Ratio | Formula (tokens = `formId.fieldName`) |
|---|---|
| Primary Ratio | Line 3 (Capital) / Line 1 (Assets) |
| Debt to Equity | Line 2 / Line 3 |
| NPL Ratio | Line 1.5.1.3.2 (non-perf loans) / Line 1.4 |
| Past Due Loans Ratio | Line 8.4 / Line 1.4 |
| Provisions to NPLs | Line 3.3.3.4 / Line 1.5.1.3.2 |
| ROA | P&L Line 10 / BS Line 1 |
| ROE | P&L Line 10 / BS Line 3 |
| Profit Margin | P&L Line 10 / P&L Line 4 |
| Net Interest Margin | (P&L 4.1 − P&L 5.1) / BS 1 |
| Efficiency Ratio | P&L 5 / P&L 4 |
| Leverage Ratio | BS 1 / BS 3 |
| Asset Turnover | P&L 4 / BS 1 |
| Liquid Assets Ratio | BS 1.1 / BS 2.1 |

Each ratio gets a stable `ratio_key`, `metric_key` and `display_format` (`percent` for %-based, `ratio` for multiples).

### Step 4 — Seed thresholds (13 rows) exactly as spreadsheet
Insert into `prudential_thresholds` with comparator, `warn_value`, `breach_value` per the Deposit-taking Institutions sheet (e.g. Primary Ratio `>= 0.07` breach, warn slightly above; NPL `<=` 0.10 breach, etc.). Values match the "Threshold" column verbatim; warn bands set at ±20% of breach to exercise Amber/Red states.

### Step 5 — Recompute for all 17 FinCorp returns
Invoke `evaluate-return-prudential` for each return (server-side loop or admin script). Writes `return_calculated_ratios`, `return_threshold_breaches`, validation logs, and dispatches notifications.

### Step 6 — End-to-end verification of SCRIPT 3 features for FinCorp
For entity `30a3c4cb-…` walk the demo tabs and confirm:

| Tab | Verify |
|---|---|
| Overview | Latest return, worst-breach severity, open actions/escalations counters populated |
| Historical Returns | 17 rows across 2022 Q1 – 2026 Q1, statuses correct |
| Ratios & Trends | Line chart renders ≥6 ratio series across 16 periods; table lists all 13 ratios per period |
| Breaches | Amber/Red rows visible where FinCorp data falls outside thresholds; "Create action" and "Escalate" wired |
| Assessments | Manual create flow works (no seed needed) |
| Actions / Escalations | New action + new escalation dialogs post; overdue counter recomputes |
| Stress Events | "Evaluate stress" button on a return triggers indicator run; row appears |
| Audit History | Every ratio/breach/action/escalation event surfaces via `useEntityAuditHistory` |
| Composite risk score | Trigger `risk-score-recompute` for this entity; `entity_risk_scores` row appears with populated components |

For each check, screenshot the preview at `/prudential/entities/30a3c4cb-…` using Playwright, plus SQL spot-checks against `return_calculated_ratios` / `return_threshold_breaches` / `entity_risk_scores`. Fix any wiring bug uncovered (no scope creep — bugs only).

### Step 7 — Report
Deliver a short verification report: seed counts, breach counts per period, screenshot paths, and any bug fixed.

## Out of scope
- Non-DTI sectors (Insurance, Securities Dealer, Micro-credit). Seed those in a follow-up once DTI demo is signed off.
- No changes to workflow, forms, submission logic, or dashboards' data model.
- No new UI screens; only fixes if a Script-3 tab is provably broken during verification.

## Confirmation needed
Please confirm you want thresholds seeded **only for the Commercial Bank / DTI ratio set** for now (13 indicators), driving FinCorp's demo. If you also want General Insurance / Life / Securities Dealer / Micro-credit configured now, I'll extend Steps 1–5 accordingly.