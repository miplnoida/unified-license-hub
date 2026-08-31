# Saint Lucia FSRA — Demo Narrative-to-Data Certification

HEAD `687a4b892b0752a4448efdf64fff2b1be3f94c0d` · migrations 1317 · read-only wave, 2026-08-31.
No product code, migration, status, figure or seed was changed in this wave.

## Method

Every scripted statement was tested against stored source data and the reader used by the
screen. A metric is only required to agree where definition, population scope, entity scope,
reporting period, current/historical basis, workflow-status predicate, active filters and
version/filing basis are identical. Legitimately different scopes are recorded as different,
not forced to match.

## Gate baseline re-established at this HEAD

| Gate | Result |
|---|---|
| `verify:st-lucia-demo` | 21/21 gates passed |
| `verify:currency-integrity` | 23/23 tests passed (3 files) |
| `metricConsistency.test.ts` | 5/5 passed |

## A. Demo path certification (27 steps)

| # | Screen | Data support | Verdict |
|---|---|---|---|
| 1 | Executive Dashboard | canonical aggregates; 47 current breaches, tier switcher present | PASS |
| 2 | Organisation registration | governed onboarding wizard live | PASS |
| 3 | Licensing queue | 29 applications (17 draft, 5 submitted, 7 approved) exist, but **none** on a Saint Lucia demo entity | PASS with caveat (D15) |
| 4 | In-progress licensing application | only `VRF-RS-*` certification-fixture submissions available | CAVEAT (D15) |
| 5 | Approved application | `APP-2026-000148`, `APP-2026-000159` approved — both carry legacy **USD** payments | CAVEAT (D7/D15) |
| 6 | Entity 360 | Coral Harbour and Hewanorra populated across supervisory areas | PASS |
| 7 | Ownership network / group structure | derived from recorded interests; new runtime tree diagram renders | PASS |
| 8 | Fit & Proper case | `fp_assessments` on demo entities = **0** | FAIL (D4/D15) |
| 9 | Returns Filing Queue | canonical returns aggregate | PASS |
| 10 | Coral Harbour accepted 2025-Q3 return | accepted immutable version `5568551b-…f751f`, filing `CV2-E02-2025-Q3` | PASS |
| 11 | Prudential overview | canonical breach/action/EWI counts | PASS |
| 12 | Ratios & Trends | `return_metric_values` canonical, 5 quarters present | PASS |
| 13 | Breaches | population correct; **severity labelling wrong** (38 warn shown as breaches) | FAIL (D5/D8) |
| 14 | Prudential actions | `PA-2026-0001` in_progress, `PA-2026-0002` completed with closure notes | PASS |
| 15 | Examination workspace | examinations on demo entities = **0** | FAIL (D4) |
| 16 | Complaint CMP-2026-000103 | exists, status `submitted`, `licensee_id` NULL | CAVEAT (D12) |
| 17 | Complaint current step / casework | governed casework surfaces live | PASS |
| 18 | Supervisory Attention | `conduct_attention_items` = **0** | FAIL (D6) |
| 19 | My Work | canonical queue aggregates | PASS |
| 20–25 | Executive / Licensing / F&P / Prudential / Examination / Complaint AI | 18 `ai_insights`, genuine provenance, advisory only; `ai_insight_actions` = 0 so no accepted/modified/rejected example exists | CAVEAT (D18) |
| 26 | AI Governance | 2 models, 25 governance events, 15 activity attempts, 3 kill switches — kill switch is **recorded, not enforced** | CAVEAT (D3) |
| 27 | Activity Log | 9,539 `audit_logs` + 28,005 `compliance_audit_logs` | PASS |

## B. Coral Harbour evidence chain — reproduced from stored data

Accepted return → accepted immutable filing version `5568551b-5574-48b8-aa9a-5f1ac283751f`
→ reporting currency XCD → `return_metric_values` → ratios → threshold evaluation →
`v_prudential_current_breaches` → acknowledgement columns → `prudential_actions` → audit.

| Figure | Stored value | Unit | Scripted | Match |
|---|---|---|---|---|
| Regulatory capital (`TOTAL_CAPITAL`) | 150,000,000 | XCD | 150,000,000 | YES |
| Risk-weighted assets (`RWA`) | 1,200,000,000 | XCD | 1,200,000,000 | YES |
| Capital adequacy | 12.50 | % | 12.5 | YES |
| Liquid assets | 87,000,000 | XCD | 87,000,000 | YES |
| Short-term liabilities | 600,000,000 | XCD | 600,000,000 | YES |
| Liquidity | 14.50 | % | 14.5 | YES |
| Non-performing loans | 55,680,000 | XCD | 55,680,000 | YES |
| Gross loans | 960,000,000 | XCD | 960,000,000 | YES |
| NPL | 5.80 | % | 5.8 | YES |
| Operating expenses | 44,400,000 | XCD | 44,400,000 | YES |
| Net interest income | 60,000,000 | XCD | 60,000,000 | YES |
| Cost-to-income | 74.00 | % | 74.0 | YES |

All twelve figures agree across accepted return, metrics, ratios/trends, breach view,
Entity 360, prudential overview and governed reports because every surface reads the same
canonical store.

### Threshold evaluation — script does not match stored configuration

| Metric | Stored comparator/threshold | Stored outcome | Scripted claim |
|---|---|---|---|
| `LIQUIDITY_RATIO` | `>= 15.0` | **breach** (14.5) | breach against 15.0 floor — CORRECT |
| `NPL_RATIO` | `<= 10.0` | **warn** (5.8) | "breach of a 5.0 threshold" — **NOT SUPPORTED** |
| `COST_INCOME_RATIO` | `<= 75.0` | **warn** (74.0) | "breach of a 65.0 threshold" — **NOT SUPPORTED** |

Only the liquidity condition is a breach. NPL and cost-to-income are early warnings against
10.0 and 75.0. This is recorded as D16 and must be corrected in the script or in configuration
before the demonstration.

## C–G

See `demo-screen-value-matrix.md` (count semantics), `demo-record-readiness-register.md`
(prepared records), `demo-live-action-rehearsal.md` (safe live actions and AI boundaries) and
`demo-discrepancy-register.md` (full register and remediation order).

## Verdict

**NOT READY — REMEDIATION REQUIRED** (see register: D1, D2, D4, D5, D6, D16 are demo-blocking).
