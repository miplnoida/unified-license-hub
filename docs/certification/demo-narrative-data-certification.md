# Saint Lucia FSRA — Demo Narrative-to-Data Certification

Mode: READ-ONLY certification. No product code, migration, RPC, RLS, permission or data change was made in this wave.

- HEAD: `6919e2384a1332e06b810dcb3fdda998b4c4722f`
- Tree: clean
- Migrations: 1,317
- Database: `postgres` (non-production RC1 certification environment)
- Certification date: 2026-08-31

## 1. Verdict

**NOT READY (conditional)** — the demonstration can be delivered on the licensing, returns,
prudential ratio, breach acknowledgement, action lifecycle, audit, communication and AI-governance
legs, but four narrative statements commonly used in the script are **not supported by current data**
and two labelling defects would visibly contradict the presenter.

Blocking items are listed in `demo-discrepancy-register.md` (D1–D4 must be resolved before the
meeting; D5–D8 are presenter-language mitigations).

## 2. Evidence chain — certified TRUE

| Narrative statement | Evidence | Result |
|---|---|---|
| Coral Harbour Bank Limited is the demo entity | `licensees` id `5855bf85-9fde-4cf8-a082-7ea904d46184` | TRUE |
| An accepted Q3 filing exists | `return_filings` ref `CV2-E02-2025-Q3`, `ACCEPTED`, accepted 2025-11-11 09:30 UTC, accepted version `5568551b-5574-48b8-aa9a-5f1ac283751f` | TRUE |
| Ratios are calculated from accepted filing data, not typed in | `return_metric_values` on the accepted version: CAR 12.5, LIQUIDITY_RATIO 14.5, NPL_RATIO 5.8, COST_INCOME_RATIO 74.0, with all underlying inputs stored (capital 150,000,000; RWA 1,200,000,000; liquid assets 87,000,000; short-term liabilities 600,000,000; NPL 55,680,000; gross loans 960,000,000; opex 44,400,000; NII 60,000,000) | TRUE |
| Filing currency is XCD | `currency_source = REGULATOR_BASE`; all 93 `return_filings` rows report XCD | TRUE |
| Thresholds are configured, not hard-coded | `prudential_thresholds`: CAR warn 12 / breach 10 (`>=`); LIQUIDITY warn 20 / breach 15 (`>=`); NPL warn 5 / breach 10 (`<=`); COST_INCOME warn 65 / breach 75 (`<=`) | TRUE |
| Coral Harbour has one true breach plus early warnings | Liquidity 14.5 vs 15.0 floor = **breach**; NPL 5.8 vs 5.0 = **warning**; cost/income 74 vs 65 = **warning**; CAR 12.5 vs 12.0 = compliant | TRUE |
| Portfolio breach inbox and Executive Dashboard agree | Both read `v_prudential_current_breaches`; both show 47 | TRUE (but see D5) |
| Acknowledgement is required and outstanding | All 47 rows have `acknowledged_at IS NULL` | TRUE |
| Supervisory action exists and has progressed | `PA-2026-0001` in_progress (liquidity remediation, due 2026-04-30); `PA-2026-0002` completed (NPL explanation, due 2026-03-31) | TRUE |
| Returns oversight numbers are canonical | `returns_supervisory_summary()`: total 93, submitted 93, accepted 90, pending review 3, overdue 2, SLA-breached 1 | TRUE |
| Ownership 54% / 46% is derived, not fabricated | Direct: Alicia Joseph 15%, Daniel Mercer 25% in Hewanorra Nexus Digital Finance Ltd; Nexus Caribbean Holdings Ltd 60%; Alicia 65% / Daniel 35% of Nexus. Derived effective: Alicia 15 + (0.65 × 60) = **54%**, Daniel 25 + (0.35 × 60) = **46%** | TRUE (see D3 for entity naming and UBO) |
| AI output is genuine model output, not scripted | `ai_insights` rows carry `provider = lovable-ai-gateway`, `model = google/gemini-3.5-flash`, `input_fingerprint`, citations/evidence arrays, `provider_state` (e.g. `INSUFFICIENT_DATA`), `confidence` | TRUE |
| AI is advisory and human-controlled | `review_status = pending` on generated insights; advisory panels never write canonical records; feedback stored with `feedback_by` / `feedback_at` | TRUE (see D6) |
| Auditability is real | `audit_logs` 9,503 rows; `compliance_audit_logs` 27,909 rows; canonical dual-surface primitive `prudential_audit_event` | TRUE |
| Communication capability is real | `notifications` 7,413 rows; `correspondence_messages` 20 rows; Resend-primary / SMTP-fallback delivery in place | TRUE |
| Persona set exists | 25+ role personas in `cert_certification_users` (officer/supervisor pairs across licensing, returns, prudential, complaints, enforcement, conduct, inspection, executive, legal, audit) | TRUE |

