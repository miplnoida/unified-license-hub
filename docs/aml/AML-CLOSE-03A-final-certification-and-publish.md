# AML-CLOSE-03A — Final certification and publish

Status: **CONDITIONAL PASS** (see P). All thresholds, weights and packages below are TEST-only technical certification values, not FSRA policy. AML-CLOSE-04 was not started.

## A. Scope
Close the AML-CLOSE-03 gaps: explain 00838's timestamp, verify source/app/database compatibility, publish, smoke-test the published app, run a full browser journey on disposable TEST data, re-prove maker/checker, classify the two security warnings, run the full test and Playwright suites, and confirm preservation.

## B. Assessment 00838 timestamp
Read-only inspection of `66cc17e3-f944-4b93-be22-8857565a1213`: `created_at = updated_at = 2026-10-03 17:35:00.173152Z`. Event history starts with `CREATED` at that same instant, followed by programme, question-plan and policy-basis stamping, then three facts recorded (17:37–17:41Z). There are zero calculation runs. The 17:35 value is the record's original creation time. AML-CLOSE-03 did not change it.

## C. Source revision
Work started at `ff6a8cc657fb2dfea7b13b36a494984a354dcbba` ("Fixed aml-panel refresh"). The published build includes this turn's test, config and report commits (latest `e584b7c9…`). No application logic changed after the fact-refresh fix, apart from moving test output folders.

## D. App/database compatibility (before publish)
- Type check clean and build OK.
- All 53 `supervisory_*` routines the app calls exist in the database (none missing).
- The internal readiness routine was revoked from signed-in users. The app never calls it directly, only through guarded public routines.

## E. Publish
Published with the normal Publish mechanism to `https://olras.mishainfotech.com` (HTTP 200). The publish gate reported 60 critical scanner findings. All of them were already there (wide read rules on reference tables). None involve AML-CLOSE-03 tables or routines.

## F. Published-app smoke test
Logged in through the real UI on the published site as `aml_supervision_officer`, which landed on `/dashboard`. The AML assessment list loaded (25 rows). Assessment `8f6e487f…` showed the factor panel with 4 factor rows and the fact register. The only failed call was `monetary_config_resolve` (401) on the signed-out login page. It is unrelated to AML and was not caused by this work.

## G. Browser journey (committed spec `09-aml-materiality-browser-journey`)
Ran on the TEST Virtual Asset demo licensee `9ca17098-…-79021972020` with TEST profile v6 (methodology v8, settings v1), all through the UI:
1. Created an assessment through the New AML/CFT assessment dialog.
2. Before any facts, INHERENT and INHERENT_B showed Information pending.
3. Recorded HAS_FLAG. INHERENT applicability was then met but it stayed pending, because materiality still needed STR_COUNT.
4. Recorded STR_COUNT = 12. Result: INHERENT Included, INHERENT_B Excluded – not material, INHERENT_C Not applicable, CONTROL Included.
5. Answered every required question in the UI and pressed Recalculate. Result: CALCULATED, residual MODERATE, engine AML06.2.
6. Reloaded the page. The calculation and the factor outcomes were unchanged.

Result: 6/6 passed. The latest disposable assessments are 00924 and 00926 (CALCULATED, AML06.2). Earlier failed runs left disposable TEST assessments (00915–00922) on the same TEST entity.

## H. Missing-information proof
Proven in the UI (steps G2–G3). A missing fact gives Information pending, never zero and never "not material". Readiness blocks submission while anything is pending.

## I. Maker/checker
Proven on TEST settings `84cc137b…`. The officer drafted and submitted for review. The same officer's approval was refused ("the approver must be a different person from the author"). A different supervisor then approved. Both TEST settings (`84cc137b…`, `b1acfb5b…`) were retired afterwards.

## J. Security warnings
| Routine | Classification | Basis |
|---|---|---|
| `supervisory_assessment_factor_authority` | Accepted, safe by design | Requires sign-in and `supervisory_assessment_question_readable`. Anonymous users cannot run it. Refusals for unrelated roles are proven in spec 09. |
| `supervisory_calculation_applicability_set` | Accepted, safe by design | Uses `supervisory_calc_config_draft_guard`, which requires a configuration-manager role and DRAFT status. Anonymous users cannot run it. Refusal is proven in spec 09. |
| `supervisory_assessment_readiness_internal` (found in this pass) | **Fixed** | It had no scope check. Execute is now granted to the service role only, and direct calls are proven refused. |

Linter: 1797 findings at the start and 1796 after the revoke. The older backlog was not touched.

## K. Full application tests
Vitest: 180 files, 1758 tests passed, none skipped.

## L. Committed Playwright certification suite
| Spec | Result |
|---|---|
| 01 authentication | 16 passed |
| 02 audience boundary | 5 passed |
| 03 PPOC multi-entity | 4 passed |
| 04 process surfaces | 9 passed, **2 failed** |
| 05 server enforcement | 6 passed |
| 06 AML demo dataset | 6 passed |
| 07 AML governed runtime | 5 passed |
| 08 AML least privilege | 2 passed |
| 09 AML materiality browser journey | 6 passed |

Total: 59 passed, 2 failed. Both failures are in the Complaints (P09) and Inspection (P10) screens. The cause is a development-only React warning about duplicate list keys (for example in `ComplaintsList`). It is outside AML and was not caused by this work. It was not fixed here, to stay within scope.

## M. AML-CLOSE-02 regressions
Specs 07 and 08 passed, covering the perimeter guard, refused facts, unchanged content fingerprint, creation without perimeter and least privilege. The role self-grant guard and anonymous protections are unchanged.

## N. Later-version demonstration
Time-dependent. Effective dates were not changed. Settings v2 could not become active, and the earlier fail-closed result (NOT_GOVERNED / NO_CONFIGURATION) still stands. Immutability of the pinned assessment was already proven in AML-CLOSE-03 H.

## O. Preservation
- 00830: 1 calculation run, last 2026-09-12. Unchanged.
- 00836: 0 runs. Unchanged.
- 00838: 0 runs, `updated_at` equals creation time. Unchanged.
- `STR_SAR_GOVERNANCE` and the six historical failures were not touched.
- FSRA records unchanged: `FSRA-AML-CFT-POLICY` v1.0 ACTIVE, `AML-CFT-RBA` v1.0 ACTIVE, MIPL v1.1 DRAFT.
- All TEST profiles are retired or superseded (v6 retired through the governed lifecycle by the TEST supervisor).
- No external communications: `notification_outbox` and `licensing_provisioning_outbox` have no rows since 2026-10-03.

## P. Certification answers
- 00838 timestamp explained: **Yes** (original creation).
- Source/app/database compatible before publish: **Yes**.
- Published and smoke-tested: **Yes**.
- Full UI journey through calculation and reload: **Yes**.
- Missing facts never silently zero or not material: **Yes**.
- Maker/checker re-proven: **Yes**.
- AML-CLOSE-03 security warnings resolved or classified: **Yes** (two accepted with proof, one extra fixed).
- Full application test suite: **Yes** (1758/1758).
- Full Playwright suite green: **No** (59/61; 2 non-AML development-warning failures).
- AML-CLOSE-02 regressions pass: **Yes**.
- Later-version factor outcome: **Time-dependent** (not demonstrable without changing effective dates).
- Preservation and no external communications: **Yes**.

Verdict: **CONDITIONAL PASS**. The conditions are the two non-AML Playwright failures and the time-dependent later-version demonstration.
