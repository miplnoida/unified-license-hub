# AML-CLOSE-02C — Supervisory Perimeter Gate & Final Verification Alignment

Date: 2026-10-03 (non-production environment). AML-CLOSE-03 not started.

## A. Verdict

**CONDITIONAL PASS**

The perimeter gate is enforced on the server and tested. The browser behaves the same way as the server. Assessments 00836/00838 were left as they were. Some saved verifiers still fail. Each remaining failure is classified in §H. None of them is a perimeter-gate or governed-runtime defect. Two Category-A items (Z2, ACTION-06/EVAL-05 permission findings) and two Category-E fixture aborts are still open, so this is not a full PASS.

## B. Genuine defect identified

`supervisory_domain_applicable(entity, domain)` returned `COALESCE(is_applicable, true)`. When an entity had **no** AML/CFT perimeter record, the result was "applies", so assessment creation went ahead (fail-open). This is how 00836 (Brimstone Payments) and 00838 (Helen Digital Assets) were created without any determination.

## C. Existing perimeter architecture

- Table `supervisory_domain_perimeter`. It holds one row per (entity_id → `licensees`, domain_code), with these columns: `is_applicable boolean`, `basis text` (≥10 chars), `determined_by`, `determined_at`, `created_at`/`updated_at`. There is a unique constraint on (entity, domain).
- Governed write: `supervisory_domain_perimeter_set(entity, domain, is_applicable, basis)`. It requires approve/manage_config permission and an entity-scope check, upserts the row and writes a `compliance_audit_logs` entry CREATE/UPDATE with before/after.
- Read RLS: internal staff who hold supervisory_spine/prudential/aml view permission. There are no direct write policies.
- Current data: 25 AML_CFT rows that apply and 1 that does not. No other domain has rows.
- **States the model supports:** no record, applicable, not applicable. It has **no** draft, submitted, effective-date, expiry or retired states. The brief's tests for those states are therefore *not applicable*. No artificial statuses were created.
- There is no UI that records a determination today. Determinations are made only through the governed RPC.
- Sector overlay (configuration applicability) is a separate control in the pinned policy snapshot. The new rule does not consult it, and overlay checks still run separately.

## D. Runtime fix

Migration (2026-10-03) added the following:

- `supervisory_assessment_creation_perimeter(entity, domain)` is the single shared rule. It is internal only: EXECUTE is revoked from `authenticated`/`anon`. For **AML_CFT** it allows creation only if a row exists with `is_applicable = true`. A missing row gives `PERIMETER_NOT_ESTABLISHED` and a false value gives `DOMAIN_NOT_APPLICABLE`. Other domains keep their existing behaviour: no record means not excluded.
- A `BEFORE INSERT` trigger `supervisory_assessment_perimeter_guard` on `supervisory_assessment` enforces the rule on **every** insert path. This covers `supervisory_assessment_create`, `_create_programmed` (which delegates to it), internal commands and raw inserts. On refusal it raises SQLSTATE 22023 `perimeter_not_established: …` / `domain_not_applicable: …`.
- `supervisory_assessment_creation_eligibility(entity, domain)` is a read model for the browser. It checks authentication and entity scope, then returns the same rule's result.
- `supervisory_domain_applicable` was left unchanged. Portfolio and overview reads still use it, and changing it would alter reporting. That is outside this scope.

## E. UI alignment

`AmlNewAssessmentDialog` now calls the eligibility read model. When creation is not allowed:

- the dialog shows *"AML/CFT supervisory applicability has not been established for this entity…"*;
- the assessment picker is hidden;
- **Continue** is disabled.

No shortcut to record a determination was added, because no governed screen exists for it. The unit test `AML-CLOSE-02C supervisory perimeter` covers this behaviour.

## F. Security proof

- **Browser E2E** (`07-aml-governed-runtime.spec.ts`, new test 5) used a real password session as the AML officer:
  - The eligibility call returned `allowed=false`.
  - A forged `rpc/supervisory_assessment_create` for Helen was rejected with `perimeter_not_established`.
  - Helen's assessment count via REST was the same before and after.
- **SQL harness** `scripts/verify-aml-close-02c-perimeter-gate.sql` (rolled back) passed **14/14**:
  - P0/P0b: the rule is not callable by `authenticated`, and the guard is enabled.
  - N1a–c: with no determination, the read model, direct create and programmed create are all refused.
  - N2: an explicit not-applicable record is refused.
  - N3: a determination for another domain or another entity does not help.
  - N4: a raw insert that bypasses the RPC is refused.
  - N5: refusals left no change to assessments, events, assessment audit rows, notifications or facts.
  - P1: after a governed determination by an authorised person, eligibility = established and creation succeeded (rolled back).
  - N6: after the determination is revoked to not-applicable, creation is refused again.
  - H1: 00838's snapshot and its 3 facts are unchanged.
- **Auditability:** a refusal is a raised business-rule exception. As with every other creation refusal (for example `methodology_unavailable`), it rolls back and writes no audit row. The caller gets the reason, and the API/database logs record the rejected call with actor, time and message. No extra audit noise was added, which matches the platform's existing pattern.

## G. Historical treatment

00836 and 00838 still exist unchanged: same IDs, history and bindings. No perimeter record was created, backdated or backfilled. **No TEST determination was persisted for Helen.** Adding one would have recorded a current entity-level "AML/CFT applies" statement against an FSRA-regulator entity. Instead, the positive path was proven inside a rolled-back transaction, with a basis marked *TEST ONLY — NOT FSRA REGULATORY DETERMINATION*. Both assessments are historical (pre-control) exceptions. AMLH-02 now reports them as such instead of failing.

