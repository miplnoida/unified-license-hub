# AML/CFT — assessment structural integrity closure

Baseline HEAD `8c5d3ff334ed447ce4c16a46641ff9551d8e9539`. Engineering integrity only:
no effective-date rule decision, no calculation configuration, no score, band,
matrix cell, `inherent_direction`, no methodology version change, no question
change, no judged rating change, no certification claim. DMS remains frozen.

## 1. Structural defect closed

Assessment dimensions were not materialised when an assessment was created, so the
working file held whatever rows a caller happened to write. The methodology
dimension universe is now materialised inside the creation transaction.

| Change | Object |
| --- | --- |
| Materialisation | `supervisory_assessment_dimension_materialise_internal(assessment, actor)` — internal, `service_role` only; returns `status` / `expected` / `existing` / `created` / `created_codes`; `NO_METHODOLOGY` when nothing is bound |
| Creation | `supervisory_assessment_create` calls it in the same transaction, returns `structure`, and records `dimensions_materialised` in the audit entry |
| Answer writer | `supervisory_assessment_question_upsert` resolves the dimension row server-side, creates it when missing, writes and returns `assessment_dimension_id` |
| Answer guard | `supervisory_assessment_response_link_guard_trg` refuses cross-assessment links, code mismatches, and unbound answers where a dimension row exists |
| Governed repair | `supervisory_assessment_structure_backfill(_domain_code, _dry_run default true, _rationale)` — `<module>.manage_config`, rationale ≥10 chars, idempotent, `STRUCTURE_REPAIRED` event plus audit per repair, dry-run returns the plan and conflicts |
| Engine honesty | `supervisory_calc_compute_policy` emits `reason_code` on every outcome (`NO_DIMENSIONS`, `NO_CALCULABLE_DIMENSION`, `NO_MATRIX_CELL`, `INCOMPLETE_DIMENSION_SIDES`, `NO_RECOMMENDATION`, `DIMENSION_NOT_IN_METHODOLOGY`), adds `published_questions`, treats an unlinked dimension as `NOT_CALCULABLE`, and reports `CALCULATED` only when a recommendation exists |

## 2. State after repair

