# AML baseline remediation — verifier defect closure and policy blocker formalisation

Scope: repair the aborting AML-02 methodology-authority verifier and establish the
exact disposition of every remaining policy-dependent red gate. AML-07 certification
is preserved unchanged. No AML-08 work was started.

Canonical AML-07 risk digest: `8385b6c8f7ba2b4102ab054c8f5ac686` (unchanged before
and after this wave). The obsolete undefined digest `d74db7c3…` is not used.

## 1. Rebaseline

| Item | Value |
|---|---|
| Expected HEAD | `2a9edb988` |
| Actual starting HEAD | `57fcf67f4` — "Certified AML-07 gates" |
| Tree state | clean |
| Commits after `2a9edb988` | `57fcf67f4`, `1c64dc4ea`, `015d3b44f` |
| Functional code changed since AML-07 | NO |
| Migrations changed since AML-07 | NO |
| Test configuration changed since AML-07 | NO |
| Dependencies changed since AML-07 | NO |

Post-AML-07 commits contained only certification documentation and verifier/census
scripts. Because this wave likewise changed only verifier scripts and documentation,
the certification requirement is focused tests plus typecheck and build; the
three-run full regression from AML-07 remains valid and was not invalidated.

## 2. AML-02 methodology-authority verifier — root cause

Verifier: `scripts/verify-supervisory-regulator-methodology-authority.sql`.

Failing statement (previously at line 247):

```
PERFORM public.supervisory_methodology_lifecycle(_a,'REVIEW', 'Fixture: submit regulator A version for approval.');
ERROR: validation_blocked: 3 blocking structural finding(s) must be resolved before REVIEW
       (CONDITIONAL_RULE_MISSING, DIMENSION_WEIGHT_SUM, INVALID_NA_CONFIGURATION)
```

The transaction aborted, every later gate was skipped, and the run ended in ROLLBACK
with 0 scored gates.

Cause: the fixture adopted the live `AML-CFT-RBA` v1.1 MIPL reference — which
deliberately still carries open methodology policy blockers — and then assumed that
copy could be moved to REVIEW purely to reach the approval-authority gates.
`supervisory_methodology_validate` and `supervisory_methodology_rule_findings`
correctly refuse that transition. Production behaviour is right; the test assumption
was wrong.

Classification: **TEST_FIXTURE_DEFECT**.

Correction (verifier only, rollback-scoped):

- the lifecycle and approval gates (REG-AUTH-04, 05, 13) now use a structurally
  complete synthetic regulator-A version created inside the transaction: one
  `INHERENT_RISK` group weighted 100, one dimension, one scored core question with a
  version-owned semantic profile and no N/A contradiction;
- a new positive gate **REG-AUTH-17** asserts that the adopted copy of the MIPL
  reference is refused both REVIEW and APPROVED while its policy blockers remain,
  and stays DRAFT — turning the previous abort into certified evidence;
- fixture cleanup discards the new version and all its children before rollback.

Nothing in production SQL, live v1.0, live v1.1 or any governed RPC was changed.
v1.1 was not activated and no structured rule, parameter value or N/A flag was authored.

## 3. AML-02 certification result

`scripts/verify-supervisory-regulator-methodology-authority.sql`: **17 passed / 0 failed / 17 total**, final `ROLLBACK`.

Rollback cleanliness after the run:

| Fixture artefact | Surviving rows |
|---|---|
| methodologies (`ZZ-%`) | 0 |
| regulators (`ZZREG%`) | 0 |
| dimensions (`ZZ-%`) | 0 |
| questions (`ZZ-%`) | 0 |
| semantic profiles (`ZZ-%`) | 0 |
| structured rules / parameters / facts / assessment bindings / events | 0 |
| approval register rows from the run | 0 |

Live values unchanged: `AML-CFT-RBA` v1.0 `ACTIVE`, v1.1 `DRAFT/MIPL_REFERENCE` with
26 dimensions, 70 questions, 5 profiles, 87 facts, 8 parameters, 0 approved values
(asserted by REG-AUTH-15 and REG-AUTH-16).

## 4. Remaining gate matrix

