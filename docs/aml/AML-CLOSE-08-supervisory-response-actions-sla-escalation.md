# AML-CLOSE-08 — Supervisory Response, Actions, SLA & Escalation

Date: 2026-10-06. Scope: AML-CLOSE-08 only. AML-CLOSE-09 not started.
All created values are TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY.

## Verdict: **CONDITIONAL PASS**

Backend authority, governance and refusal paths are evidenced. The end-to-end
**browser** SLA journey (hold → resume → close on a live governed deadline) was
**not performed**: no TEST-pinned SLA/response policy exists, so every TEST
assessment reports `NOT_GOVERNED` and no live deadline can be opened without
authoring a TEST policy package. Not published (see Y).

## A. Architecture reuse
No new action, SLA or escalation engine. Consequences use
`supervisory_consequence_record/withdraw/view`; deadlines use the platform SLA
stage engine (`sla_stage_instances`, `sla_stage_events`, `sla_escalation_dispatches`)
via `supervisory_response_sla_view/pause/complete`.

## B. Source of risk
`supervisory_consequence_source_internal` reads the publication driving
`entity_risk_state.driving_assessment_id`; unpublished/pending assessments are
refused; missing modern publication is labelled `LEGACY_RISK_RECORD`. Demo entity
read: MEDIUM_HIGH from SUP-AML_CFT-2026-01177, eligible, no blockers.

## C. No rating-to-action automation
Actions listed by the server with availability/prerequisites only (plan and
reassessment available; intervention/examination `PREREQUISITE_MISSING`). Nothing
is proposed or created from a rating.

## D. Defects found and closed
1. **Hold reason conflated with written rationale.** `supervisory_response_sla_pause`
   took one text used as both. Replaced by `(uuid, text, boolean, text)`: controlled
   reason from the obligation's policy vocabulary, separate rationale ≥10 chars
   stored in stage-event metadata; duplicate hold / resume-when-not-held refused.
2. **No browser controls.** Hooks existed but the deadline panel offered no hold,
   resume or close. Added `AmlSlaObligationControls` (pending obligations only).
3. **Client-side authority for showing controls.** The view now returns
   server-decided `viewer_can_manage` (super admin, `aml_supervision.review` or
   `supervisory_spine.review`); the screen only reads it. Officer = false,
   supervisor = true (read-only probe).
4. **Stale verifier assertions.** R2C, R2D and R2E capability checks still
   expected SECTOR_OVERLAY/FACT_CONFIG/SOURCE_BINDING as configuration-only;
   these became runtime-enforced in AML-CLOSE-02. Assertions corrected, not weakened.

## E. Backend verifiers (single transaction, ROLLBACK)
| Verifier | Result |
|---|---|
| consequence linkage | 66 / 0 |
| response policy (R2C) | 66 / 0 |
| SLA policy (R2D) | 102 / 0 |
| integrated chain (R2E, uses new hold signature) | 57 / 0 |

## F. Negative authorisation (read-only/refusal probes, no state change)
| Caller | Result |
|---|---|
| anonymous | 401 permission denied |
| licensee | 403 outside supervisory scope |
| AML officer | 403 review authority required |
| supervisor on closed obligation (hold/resume/close) | 400 `sla_not_open` |
The rationale-length refusal on an **open** deadline is covered by R2E only, not live.

## G. Notifications
(Corrected in BB.) No real email, SMS or webhook was sent during AML-CLOSE-08. The live escalation sweep was intentionally NOT executed against an overdue live TEST stage, because its notification path can dispatch external communications.

## H. Tests
Vitest 188 files: 1801/1801 after adding `data-rbac` markers (first run 1799/1801 —
two RBAC-coverage failures for the new buttons, fixed). Deadline panel 11/11
including control visibility. Typecheck clean; build OK.

## I. Preservation
00830/00836/00838, FSRA-AML-RESPONSE / FSRA-AML-SLA v1.0 (ACTIVE) and
STR_SAR_GOVERNANCE not modified. The only existing obligation (00830, ON_TIME,
completed) was only probed with refused calls.

## X. Security
Migrations introduced one expected advisory (signed-in users may call the
hold RPC; it performs its own authentication, permission and scope checks).
1806 platform advisories predate this package. No fresh full scan run.

## Y. Not done / conditions for PASS
1. Author a TEST SLA + response policy in the browser, pin it to a new TEST
   assessment, publish, record a consequence, then hold/resume/close in the browser.
2. Live proof of breach/escalation tiers on a TEST deadline.
3. Full AML browser suite, fresh security scan, publish and live smoke.

## Z. AML-CLOSE-08A — live browser deadline journey (evidence)

