# Certification V2 — Wave 2: Golden Formula & Threshold Dataset

Status: **CERTIFIED**
Harness: `scripts/cert-v2/02-wave2-supervisory-universe.sql`
Verifiers: `cert_v2_golden_ratios()`, `cert_v2_universe_gate()`

---

## 1. Method

The universe is designed **ratio-first**. For every entity/period the design fixes
the intended ratio series (e.g. E01 CAR 16.4 → 16.3 → 16.2 …). The harness then
works backwards through `cert_v2_reported_inputs()` to produce the raw reported
inputs (capital, risk-weighted assets, liquid assets, liabilities, NPLs, gross
loans, operating cost, operating income) that must yield those ratios.

Reported inputs are written as `return_metric_values.source_kind = 'REPORTED'`.
No calculated value is ever written by the harness. Calculation is performed by
the **real server engine** (`returns_calculate_metrics`) through
`cert_v2_seed_calculate()`, exactly as an operational submission does.

`cert_v2_golden_ratios()` then compares the design series (expected) against the
stored engine output (actual).

---

## 2. Result

| Population | Count | Status |
| --- | --- | --- |
| Reported values seeded | 1,207 | — |
| Engine-calculated values (AVAILABLE) | 278 | — |
| Engine-calculated values (NOT_AVAILABLE — missing inputs) | 176 | expected |
| Engine-calculated values (ERROR — zero denominator) | 1 | expected |
| Golden comparisons executed | 278 | — |
| Golden comparisons FAIL | **0** | **PASS** |

Sample (E01, HEALTHY):

| Entity | Period | Metric | Expected | Engine actual | Status |
| --- | --- | --- | --- | --- | --- |
| E01 | 2024-Q1 | CAPITAL_ADEQUACY_RATIO | 16.4 | 16.4 | PASS |
| E01 | 2024-Q1 | LIQUIDITY_RATIO | 34.0 | 34.0 | PASS |
| E01 | 2024-Q1 | NPL_RATIO | 2.8 | 2.8 | PASS |
| E01 | 2024-Q1 | COST_INCOME_RATIO | 58.0 | 58.0 | PASS |
| E01 | 2024-Q2 | CAPITAL_ADEQUACY_RATIO | 16.3 | 16.3 | PASS |
| E01 | 2024-Q4 | COST_INCOME_RATIO | 59.0 | 59.0 | PASS |

---

## 3. Deliberate arithmetic edge cases

| Scenario | Entity | Engine behaviour | Verdict |
| --- | --- | --- | --- |
| ZERO_DENOMINATOR | E15 | 1 value recorded `availability = 'ERROR'`; no exception, no NULL masquerading as a value | correct |
| MISSING_INPUT | E16 | dependent metrics recorded `availability = 'NOT_AVAILABLE'`; ratio not fabricated | correct |
| BOUNDARY_PASS | E13 | value exactly at threshold does **not** raise a breach | correct |
| BOUNDARY_WARN | E14 | value one step across the warn line raises `level = 'warn'`, `risk_level = 'amber'` | correct |

---

## 4. Threshold resolution certification

Thresholds are resolved from `prudential_thresholds` by metric key, with
`warn_value` / `breach_value` and comparator direction.

Certification thresholds used by the universe:

| Metric | Comparator | Warn | Breach |
| --- | --- | --- | --- |
| CAPITAL_ADEQUACY_RATIO | >= | 12.0 | 10.0 |
| LIQUIDITY_RATIO | >= | 20.0 | 15.0 |
| NPL_RATIO | <= | 5.0 | 10.0 |
| COST_INCOME_RATIO | <= | 65.0 | 75.0 |

Resolution outcome across the seeded universe:

| Metric | warn (amber) | breach (red) |
| --- | --- | --- |
| CAPITAL_ADEQUACY_RATIO | 8 | 1 |
| LIQUIDITY_RATIO | 7 | 1 |
| NPL_RATIO | 11 | 3 |
| COST_INCOME_RATIO | 12 | 4 |

Total breaches: **47**, produced by **88 detection runs**, with **0 failed runs**.
Breach attribution is entity-correct: red breaches concentrate on
Windward Trust Bank (CAPITAL_WEAKNESS) and Coral Harbour Bank
(LIQUIDITY_STRESS); Tabernacle Commercial Bank (BOUNDARY_WARN) produces warn
levels only.

### 4.1 Observation carried forward (configuration, not a defect)

`prudential_thresholds` contains both upper-case (`NPL_RATIO`) and lower-case
(`npl_ratio`) keys from earlier configuration eras. Detection resolves on exact
key, so there is no ambiguity in evaluation, but the duplicate naming should be
consolidated during Wave 3 threshold administration work.

---

## 5. Reproducing

```sql
SELECT public.cert_v2_seed_universe('golden re-verify');
SELECT status, count(*) FROM public.cert_v2_golden_ratios() GROUP BY 1;  -- 278 PASS
SELECT * FROM public.cert_v2_universe_gate();                            -- 13 PASS
```
