# AML/CFT Final Engineering Release Lock (AML-LOCK-01)

## 1. Locked release candidate

```
RELEASE_CANDIDATE_HEAD=4803c15fd5006426a8d78dee288f4531afe1d486
```

- Expected HEAD: `4803c15fd5006426a8d78dee288f4531afe1d486` — actual HEAD identical.
- Commit subject: `Fixed mixed-case & exam load`.
- Tree state: clean before, during and after certification (`git status --porcelain` empty).
- Commits/migrations since AML-UAT-01: none (functional). Only this document is added.
- Database migration state: connected Lovable Cloud database at the AML-UAT-01 migration level;
  no migration was applied during this lock.
- No functional fix was required, so the three integration runs all executed against this exact HEAD.

## 2. Accepted AML-UAT-01 evidence (referenced, not repeated)

| Evidence | Result |
|---|---|
| Browser AML screens | 8 / 8 |
| Governed acceptance journey | 29 / 29 |
| Portfolio reporting SQL | 50 / 50 |
| AML-08 | 66 passed |
| AML-09 | 43 passed |
| AML-11 | 41 passed |
| Full integration (UAT) | 174 files / 1703 tests |

Automated regressions confirmed present at the locked HEAD:

- Mixed-case rating normalisation — `scripts/verify-aml-portfolio-reporting.sql` gates
  CASE-01…CASE-04 (report + export parity, canonical bucket collapse, stored values unchanged),
  plus UI assertions in `src/test/amlPortfolioReporting.test.tsx`.
- Examinations screen broken data request — corrected `src/hooks/useAmlSupervision.ts` selection
  (no `examination_team_members.ended_at`), covered by the AML supervision UI suite.

Stored risk history was **not** rewritten: `entity_risk_state` = 22 rows,
`entity_risk_state_movement` = 25 rows, digest unchanged (see §8).

## 3. SQL verifier matrix (one pass, sequential, ON_ERROR_STOP, rollback-scoped fixtures)

| Verifier | Passed | Failed |
|---|---:|---:|
| verify-aml-route-register | 7 | 0 |
| verify-aml-assessment-structural-integrity | 14 | 0 |
| verify-regulator-scope-contract | 11 | 0 |
| verify-aml-policy-profile-kernel | 33 | 0 |
| verify-aml-methodology-studio | 45 | 0 |
| verify-assessment-programme-configuration | 52 | 0 |
| verify-assessment-question-plan | 50 | 0 |
| verify-aml-evidence-fact-readiness | 58 | 0 |
| verify-aml-calculation-governance | 20 | 0 |
| verify-aml-calculation-integrity | 7 | 4 (policy-dependent: CALC-05/06/09/11) |
| verify-aml-assessment-review-risk-publication (AML-07) | 47 | 0 |
| verify-aml-supervisory-consequence-linkage (AML-08) | 66 | 0 |
| verify-aml-risk-monitoring-reassessment (AML-09) | 43 | 0 |
| verify-aml-portfolio-reporting (AML-10) | 50 | 0 |
| verify-aml-supervisory-outcome-effectiveness (AML-11) | 41 | 0 |
| verify-aml-full-module-hardening | 56 | 5 (AMLH-09 + CALC-05/06/09/11) |
| verify-aml-v11-reference-draft | 18 | 0 |
| verify-aml-calculation-policy-engine (AML-12) | 50 | 0 |
| verify-aml12-activation-rehearsal (AML-12A) | 18 | 0 |
| verify-aml-dimension-linkage | 11 | 1 (LINK-11) |
| verify-epic-3-aml-closed-loop | 22 | 0 |

All fixture-based verifiers ran in a single transaction with a final `ROLLBACK` and a
post-rollback survivor check; every survivor check returned zero.

Every failing gate is a previously documented **external policy / methodology decision**
blocker, not an engineering defect:

- CALC-05, CALC-06, CALC-11 — no ACTIVE calculation configuration is published (DEC-01…DEC-08 unsigned).
- CALC-09 — no recorded AML/CFT effective-date rule decision.
- AMLH-09 — 565 approved dimensions with no governed calculation outcome (consequence of the above).
- LINK-11 — 22 dimensions use `STR_SAR_GOVERNANCE`, absent from the bound methodology; a
  methodology decision, not deterministically repairable.

## 4. Frontend / authority matrix

