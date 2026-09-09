# AML-06 — Calculation policy, scoring and residual-risk engine

This document records what the platform can do (engine capability), what the
rolled-back certification fixture publishes (AML06CERT synthetic policy) and what
the regulator has actually decided in the live database (live regulator policy).
These three are kept strictly apart: the platform never substitutes a value the
regulator has not published.

## 1. Policy architecture

A calculation policy is a versioned, attributable record owned by the regulator
and bound to one published methodology version. Its layers are:

| Layer | Store | What the regulator decides |
| --- | --- | --- |
| Parameters | `supervisory_calculation_config` | rounding, aggregation default, recommendation policy, version, status |
| Response scoring | `supervisory_calculation_response_score` | the score a published response option carries |
| Question participation | `supervisory_calculation_question_weight` | whether a question is scored, excluded or informational; its weight; whether it is critical |
| Dimension policy | `supervisory_calculation_dimension_weight` | which side a dimension feeds (inherent risk or control effectiveness), its weight, its aggregation method, its minimum completeness |
| Fact transformation | `supervisory_calculation_fact_rule`, `..._fact_threshold` | data type, unit, direction, missing-fact treatment, target dimension, weight, and the threshold bands that turn a fact value into a score |
| Materiality | `supervisory_calculation_materiality_rule` | comparator, threshold, adjustment kind and band, with a mandatory rationale |
| Bands | `supervisory_calculation_band` | contiguous 0–100 band edges for the inherent and control scales |
| Residual matrix | `supervisory_calculation_matrix` | the rating for every inherent × control cell |

Vocabularies are finite and server-enforced. The published methodology supplies
the inherent-risk scale (`scoring_scale`) and the control-effectiveness scale
(`definition.control_scale`); band codes and residual-matrix cells may use no
other codes.

## 2. Administration surface

`/admin` → Supervisory calculation configuration presents one screen per policy
version with tabs: Parameters, Response scoring, **Question participation**,
**Dimension policy**, **Fact transformation**, **Materiality**, Bands, Residual
matrix, History. Approval is a separate maker-checker surface.

Behaviour:

- only a DRAFT version is editable; approved versions render read-only;
- validation is a server call (`supervisory_calculation_config_validate`) and its
  findings are displayed verbatim;
- lifecycle transitions (`DRAFT → REVIEW → APPROVED → ACTIVE → RETIRED`) run
  through `supervisory_calculation_config_lifecycle` with a rationale;
- the residual matrix and fact bands offer only methodology-published codes, so
  an unmatched rating code cannot be selected;
- every persisted action carries the canonical permission marker
  `aml_supervision.manage_config`.

## 3. Calculation chain

The server operation `supervisory_assessment_calculation_run_record` resolves the
programme, question plan, methodology version and the calculation policy in force
on the date the domain's effective-date rule names, then:

1. selects only questions the assessment's question plan includes;
2. applies participation and response scores;
3. transforms governed facts through their threshold bands, validating unit,
   period and ratio provenance, and applies the configured missing-fact
   treatment;
4. aggregates each dimension by its configured method and refuses a dimension
   below its minimum completeness;
5. aggregates the inherent-risk and control-effectiveness sides;
6. bands each side and selects the residual-matrix cell;
7. applies materiality flooring or flagging;
8. rounds as the policy directs and records the proposed result.

Where any input, policy element or vocabulary is missing, the run is recorded as
`NOT_CALCULABLE` with a machine-readable reason code. No fallback value is
invented anywhere in the chain.

## 4. Immutable runs, hashes and trace

Each calculation writes a new numbered run holding the input snapshot, the policy
snapshot, methodology/programme/question-plan references, question and fact
contributions, dimension results, both sides, the residual result, materiality
treatment, the proposed result, the engine version, the inputs hash, the result
hash and the complete trace. Direct `UPDATE`/`DELETE` is refused; recalculation
adds a run and leaves earlier runs untouched. Identical inputs and policy
reproduce an identical result hash.

## 5. Overrides

A supervisor may propose a rating from the methodology's published vocabulary
with a written rationale. The calculated values are copied onto the override
record and preserved. A different person must decide it (approve or reject);
maker-checker separation, permission and regulator scope are enforced server-side
and every decision is audited.

## 6. Risk-of-record boundary

AML-06 publishes nothing to the entity risk-of-record. A calculated run and an
approved override are supervisory working results only; the assessment workspace
states this explicitly.

## 7. Security

- writes to all AML-06 stores are revoked for signed-in roles; only the governed
  operations write;
- internal calculation helpers are not executable by `anon` or `authenticated`;
- `SECURITY DEFINER` routines pin `search_path`;
- cross-regulator and cross-assessment reads are refused rather than filtered;
- refusal reasons are code-based and disclose no restricted input.

## 8. Certification

| Suite | Gates |
| --- | --- |
| `scripts/verify-aml-calculation-policy-engine.sql` | POLICY 11, SCORE 4, FACTCALC 6, DIMCALC 3, INHERENT 1, CONTROL 1, RESIDUAL 3, TRACE 4, OVERRIDE 6, LIFECYCLE 2, SEC 6, LEGACY 3 — 50 total, rollback-only |
| `src/test/amlCalculationPolicyAdminUi.test.tsx` | UI-CALCADMIN-01…14 |
| `src/test/amlAssessmentCalculationWorkspace.test.tsx` | UI-CALC-01…15 |
| `scripts/verify-calculation-frontend-boundary.mjs` | CFB-01…12 |