| Gate | Verifier / file | Status | Exact cause | Classification | Owner | Next action |
|---|---|---|---|---|---|---|
| CALC-05 | `verify-aml-calculation-integrity.sql` | RED | no ACTIVE calculation configuration is published, so determinism cannot be evidenced | SUPERVISORY_POLICY_DECISION_REQUIRED | Regulator | DEC-01…DEC-05 |
| CALC-06 | `verify-aml-calculation-integrity.sql` | RED | no ACTIVE configuration, so stored results cannot be reconciled | SUPERVISORY_POLICY_DECISION_REQUIRED | Regulator | DEC-01…DEC-05 |
| CALC-09 | `verify-aml-calculation-integrity.sql` | RED | recorded AML/CFT effective-date rule decisions = 0 | SUPERVISORY_POLICY_DECISION_REQUIRED | Regulator | DEC-01 |
| CALC-11 | `verify-aml-calculation-integrity.sql` | RED | no ACTIVE calculation configuration is published | SUPERVISORY_POLICY_DECISION_REQUIRED | Regulator | DEC-02…DEC-04 |
| CALCG-03 | `verify-aml-calculation-governance.sql` | GREEN (fixed) | asserted the obsolete top-level status `NO_EFFECTIVE_DATE_RULE`; the engine reports `NOT_CALCULABLE` + `reason_code NO_EFFECTIVE_DATE_RULE` | VERIFIER_CONTRACT_DRIFT | Engineering (closed) | none |
| CALCG-20 | `verify-aml-calculation-governance.sql` | GREEN (fixed) | scanned every `supervisory_calc%` function for the word MATERIAL, so the legitimate governed materiality policy surface tripped it | VERIFIER_CONTRACT_DRIFT | Engineering (closed) | none |
| OUTC-09 | `verify-aml-calc-outcome-fixtures.sql` | GREEN (fixed) | asserted the obsolete top-level status `NO_CONFIGURATION`; the engine reports `NOT_CALCULABLE` + `reason_code NO_CONFIGURATION` | VERIFIER_CONTRACT_DRIFT | Engineering (closed) | none |
| AMLH-09 | `verify-aml-full-module-hardening.sql` | RED | 565 approved AML dimensions carry no acceptable governed calculation outcome, because no configuration has ever been in force | METHODOLOGY_CONFIGURATION_BLOCKER | Regulator / methodology authority | DEC-01…DEC-05, then a governed recalculation |
| LINK-11 | `verify-aml-dimension-linkage.sql` | RED | 22 assessment dimensions use `STR_SAR_GOVERNANCE`, absent from bound methodology `AML-CFT-RBA` v1.0 | LEGACY_DATA_REMEDIATION_REQUIRED | Methodology authority + data steward | DEC-08 and the row-level proposal |

The three corrected gates were strengthened, not weakened: each now asserts the
governed status, the specific reason code and a recorded human reason.

No gate was marked green merely because the engine returned `NOT_CALCULABLE`.

## 5. Regression and security matrix

| Check | Result |
|---|---|
| AML-02 regulator methodology authority | 17 / 0 / 17, ROLLBACK |
| AML-02 methodology studio | 45 / 0 |
| AML-CFT v1.1 reference draft | 18 / 0 |
| AML-01 policy profile kernel | 0 FAIL (PROFILE-01…40 complete, ROLLBACK) |
| AML-03 assessment programme configuration | 0 FAIL (PROG-01…50 complete, ROLLBACK) |
| AML-04 assessment question plan | 0 FAIL (50 gates, ROLLBACK) |
| AML-05 evidence / fact readiness | 0 FAIL (58 gates, no AML05CERT survivor) |
| AML-06 calculation policy engine | 0 FAIL (50 gates, no AML06CERT survivor) |
| AML-06 calculation governance | 20 / 0 (CALCG-03, CALCG-20 now green) |
| AML-06 calculation outcome fixtures | 14 / 0 (OUTC-09 now green) |
| AML-06 calculation integrity | 7 / 4 — CALC-05, 06, 09, 11 policy-blocked |
| AML-07 review / approval / publication | 0 FAIL (47 gates, no AML07CERT survivor) |
| AML dimension linkage | 11 / 1 — LINK-11 legacy data |
| AML full module hardening | 15 / 1 — AMLH-09 policy-blocked |
| Supervisory authority boundary | 17 / 0 / 17 |
| Action convergence (OS-02D) | 14 PASS / 0 |
| Permission reference gate | PASS |
| RBAC parity | OK (46 scope tuples) |
| Centralised authorisation | OK — all decisions in `src/lib/rbac/authorize.ts` |
| Atomic authorisation | OK — no unallowlisted check-then-mutate |
| Edge function authorisation | OK — every function gated |
| Platform hardening | 4 PASS / 0 FAILED |
| AML-04 frontend boundary | 7 / 0 |
| AML-07 frontend boundary | 17 / 17 |
| `authorize` unit tests | 11 / 11 |
| AML-07 review + risk history UI | 35 / 35 (25 review, 10 risk history) |
| Typecheck | PASS |
| Build | PASS |
| Security scan | 2 inherited platform advisories (SECURITY DEFINER view, mutable function search_path) — pre-existing, non-AML |

