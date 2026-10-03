# AML-CLOSE-02B — Final closure certification for governed runtime authority

Date: 2026-10-03 (UTC). Environment: non-production preview backend.
**TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY.** AML-CLOSE-03 not started.

## A. Verdict

**CONDITIONAL PASS**

Every AML-CLOSE-02B technical item specific to governed runtime authority passed
(four negative cases, UI/backend parity, fingerprint, browser suite, unit/type/boundary
regressions, historical immutability, FSRA non-impact, no external messages).
It is conditional on PASS criterion 4 alone: the full set of saved database verifiers
does **not** pass cleanly (section E). All failures except one pre-date AML-CLOSE-02B and
concern other epics. The exception (AMLH-02) counts `SUP-AML_CFT-2026-00838` because
Helen Digital Assets Ltd has no AML/CFT perimeter determination, which exposes a
pre-existing gap: assessment creation does not require an applicable perimeter
(`SUP-AML_CFT-2026-00836`, created 2026-09-28, has the same gap). Not fixed here (scope,
and 00838 must not be rewritten).

## B. Carried-forward evidence (AML-CLOSE-02A)

`SUP-AML_CFT-2026-00838` (66cc17e3-…) for Helen Digital Assets Ltd was created through the
real browser login of the AML officer and pinned TEST package `AML_TECH_CERT_POLICY` v1,
methodology `AML_TECH_CERT_METHOD` v2, calculation settings v1, sector overlay v1, fact
settings v1 and source settings v1 (snapshot hash `7e5bed5e523315dec267329dbca344c2`).
Facts recorded via governed commands with governance provenance. Excluding-overlay
creation refusal, self-approval refusals and draft binding refusal were proven live.

Correction to the 02A report: the assessment holds **three** facts, not two. The third,
`AML_TECH_CERT_TIER = TIER_A` (source FORM, 17:41:56Z), was the accepted positive control
recorded during the 02A source-binding tests. All three are unchanged.

## C. Missing negative cases

Executed by `scripts/verify-aml-close-02b-final-closure.sql` — one DO block that ends by
raising, so the whole transaction rolls back. Governance actions run as the real maker
(AML officer) and checker (AML supervisor) via `request.jwt.claims` + `SET LOCAL ROLE
authenticated`. Result: **`CLOSE02B_RESULT pass=37 fail=0`**.
Post-run census: 0 `CLOSE02B%` components, 0 fixture packages, 0 fixture fact definitions;
table counts (assessments, facts, components, packages, snapshots, methodologies,
notifications) identical before/after (`38,3,11,4,4,8,17860`).

Fixture package: a DRAFT copy of the retired TEST package (version `02B-fixture`).
Runtime cases pin the invalid state onto a fixture snapshot of a TEST assessment
(simulating drift/tamper, since normal resolution can never pin them).

| Case | Setup | Backend attempt | Rejection | Rows written |
|---|---|---|---|---|
| A inactive overlay | RETIRED overlay | `supervisory_policy_profile_binding_set` | `component_not_approved` | 0 bindings |
| A (history) | same overlay pinned | `sector_overlay_internal` | Not refused — by design a retired, once-approved version stays readable **only** for assessments that already pinned it (this is what keeps 00838 reproducible). It cannot govern new work because binding refuses it. | — |
| B submitted, unapproved overlay | created + `SUBMITTED` via `supervisory_policy_component_create` / `_lifecycle` as maker | `binding_set` | `component_not_approved` | 0 bindings |
| B runtime | pinned | `fact_governance_internal`; `supervisory_assessment_fact_set` as officer | `PINNED_POLICY_NOT_APPROVED`; 22023 "not an approved, activated version" | 0 facts |
| C1 not yet effective (from 2099-01-01) | ACTIVE, pinned | overlay check; `fact_set` | `PINNED_POLICY_NOT_EFFECTIVE`; 22023 "not in effect on 2026-10-03" | 0 facts |
| C2 expired (2020-01-01…2020-12-31) | ACTIVE, pinned | overlay check; `fact_governance_internal` | `PINNED_POLICY_NOT_EFFECTIVE`; 22023 | 0 facts |
| D draft source settings | DRAFT via governed create | `binding_set`; pinned → `fact_set` with source EXTERNAL (only allowed by that draft) | `component_not_approved`; 22023 "source binding cannot be used" | 0 bindings, 0 facts |
| D submitted source settings | SUBMITTED via lifecycle | `binding_set`; pinned → `fact_governance_internal` | `component_not_approved`; 22023 | 0 |
| D retired source settings | RETIRED | `binding_set` | `component_not_approved` | 0 |