| Check | Result |
|---|---|
| AML-04 question-plan boundary | 7 / 7 |
| AML-05 evidence & facts boundary | 12 / 12 |
| AML-06 calculation boundary | 12 / 12 |
| AML-07 review & publication boundary | 17 / 17 |
| AML-08 consequence boundary | 20 / 20 |
| AML-09 monitoring boundary | 27 / 27 |
| AML-10 portfolio boundary | 33 / 33 |
| AML-11 outcome boundary | 39 / 39 |
| AML UI suites (review 25, consequence 25, monitoring 22, portfolio 27, outcome 25, plan 18, calculation 15, evidence 20, methodology/programme) | all passed |
| verify-authz-centralized | OK — 1609 files scanned, all decisions in `src/lib/rbac/authorize.ts` |
| verify-atomic-authz | OK — no unallowlisted check-then-mutate |
| verify-write-contract | OK — 0 stale runtime table-write column references |
| verify-breadcrumb-coverage | 371 / 373 (inherited, non-AML: `/supervision/detection`, `/supervision/management-assurance`) |

React never authoritatively decides lifecycle, readiness, eligibility, rating or publication —
every boundary verifier asserts server-owned decisions only.

## 5. RBAC and security

```
unguarded actions:                    0
actions checked:                      RBAC/action suites 11 files / 73 tests passed
RBAC violations:                      0
scope tuples passed/total:            46 / 46
anonymous execute count:              7 (certified allowlist, unchanged)
unpinned SECURITY DEFINER functions:  0 in the AML surface
advisories before:                    4 finding types (1756 linter advisories)
advisories after:                     4 finding types
delta:                                0
new finding types:                    0
inherited finding types:              Security Definer View; Function Search Path Mutable;
                                      registration storage anon read/upload;
                                      registration storage broad authenticated read
```

Inherited, non-AML red gates recorded for the platform backlog (present before this lock,
outside AML scope, no AML object involved):

- `verify-definer-guards` — 13 trigger functions executable by `anon`/`authenticated`.
- `verify-audit-contract` — 16 stale audit column references in
  `workflow_instance_start` and the `delegation_rule_*` functions.

## 6. Three full integration runs (same locked HEAD, two workers)

```
RUN 1 — 4803c15fd  174 files  1703 passed  0 failed  0 skipped  177.20s
RUN 2 — 4803c15fd  174 files  1703 passed  0 failed  0 skipped  168.30s
RUN 3 — 4803c15fd  174 files  1703 passed  0 failed  0 skipped  162.99s
```

No intermittent AML failure; no retry selection; no code change between runs.

## 7. Typecheck and build

- `tsgo --noEmit` — exit 0, no errors.
- `bun run build` — exit 0, built in 42.36s.
- New warnings: none. Inherited warnings: Tailwind `duration-[170ms]` ambiguity, Rollup chunk-size advisory.

## 8. Fixture cleanliness and preservation

Fixture families surviving: `PLANCERT%` 0, `AMLUAT%` 0, `AML03…AML09CERT%` 0,
`AML10CERT%` 0, `AML11CERT%` 0, `AML12CERT%` 0 — across assessments, methodologies,
programmes/programme sets, licensees, risk states and audit payloads.
No operational or historical record was removed.

Census (`scripts/aml07-preservation-census.sql`), identical before and after:

```
aml07_risk_digest              8385b6c8f7ba2b4102ab054c8f5ac686
assessments_total 28   assessments_current 25   responses 984
entity_risk_state 22 (AML 21)  entity_risk_movements 25
calculation_policies_live 0    calculation_policies_all 0
methodology AML-CFT-RBA v1.0   ACTIVE / REGULATOR_AUTHORED
methodology AML-CFT-RBA v1.1   DRAFT  / MIPL_REFERENCE
programme_sets 1   programmes 4   regulators 3
```

```
existing assessments changed:        NO
historical plans backfilled:         NO
operational responses changed:       NO
risk of record changed:              NO
risk history changed:                NO
risk digest changed:                 NO
v1.0 changed:                        NO
v1.1 changed or activated:           NO
programme reference changed:         NO
live calculation policy created:     NO
live calculation policy activated:   NO
materiality policy authored:         NO
LINK-11 changed:                     NO
operational actions changed:         NO
AML business data deleted:           NO
regulator records changed:           NO
```

## 9. Outstanding external policy blockers

DEC-01…DEC-08 remain unsigned (see `docs/aml/AML-12-policy-activation-decision-pack.md`),
keeping CALC-05/06/09/11, AMLH-09 and LINK-11 red. No policy was invented or activated in this
wave; these are external decisions and do not fail the engineering lock.

## 10. Demo-seeding readiness

Engineering gates are green, fixtures are clean, preservation is proven and no live calculation
policy exists. Controlled demo cleanup and seeding may proceed as a separate, explicitly
authorised wave.