## 6. Preservation census

Before and after this wave are identical, including the digest.

| Metric | Before | After |
|---|---|---|
| AML-07 risk digest | `8385b6c8f7ba2b4102ab054c8f5ac686` | same |
| assessments total / current / rated | 28 / 25 / 25 | same |
| statuses (approved / draft / submitted / superseded) | 22 / 2 / 1 / 3 | same |
| responses | 984 | same |
| question plan rows | 0 | same |
| evidence / facts | 0 / 0 | same |
| methodologies | v1.0 ACTIVE, AML_RBA v1.0 SUPERSEDED, v1.1 DRAFT/MIPL_REFERENCE | same |
| v1.1 dimensions / questions | 26 / 70 | same |
| programme sets / programmes | 1 / 4 | same |
| calculation policies (all / live) / runs / overrides | 0 / 0 / 0 / 0 | same |
| review rounds / challenges / approval decisions / publications | 0 / 0 / 0 / 0 | same |
| entity risk states (total / AML) / movements | 22 / 21 / 25 | same |
| regulators | 3 | same |
| certification fixtures (PLANCERT, AML05CERT, AML06CERT, AML07CERT) | 0 | same |

- existing assessments changed: NO
- historical responses changed: NO
- question plans changed: NO
- evidence or facts changed: NO
- risk of record changed: NO
- risk history changed: NO
- v1.0 changed: NO
- v1.1 substantive content changed: NO
- v1.1 activated: NO
- reference programmes changed: NO
- live calculation policy authored: NO
- materiality policy invented: NO
- legacy links rewritten: NO
- AML business data deleted: NO
- regulator records deleted: NO

## 7. Verdict

- AML-07: **PASS** (preserved; evidence unchanged)
- AML baseline: **CONDITIONAL — EXTERNAL POLICY DECISIONS REQUIRED**

Every engineering and verifier defect found in this wave is closed. The remaining
red gates are all absences of regulator-authored policy or an unauthorised legacy
mapping, documented as DEC-01…DEC-08 in
`docs/aml/AML-calculation-policy-decision-register.md` and, for LINK-11, in
`docs/aml/AML-legacy-dimension-link-remediation-proposal.md`.

## 8. AML-08 readiness

The accepted policy blockers **do** permit AML-08 to begin, because none of them is
an engineering defect and all engine capability behind them is certified. AML-08 must
not depend on a produced residual rating, a calculation-derived published risk of
record, or a remediated legacy dimension link until DEC-01…DEC-08 are answered.

## 9. Files changed in this wave

- `scripts/verify-supervisory-regulator-methodology-authority.sql` (fixture repair + REG-AUTH-17)
- `scripts/verify-aml-calculation-governance.sql` (CALCG-03, CALCG-20 assertions)
- `scripts/verify-aml-calc-outcome-fixtures.sql` (OUTC-09 assertion)
- `docs/aml/AML-calculation-policy-decision-register.md` (new)
- `docs/aml/AML-legacy-dimension-link-remediation-proposal.md` (new)
- `docs/aml/AML-baseline-remediation-certification.md` (this document)
