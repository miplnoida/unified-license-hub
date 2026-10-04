# AML-CLOSE-03 — Materiality and applicability runtime authority

Status: **CONDITIONAL PASS** (see N). All values below are TEST-only technical certification values. None of them is an FSRA threshold, weight or policy.

## A. Scope
Make risk-factor applicability and materiality backend-authoritative, explainable, pinned per assessment and fail-closed on missing information, by extending the existing AML-06 engine. AML-CLOSE-02 is not reopened.

## B. Architecture
- One engine: `supervisory_calc_compute_policy` (engine version `AML06.2`) now consumes applicability rules (`supervisory_calculation_applicability_rule`) and factor-level materiality rules (`supervisory_calculation_materiality_rule`, `adjustment_kind = FACTOR_MATERIALITY`). No parallel engine.
- Three separate decisions per factor: applicability → materiality → effect on rating. Scoring is unchanged and only consumes factors that are applicable and included.
- Config resolution is pinned-snapshot first; date resolution is only a fallback for legacy assessments without a snapshot.
- Read model `supervisory_assessment_factor_authority` is shown read-only in `AmlFactorAuthorityPanel`; readiness and fingerprint include factor decisions.

## C. Missing information
A missing fact yields `INFORMATION_PENDING` for that factor (never zero, never "not material"); readiness lists it and submission is blocked. Proven in browser (C-01 below).

## D. TEST package
Methodology `AML_TECH_CERT_METHOD` v8, calculation settings v1 (`18ca681c…`), policy profile `AML_TECH_CERT_POLICY` v4 then v5 (settings v2 `b1acfb5b…`). Profile v5 retired at end of run so no live assessment can bind TEST values. Earlier lineage versions (v3–v7) are superseded setup artefacts, not evidence.

## E. Entity and perimeter
Unused Virtual Asset demo licensee `9ca17098-…-79021972020`, added to the TEST officer portfolio via `staff_portfolio_scope_add`, assigned via `assign_entity_supervision`, TEST-only AML_CFT perimeter set by supervisor. Direct assignment-table write was refused (403).

## F. Browser journey (real UI login, `aml_supervision_officer`)
1. Created programmed assessment `8f6e487f-68c1-4038-b3e2-693a2d91a360` via the New assessment dialog; methodology v8 shown as TEST.
2. Factor panel before facts: INHERENT applicability pending (`HAS_FLAG` missing); INHERENT_B materiality pending (`STR_COUNT` missing); CONTROL included; INHERENT_C not applicable (sector restricted to INTERNATIONAL_BANKING).
3. Recorded `HAS_FLAG = yes` (Officer entry) and `STR_COUNT = 12` (Regulatory return) in the fact register.
4. Factor panel after facts: INHERENT applicable + material (12 ≥ 10); INHERENT_B applicable, not material (12 < 50) → excluded; INHERENT_C not applicable; CONTROL included.
5. Defect found and fixed: the panel did not refresh after recording a fact; fact writes now invalidate the factor-authority query.

Question answers and calculation were driven by API for the same assessment (not via UI): `CALCULATED`, inherent 50 / MEDIUM_HIGH, control 100 / STRONG, residual MODERATE, engine AML06.2, settings v1. INHERENT_B was answered but excluded, so it did not contribute.

## G. Negative and forged-request tests (all refused)
| # | Attempt | Result |
|---|---|---|
| N1/N2 | Edit applicability / materiality on ACTIVE settings | 400 draft-only |
| N3/N4 | Unknown fact / unknown factor | 400 not in methodology |
| N5 | Rule without rationale | 400 constraint |
| N6 | Unsupported operator on yes/no fact | 400 operator_not_supported |
| N7 | `when_missing = NOT_MATERIAL` (silent default) | 400 constraint |
| N7b | Factor materiality without threshold | 400 not-null |
| N8 | Factor authority as complaints officer, licensee, read-only | 403 outside authority |
| N9/N10 | Anonymous read / write | 401 permission denied |
| N11/N12 | Direct table insert / update | 403 permission denied |
| N13a | Submit incomplete settings for review | 400 incomplete |

Direct-write privileges on the applicability rule table were found too broad and revoked in this pass (signed-out: none; signed-in: read only).

## H. Immutability under a later version
Published settings v2 (INHERENT threshold 20, EXCLUDE) and profile v5. Recalculating `8f6e487f…` afterwards — and again after profile v5 was retired — returned the identical result on settings v1. A second assessment `7aaa0526…` created after v5 pinned profile v5 / settings v2.

## I. Fail-closed on non-active settings
Settings v2 could not be activated (successor must take effect after predecessor's effective date, today). Assessment `7aaa0526…`, pinned to approved-but-not-active v2, reports `NOT_GOVERNED / NO_CONFIGURATION`, so no factor decision is made. This is safe, but the later version's factor *outcome* was not demonstrated.

## J. Protected records
00830 last calculation run 2026-09-12 (unchanged); 00836 has no calculation run. 00838 (draft) shows `updated_at` 2026-10-03 17:35 UTC with no calculation run; the cause of that timestamp was not attributed in this pass and should be reviewed. `STR_SAR_GOVERNANCE` and the six historical failures were not touched.

## K. AML-CLOSE-02 preservation
Perimeter guard, policy pinning, overlay/fact/source authority, content fingerprint, role self-grant guard and anonymous protections untouched; RBAC suite passes.

## L. Regression
- Type check: clean.
- Vitest (AML + RBAC): 30 files, 357 tests passed.
- Build: OK.
- Not run: full `src/test`, Playwright cert-v2 suite.

## M. Known limits
- Maker ≠ checker for settings relies on the existing H2B verifier; it was not re-shown here because a complete TEST draft was not taken through review.
- Two signed-in SECURITY DEFINER warnings from the AML-CLOSE-03 functions remain (guarded internally); pre-existing linter backlog unchanged.
- Earlier wrong-path assessment `00913` (no snapshot) and API assessment `18090f2f…` (methodology v6) are not evidence.

## N. Certification answers
- Backend-authoritative applicability/materiality: **Yes**.
- Missing facts never silently zero/non-material: **Yes**.
- Pinned and immutable across later versions: **Yes** (for the governed assessment).
- Forged requests refused: **Yes**.
- Full browser journey through calculation: **Partial** — facts and factor decisions in UI; answers/calculation by API.
- Later-version factor outcome demonstrated: **No** (effective-date rule; fail-closed shown instead).

Verdict: **CONDITIONAL PASS**.
