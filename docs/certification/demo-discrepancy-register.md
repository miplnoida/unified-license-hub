# Saint Lucia FSRA — Demo Discrepancy Register

HEAD `6919e2384a1332e06b810dcb3fdda998b4c4722f`. Read-only certification, 2026-08-31.
No remediation has been applied in this wave. Remediation type is stated so the next wave stays minimal.

| ID | Discrepancy | Severity | Screen impact | Remediation type | Order |
|---|---|---|---|---|---|
| D1 | No Saint Lucia entity has a risk score; all 19 scored entities are band `low` with all-zero components, so no risk-based supervision result and no HIGH rating can be shown | P0 | Risk views, Executive risk band tile, AI portfolio insight ("19 entities low") | **Engine run over demo data** — score the Saint Lucia entities using the existing weighted engine (breaches, complaints, overdue returns, enforcement, findings, F&P). Never hard-code a band | 1 |
| D2 | `ubo_policies` is empty, so `entity_ubo_resolve` returns `CONFIGURATION_REQUIRED` for regulator `8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3` | P0 | UBO tab shows configuration-required instead of identified UBOs | **Configuration** via the existing governed `admin_upsert_ubo_policy` (ownership/voting thresholds, control test). No schema or code change | 2 |
| D3 | AI stop control writes `ai_governance_kill_switches.is_engaged` but no edge function or client hook reads it; `SUPERVISORY_ADVISORY_AI_ENABLED` is a hardcoded `true` | P1 | Governance screen implies enforceable AI suspension that is not enforced | **Presenter language now** ("the suspension decision is recorded and governed"); code enforcement is a separate governance wave | 3 |
| D4 | No examination and no F&P assessment is linked to any Saint Lucia demo entity (13 examinations on Meridian/Windward; 36 F&P assessments unlinked) | P1 | Examination and F&P steps must switch entity mid-journey | **Demo data** — create one examination and one F&P case on Coral Harbour through the existing governed paths, or drop these steps from the journey | 4 |
| D5 | The 47 "breaches" are 38 `warn` + 9 `breach`; Executive Dashboard and Breach Inbox count them unfiltered, Alert Center titles all of them "Breach:", and warning rows display the **breach** threshold | P1 | Presenter would misstate severity; warning rows contradict the scripted 5.0 / 65 warning thresholds | **Label/UI correction** — split counts into breaches vs early warnings and show the threshold that was actually crossed. Interim: use the certified wording | 5 |
| D6 | `prudential_stress_events` = 0 and `conduct_attention_items` = 0 | P1 | Stress and supervisory attention screens are empty | **Demo data** through the certified stress evaluation path (F8-W3A), or omit these screens | 6 |
| D7 | Two completed USD payments remain (USD 25,000 on APP-2026-000148, USD 112.00 on APP-2026-000159) alongside 10 XCD payments | P2 | Contradicts the XCD narrative if those applications are opened | **Avoid in journey** — records are append-only regulatory evidence and must not be deleted | 7 |
| D8 | Breach Inbox "Critical / High" tile filters `level in ('critical','high')`, values absent from the `warn`/`breach` schema; row severity chips fall back to unstyled raw text | P2 | Permanently-zero KPI and unstyled chips | **Small UI fix** in the same change as D5 | 8 |
| D9 | `ChartWidget.tsx:75` hardcodes `$` for currency-formatted chart values | P2 | Report charts show `$` in an XCD demo | **Small UI fix** — route through `formatBaseMoney` | 9 |
| D10 | General Settings currency dropdown (USD/EUR/GBP) is never consumed anywhere | P2 | Regulator-visible dead control | **Small UI fix** — remove or bind to governed currency configuration | 10 |
| D11 | `RetailPaymentsPanel.tsx:81` and `FilingMonetaryDisplay.tsx:80` render data-driven currency codes without `money.ts`, so decimal precision is not governed | P3 | Precision may differ from `currencies.decimal_precision` | **Small UI fix** | 11 |
| D12 | Complaint `CMP-2026-000103` has NULL `licensee_id` and both respondent rows have NULL `licensee_id` | P2 | Cannot be presented as a complaint against a specific entity | **Demo data** — link the respondent to Coral Harbour through the existing governed complaint path | 12 |
| D13 | Entity 360 "Breaches" tab heading covers a mixed breach/warning list (counts are correctly separated underneath) | P3 | Minor ambiguity | **Label correction** with D5 | 13 |
| D14 | `PrudentialEntityHistoryDrawer` and `sup_entity_supervisory_state` already distinguish breach vs EWI correctly — the portfolio surfaces diverge from this correct server contract | Informational | — | Adopt the server contract in the portfolio surfaces (D5) | — |

## Interpretation

- No fabricated data, fabricated AI output, fabricated ownership or hard-coded risk result was found.
- Everything asserted about ratios, thresholds, breach semantics, ownership derivation, actions,
  audit, notification and AI provenance is genuinely supported by data.
- The blocking gaps are **missing engine output and missing configuration** (D1, D2) plus
  **labelling** (D5), not architectural defects.