Spec `e2e/cert-v2/17-aml-supervisory-response-sla.spec.ts`, run tag `1791332790501`, preview. All 7 journey steps passed. The fixture setup also passed. Every successful step was a normal browser action.
- The fixture created and approved the TEST response policy `TEST-AML08A-RESP-32790501` and the TEST deadline policy `TEST-AML08A-SLA-32790501` (1.0) through the policy screens, using maker/checker. They were bound to a TEST profile.
- Assessment `834a1945-…` pinned both TEST components and did not pin `FSRA-AML-SLA`. It was calculated, approved and published in the browser. Official risk became MEDIUM_HIGH. The first run's expected TEST band (MODERATE) was corrected to the band the TEST case actually calculates.
- The REQUIRED response was displayed, but no decision or obligation was created automatically.
- A consequence recorded in the browser produced exactly 1 decision (`OPEN_SUPERVISORY_PLAN`). It also produced exactly 1 obligation `ee14e283-…` with the TEST policy, 1 day, CALENDAR_DAYS, the pause reason `AWAITING_ENTITY_INFORMATION`, and an active stage. Official risk did not change.
- The supervisor saw the controls; the officer saw none. Holds were refused for the officer, the licensee and anonymous users (401/403). Holds with a missing or short rationale, or a reason the policy does not allow, were refused. Direct inserts into the obligation, stage-event, dispatch and decision tables were refused, and so was a direct stage update.
- Browser hold: after reload the stage was paused, with 1 paused event that carries the reason and the separate rationale. A second hold was refused.
- Browser resume: the stage was active, `pause_seconds > 0`, and the due date was not shortened. The paused event was unchanged. A second resume was refused.
- Browser close: the server decided ON_TIME, with 1 completed event, and the controls were removed. Hold, resume and close attempts after closing were all refused with `sla_not_open`. Official risk did not change.
- Teardown: the first attempt timed out while a policy page was loading. The wait was raised to 90 s and the re-run passed. Read-only check: all 3 TEST components and the profile are RETIRED, and the obligation stays ON_TIME.

## BA. Status after 08A
- Breach and escalation were proven only by the rollback SQL verifier (R2D 102/102: breach and escalation happen exactly once). The live `sla-escalation-sweep` was **not** run, because it calls the notification dispatch and could send real messages.
- Not run in this pass: the full AML browser suite, a fresh security scan, publishing and the live smoke test.
- 00830/00836/00838 are present (1 approved, 2 draft) and were not touched. No email or SMS was sent.
- **Verdict: AML-CLOSE-08 remains CONDITIONAL PASS.** The positive deadline journey is now proven in the browser. Closing the remaining gates above still needs a separate authorized pass. AML-CLOSE-09 was not started.

# AML-CLOSE-08B — Final Safe Closure

## BB. Notification scope correction
`supabase/functions/sla-escalation-sweep/index.ts` invokes `dispatch-notification-event` for `workflow.sla_breached` and `workflow.sla_escalation`. The repository notification matrix records `workflow.sla_escalation` as `in_app + email`. Section G has been corrected. The live sweep was deliberately not run against any overdue stage. This was a safety decision, not a control defect. No email, SMS or webhook was sent during 08B.

## BC. AML-08 vs AML-11 boundary
AML-08 certifies deadline creation, the canonical stage, overdue detection, breach transition and event, escalation-tier eligibility, dispatch uniqueness and stage escalation evidence. AML-11 will certify real delivery: channels, recipients, templates, delivery outcomes, retries and suppression.

## BD. Breach/escalation core (rollback only)
R2D passed 102/0. Relevant checks:
- 67: an overdue deadline breaches once.
- 68: there is no second breach.
- 69: one escalation event.
- 71: late-completion evidence is kept.
- 51 and 52: breach and escalation each exist exactly once in the engine.
- 77: ON_TIME/LATE is decided by the server.
- 81: one deadline per consequence.
- 82: no action, finding or enforcement case is created.
- 37: policy cannot suppress escalation.

The linkage verifier confirms that no fixture (risk movement, enforcement, etc.) survives the rollback.

## BE. Edge worker wiring review (source only, worker not invoked)
1. Selects `state='active' AND due_at < now`.
2. Calls `public.sla_stage_mark_breached`. This returns false unless the stage is `active` and overdue, so only `active → breached` is possible. It logs the event and an audit row.
3. Notifies only when the call returned true.
4. Reads breached stages, then `sla_escalation_tiers` by process type and `delay_days`.
5. Inserts into `sla_escalation_dispatches`. The constraint `UNIQUE (workflow_instance_id, tier)` (`sla_escalation_dispatches_workflow_instance_id_tier_key`) applies, and 23505 is treated as already sent.
6. Calls `public.sla_stage_mark_escalated`.

