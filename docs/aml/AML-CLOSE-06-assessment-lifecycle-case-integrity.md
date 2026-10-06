# AML-CLOSE-06 — Assessment lifecycle and case integrity

Status: **PASS** (closed by AML-CLOSE-06A — see section AG; section V items resolved there)
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

---

# AML-CLOSE-06A — Final Certification Closure

Source: Git HEAD `6b69bdd4e`. AML-CLOSE-06 migrations `20261005230546_fbbc7719…` and `20261005231426_f10f9098…` (unchanged in 06A). Changes made in 06A: none to application code or migrations. A temporary live-smoke spec was used, then deleted.

## X. Full Playwright regression
Full suite (`npx playwright test`, 85 tests): **78 passed, 4 failed, 3 did not run, 0 skipped** (35.2 min).

| Failure | Step | Root cause | Baseline | AML-CLOSE-06 related |
|---|---|---|---|---|
| 04 P09-COMPLAINTS | surface defects | React duplicate-`key` console warning in `ComplaintsList` | Same signature as earlier baseline | No |
| 04 P10-INSPECTION | surface defects | `denied-ui /inspections`, `/prudential/examinations` for the persona | Same signature as earlier baseline | No |
| 04 P05-FITPROPER | `/fpa` body length 30 (<50) | Page still loading at the assertion. **Passed when run alone** (14.7 s) | New, timing only | No |
| 14 D (reassign owner) | `loginAs` stayed on `/login` | Sign-in timed out late in a 35-minute run. **Full spec 14 rerun: 8/8** | Timing only | No (the sign-in step, not lifecycle logic) |

The 3 "did not run" were spec-14 tests after D; serial mode skips the rest after a failure. All of them passed in the rerun. Every other AML spec (06–13) passed in the full run.

## Y. Fresh Security scan
Run `2026-10-06T00:09:04Z`: **critical 0, warning 31, info 28**. All of these are earlier open-read or storage findings; none concern the AML-CLOSE-06 routines.
Conflict: the publish gate reported **60 unresolved critical findings** from stored scan state. This is the same set recorded in earlier packages, which this fresh scan did not list as critical. So a stored scan record still carries critical findings, and that record does not match this scan. Publishing was not blocked.

## Z. Three warning disposition
Signed-out, licensee, AML officer, AML supervisor and super admin are dynamic calls (06A). Cross-scope used a prudential supervisor.

| Routine | Signed-out | External (licensee) | Ordinary AML officer | AML supervisor | Cross-scope (prudential supervisor) | Classification |
|---|---|---|---|---|---|---|
| `supervisory_assessment_reassign` | 401 refused | 403 refused | 403 refused | allowed (reached the stale-holder check, so no change was made) | 403 entity outside scope | SAFE BY DESIGN — AUTHENTICATED ENTRY POINT WITH SERVER-SIDE AUTHORIZATION |
| `supervisory_assessment_assignment_candidates` | 401 | 403 | 403 | 200 (4) | 403 entity outside scope | SAFE BY DESIGN — AUTHENTICATED ENTRY POINT WITH SERVER-SIDE AUTHORIZATION |
| `supervisory_assessment_orphan_cases` | 401 | 403 | 403 | 200 (5) | 200 (3), limited to entities in its scope | SAFE BY DESIGN — AUTHENTICATED ENTRY POINT WITH SERVER-SIDE AUTHORIZATION |

- All three derive the caller from `auth.uid()`, run as `SECURITY DEFINER` with `search_path=public`, and anon cannot execute them.
- Passing a forged `_actor_id` was rejected: the function signature has no such parameter (404).
- The prudential supervisor holds `supervisory_spine.approve`, the same authority that `supervisory_assessment_approve` accepts. Its orphan list is therefore filtered by entity scope rather than refused, and its reassign and candidate calls on an out-of-scope entity are refused.

## AA. Lifecycle re-certification
- Spec 14 passed 8/8 three times: before 06A, in 06A, and in the rerun after the full suite.
- Direct check after the full suite:
  - AML officer → calculate on the supervisor-owned case 01045: refused, `not_case_owner`.
  - AML officer → submit on 01045: refused, `not_case_owner`.
  - Supervisor → calculate on the officer-owned case 01038: refused, `not_case_owner`.
