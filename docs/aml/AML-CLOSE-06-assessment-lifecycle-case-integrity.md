# AML-CLOSE-06 — Assessment lifecycle and case integrity

Status: **CONDITIONAL PASS** (technical lifecycle controls proven; open items in section V)
Scope: AML-CLOSE-06 only. AML-CLOSE-07 not started. App not republished in this package.

## A. Scope and boundary
Assessment lifecycle, case ownership, reviewer assignment, return/resubmit rounds, concurrency and direct-write refusal for AML/CFT supervisory assessments. TEST-only values (`TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY`).

## B. Discovery (before change)
Existing commands: create, submit_for_review, review_assign/return/reject, approve, challenge_raise/resolve, lifecycle_state. Raw states `draft, submitted, reviewed, returned_for_revision, approved, closed, superseded` map to canonical `DRAFT, SUBMITTED_FOR_REVIEW, RESUBMITTED, UNDER_REVIEW, RETURNED_FOR_CHANGES, APPROVED_NOT_PUBLISHED, APPROVED, CLOSED_WITHOUT_APPROVAL, CLOSED, SUPERSEDED`. `authenticated` has no INSERT/UPDATE on `supervisory_assessment`. Submit and approve take row locks; approve enforces maker-checker.

## C. Gaps found
1. Edit/calculate/submit were permission-scoped, not owner-bound.
2. No controlled owner reassignment, no assignment history, no orphan queue.
3. Reviewer assignment did not validate candidate active/internal/scope or independence.
4. Resubmission screen sent the previous round's calculation run, so a recalculated returned case could not be resubmitted from the browser (found by journey B, fixed).

## D. Changes
- Append-only `supervisory_assessment_assignment` history (governed writer guard; no direct client writes).
- `supervisory_assessment_case_actor_require` added to execution_require_edit, question_upsert, calculate, dimension_upsert, submit_for_review (super admin excepted).
- `supervisory_assessment_reassign` (approval authority, reason ≥10 chars, expected current holder → `stale_assignment` SQLSTATE 55000, reviewer ≠ owner/preparer/submitter, candidate active/internal/in scope).
- `supervisory_assessment_assignment_candidates`, `supervisory_assessment_orphan_cases`; legacy reviewer assignment routed through reassign.
- Lifecycle read model: case_actor flag, NOT_CASE_OWNER reason, reassign actions, orphan flags, unknown stored state → `UNKNOWN`.
- UI: Case assignment card (server-action driven), orphan-case alert on register, resubmit binds the current run (server-chosen).
- Source parity: migrations are in `supabase/migrations/` (20261005230546…, 20261005231426…).

## E. Canonical lifecycle map
Unchanged state set; transitions only via governed commands listed in B/D.

## F. Ownership
Only the current owner may work a case. Proven: supervisor on another owner's draft refused for calculate and submit (NOT_CASE_OWNER); journey D — after reassignment the old owner cannot act and the new owner can.

## G. Reviewer assignment and independence
Self-review (reviewer = owner/preparer/submitter) refused; draft reviewer assignment refused; short reason refused.

## H. Maker-checker
Submitter's APPROVE action not permitted (MAKER_CHECKER or PERMISSION_MISSING) and direct approve RPC refused (journey A).

## I. Review rounds
Journey B: return with reason → RETURNED_FOR_CHANGES; edit, recalculate, resubmit creates round 2; round 1 record intact; approval after independent review.

## J. Concurrency
Journey E: duplicate submit and duplicate approve each produce exactly one transition. Stale reassign returns `stale_assignment` in ~132 ms (earlier 40001 retry hang fixed).

## K. Direct-write refusal
Direct REST patches to status, owner, reviewer, submission fields, round counter, approval pointer, closure and supersession: 403. Challenge patch: 200 with zero rows. Forged assignment-history and review-round inserts refused.

## L. Orphan cases
Server-listed for supervisors (3 at probe time); refused for ordinary officer; never auto-assigned.

## M. Function access (security warnings)
The 3 new linter warnings concern `supervisory_assessment_reassign`, `_assignment_candidates`, `_orphan_cases`: deliberately callable by signed-in users (not anon) because the screen calls them; each re-checks authority inside and refused the ordinary officer in negative tests. Internal helpers (`_case_actor_require`, `_can_reassign`, `_assignment_flags_internal`) are not executable by anon or authenticated. Accepted with this rationale; ~1805 pre-existing baseline linter findings are outside scope.

## N. Browser journeys (normal user journey only)
`e2e/cert-v2/14-aml-lifecycle-case-integrity.spec.ts` with browser-only fixture setup/teardown: **8/8 passed** (A, B, D, E, negative, protected, setup, teardown). APIs used only for read-only checks, negative authorization and concurrency.

## O. Regression
Vitest 187 files / **1786/1786** passed (includes new `src/test/amlClose06Lifecycle.test.ts`). Build OK.

## P. Protected records (unchanged)
00830 approved `2026-09-12 14:11:29`; 00836 draft `2026-09-28 11:37:09`; 00838 draft `2026-10-03 17:35:00`. FSRA policy and STR_SAR_GOVERNANCE not touched. SEC-CRED provider architecture not touched.

## Q. TEST data
TEST package retired by browser teardown each run. TEST assessments from runs remain as labelled TEST records (no supported withdrawal).

## R. Earlier failures (honest record)
First runs failed on: self-approval reason expectation (officer lacks approve permission → PERMISSION_MISSING; assertion widened, permitted=false still required); journey B resubmit (real UI bug, fixed in D). One intermittent journey-A failure was not reproduced on two reruns.

## S. Least privilege
No new grants to anon; no client table writes.

## T. External communications
None sent.

## U. Publish
Not published in this package.

## V. Open items (why CONDITIONAL)
- Full Playwright regression across all suites not re-run in this package (only spec 14 + fixtures).
- Fresh security scan not run; linter warnings in M accepted by rationale, not removed.
- Team-based ownership (`team_id` empty everywhere) not implemented.
- Not republished/live-smoked.

## W. Stop
Stopped at AML-CLOSE-06. AML-CLOSE-07 not started.
