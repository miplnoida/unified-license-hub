# Saint Lucia FSRA — Demo Discrepancy Register

HEAD `687a4b892b0752a4448efdf64fff2b1be3f94c0d` · migrations 1317 · refreshed 2026-08-31
(read-only wave; nothing was remediated).

Severity: **P0** demo cannot proceed · **P1** materially misleading · **P2** presentation risk.
Correction type: DATA (prepare a real record via governed path) · CONFIG · UI · SCRIPT.

| ID | Screen | Scripted statement | Expected | Actual | Evidence | Sev | Demo impact | Correction | Order |
|---|---|---|---|---|---|---|---|---|---|
| D1 | Risk-based supervision / Entity 360 | "the engine calculates Coral Harbour as HIGH risk" | at least one calculated non-low band for a Saint Lucia entity | all 19 current rows in `entity_risk_scores` have `band = low` | `entity_risk_scores` | P0 | risk-based supervision story unsupported | CONFIG (Saint Lucia scoring model + run the engine; never hard-code HIGH) | 1 |
| D2 | Ownership / UBO | "the system resolves the ultimate beneficial owner" | UBO policy configured so `entity_ubo_resolve` returns a determination | `ubo_policies` empty → `CONFIGURATION_REQUIRED` | `ubo_policies` | P0 | UBO claim must be withdrawn | CONFIG (create the Saint Lucia UBO policy) | 2 |
| D4 | Examination workspace / F&P case | prepared examination and F&P case on a demo entity | ≥1 each | 0 examinations and 0 `fp_assessments` on all 8 demo entities | `examinations.entity_id`, `fp_assessments.licensee_id` | P0 | two scripted sections have nothing to open | DATA (prepare via governed intake, not direct inserts) | 3 |
| D5 | Breach Inbox / Alert Center / Entity 360 | "47 breaches" | population labelled by level; warnings labelled as warnings against the warning threshold | 38 of 47 are `level='warn'` yet titled `Breach: <metric>` and shown against the breach threshold | `v_prudential_current_breaches`, `src/pages/supervision/BreachInbox.tsx`, `src/pages/analytics/AlertCenter.tsx:131` | P1 | overstates severity to the regulator | UI (level-aware labels/thresholds) + SCRIPT | 4 |
| D6 | Supervisory Attention / Stress indicators | "attention queue and stress events" | ≥1 open item each | `conduct_attention_items` = 0, `prudential_stress_events` = 0 | tables | P1 | two empty screens | DATA (trigger the existing engines on prepared filings) | 5 |
| D16 | Prudential thresholds / breach detail | "NPL breaches a 5.0 threshold; cost-to-income breaches 65.0" | stored thresholds match the script | stored: NPL `<= 10.0` → **warn**; cost/income `<= 75.0` → **warn**; only liquidity `>= 15.0` is a breach | breach rows for filing version `5568551b-…f751f` | P1 | presenter would state figures the screen contradicts | SCRIPT (state liquidity breach, NPL/cost-income as early warnings) or CONFIG (adopt real FSRA thresholds) | 6 |
| D8 | Breach Inbox | "critical/high open" tile | tile reflects real severities | severity filter/tile uses `critical`/`high`, values that never occur (`breach`/`warn` only) — permanently 0 | `BreachInbox.tsx:55-56,160` | P1 | dead filter and always-zero KPI on screen | UI | 7 |
| D18 | AI review surfaces | "an officer accepted / modified / rejected an AI output" | ≥1 attributable decision | `ai_insight_actions` = 0 (18 insights all awaiting review) | tables | P1 | human-in-the-loop cannot be shown as history | DATA (record one genuine supervisory decision pre-demo) | 8 |
| D7 | Payments / approved applications | "all monetary values are XCD" | no non-XCD completed payments on demo surfaces | 2 completed **USD** payments totalling 25,112.00 (vs 10 XCD totalling 10,000.00), on `APP-2026-000148`/`APP-2026-000159` | `payments` | P1 | contradicts the XCD base-currency statement | DATA (avoid those records in the path; do not delete append-only evidence) + SCRIPT | 9 |
| D12 | Complaint CMP-2026-000103 | "complaint linked to the licensee" | `licensee_id` populated | `licensee_id` NULL, status `submitted` | `complaints` | P1 | conduct→entity linkage unavailable | DATA (link via governed complaint update) | 10 |
| D3 | AI Governance | "kill switch stops the model" | enforcement demonstrable | 3 kill switches recorded; enforcement not proven | `ai_governance_kill_switches` | P2 | must be described as recorded control | SCRIPT | 11 |
| D15 | Licensing queue / application detail | "a Saint Lucia application in progress" | demo-entity application | 29 applications exist but all belong to certification/Apex fixtures (`VRF-RS-*`, `VRF-WF-*`, `APP-2026-0001xx`); 0 on the 8 demo entities | `applications` | P2 | licensing walk-through uses fixture references | DATA or SCRIPT (name the actual reference numbers) | 12 |
| D9 | Report chart tooltips | currency shown as configured base | XCD | `ChartWidget.tsx:75` hardcodes `$${v.toLocaleString()}` | source | P2 | wrong symbol in a chart tooltip | UI | 13 |
| D10 | General Settings | currency options governed | governed currency registry | `GeneralSettings.tsx:133-135` still offers usd/eur/gbp literals | source | P2 | contradicts XCD governance if opened | UI | 14 |
| D11 | Misc monetary displays | all money via `src/lib/money.ts` | shared helpers | 128 files still contain raw `toLocaleString` usage (many non-monetary) | static scan | P2 | residual formatting drift | UI (targeted) | 15 |
| D17 | Coral Harbour action ledger | — | no test rows in the demo ledger | `PA-2026-000012` titled `probe`, status open | `prudential_actions` | P2 | visible test noise | DATA (retitle/close via governed path) | 16 |

## Closed since the previous register

- Cross-screen breach count divergence — 47 on Executive Dashboard and Breach Inbox (verified).
- Application/complaint open counts — canonical queue and dashboard aggregates (verified).
- Prudential action and escalation open-state predicates — shared (verified).
- Entity breach counts separated into `current_breach_count` / `unacknowledged_breach_count`.
- Returns administration uses the canonical returns aggregate.
- No `INR`/`₹` remains anywhere in `src`; currency gate 23/23.
- Ownership group structure now has a runtime-drawn tree diagram plus the collapsible list.

## Verdict

**NOT READY — REMEDIATION REQUIRED.**
Blocking set: D1, D2, D4 (P0) and D5, D6, D16 (P1). Remediation order is the Order column;
items 1–8 must be complete before rehearsal.