There is no AML-specific escalation path.

## BF. Safe worker test
Added `src/test/slaEscalationSweepWiring.test.ts` (3 tests). It is a source-contract test, so the worker is never executed. It asserts:
- the breach selection and delegation to `sla_stage_mark_breached`, with notification only on a true transition;
- the tier → dispatch insert → 23505 skip → `sla_stage_mark_escalated` chain;
- no `skipNotifications`/`dryRun` bypass and no AML-specific path.

A mocked execution test was not added: the Deno worker has no dependency-injection seam, and adding one would change production code. No notification bypass was introduced.

## BG. Full AML browser suite (preview)
- **Full run:** 50 tests; 37 passed, 3 failed, 10 did not run (34.2 min).
  - Spec 13 B: click timeout.
  - Spec 14 A: `upstream r…` non-JSON answer from the auth gateway while obtaining a token.
  - Spec 16 G/H: one call returned HTTP 500.
  - Backend checks and Vitest were running at the same time.
  - Postgres error logs and edge logs for the preceding 60–70 min show no matching 500 or error. The 500 was gateway-level, with no database or function error recorded.
- **Re-run of 13, 14 and 16:** 13 passed, 1 failed, 3 did not run.
  - 13 and 16 G/H passed.
  - 14 D failed: assessment creation stayed on "Working…" for more than 45 s (screenshot). This is a slow server answer, not an assertion failure.
- **Spec 14 alone:** 8/8 passed (8.1 min).
- The suite has **not** passed cleanly in a single run, and the 3-consecutive-pass standard was not completed. This is not labelled flakiness.
- Spec 18 (`18-aml-sla-rpc-authority.spec.ts`, new) was added after the full run started. It was run separately: 6/6 passed.

## BH. Spec 17 re-certification
In the full run, spec 17 executed all 7 steps without failure on a fresh run-scoped TEST package. Steps covered:
- pinning;
- REQUIRED with no automatic action;
- exactly one consequence and exactly one obligation;
- officer denied;
- hold, reload and resume;
- ON_TIME close;
- duplicate refusals;
- protected state.

The fixture teardown retired the TEST package.

## BI. Backend verifier totals
| Verifier | Result |
|---|---|
| consequence linkage | 66 PASS / 0 FAIL, rollback verified |
| R2C | 66/0/66 |
| R2D | 102/0/102 |
| R2E | 57/0/57 |

## BJ. App regression
- Typecheck (`tsgo`): 0 errors.
- Vitest: 189 files, 1804/1804 passed. This includes the 3 new wiring tests and the RBAC action-coverage tests.
- Production build: OK in the harness.

## BK. Fresh security scan (2026-10-07 ~01:21 UTC)
0 critical, 17 warning, 42 info.

## BL. Authenticated RPC warning disposition
Both `supervisory_response_sla_pause(uuid,text,boolean,text)` and `supervisory_response_sla_complete(uuid,text)` are SECURITY DEFINER. Anonymous callers cannot execute them; authenticated callers can.

The function bodies check, in this order:
1. `auth.uid()` (no actor parameter);
2. existence;
3. `supervisory_entity_scope_check`;
4. review authority;
5. open state;
6. rationale of at least 10 characters;
7. the pause policy and the reason vocabulary.

Spec 18 results:
- Signed-out callers got 401/403.
- The licensee, the AML officer and an other-domain supervisor (prudential) were refused before any state check.
- A scoped AML supervisor passed authority and reached `sla_not_open`.
- A forged `_actor_id` was rejected because no such parameter exists.

The allowed path on an open obligation was proven in spec 17. No AML-specific out-of-scope supervisor persona exists, so the other-domain supervisor stands in.

Classification: **SAFE BY DESIGN — AUTHENTICATED ENTRY POINT WITH SERVER-SIDE AUTHORIZATION.**

## BM. Direct-write bypass
Spec 18 tried INSERT, UPDATE and DELETE as the supervisor on `supervisory_consequence_decision`, `supervisory_response_sla_obligation`, `sla_stage_instances`, `sla_stage_events` and `sla_escalation_dispatches`. All were refused or changed 0 rows. The obligation stays ON_TIME and its events are intact. TRUNCATE was not separately re-inspected in 08B.

## BN. TEST policy retirement
`TEST-AML08A-RESP-32790501` and `TEST-AML08A-SLA-32790501` are RETIRED. Every 08B suite run created and then retired its own run-scoped package. `FSRA-AML-RESPONSE` and `FSRA-AML-SLA` are ACTIVE, `updated_at 2026-09-12 14:07:47`. The ON_TIME TEST obligation is kept as evidence.

