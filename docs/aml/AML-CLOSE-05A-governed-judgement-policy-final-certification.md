# AML-CLOSE-05A — Governed judgement policy, re-runnable browser certification & publish

All values used are TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY.

## A. Outcome
**CONDITIONAL PASS.** All browser, regression, security-baseline, publish, smoke and retirement gates passed.
Conditions are in section Q.

## B. Rules followed
- Every successful-path setup and action (policy component, maker/checker approval, package version, binding,
  activation, assessments, facts, answers, calculations, overrides, decisions, retirement) was done in the screens.
- Direct calls were used only for read-only checks and refused-bypass tests.
- Specs 10 and 11 no longer invoke calculation through an API; they read the browser-recorded run.

## C. Model inspected — platform invariants vs policy rules
| Platform invariant (not switchable) | Policy-controlled (JUDGEMENT_POLICY) |
|---|---|
| Independent decider (proposer ≠ decider) | Direction (UP / DOWN / BOTH) |
| Run-bound override; STALE on recalculation | Maximum rating steps |
| Decision is final; rejection needs a reason | Prohibited target ratings |
| Withheld calculation cannot be overridden | Ratings the rule applies to |
| Policy resolved only from the pinned snapshot | Override permitted; rationale minimum length |

No parallel policy feature was invented; the existing component, profile binding and evaluator were used.

## D. Screen changes
Calculation tab shows the pinned judgement policy evaluation: package version, policy code/version, rule,
direction, step limit, rationale minimum, and for each candidate rating whether the policy permits it.
Refusal messages explain direction, movement, prohibited-target and rationale refusals in plain language.

## E. Re-runnable fixture
`aml.fixture.setup.ts` (browser) creates a unique TEST JUDGEMENT_POLICY (direction UP, max 1 step, rationale ≥ 40),
approves it with a second person, creates a new TEST package version, binds and activates it.
`aml.fixture.teardown.ts` (browser) retires both after each run. Specs 09–13 depend on it.

## F. Journey A — permitted override (00964)
Policy shown on screen; short rationale refused; one-step upward HIGH proposed by officer, approved by supervisor;
calculated MEDIUM_HIGH unchanged; final HIGH, source APPROVED_OVERRIDE; policy status EVALUATED and the override
records policy `AML_TECH_CERT_JUDGEMENT_05730736` 1.0, package 10.730736, rule TEST-JU-730736.

## G. Journey B — refused departures
Downward (MODERATE) refused for direction; two-step SEVERE refused for movement. No override recorded; calculation
run and hash unchanged.

## H. Policy-version pinning
After teardown retired the package and policy, pinned assessments still evaluate against the policy they were
created under (read-only check, status EVALUATED, same policy code).

## I. Refused bypasses (direct calls)
Two steps up (403 movement), one/two steps down (403 direction), short rationale (400), forged policy argument
(404 unknown signature), rewriting the pinned snapshot (200, zero rows changed), editing the approved policy
(200, zero rows changed), rebinding on an active package (403 `policy_profile_immutable`). All refused.

## J. Spec 06 register fix
Root cause confirmed: the register lists newest first, 25 per page, and TEST rows pushed DEMO rows off page one.
The spec now uses the register's own search box.

## K. Flakiness fixed
- Assessment tab load: wait longer and reload once.
- Fact dialog: the source box briefly renders as free text until the governing sources load; the spec now waits and
  fills source and reference by their own fields.

## L. Results
| Suite | Result |
|---|---|
| AML specs 06–08 (chromium) | 13/13 passed |
| AML specs 09–13 with setup/teardown | 24/24 passed (16.6 min) |
| App unit tests | 1762/1762 passed (181 files) |
| Type check | clean |

## M. Security
Linter 1,796 findings — unchanged baseline; no database change in this package. The scan still reports 60
inherited critical findings (mostly wide read rules on configuration tables). Not claimed clean.

## N. Publish
Published to `olras.mishainfotech.com`; live smoke: AML officer signed in and the assessment register loaded.

## O. Retirement / orphans
Each run's TEST package and policy were retired in the screens. Two judgement policies left by interrupted runs
(`…_03642753`, `…_07643400`) were retired in the screens. One TEST package draft (`28123d19…`) remains DRAFT:
the screen offers no retire action for drafts. It is inactive and cannot be used by assessments.

## P. Protected records
00830 (approved HIGH), 00836, 00838 unchanged; FSRA policy and STR_SAR_GOVERNANCE not touched; no external
communications sent.

## Q. Open conditions
1. One inactive TEST draft package remains; the platform has no supported discard for drafts.
2. The independent decider is always the AML supervisor; no third AML approver persona exists.
3. 60 inherited critical security findings remain outside this package's scope.
4. Fact dialog source box briefly accepts free text before governed sources load (handled in tests; small UX fix
   recommended).

## R. Evidence
Run logs under `/tmp/m05a/` (`aml5.log`, `c68.log`, `r13b.log`, `live.log`).

## S. Stop
Stopped after AML-CLOSE-05A. AML-CLOSE-06 not started.