## H. Verifier reconciliation

| Verifier / gate | Previous failure | Class | Action | Now |
| --- | --- | --- | --- | --- |
| full-module-hardening AMLH-02 | 2 assessments without perimeter | C | Modernised. Requires the guard to be installed, no assessment under a not-applicable record, and no missing-perimeter assessment created after the control date. Pre-control ones are reported. | PASS (reports 2 historical) |
| AMLH-08 | 40 overrides without reason | C | none: historical data | FAIL |
| AMLH-09 | 523 dimensions with no governed outcome | C | none: predates governed calculation | FAIL |
| AMLH-17 | 1 examination without origin | C | none | FAIL |
| policy-profile-kernel PROFILE-02 | hard-coded 3-type list | B | Invariant changed to "every available type has a governed backing store" | PASS |
| PROFILE-03 (revealed) | probed SLA_POLICY, which is now implemented | B | Probes an unregistered type | PASS |
| PROFILE-08+ (revealed) | fixture `already_adopted` (MIPL programmes adopted by FSRA) | E | not repaired in scope | ABORT |
| epic-3 closed loop | Z2 officer holds view_confidential (and now creation aborted on the new gate) | A (Z2) / E (fixture) | Fixture records a rolled-back perimeter for its in-scope entity | 14 PASS, Z2 FAIL |
| w4-a6 closed loop | `STR_SAR_GOVERNANCE` not in methodology 1.0 | D | Fixture now has an explicit perimeter | 4 PASS, then stops on D |
| dimension-linkage | aborted: persona/entity outside scope | E | Fixture picks an entity with an established perimeter | 11 PASS, LINK-11 FAIL (D: STR_SAR_GOVERNANCE) |
| calculation-governance CALCGOV-11 | 20 historical dimensions recalculated | C | none | FAIL |
| demo-dataset D-03 | demo case 01 carries 00735 | C | none | FAIL |
| risk-monitoring MON-07 | NO_RUN for a legacy record | C | none | FAIL |
| consequence-linkage ACTION-06 | contract does not refuse missing permission | A | none (permission design, outside perimeter scope) | FAIL |
| outcome-effectiveness EVAL-05 | restricted evidence cited without authority | A | none | FAIL |
| v11-reference-draft | 1 fail | E | none | 19 PASS / 1 FAIL |
| review-risk-publication, calculation-policy-engine, evidence-fact-readiness, aml12-activation-rehearsal | abort: `programme_not_in_effective_policy` | E | not repaired (fixtures predate the FSRA package programme binding) | ABORT |

## I. Full database verification results

- **Passing:** CLOSE-02C 14/14, CLOSE-02B 37/37, CLOSE-02 23/23, policy-profile-kernel 7 PASS then abort (E), full-module-hardening 51 PASS/3 FAIL (C), epic-3 14/1, dimension-linkage 11/1, w4-a6 4 then D stop.
- **Unchanged from 02B:** calculation-governance 13/1, demo-dataset 2/1, monitoring 6/1, consequence-linkage 13/1, outcome-effectiveness 10/1, v11 19/1.
- **Still aborting:** 4 verifiers (E).
- **Regression check:** no remaining failure is caused by the perimeter gate or the governed runtime.

## J. Regression results

- TypeScript: pass.
- Vitest: 180 files / 1757 tests. All pass after the dialog test mock was updated. The only failures seen were 5 in that file before the mock change.
- Screen-boundary scripts: 8/8 pass.
- Playwright spec 07: 5/5 pass.

## K. 00838 integrity proof

- Snapshot `content_hash` = `7e5bed5e523315dec267329dbca344c2` (unchanged).
- Facts: **3**, all unchanged: `AML_TECH_CERT_HAS_FLAG` (MANUAL), `AML_TECH_CERT_STR_COUNT` (RETURN), `AML_TECH_CERT_TIER` (FORM, TIER_A).
- Package, methodology, calculation, overlay, fact and source bindings are untouched. No perimeter row was added for Helen.

## L. FSRA non-impact

- FSRA-AML-CFT-POLICY 1.0 is ACTIVE.
- AML-CFT-RBA 1.0 is ACTIVE.
- 1.1 is DRAFT.
- TEST package v2 and TEST methodology v2 are RETIRED.
- The 00830 snapshot hash `2363b569…` is unchanged.
- STR_SAR_GOVERNANCE was not touched.
- The 19 publication gaps were not touched.
- No policy values were invented.
- Communications: no email, SMS or webhook was sent. Refusals created no notifications (N5).

## M. Remaining regulator/business decisions

These are still open:

- real FSRA sector overlays;
- structured facts;
- allowed sources;
- the methodology 1.1 adoption decision;
- calculation and rating values;
- `STR_SAR_GOVERNANCE`;
- the meaning of "applies with modifications";
- treatment of the 19 historical publication gaps;
- whether 00836/00838 should receive a regulator-approved perimeter determination or stay recorded exceptions.

## N. Final closure answers

1. Supervisory perimeter: **YES**.
2. Governed runtime architecture: **YES**.
3. Verification suite: **YES, with exceptions**. The stale perimeter and catalogue gates were modernised, and every remaining failure is classified in §H. Four fixture-aborting verifiers (E) and the PROFILE kernel fixture still need repair.
4. Real FSRA policy: **NO**.