## BO. Publish / live smoke
**Not performed.** The publish gate requires the full AML browser suite to pass, and it did not pass cleanly (BG).

## BP. Protected state
- 00830: approved, 2026-09-12 14:11:29.
- 00836: draft, 2026-09-28 11:37:09.
- 00838: draft, 2026-10-03 17:35:00; still has 3 facts.
- STR_SAR_GOVERNANCE: 22 rows, ID digest `8305ec6bbf50ef8573c6634bd6de6328`, the same as AML-CLOSE-07C.
- FSRA policies: unchanged.
- The demo entity's official risk is MEDIUM_HIGH, driven by a TEST assessment published by the suite's own browser journeys.

## BQ. Remaining limitations
- There is no single clean full AML browser run. Server responses were slow or unavailable (gateway errors, creation taking more than 45 s); each affected spec passed on re-run.
- Not published and no live smoke.
- TRUNCATE privilege was not re-inspected.

External escalation notification delivery is intentionally deferred to AML-CLOSE-11.

## BR. Final verdict
**AML-CLOSE-08 = CONDITIONAL PASS.** Criteria 1–6 and 8–13, 15 and 16 are evidenced. Criteria 7 (clean full browser suite) and 14 (publish and live smoke) are not. AML-CLOSE-09 was not started.

# AML-CLOSE-08C — Final Isolated Certification

## BS. Final code/build baseline
Git HEAD `970364f1f`; preview `http://localhost:8080` (dev build); Lovable Cloud backend (single instance). Current AML browser certification = `aml` project (specs 09–18 + fixture setup/teardown) plus specs 06–08 (chromium project): **69 tests in 15 files** (previous 50-test count no longer current).

## BT. Isolated-run conditions
Started 2026-10-07 02:30:31 UTC after confirming no Vitest/Playwright process running. No backend verifier, Vitest, build, security scan or second suite ran concurrently. Pre-run: app `/login` 200, backend auth health 200.

## BU. Complete AML browser suite
Total 69 — **56 passed, 2 failed, 11 did not run** — duration 32.4 min. **Not clean.**

## BV. Failure investigation
1. Spec 12 B (02:38:40–02:41:45 UTC): after approval + reload, "Review & decision" tab never rendered (20 s). Trace shows repeated HTTP 500 `57014 canceling statement due to statement timeout` from `sup_dashboard_summary` (02:38:44, 02:39:37, 02:39:54, 02:40:31) and `supervisory_work_queue` (02:40:31). Classification: **APPLICATION_DEFECT (backend performance — read RPCs exceeding statement timeout)**, not proven infrastructure. Root cause not yet fixed.
2. Spec 15 A (02:51:28 UTC): login returned an empty `{}` error toast; user stayed on `/login`. No evidence yet distinguishing auth-gateway event from app defect → **unclassified**; INFRASTRUCTURE_EVENT not claimed.
Dependent tests (5 in spec 12, 6 in spec 15) did not run.

## BW. TRUNCATE privilege confirmation
Read-only inspection: `supervisory_consequence_decision`, `supervisory_response_sla_obligation`, `sla_stage_instances`, `sla_stage_events` — no TRUNCATE for anon/authenticated. **`sla_escalation_dispatches` granted TRUNCATE to anon and authenticated — security defect.** Fixed by migration revoking TRUNCATE/REFERENCES/TRIGGER from anon, authenticated, PUBLIC (no data change); re-check shows false for both. Because this is a security change, a fresh scan is now required before closure (not yet run).

## BX–CE
Not performed: suite not clean, so no publish, no live smoke (BZ–CC). Live escalation sweep NOT EXECUTED BY DESIGN — worker can invoke real notification delivery; deferred to AML-CLOSE-11 (CD). No email/SMS/webhook sent in 08C. TEST policy residue, protected-state and official-risk rechecks deferred to the next certification run.

## CF. Final evidence matrix
| Gate | Final |
|---|---|
| Backend verifiers 66/66/102/57 | PASS (prior) |
| App regression 1804/1804 | PASS (prior; no app source change in 08C) |
| Security | needs fresh scan after TRUNCATE revoke |
| Full AML browser (isolated) | **FAIL** 56/2/11 |
| TRUNCATE privileges | FIXED (defect found) |
| Publish/live smoke | NOT RUN |
| External notification | deferred AML-CLOSE-11, not an 08 blocker |

