# AML-CLOSE-06: Assessment lifecycle and case integrity

Scope: certify the existing AML/CFT assessment lifecycle and harden it only where a real gap is shown. Calculation, judgement and publication logic (AML-CLOSE-04/05/07) stay as they are, and so does the email-provider setup. 00830, 00836, 00838, the FSRA policy and STR_SAR_GOVERNANCE stay untouched. Successful journeys run only through the browser. Direct calls are used only for refusals, forgery attempts, race tests and read-only checks.

## What already exists
- The server publishes each assessment's lifecycle state, and it already has commands for transition, submit for review, assign reviewer, raise and resolve challenges, return, reject, approve and publish.
- Readiness checks, review-blocker checks and the review-round register are already in place.
- The assessment table only allows reads (one read policy, no write policy). This suggests direct status writes are already blocked; that will be proved, not assumed.
- Gap found: there is no command to reassign an owner and no way to find cases left without an eligible owner or reviewer (orphan cases).

## Phase 1: Discovery and lifecycle map (read-only)
- Read the lifecycle-state, transition, submit, assign, return, reject, approve and challenge command definitions, plus the guard triggers and the review-round table.
- Build the map: stored state, then canonical state, permitted actions, required permission, required relationship to the case, maker/checker rule, blockers, resulting state.
- Record the current ownership rules: who counts as preparer, creator, owner, team, reviewer, submitter and approver.
- Record the rule for parallel assessments, taken from the existing uniqueness constraints and programme configuration.
- Check how reopening, rejection and supersession behave today.

## Phase 2: Negative tests (direct calls under TEST roles)
- Direct table writes covering every forbidden status change, plus submitter, reviewer, round, approval, owner and closure fields.
- An unrelated AML officer edits facts, responses, evidence or ratings using a known assessment ID.
- Forged cross-assessment and cross-entity references.
- Double submit and double approve; parallel return and approve; approve while a challenge opens; a stale calculation hash at submit.
- The preparer or submitter tries to approve.

## Phase 3: Minimal hardening (only for gaps Phase 2 confirms)
- Add a governed command to reassign an owner or reviewer: it requires supervisor permission, a reason and the expected current assignee, keeps every past assignment, and records an audit event.
- Add a read-only orphan-case view: no eligible owner, no eligible reviewer, a disabled assignee, or an assignee without the required scope. It appears as a flag in the supervisory work queue. Nothing is auto-assigned.
- Add an expected-state check to transitions only where a race is actually shown, using the existing row lock.
- Make all lifecycle commands refuse to act when the assessment is in an unknown stored state.
- Front end: the reassign action and orphan flag appear only when the server's list of allowed actions includes them, and any unknown reason code is shown as "not allowed".
- Record the architecture rules in the project's rules file.

## Phase 4: Browser journeys (disposable TEST fixture, created on screen)
- A: create, prepare, calculate, submit, assign reviewer, independent approval, reload at each stage.
- B: return with a reason, edit, recalculate, resubmit; round 2 appears and round 1 is unchanged; approval.
- C: preparer or submitter approval is refused.
- D: the assigned user loses eligibility; a supervisor sees the orphan flag and reassigns; the old user cannot act and the new one can.
- E: double-clicking submit or approve produces exactly one transition.
- Afterwards, verify the stored rounds, pinned calculations, history and protected records read-only.

## Phase 5: Gates and report
- Typecheck, build, full app tests, the AML browser suite and new lifecycle tests, the security/role tests, and a fresh security scan.
- Retire TEST configuration and role grants through the supported screens.
- Write the report, sections A–W, to `docs/aml/AML-CLOSE-06-assessment-lifecycle-case-integrity.md`. Stop before AML-CLOSE-07.

## Technical notes
- New commands run with elevated database privileges, check permissions internally and refuse anonymous callers. Assignment history lives in an append-only table with grants and access rules in the same change.
- No historical rows are rewritten. Removing a role never deletes past author references.