The SQL suite creates an `AML06CERT` synthetic methodology publishing its own
inherent scale (`LOW`, `MODERATE`, `MEDIUM_HIGH`, `HIGH`, `SEVERE`) and control
scale (`WEAK`, `STRONG`) with a complete 10-cell residual matrix, and rolls back:
no `AML06CERT` record survives. Negative gates prove the validator refuses an
unknown inherent code, an unknown control code, a missing control scale, an
incomplete matrix, threshold gaps or overlaps, and unit disagreement.

## 9. Preservation

Nothing in AML-06 alters existing assessments, question plans, responses,
evidence, facts, historical calculation results, the entity risk-of-record,
methodology v1.0 or v1.1, reference programmes, or live scoring, band, matrix and
materiality policy.

## 10. Remaining regulator policy decisions

Live calculation policy is still empty by design. The regulator must decide and
approve, for the methodology version it wishes to operate: response scores,
question participation and weights, dimension sides, weights and minimum
completeness, fact transformations and bands, materiality rules, inherent and
control bands, and the residual matrix. Until an approved version exists, every
run is correctly recorded as `NOT_CALCULABLE`.

## 11. Final certification record (AML-06 lock)

Final code state: HEAD `027a96a7f`, clean tree. No functional change was made
during the certification lock.

### 11.1 SQL, UI and boundary results

| Gate | Result |
| --- | --- |
| `scripts/verify-aml-calculation-policy-engine.sql` | 50 / 50 PASS, rollback-only |
| `src/test/amlCalculationPolicyAdminUi.test.tsx` | 14 / 14 PASS |
| `src/test/amlAssessmentCalculationWorkspace.test.tsx` | 15 / 15 PASS |
| `scripts/verify-calculation-frontend-boundary.mjs` | CFB-01…12, 12 passed / 0 failed |
| `scripts/verify-evidence-fact-frontend-boundary.mjs` (AML-05) | FEB-01…12, 12 passed / 0 failed |

### 11.2 RBAC defect and correction

The first full-suite run failed `src/test/rbac/actionCoverage.test.ts` because the
local "Add band" control in `FactTransformEditor.tsx` and the "Add rule" control in
`MaterialityEditor.tsx` carried no canonical permission marker. Both now carry
`data-rbac="aml_supervision.manage_config"`. Action governance is 2283 / 2283
protected (100.0%). No file was allowlisted to silence the scanner.

### 11.3 Security results

| Gate | Result |
| --- | --- |
| RBAC action coverage | 2283 / 2283 protected |
| `verify-rbac-parity.mjs` | PASS |
| `verify-authz-centralized.mjs` | PASS — all decisions in `src/lib/rbac/authorize.ts` |
| `verify-hardening.mjs` | PASS — 4 passed / 0 failed |
| `verify-anon-execute.sql` | PASS — 7 allowlisted, 0 defects |
| Internal calculation helpers | not executable by `anon` or `authenticated` |

### 11.4 Three consecutive full regressions

| Run | Files | Passed | Failed | Skipped | Duration | Code state |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 168 | 1569 | 0 | 0 | ~276 s | unchanged |
| 2 | 168 | 1569 | 0 | 0 | 228.64 s | unchanged |
| 3 | 168 | 1569 | 0 | 0 | 222.17 s | unchanged |

Canonical two-worker configuration; no retries, skips, quarantine, weakened
assertions or timeout increases.

### 11.5 Typecheck and production build

`npx tsgo --noEmit` — PASS. `npm run build` — success, built in 58.50 s. Warnings
are advisory only (a Tailwind ambiguous-utility notice and the chunk-size notice);
neither blocks production readiness.

### 11.6 Preservation census

| Measure | Value |
| --- | --- |
| Supervisory assessments | 28 |
| Programme-driven assessments | 0 |
| Question-plan rows | 0 |
| Question responses | 984 |
| Evidence basis rows | 0 |
| Fact rows | 0 |
| Calculation policies | 0 |
| Question-policy rows | 0 |
| Dimension-policy rows | 0 |
| Fact-transformation rules | 0 |
| Threshold bands | 0 |
| Rating bands | 0 |
| Residual-matrix rows | 0 |
| Materiality rules | 0 |
| Response scores | 0 |
| Calculation runs | 0 |
| Historical calculation results | 2 |
| Overrides | 0 |
| Risk-of-record rated assessments | 25 |
| Risk-of-record digest | `3d9da4836a8ce2583b22293d1dbf705a` |
| Regulators | 3 |
| AML-CFT-RBA v1.0 | ACTIVE, REGULATOR_AUTHORED |
| AML-CFT-RBA v1.1 | DRAFT, MIPL_REFERENCE |
| Reference programme sets / programmes | 1 / 4 |
| Surviving `AML06CERT%` records | 0 |

Every preservation question — assessments, question plans, responses, evidence,
facts, historical calculation results, risk-of-record, v1.0, v1.1, v1.1
activation, reference programmes, live calculation policy, live bands, live
residual matrix, live materiality, AML business data deletion, regulator record
deletion — answers NO.

No AML06CERT synthetic value has been written as live regulator policy. The live
policy decisions listed in section 10 remain open.
