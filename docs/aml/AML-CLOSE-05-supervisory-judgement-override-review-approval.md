# AML-CLOSE-05 — Supervisory judgement, override, review and approval authority

All values used are TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY.

## A. Outcome
**CONDITIONAL PASS.** Every judgement path was proven through the normal browser user journey
(`e2e/cert-v2/12-aml-judgement-review-approval.spec.ts`, 9/9 passed). Conditions are in section N.

## B. Rules followed
- No test data created and no assessment calculated through API calls. The TEST package version,
  assessments, facts, answers, calculations, overrides, submissions and approvals were all done in the screens.
- API calls were used only for read-only checks and refused-bypass tests.
- Earlier specs 10 and 11 previously calculated through an API call for reconciliation; they now read the
  latest browser-recorded run instead.

## C. Server changes (migration, applied before this report)
- Override proposal checks against `COALESCE(residual_rating, recommended_rating)` — the same rating
  approval uses (previously proposal compared against the advisory recommendation only).
- New override status `STALE`: recording a new calculation run marks earlier pending, or approved-but-unused,
  overrides stale. A stale override cannot be decided (`already_decided: this override is STALE`).
- Recalculation only for `draft` / `returned_for_revision`; proposal/decision only while the assessment is open.

## D. Screen changes
- Calculation tab: "Advisory recommendation" label; new row "Calculated rating used for approval and override";
  override history shows run number, "calculated → proposed", status (incl. Stale), decider and decision note.
- Review tab: "CALCULATED → FINAL" row and the source of the published risk-of-record.
- Refusal messages now explain maker/checker, stale, closed, locked, not-calculated and no-difference cases.

## E. TEST package
Version `9.494718` of `AML_TECH_CERT_POLICY` (`c3c1b23e-c8c7-4fbd-8cee-1fd2cfaed5f5`) created and submitted by the
AML officer, approved and activated by the AML supervisor, retired in the screen after use.

## F. Journey A — calculated result approved unchanged (00941)
Calculated MEDIUM_HIGH; approver was offered no rating choice; final MEDIUM_HIGH, source COMPUTED; survived reload.

## G. Journey B — approved override (00942)
Officer proposed HIGH (one step up) with rationale; officer's approve button disabled. Supervisor approved it.
Officer submitted, supervisor approved. Final HIGH, source APPROVED_OVERRIDE; decision record holds computed
MEDIUM_HIGH, override id/rating, run id and result hash. Calculation run unchanged (ids, hashes, ratings identical
before/after). Published entity risk HIGH, driven by 00942. Proposer ≠ decider.

## H. Journey C — rejected overrides (00943)
Two proposals (MODERATE, HIGH) both rejected with notes; both remain in history; final MEDIUM_HIGH, source COMPUTED.

## I. Journey D — self-decision refused, stale override (00944)
Supervisor proposed and tried to approve own proposal: refused in the screen ("must be decided by someone other").
Officer changed a fact and recalculated (run #2): override shown Stale; no decision button; direct decision refused.

## J. Journey E — withheld calculation (00945)
Not calculable; no override form offered; direct proposal refused `not_calculated`.

## K. Refused bypasses (direct calls)
Propose on approved assessment; recalculate approved/superseded assessment; re-decide a decided override; edit the
override row, the calculation run, the approved rating (all `permission denied`); legacy transition with a rating
(`client_rating_refused`); officer approving an assessment; read-only, complaints officer, licensee and auditor
proposing or deciding; signed-out proposal (401). All refused.

## L. Regression
- App tests: 1760/1760 passed.
- AML browser specs 06–11: 16 passed, 4 failed. Specs 09, 10, 11 depend on their own TEST package versions, which
  were retired after their certification, so their factor tables are empty — fixture retirement, not a defect.
  Spec 06 "register lists DEMO AML assessments" failed, most likely because newer TEST assessments push demo rows off
  the first page; not yet confirmed.

## M. Protected records
00830, 00836, 00838 unchanged; FSRA policy not touched; no external communications sent.

## N. Open conditions
1. Specs 09–11 need a re-runnable TEST package fixture set up through the screens before each run.
2. Spec 06 register failure to be confirmed and made independent of TEST assessment volume.
3. No judgement policy is bound to the TEST package, so overrides ran under platform controls (NOT_GOVERNED);
   governed judgement-policy limits were proven in PCOMP-R2B SQL verifiers, not in this browser journey.
4. The independent decider in every journey is the AML supervisor; no third AML approver persona exists.
5. The app was not republished in this package.

## O. Evidence
`/tmp/m05/r12.log` run log (TEST ids and decision records printed per journey).

## P. Stop
Stopped after AML-CLOSE-05.