## 3. Statements NOT currently supported

| Narrative statement | Actual system state | Severity |
|---|---|---|
| "The engine has risk-scored the Saint Lucia entities" | `entity_risk_scores` has 19 rows, **none for any Saint Lucia demo entity**, and every current band is `low` with all-zero components | P0 |
| "This entity is rated HIGH risk" | No entity in the environment is above `low`; a HIGH result cannot be shown without fabricating it | P0 |
| "Here are the identified ultimate beneficial owners" | `ubo_policies` is **empty**, so `entity_ubo_resolve` returns `CONFIGURATION_REQUIRED` for the Saint Lucia regulator (`8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3`) | P0 |
| "Here is the examination on our demo entity" | All 13 `examinations` belong to non-demo entities (Meridian Commercial Bank, Windward Trust Bank); zero for Coral Harbour or any Saint Lucia entity | P1 |
| "This complaint is against Coral Harbour" | `CMP-2026-000103` is `submitted`, medium severity, `licensee_id` NULL, and both respondent rows have NULL `licensee_id` | P1 |
| "Stress indicators have raised events" | `prudential_stress_indicators` 13 configured, `prudential_stress_events` **0** | P1 |
| "Supervisory attention queue shows prioritised work" | `conduct_attention_items` = 0 | P1 |
| "Fitness & propriety cases exist for our demo entity" | 36 `fp_assessments` exist (34 determined, 1 screening, 1 draft) but **0 linked to any Saint Lucia licensee** | P1 |
| "All payments are in XCD" | 10 completed payments XCD 10,000 total; **2 completed USD payments remain** (USD 25,000 on APP-2026-000148, USD 112.00 on APP-2026-000159) — append-only certification-fixture residue | P2 |

## 4. Screen-level labelling defects

| Screen | Defect | Impact |
|---|---|---|
| Executive Dashboard "Open Breaches" KPI | Counts all `v_prudential_current_breaches` rows with no `level` filter; the 47 comprise **38 `warn` + 9 `breach`** | Presenter would state 47 breaches when only 9 are breaches |
| Breach Inbox "Open" tile | Same unfiltered mix; the "Critical / High" tile filters on `level in ('critical','high')`, values that do not exist in the `warn`/`breach` schema — permanently 0 | Visible dead KPI |
| Breach Inbox row severity chip | `LEVEL_META` keys (`critical/high/medium/warning/low/info`) do not match stored `warn`/`breach`, so raw text renders unstyled | Cosmetic but noticeable |
| Breach Inbox / Alert Center threshold cell | Shows a single `threshold_value` without saying whether it is the warning or breach threshold; warning rows display the **breach** threshold (NPL 10, cost/income 75) | Contradicts the scripted warning thresholds (5.0 / 65) |
| Alert Center | Titles every row `Breach: {metric}`, including warn-level early warnings | Overstates severity |
| Entity 360 breach tab | Counts correctly separated (`current_breach_count` / `unacknowledged_breach_count`) and `sup_entity_supervisory_state` splits breach vs EWI, but the tab heading still reads "Breaches" for a mixed list | Minor |
| Report Chart widget (`ChartWidget.tsx:75`) | Hardcodes `$` for `format === 'currency'` | Contradicts XCD narrative |
| General Settings currency dropdown | USD/EUR/GBP selector whose value is never consumed anywhere | Regulator-visible dead control |
| AI stop control | `ai_governance_kill_switches.is_engaged` is written and displayed but not read by any AI edge function or client hook; `SUPERVISORY_ADVISORY_AI_ENABLED` is a hardcoded `true` | Do **not** claim the kill switch halts AI execution |

Correct positive: `PrudentialEntityHistoryDrawer` labels breach vs warning correctly, and
`sup_entity_supervisory_state` splits `current_breaches` from `current_ewis` server-side.

## 5. Certified-safe narrative wording

- "47 current threshold exceptions — 9 breaches and 38 early-warning signals — all awaiting acknowledgement."
- "Coral Harbour's liquidity ratio of 14.5% breaches the configured 15% floor; NPL at 5.8% and cost/income at 74% are early warnings."
- "Effective ownership of 54% / 46% is derived by the platform through the holding company; UBO determination requires the regulator's UBO policy to be configured."
- "AI is advisory: it is generated by a governed model gateway, it records provider, model, confidence and evidence, and a person decides. Nothing is written to a regulatory record by the model."
- Avoid: "HIGH risk", "the engine rated this entity", "identified UBOs", "the kill switch stops AI", any single currency symbol other than XCD / EC$.

## 6. Companion documents

- `demo-screen-value-matrix.md` — screen, URL, expected on-screen values
- `demo-record-readiness-register.md` — prepared records and their state
- `demo-live-action-rehearsal.md` — safe live actions and fallbacks
- `demo-discrepancy-register.md` — full discrepancy list with severity and remediation type