Note: binding does not check effective dates; dates are enforced at runtime against the
snapshot's `resolved_as_of` (and at creation, since stamping evaluates the overlay).
Cleanup: transaction rollback, verified by census.

## D. UI/backend parity

- Read model (`supervisory_assessment_configuration_authority` on 00838):
  `AML_TECH_CERT_RETIRED` and `AML_TECH_CERT_OTHER_SECTOR` → `permitted=false` with a reason;
  STR_COUNT and HAS_FLAG permitted and recorded (RETURN / MANUAL).
- Browser (real login, spec 07): both refused facts show "No — …", the
  "Not used by the governing fact settings" badge, and **zero** Record/Update buttons;
  recorded facts show `Recorded (RETURN)` / `Recorded (MANUAL)`.
- Forged authenticated `fact_set` for both (browser-suite token and SQL harness): refused
  22023, 0 rows written on 00838.
- Valid governed fact remains recordable: accepted and persisted (value 7) on a fixture
  TEST assessment inside the rolled-back harness.

## E. Database verifier results

All run as `BEGIN; \i file; ROLLBACK;`. No script contains COMMIT; every write is inside
its own rolled-back block or the outer rollback. Classification: read-only =
structural-integrity, route-register, v11-reference-draft, aml07-preservation-census,
demo-dataset (temp table only); all others transactional, rolled back. None writes
persistent data. Census unchanged.

| Verifier | Result |
|---|---|
| verify-aml-close-02b-final-closure | 37/37 PASS |
| verify-aml-close-02-configuration-authority | 23/23 PASS |
| uat-aml-end-to-end | 29 PASS / 0 FAIL |
| verify-aml-assessment-structural-integrity | 14/14 PASS |
| verify-aml-authority-ux-parity | 10/10 PASS |
| verify-aml-calc-outcome-fixtures | 14/14 PASS |
| verify-aml-calculation-integrity | 11/11 PASS |
| verify-aml-methodology-studio | 45/45 PASS |
| verify-aml-portfolio-reporting | 50/50 PASS |
| verify-aml-route-register | 7/7 PASS |
| verify-w4-a6-aml-closed-loop | 4 PASS, then stops: `STR_SAR_GOVERNANCE` not in methodology 1.0 (known, untouched) |
| aml07-preservation-census | read-only census, ran clean |
| verify-aml-calculation-governance | 13 PASS / 1 FAIL (CALCGOV-11: 20 historical dimensions recalculated — pre-existing) |
| verify-aml-full-module-hardening | 50 PASS / 5 FAIL (AMLH-02 perimeter = 2 incl. **00838**; AMLH-08, -09, -17 pre-existing data gaps) |
| verify-aml-demo-dataset | 2 PASS / 1 FAIL (D-03: demo case 01 has 00735, created 2026-09-10 — pre-existing) |
| verify-aml-policy-profile-kernel | 1 PASS / 1 FAIL (PROFILE-02 expects an older component-type list; families were added later) |
| verify-aml-risk-monitoring-reassessment | 6 PASS / 1 FAIL (MON-07) |
| verify-aml-supervisory-consequence-linkage | 13 PASS / 1 FAIL (ACTION-06) |
| verify-aml-supervisory-outcome-effectiveness | 10 PASS / 1 FAIL (EVAL-05) |
| verify-aml-v11-reference-draft | 19 PASS / 1 FAIL |
| verify-epic-3-aml-closed-loop | 14 PASS / 1 FAIL (Z2: officer holds view_confidential) |
| verify-aml-assessment-review-risk-publication, -calculation-policy-engine, -evidence-fact-readiness, aml12-activation-rehearsal | Abort at fixture setup: `programme_not_in_effective_policy` — fixtures predate FSRA package 1.0 binding a specific programme. Not run to completion. |
| verify-aml-dimension-linkage | Aborts: persona outside supervisory scope (fixture persona drift) |

Equivalent coverage for the aborted fact/evidence verifiers comes from the 02 and 02B
harnesses. Repairing the drifted verifiers is out of AML-CLOSE-02B scope.

## F. Browser automation results

`npx playwright test 06-aml-demo-dataset 07-aml-governed-runtime` (real login UI):
**10 scenarios, 10 passed, 0 failed, 0 skipped** (2.2 min). Spec 07 is new and read-only
against 00838. Specs 01–05 (non-AML certification) were not run in this package.

## G. Fingerprint analysis

- **What it is:** `supervisory_policy_component_content_hash` is computed dynamically
  (`md5(id|code|version|status|content)`; methodology/calculation/programme variants also
  include status). Its values are persisted only inside each assessment snapshot's
  `components[].content_hash` and folded into the snapshot `content_hash`.