| Measure | Value |
| --- | --- |
| AML/CFT assessments | 27, all methodology-bound |
| Assessment dimensions | 724 (702 expected from the active methodology's 26 active dimensions, plus 22 legacy rows) |
| Unlinked dimensions | 22, all `STR_SAR_GOVERNANCE` — a code the bound methodology does not publish |
| Question responses | 984, 0 unbound, 0 mis-bound |

## 3. Verification (exact counts)

| Suite | Result |
| --- | --- |
| `scripts/verify-aml-assessment-structural-integrity.sql` | STRUCT-01…STRUCT-14 — 14 PASS, 0 FAIL |
| `scripts/verify-aml-dimension-linkage.sql` | 11 PASS, 1 FAIL — LINK-11 (22 `STR_SAR_GOVERNANCE` rows) |
| `scripts/verify-aml-calc-outcome-fixtures.sql` | OUTC-01…OUTC-14 — 14 PASS, 0 FAIL |
| `scripts/verify-aml-calculation-governance.sql` | CALCG-01…CALCG-20 — 20 PASS, 0 FAIL |
| `scripts/verify-aml-calculation-integrity.sql` | 7 PASS, 4 FAIL — CALC-05, CALC-06, CALC-09, CALC-11 |
| `scripts/verify-aml-full-module-hardening.sql` | 15 PASS, 1 FAIL — AMLH-09 |
| `bunx tsgo --noEmit` | clean |
| `bunx vitest run src/test/rbac` | 70 passed, action coverage 100% (two document-upload action sites re-marked) |
| `scripts/validate-nav-icons.mjs` | OK — 240 items |
| `scripts/verify-breadcrumb-coverage.mjs` | 362 routes, 0 uncovered |
| Build | OK |
| Security linter | 1611 issues, unchanged baseline, no new issue type |

OUTC-11 was failing because its "calculable" fixture answered only the inherent
side; under the corrected contract a residual rating needs both sides. The
fixture now carries a fourth assessment (`ZZ-OUTC-CALC`) answered on both sides,
so the gate proves the distinction instead of tolerating it.

Not executed, therefore not claimed: driven browser journeys, Playwright AML
suite, scale/performance and accessibility passes, full `src/test` run.

## 4. Remaining blockers (policy, not engineering)

1. LINK-11 — whether the 22 `STR_SAR_GOVERNANCE` dimensions map to
   `STR_GOVERNANCE` or belong to a retired methodology is a methodology decision.
2. CALC-05, CALC-06, CALC-09, CALC-11 and AMLH-09 — no ACTIVE calculation
   configuration and no recorded AML/CFT effective-date rule exist. Both must be
   authored in the Administration screens and approved by a second identity.

## 5. Verdicts

- ASSESSMENT STRUCTURAL INTEGRITY — **PASS** (14/14)
- DECISION PACK — **NOT READY**
- AML FULL MODULE HARDENING — **NOT CERTIFIED**

## 6. SERVER AUTHORITY CLOSURE

Engineering integrity only. No methodology, question, weight, score, band, matrix
cell, `inherent_direction`, effective-date rule or rating was authored or changed.

### 6.1 Methodology binding is server-authoritative

`supervisory_assessment_create` previously accepted `_methodology_id` and proved
only that the row existed. It now resolves the applicable version itself through
`public.supervisory_methodology_resolve_detail(_domain_code, _sector_id, _as_of,
_regulator_id)` — as of the execution date, per the approved resolution decision —
and treats any caller-supplied id as a consistency assertion only.

| Condition | Outcome |
| --- | --- |
| No applicable version | `methodology_unavailable` |
| Two equally applicable versions | `methodology_ambiguous` |
| Caller id <> resolved id (foreign domain, inactive, future, expired, wrong sector, valid-but-not-resolved) | `methodology_selection_mismatch` |

Sector semantics were corrected: `NULL` is no longer a wildcard on either side.
A `NULL` entity sector resolves only genuinely global versions (`sector_id IS NULL`
and an empty `applicable_sector_ids`); otherwise a version qualifies on
`sector_id = _sector_id` or membership of `applicable_sector_ids`. A `NULL` caller
regulator is likewise not a wildcard. Specificity ranking is sector-scoped (2) >
sector-listed (1) > global (0), plus regulator-scoped (2), then `effective_from`
descending.

### 6.2 Canonical write authority

The eight canonical supervisory tables previously granted
`INSERT/UPDATE/DELETE/TRUNCATE` to both `anon` and `authenticated`, with a single
permission-shaped `_write` policy. Direct writes are now closed:

- every INSERT/UPDATE/DELETE policy dropped;
- `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER … FROM anon, authenticated`; `REVOKE ALL … FROM anon`;
- `GRANT SELECT … TO authenticated` (governed read RLS unchanged), `GRANT ALL … TO service_role`;
- RLS remains enabled on every table.

The only mutation paths are `supervisory_assessment_create`,
`supervisory_assessment_transition`, `supervisory_assessment_dimension_upsert`,
`supervisory_assessment_question_upsert` and the governed repair RPCs.
`supervisory_assessment_event` is therefore server-generated only.

### 6.3 Methodology version immutability

`supervisory_methodology_dimension_save` and
`supervisory_methodology_question_sync` refuse any structural change — adding or
removing a dimension, re-weighting, toggling activation, changing questions —
unless the version status is `DRAFT` or `REVIEW`:

`methodology_immutable: version status <S> is structurally frozen; create a new
methodology version to change dimensions, weights, questions or activation`

`APPROVED`, `ACTIVE`, `SUPERSEDED` and `RETIRED` are frozen; change requires a new
version via `supervisory_methodology_new_version()`. Historical assessments bound
to the current version are unaffected by edits to a new draft.

### 6.4 Concurrency

`supervisory_assessment_dimension_materialise_internal` inserts with
`ON CONFLICT (assessment_id, dimension_code) DO NOTHING` against
`supervisory_assessment_dimension_uniq`, so concurrent creation and repeated
materialisation raise no unique violation and report `ALREADY_COMPLETE` with
`created = 0`.

### 6.5 Verification

`scripts/verify-supervisory-authority-boundary.sql` — AUTH-01…AUTH-17, **17 PASS,
0 FAIL**. Every gate executes the prohibited action and asserts the refusal:
no write grants or write policies for `anon`/`authenticated` (AUTH-01…04);
a `super_admin` signed-in identity refused direct writes to assessment, dimension,
event and methodology-dimension (AUTH-05…08); server-resolved binding, foreign
domain, non-resolved version, NULL-sector non-wildcard and ambiguity
(AUTH-09…13); immutability on `ACTIVE` for a structural change and an activation
toggle, acceptance on a new draft with the current version unchanged
(AUTH-14…16); idempotent materialisation (AUTH-17).

### 6.6 Regression

| Suite | Result |
| --- | --- |
| `verify-supervisory-authority-boundary.sql` | 17 PASS, 0 FAIL |
| `verify-aml-assessment-structural-integrity.sql` | 14 PASS, 0 FAIL |
| `verify-aml-calc-outcome-fixtures.sql` | 14 PASS, 0 FAIL |
| `verify-aml-calculation-governance.sql` | 20 PASS, 0 FAIL |
| `verify-aml-dimension-linkage.sql` | 11 PASS, 1 FAIL — LINK-11 (22 `STR_SAR_GOVERNANCE` rows) |
| `verify-aml-calculation-integrity.sql` | 7 PASS, 4 FAIL — CALC-05/06/09/11 (no ACTIVE calculation configuration, no effective-date rule) |
| `verify-aml-full-module-hardening.sql` | 15 PASS, 1 FAIL — AMLH-09 |
| `bunx tsgo --noEmit` | clean |
| `bunx vitest run src/test/rbac` | 70 passed, action coverage 100% |
| `bunx vite build` | OK |

All failures are the unchanged policy blockers recorded in §4 — none is an
authority or structural defect.

Pre-existing, out of scope: `verify-epic-2-supervisory-spine.sql`,
`verify-epic-3-aml-closed-loop.sql` and `verify-w4-a6-aml-closed-loop.sql` abort
on `dimension_not_in_methodology` because their fixtures answer dimension codes
the ACTIVE methodologies do not publish (`CAPITAL_ADEQUACY`; `STR_SAR_GOVERNANCE`
versus the published `STR_GOVERNANCE`). This is the off-methodology guard from §1
meeting stale fixture vocabulary — the same methodology decision as LINK-11, not
an authority regression. Not executed, therefore not claimed: driven browser
journeys, Playwright suites, scale/accessibility passes, full `src/test` run.