## CG. Final verdict
**AML-CLOSE-08 = CONDITIONAL PASS.** Next: fix dashboard/work-queue statement timeouts, investigate login `{}` failure, fresh scan, then one new isolated full suite before publish. AML-CLOSE-09 not started.

---
# AML-CLOSE-08D — performance and authentication defect closure (2026-10-07)

## CH. Scope
08D only. TEST data only; no live sweep, no email/SMS/webhook. AML-CLOSE-09 not started.

## CI. Dashboard / work-queue statement timeouts (fixed)
Root cause: `sup_dashboard_summary` scanned `v_prudential_current_breaches` four times (~1.16 s each); `supervisory_work_queue` re-evaluated the shared `supervisory_work_item` base; RBAC wrappers `has_permission` / `is_super_admin` (SQL SECURITY DEFINER) and `sec_has_permission` (expanded full permission set per call) dominated per-row cost.
Fix (two applied migrations): single breach aggregate; MATERIALIZED shared base; `sec_has_permission` filters requested module/action directly (equivalence checked on 16,920 user/module/action cases, 0 mismatches); wrappers moved to PL/pgSQL with same logic. No scope widened.
Measured as TEST AML supervisor, 50 sequential calls each, 0 errors (median/p95/max ms): `aml_overview_metrics` 214/223/385; `sup_dashboard_summary` 360/372/383 (was ~3,900); `aml_work_queue_page` 401/455/521; `supervisory_work_queue` 392/408/441 (was ~3,500). 5 concurrent pairs: no errors.

## CJ. Login `{}` defect (fixed in UI)
Trace evidence: `/auth/v1/token` returned HTTP 504 `text/plain` after 35.7 s; the library surfaced `{}`. `safeAuthErrorMessage` now shows "Sign-in could not be completed. Please try again." for empty/structural messages and any 5xx; meaningful 4xx (wrong credentials) unchanged. Unit test 3/3. E2E helper records only status/content-type/timing/request-id on failure.

## CK. 10 consecutive real UI sign-ins
`e2e/cert-v2/auth-latency-probe.spec.ts`, TEST AML officer: 10/10 reached `/dashboard`, HTTP 200 each, 54.4 s total. PASS.

## CL. Spec 12 / Spec 15 three-in-a-row
NOT MET. Spec 12 runs: pass, fail, fail; restarted: fail; diagnostic sample run: fail. Spec 15 three-in-a-row not reached.
Failure evidence (preserved per run under `/tmp/aml08c/out-*`):
- 03:44 token request never answered within 60 s.
- 03:54 `sec_get_user_context` HTTP 500 `57014` after 15.7 s; trivial reads (`site_settings`, `currencies`) 8 s.
- 04:00 server wait 3–22 s on ordinary reads (`licenses`, `payments`, `notification_counts` 13.6 s).

## CM. Root-cause localisation (partial)
- While spec 12 ran, `pg_stat_activity` sampled every ~2 s for ~4 min: **zero** statements active > 0.8 s. The same reads take ~0.1 s when idle. Delay is therefore before/around statement execution (API/pooler queueing or instance saturation), not one slow query.
- Scheduled jobs failed with `job startup timeout` at 03:04–03:09 and 03:42–03:44 — the database could not start work, matching the 03:44 sign-in hang.
- One dashboard landing fires 58 backend requests in 12 s (licenses ×9, complaints ×6, licensees ×5 …). This client fan-out is a contributing load source; not yet reduced.
- Health snapshot: connections 36/60, no recorded exhaustion alert. API gateway/PostgREST logs returned no rows, so the exact queueing layer is **not proven**.

## CN–CW. Gates not executed because CL is not met
Privilege checks on the five tables, fresh security scan after the RBAC change, full Vitest/build, one clean isolated full AML suite, TEST residue census, protected-state re-check, publish and live smoke: **not run in 08D**. Migration linter flagged `has_permission` / `is_super_admin` as signed-in-callable SECURITY DEFINER; both were already SECURITY DEFINER and callable before 08D — needs confirmation in a fresh scan.

## CX. Protected data
No writes to 00830/00836/00838, FSRA policy, STR_SAR_GOVERNANCE in 08D (only TEST fixtures created/retired by the browser specs). Not re-fingerprinted in 08D.

## CY. Remaining work
1. Reduce dashboard landing fan-out (dedupe licenses/licensees/complaints count queries).
2. Obtain gateway/pooler evidence for the queueing window, or larger instance.
3. Re-run spec 12 and 15 ×3, then the remaining gates.

## CZ. Verdict
**AML-CLOSE-08 = CONDITIONAL PASS.** Not published. AML-CLOSE-09 not started.