- **Intended meaning:** callers label it "content hash" and use it to prove the pinned
  basis; the snapshot event describes it as the immutable policy basis. The intended
  semantic is therefore **substantive configuration content (1)**. Including `status` is a
  defect: after activation/supersession/retirement the recomputed value no longer matches
  the stored one, so it would falsely signal content change.
- **Code changed:** yes, forward-safe and additive.
  - `supervisory_policy_component_content_fingerprint` (**cfp1**): md5 of canonical jsonb of
    id, type, code, version and content only — no status, timestamps or actors; jsonb key
    canonicalisation makes field order irrelevant. Not directly callable by signed-in users.
  - `supervisory_assessment_policy_basis_integrity(assessment)`: read-only, scope-checked.
    For each pinned component it reproduces the legacy formula across lifecycle states to
    prove the stored historical hash still matches today's content, and reports the cfp1
    fingerprint and the status at stamping.
  - The legacy function and all stored hashes are **unchanged**; nothing recalculated.
- **Tests (in the 02B harness):** status-only (SUBMITTED) unchanged ✔, approve-only
  unchanged ✔, activate-only unchanged ✔, legacy hash does change on lifecycle (defect
  demonstrated) ✔, content change → fingerprint changes ✔, key-order change → unchanged ✔,
  00838 stored hashes (`7e5bed5e…`, overlay `2a8d2ad5…`) unchanged ✔, 00838 integrity =
  `CONTENT_UNCHANGED` ✔ (also proven via the browser-suite API).

## H. Regression results

| Suite | Result |
|---|---|
| TypeScript typecheck | 0 errors |
| Vitest (all `src/test`, includes all AML unit tests) | 178/178 files, **1717/1717** tests PASS |
| Screen-boundary scripts | monitoring 27/27, outcome-effectiveness 39/39, portfolio 33/33, review-publication 17/17, supervisory-consequence 20/20, evidence-fact 12/12 — **148/148** |
| AML-CLOSE-02 backend harness | 23/23 |
| AML-CLOSE-02B harness (covers 02A negative/parity/fingerprint) | 37/37 |
| Browser E2E (AML) | 10/10 |
| Database verifiers | see E |
| Preview build | OK |

## I. Historical immutability (re-read at end)

00838 snapshot: package `AML_TECH_CERT_POLICY` 1, methodology `AML_TECH_CERT_METHOD` 2
(df8921b4), calculation 1 (cbecda28), overlay 1 (a9c454fb), fact settings 1 (05edf00c),
source settings 1 (19f44ec6); `content_hash 7e5bed5e523315dec267329dbca344c2`; 7 events.
Facts: STR_COUNT 12 (RETURN), HAS_FLAG true (MANUAL), TIER TIER_A (FORM), each with
source-binding provenance v1, timestamps from 2026-10-03 17:37–17:41Z (no updates).
Integrity check: `CONTENT_UNCHANGED`.

## J. FSRA non-impact

FSRA-AML-CFT-POLICY 1.0 ACTIVE; methodology AML-CFT-RBA 1.0 ACTIVE; 1.1 DRAFT; TEST package
v2 RETIRED (v1 SUPERSEDED); TEST methodology v2 RETIRED. `SUP-AML_CFT-2026-00830` snapshot
hash `2363b569…` and 10 events (last 2026-09-12) unchanged. The 19 publication gaps and
`STR_SAR_GOVERNANCE` untouched. No regulator setting created or modified.

## Communications

No rows in `notification_outbox` since 2026-10-03 (no email, SMS or webhook queued). No
new in-app notification. The single 02A in-app TEST notification remains as documented.

## K. Remaining regulator/business decisions (not technical failures)

Real FSRA sector overlays; real FSRA structured facts; real FSRA source rules; methodology
1.0 vs later adoption; real calculation/rating settings; `STR_SAR_GOVERNANCE`; "applies with
modifications" interpretation; publication decision for the 19 historical assessments.

Technical follow-ups (not regulator decisions): require an applicable AML/CFT perimeter at
assessment creation; refresh the drifted verifiers listed in E.

## L. Final certification statement

### Technical architecture
**YES** — governed Sector Overlay + Fact Settings + Source Settings drive AML/CFT
assessments authoritatively, with backend enforcement, source provenance, maker-checker
governance, version immutability and reproducibility (now with a lifecycle-independent
content fingerprint). The verdict stays CONDITIONAL only because the wider verifier
estate is not green (section E).

### Real FSRA policy
**NO** — no regulator-approved FSRA configuration has been supplied or certified.