- Reassignment history for 01045: OWNER moved from the AML officer to the AML supervisor, by the AML supervisor, with a 102-character reason, at `2026-10-05 23:46:43Z`.
- History PATCH and DELETE affected 0 rows, and the row is unchanged afterwards. A forged INSERT was refused with 42501.
- Orphan queue: visible to the supervisor, refused to the officer, never auto-assigned, and recovered through governed reassignment (journey D).

## AB. TEST assessment residue
- Retained: 29 TEST assessments, `SUP-AML_CFT-2026-01035` to `-01065`, plus the earlier probe case `01034`.
- All are on one entity: *Virtual Asset Business Demo Licensee (SAINT-LUCIA-FSRA-DEMO)*.
- All 29 have a creation rationale starting `TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY` (0 without it). All are pinned to the run-scoped TEST package, which was retired after every run.
- Only 1 is `approved`/current, and it is on that demo entity. None are on the entities of 00830, 00836 or 00838, so they are safe to retain.
- No withdrawal feature was created.

## AC. Publish
- Requested `2026-10-06 ~01:31 UTC` from HEAD `6b69bdd4e` to `olras.mishainfotech.com`.
- Live entry `index-C1aI0cVT.js`. The live chunk `AmlAssessmentWorkspace-DDgsqVlV.js` contains `aml-assignment-card`, confirming the AML-CLOSE-06 front end is served.

## AD. Live smoke (published site, TEST records only, no approvals)
- AML officer:
  - The register loads and the TEST case 01038 opens.
  - The lifecycle panel shows "Editing allowed" and the permitted-action set, with "Reassign case owner" listed as not permitted.
  - The Case assignment card is correctly hidden, because the officer has no reassignment authority. This is by design.
  - The state holds after reload.
- AML supervisor: the register shows the orphan alert, case 01045 opens, the Case assignment card loads, the candidate list holds 4 people, and the state holds after reload.
- Licensee: no Case assignment card is rendered.

## AE. Protected-state proof
- 00830: approved, `2026-09-12 14:11:29`.
- 00836: draft, `2026-09-28 11:37:09`.
- 00838: draft, `2026-10-03 17:35:00`. It still has its original **3 facts** (`AML_TECH_CERT_STR_COUNT`, `_HAS_FLAG`, `_TIER`; latest `2026-10-03 17:41:56`; each has a source).
- FSRA AML components: latest change `2026-09-14 04:32:41`.
- `STR_SAR_GOVERNANCE` dimension rows: 22, latest `2026-09-04 09:12:27`.
- No change to SMTP, email-provider or SEC-CRED configuration. No email or SMS was sent.

## AF. Team ownership disposition
Deferred enterprise enhancement, not a blocker for the currently certified individual-owner operating model.

## AG. Final verdict
**AML-CLOSE-06 = PASS**

Assessment lifecycle, ownership and case integrity are TECHNICALLY CLOSED.

Caveat (not an AML-CLOSE-06 criterion): stored scan state still lists 60 earlier critical findings that this fresh scan does not report (section Y).

### Final answers
- Did the lifecycle suite pass again? **YES** (8/8).
- Did the complete browser regression run? **YES** (78/85 passed, 4 failed, 3 did not run).
- Are there new browser failures attributable to AML-CLOSE-06? **NO**.
- Does the fresh scan contain an unexplained critical finding? **NO** (0 critical; for the stored-state conflict, see Y).
- Are the three warnings dynamically proven safe? **YES**.
- Can an unrelated AML officer edit, calculate or submit another owner's case? **NO**.
- Can an authorised supervisor recover or reassign an orphaned case? **YES**.
- Is assignment history immutable and auditable? **YES**.
- Do retained TEST assessments affect real risk-of-record or FSRA policy? **NO**.
- Are 00830, 00836 and 00838 unchanged, with 00838 keeping its 3 facts? **YES**.
- Was the AML-CLOSE-06 front end published? **YES**.
- Is team ownership required? **NO** (deferred enhancement).

Stopped. AML-CLOSE-07 not started.
