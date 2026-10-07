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

---
# AML-CLOSE-08E — Request fan-out, request-layer saturation, capacity (2026-10-07)

## DA. Dashboard fan-out (fixed)
Clean TEST AML supervisor landing, first 15 s, sign-in token and realtime excluded (`e2e/cert-v2/dashboard-request-budget.spec.ts`):
| | Before | After |
|---|---|---|
| Total backend requests | 50 | 34 (2 are static logo/favicon files) |
| Exact duplicates | user_roles ×3, profiles ×3, user_dynamic_roles ×3, roles ×3, delegation_rules ×5, notifications ×3, notification_counts ×3 | user_dynamic_roles ×2 (sign-in role label + dashboard tier lookup, two separate uses; kept) |
| Dashboard metric requests | ~45 count/list calls | 1 `supervisory_dashboard_operational_summary` + `sup_dashboard_summary` + `supervisory_work_queue` + module tiles the user can open |
| Median / slowest | — | 53 ms / 928 ms |

Changes:
- `supervisory_dashboard_operational_summary(_sector_id, _regulator_id)`: one SECURITY INVOKER aggregate (so the caller's own access rules apply) using the same filters as the old counts. Application counts call the same `get_application_list_page` + drill-down params; returns via `returns_supervisory_summary`. No new tables. Authenticated only.
- `useSupervisoryMetrics` uses it; output shape unchanged.
- Fit & Proper, Conduct and Prudential tile queries now take `enabled` and do not run without module access.
- `fetchPlatformUser` shares one in-progress load per user (sign-in fired it 3×); nothing cached after it settles.
- Notifications and delegation banner key on user id, not the user object.
Comparison as TEST supervisor: new vs old values for licences 25/25, active 25/25, licensees 26/26, complaints-open 0/0, payments-pending 0/0, enforcement-open 0/0, risk-high 0/0, applications-all 3/3; sector filter returns scoped zeros. 0 mismatches.
Target ≤20 **not met**: the remaining ~29 API calls are app-shell start-up (currencies, regulators, site settings, entity context, entitlements, notifications, security context), not dashboard tiles.

## DB. Request-layer probe (every ~2 s, aligned by timestamp)
Cheap anon REST read (`site_settings`, normally ~0.1 s) and `pg_stat_activity` sampled throughout Spec 12 runs:
| Time (UTC) | REST read | DB connections | Active client queries | Oldest active |
|---|---|---|---|---|
| 04:30:18 | 11.4 s | 41 | 1 (probe) | none >0 s |
| 04:36:22 | 12.0 s | 42 | 1 (probe) | none |
| 04:37:23 | 6.1 s | 41 | 1 (probe) | none |
Classification: **Case C**. Requests are delayed before they reach the database. The database was idle with no waits. Peak connections were 42/60, so the limit was not reached. Earlier windows (03:04–03:09, 03:42–03:44) logged background-job `job startup timeout`. Request/pooler/auth logs returned no rows: **OBSERVABILITY GAP** for the exact layer.

## DC. Spec 12
Test fix: the review-tab click could land during a re-render and get lost. Spec now retries until the tab is selected.
Runs: pass (6.0 m), pass (7.2 m), **fail** (Recalculate button not ready within 20 s at ~04:36). This lines up with the 12 s REST stall above. Spec 15 not run (sequence stops at first failure). **3/3 not met.**

## DD. Scaling decision
Conditions in §23 hold: individual SQL is fast; the dashboard storm is removed; stalls occur with an idle database and connections below limit. Classification: **TEST INFRASTRUCTURE CAPACITY LIMIT (probable)**. A database-server size upgrade is reasonable but needs the owner's approval (cost). Not performed.

## DE. Security
- Five-table privileges (anon / authenticated): `supervisory_consequence_decision` — / SELECT; `supervisory_response_sla_obligation` — / SELECT; `sla_stage_instances` and `sla_stage_events`: anon SELECT revoked → — / SELECT (writes already refused by policy); `sla_escalation_dispatches` had INSERT/UPDATE/DELETE granted to anon and authenticated. RLS had no write policy, so writes were refused, but the grants are now **revoked** → — / SELECT. TRUNCATE granted to neither. Not executed.
- `has_permission` / `is_super_admin`: SECURITY DEFINER, authenticated EXECUTE, anon none. Required: 503 access-rule clauses call them, all with `auth.uid()`. They return only a boolean, but a signed-in caller *can* pass another user's id and learn yes/no for one permission. Tightening to self-only cannot be done inside a definer function without breaking nested definer callers. **Accepted residual, low severity**, recorded for a dedicated RBAC package.
- Fresh scan: **0 critical**, 17 warnings, 42 info (same classes as before).

## DF. Regression
Vitest 190 files / 1807 passed (ran during Spec 12 run 1 — not isolated). Build OK. Full AML suite, publish and live smoke **not run** (Spec 12 gate not met). No live sweep, no email/SMS/webhook. Protected records not written.

## DG. Verdict
**AML-CLOSE-08 = CONDITIONAL PASS.** Blocker: request-layer stalls upstream of the database on the TEST project. Next: owner decision on database-server upgrade, then A/B re-run of Spec 12 ×3, Spec 15 ×3, full AML suite, publish. AML-CLOSE-09 not started.

---
# AML-CLOSE-08F1 — Current-Capacity Stall Reproduction (2026-10-07)

Diagnostic only. No code, schema, grant, policy, setting or capacity change. No publish, no Spec 15, no full suite, no sweep, no email/SMS/webhook.

## DH. Shared-environment constraint
TEST and live share one backend server. Any future size change affects both. It must be separately authorised as a shared-environment infrastructure change, preferably in a low-traffic window. Not done.

## DI. Idle baseline (13:13–13:14 UTC, 20 samples, Git `32b0693b9`)
| Check | Median | p95 | Max |
|---|---:|---:|---:|
| `site_settings` | 104 ms | 184 ms | 184 ms |
| sign-in token | 203 ms | 278 ms | 278 ms |
| `sec_get_user_context` | 161 ms | 412 ms | 412 ms |
| `supervisory_dashboard_operational_summary` | 757 ms | 1,465 ms | 1,465 ms |
| `sup_dashboard_summary` | 468 ms | 649 ms | 649 ms |
| `supervisory_work_queue` | 513 ms | 783 ms | 783 ms |
Connections 16/60, memory 58%, no resource alerts (48 h). The earlier "second ordinary read" was an invalid query (HTTP 400) and is discarded.

## DJ. CHEAP_REST_CONTROL
`GET /rest/v1/regulators?select=id&limit=1` (anon key, no join). Idle, 20 samples at 13:25 UTC: all HTTP 200, median 109 ms, p95 139 ms, max 625 ms. During Spec 12 it was polled every ~2 s together with `pg_stat_activity` (535 samples, 13:25:12–13:42:48).

## DK. Spec 12 runs
| Run | UTC | Result |
|---|---|---|
| 1 | 13:25:42–13:32:15 | 9/9 passed (6.5 m) |
| 2 | 13:32:28–13:39:19 | 9/9 passed (6.8 m) |
| 3 | 13:39:25–13:43:09 | **FAILED**: setup + journey A passed; journey B failed; 5 did not run; fixture teardown failed |
**3/3 not met.** The stall reproduced. Sequence stopped; no rerun.

Control read per window: pre-run max 0.15 s; run 1 max 2.03 s (1 sample >2 s); run 2 max 4.90 s (4 >2 s); run 3 max **19.19 s** (5 >2 s).

## DL. Failure window (actual evidence)
| UTC | Spec step | Cheap REST | Auth | AML/app request | DB conns | Active client queries / max age | DB wait | CPU | Memory | Background jobs |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---|
| 13:41:21–13:41:58 | B: officer sign-in | 0.10–1.06 s | token 1.03 s (13:41:53, 200) | — | 39 | 0 / 0 s | none | UNKNOWN / NOT EXPOSED | UNKNOWN | cron OK |
| 13:42:00 | B: app shell load | **15.59 s** | — | `profiles` 9.72 s; `user_dynamic_roles` 6.98 s (13:42:09) | 39 | 0 / 0 s | none | UNKNOWN | UNKNOWN | cron OK |
| 13:42:19 | B: "New AML/CFT assessment" not rendered | 0.94 s | — | `sec_get_user_context`, `entity_license_entitlements`, `licensees`, `notifications` etc. never completed (-1, page closed at 20 s timeout) | 39 | 0 / 0 s | none | UNKNOWN | UNKNOWN | cron OK |
| 13:42:20–13:42:48 | teardown sign-in | 4.61 s, **18.89 s**, **19.19 s** | **token HTTP 504 after 45.4 s** (req `01a11699-…`) | — | 39–40 | 0 / 0 s | none | UNKNOWN | UNKNOWN | cron OK |
Memory after the run (db health, 13:44): 76%, 32/60 connections, pool clients 1/200, no exhaustion alert.

## DM. Database activity
- Peak connections during all three runs: **40/60**. Pool clients 1/200.
- Active client queries in every sample (excluding the probe): **0**; longest active statement observed: **0 s**; wait events: **none**.
- Blocked-session count was non-zero (3) in one sample only, 13:32:00, between runs — not in the failure window.
- At 13:37:30 one monitor connection was refused by the connection pooler: `FATAL (EAUTHQUERY) auth_query secret check timed out`. This is a pooler-side authentication lookup timing out, during run 2.
- `pg_stat_statements` (cumulative since stats reset, not window-specific) shows old PostgREST `licenses`/`licensees` count queries with max ~8.0 s (statement-timeout ceiling). Not attributable to this window; no such statement was active during the stall.
- SQL timing for the 9.7 s `profiles` read: no matching active statement was visible in any 2 s sample, so SQL execution was below sampling resolution; ≈9.7 s occurred outside SQL execution.

## DN. Infrastructure utilisation
CPU, database CPU, I/O, network, API/PostgREST utilisation: **UNKNOWN / NOT EXPOSED**. Memory 58% before, 76% after (single snapshots, not a time series). No resource-exhaustion alert recorded.

## DO. Auth / API behaviour
- Cheap control read slowed: **yes** (to 19.2 s, HTTP 200).
- Auth slowed: **yes** (one token request 504 after 45.4 s; earlier token 1.03 s).
- AML/app requests slowed: **yes** (profiles 9.7 s, user roles 7.0 s; security-context calls did not complete within 20 s).
- PostgreSQL long-running query: **no**.
- Gateway/auth/postgres log queries for the window returned **no rows** (observability gap).

## DP. Background jobs
103 scheduled job runs 13:24–13:44, all succeeded. Maximum start delay after the scheduled minute: 8.0 s (time not tied to a specific run). No `job startup timeout` in this window.

## DQ. Classification
**F. SHARED_PROJECT_CAPACITY (probable) with G. OBSERVABILITY_GAP.** Gateway reads, Auth and app reads all degraded at the same time, and the pooler logged an authentication-lookup timeout. PostgreSQL showed no active statements, no waits and connections below the limit. Not A (no slow SQL), not B (40/60, 1/200 pool), not proven C (CPU not exposed, memory 76%), not E alone (REST also degraded). The exact managed-service layer remains unobservable.

## DR. Capacity-upgrade recommendation
**UPGRADE_NOT_YET_JUSTIFIED.** Multiple services stall at once, which fits shared-capacity pressure. But no exposed metric shows CPU, memory or connection saturation that extra compute would clearly relieve. If the owner wishes to test it, it is a shared TEST+live change needing separate authorisation in a low-traffic window.

## DS. TEST residue from 08F1
Run 3 teardown failed (Auth 504), so run-scoped TEST policies `AML_TECH_CERT_JUDGEMENT_80368237`, `TEST-AML08A-RESP-80368237` and `TEST-AML08A-SLA-80368237` remain **APPROVED** (not retired). The same applies to older 08E sets 45472712 and 45213303 (APPROVED/SUBMITTED). TEST assessment 01283 (journey A) approved. These are TEST-only and were not cleaned up in this diagnostic pass. They must be retired through the screens in the next authorised pass.
Remaining dashboard start-up request families (from DA, not re-measured): settings, regulators, currencies/monetary config, entity context (licensees, PPOC mappings, profile), entitlements/security context, notifications, delegation, module tiles. No changes.
Protected 00830/00836/00838 timestamps unchanged per run 1/2 "protected assessments untouched" checks.

## DT. Verdict
**AML-CLOSE-08 = CONDITIONAL PASS.** Spec 12 = 2/3 on current capacity. Code/schema/settings changed: **NO**. AML-CLOSE-09 not started.

---
# AML-CLOSE-08F2 — TEST Residue Cleanup & Infrastructure Escalation

2026-10-07 UTC. Scope: read-only inventory/verification, existing governed browser retirement/return, this report and support pack only. Source HEAD at entry `08e53178a`. No Spec 12/15/full-suite execution, publish, capacity change, application/schema/RLS/grant/Auth/pooler/timeout change or external communication.

## DU. Orphan TEST inventory
Complete pre-mutation inventory: **2 associated profiles and 9 components**. Run 45213303 had **no associated profile/binding/snapshot** matching its component IDs/codes; no profile was fabricated. A nearby retired profile 10.281560 belongs to different metadata and was left untouched.

Actor keys: maker/submitter/binder `b8eaf680-fe66-4d49-b816-1c087f511235`; independent checker and F2 cleanup actor `0b522724-adcb-48bf-b21d-175339479616` (normal TEST AML supervisor login). Components are version 1.0, regulator-authored but explicitly TEST ONLY, with NULL effective dates. Codes are shown exactly; neither origin label nor status alone was treated as lifecycle authority.

| Run | Object/code | ID | Before | Created UTC / last update before cleanup |
|---|---|---|---|---|
| 80368237 | AML_TECH_CERT_POLICY 10.368237 | 5e9aeb59-1f79-4fb9-9265-4229d36602f7 | ACTIVE | 13:40:27.397312 / 13:40:46.153240 |
| 80368237 | AML_TECH_CERT_JUDGEMENT_80368237 | d022ef14-4867-4d6d-b640-667a5590843b | APPROVED | 13:39:37.201087 / 13:40:14.125540 |
| 80368237 | TEST-AML08A-RESP-80368237 | 211cf2fc-18e7-4293-ae0a-58d8af89e770 | APPROVED | 13:39:56.471009 / 13:40:16.341793 |
| 80368237 | TEST-AML08A-SLA-80368237 | 39fc9d4b-5094-4c59-bd98-0647ff0ad470 | APPROVED | 13:40:03.303801 / 13:40:18.974591 |
| 45472712 | AML_TECH_CERT_POLICY 10.472712 | d56ae0f4-f85d-473d-af22-a6581d19f12a | REVIEW | 03:58:55.839434 / 03:59:04.738437 |
| 45472712 | AML_TECH_CERT_JUDGEMENT_45472712 | d260fb7f-549d-4340-81bb-0c24378287d9 | APPROVED | 03:58:01.133172 / 03:58:37.335747 |
| 45472712 | TEST-AML08A-RESP-45472712 | 25f607e2-bddc-448f-8765-7bedb2d3bfe6 | APPROVED | 03:58:15.295871 / 03:58:39.922508 |
| 45472712 | TEST-AML08A-SLA-45472712 | 739d04f4-fbb9-46ec-a93b-2c758aea6537 | APPROVED | 03:58:20.917405 / 03:58:44.145641 |
| 45213303 | AML_TECH_CERT_JUDGEMENT_45213303 | 00b9e262-baa1-452e-9173-a9b6baf004b2 | APPROVED | 03:53:45.969800 / 03:54:11.429312 |
| 45213303 | TEST-AML08A-RESP-45213303 | cdfd323d-39ab-4960-bc0f-eeba59fd934b | APPROVED | 03:53:55.892660 / 03:54:13.378144 |
| 45213303 | TEST-AML08A-SLA-45213303 | 9986a11a-d804-48c4-80be-6213f305e997 | SUBMITTED | 03:54:01.442223 / 03:54:03.913266 |

Both profiles were made/submitted by the maker; only 80368237 had checker approval. Its effective period before cleanup was 2026-10-07 to NULL; 45472712 dates NULL. All components were made/submitted by maker; all except SLA-45213303 approved by checker; that SLA had no approval actor.

Bindings: 80368237 J/R/S at 13:40:30.141094 / 13:40:31.635484 / 13:40:33.188264; 45472712 at 03:58:58.953159 / 03:59:00.999376 / 03:59:03.366277. Each binding recorded APPROVED, version 1.0 and maker binder. 45213303 has zero bindings. Snapshot census: only assessment 01283 references the affected profile/components. Before cleanup only ACTIVE 80368237 could govern new work in its sector; REVIEW 45472712 and unbound 45213303 could not.

## DV. Lifecycle capability results
Actual browser/server controls inspected before mutations for every existing profile/component. 80368237 profile and eight APPROVED components: **RETIRABLE**, Retire enabled. REVIEW profile and SUBMITTED SLA-45213303: Return-to-draft enabled, retirement not offered/enabled. After authorised return both were rechecked: **INACTIVE_NONRETIRABLE**, not RETURN_THEN_RETIRE, because retirement still unavailable. No approval/activation was performed to manufacture a retirement route. Screens/logs: `/tmp/browser/aml08f2/component-capabilities.log`, `cleanup.log`, before/after screenshots.

## DW. Policy profile cleanup
Profile first: 80368237 ACTIVE→RETIRED at **16:22:19.823016**; 45472712 REVIEW→DRAFT at **16:22:23.050655**. Server history confirms cleanup actor above. Exact retirement rationale: `TEST ONLY — AML-CLOSE-08 certification package retired after browser certification teardown was interrupted by shared service instability.` Return rationale additionally records that retirement is not offered and the object must not be reused.

Retirement command automatically closed the retired TEST profile's effective_to to 2026-10-07; no date editor/direct date change was used. Draft profile retirement remained disabled; no direct SQL, delete, history/binding rewrite or bypass.

## DX. Component cleanup
After profiles, eight APPROVED components were retired through enabled UI actions; one SUBMITTED SLA returned to DRAFT. All nine content digests match pre-cleanup.

| Run | J / response / SLA resulting status | J / response / SLA command times UTC |
|---|---|---|
| 80368237 | RETIRED / RETIRED / RETIRED | 16:22:26.175192 / 16:22:29.249582 / 16:22:31.826377 |
| 45472712 | RETIRED / RETIRED / RETIRED | 16:22:34.476182 / 16:22:37.070751 / 16:22:39.644512 |
| 45213303 | RETIRED / RETIRED / DRAFT | 16:22:42.697322 / 16:22:45.477426 / 16:22:48.246042 |

**9 objects retired (1 profile + 8 components); 2 non-retired drafts remain (1 profile + 1 SLA) because no safe retirement control exists.** Inactive-authority cleanup achieved; literal retirement of every object is not claimed.

## DY. Historical assessment pinning
01283 ID `56da8bb5-b596-48ee-b5a4-bb7e3202798f`, approved, update **13:41:48.490097**, row fingerprint **57a045c3b4cec8d54fcd0ec82bdcc656** unchanged. Snapshot fingerprint **120f8ee02207de73ac396d8ae59c850f**, legacy snapshot hash **a326656cdc3b15ef4282aee2502112a4** unchanged. Original profile 10.368237 and J/R/S component IDs/version 1.0 retained.

Authenticated read-only `supervisory_assessment_policy_basis_integrity`: **CONTENT_UNCHANGED**, algorithm cfp1, all nine pinned families content_unchanged=true. Retired J/R/S fingerprints respectively **cfp1:1503eaaef9d6fd8cfaf76ba24231ec2e**, **cfp1:b7d4c42d6f96edb0d70dfcc8fe068bfb**, **cfp1:eca5cd97e1a33d7cc9118fcc3e9e4a6c**. Original legacy component hashes remain **59906277c7297847bea2f0e6ba6d961a**, **e60a2e28c896b6fe1dd935af8e9ebfee**, **d85a887186c720ae5e051b25d570210c** in snapshot; current status-sensitive hashes differ as expected, not content mutation. No assessment recalculation/approval/publication/provenance change.

## DZ. New-work policy-resolution proof
Read-only authenticated `supervisory_policy_profile_resolve` for AML_CFT / FSRA / affected VIRTUAL_ASSET_BUSINESS sector / 2026-10-07: **RESOLVED**, exactly one candidate, **FSRA-AML-CFT-POLICY 1.0**, ID `5dcc6999-7740-476a-b549-98537ad585c2`. Returned response/SLA are the real FSRA IDs in EA, ACTIVE 1.0. Orphan active profiles = **0**; orphan ACTIVE components = **0**; active bindings for each of the nine orphan components = **0**. **0 orphan packages can govern new work now.** Retired/inactive records can still be historical evidence; authorised future versioning is not confused with current authority. Read-only creation eligibility confirms PERIMETER_ESTABLISHED, allowed=true; it is a perimeter verdict, not the policy-resolution proof. No new assessment created. Resolver prose contains stale family descriptions; authority conclusion uses structured resolved IDs/statuses, not that prose.

## EA. FSRA authority
Before/after row fingerprints, versions and update times identical, all ACTIVE 1.0, updated 2026-09-12 14:07:47.217799 UTC:
- Profile `5dcc6999-7740-476a-b549-98537ad585c2`: **9489529168cbbcba9640fb323043d96c**.
- FSRA-AML-RESPONSE `82537e2b-3c62-4eed-821f-67332d5809ba`: **69822c0426aa944a54d4719b106c5edc**.
- FSRA-AML-SLA `0f08c975-cb4a-4fb1-bef3-707e9752f992`: **688efd7f1815d56b37c2c76c385d4b3d**.
No real policy change; structured resolver positively confirms new-work authority.

## EB. TEST residue census
| Run | Profile | Judgement | Response | SLA | Assessment evidence | Governs new work? |
|---|---|---|---|---|---|---|
| 80368237 | RETIRED 10.368237 | RETIRED | RETIRED | RETIRED | 01283 retained | No |
| 45472712 | DRAFT 10.472712 | RETIRED | RETIRED | RETIRED | No affected snapshot found | No |
| 45213303 | No associated profile/binding found | RETIRED | RETIRED | DRAFT | No affected snapshot found | No |

Scope is these three run IDs; not a claim that every historical TEST object platform-wide is retired. Two drafts retained with governed return history; no further approval path attempted.

## EC. Protected-state proof
Before/after exact row digests and timestamps match:
| Assessment | Last update UTC | Row fingerprint | Facts |
|---|---|---|---:|
| 00830 | 2026-09-12 14:11:29.821340 | 1d69a6ed9bf755f77cf2310b4a6203b6 | 0 |
| 00836 | 2026-09-28 11:37:09.016119 | 4d1732290423df77e883e94f8b58a466 | 0 |
| 00838 | 2026-10-03 17:35:00.173152 | 8513abd140887090aaea1e12f7599f6a | **3** |
00838 original fact rows/provenance digest **0120ffc47bb15da3f547675b0217f1e7**, unchanged. Correct table `supervisory_assessment_dimension`, STR_SAR_GOVERNANCE **22** rows, ID digest **8305ec6bbf50ef8573c6634bd6de6328**, full row digest **c311070dab1b86d32cd3b12d0844bb9f**, unchanged.

## ED. Infrastructure support pack
Created `docs/aml/AML-CLOSE-08-infrastructure-stall-support-pack.md`, A–I: shared environment, accepted F1 baseline/timeline, DB/pooler/job observations, unavailable internal metrics, documentary safe reproduction and six support questions. No fresh load or external support dispatch. Earlier approximate startup/query-layer explanations are not promoted to causal proof.

## EE. Capacity recommendation
**UPGRADE_NOT_YET_JUSTIFIED.** SHARED_PROJECT_CAPACITY (probable) with OBSERVABILITY_GAP retained. PostgreSQL root cause not proven; observed connections below limits, CPU/internal queues unavailable. No shared-server capacity change. Any future experiment needs separate shared-live authorisation.

## EF. Verdict
**AML-CLOSE-08 = CONDITIONAL PASS.** New-work TEST authority = **0**. Historical pinning, real FSRA authority and protected state positively verified. Two inactive nonretirable drafts remain, not silently described as retired. Functional AML-CLOSE-08 controls have prior proof, but deterministic end-to-end certification remains blocked by the reproducible shared managed-service request-layer stall whose exact internal layer is not observable from this project. No new certification suites, scan, publication, external email/SMS/webhook, settings/account/security/schema/application changes. Only authorised lifecycle commands and documentation occurred. **AML-CLOSE-09 not started. STOP.**

## EG. Conditional resumption prerequisite — 2026-10-07 16:37–16:40 UTC

Owner uploaded a certification-only resumption instruction conditional on the managed-platform/request-path blocker having been materially addressed, changed or made observable. The repeated upload contains the same condition and supplies no remediation reference, actor or timestamp. This entry records preliminary read-only evidence, not a new certification attempt or proof of remediation.

| Required record | Direct evidence / limitation |
|---|---|
| Platform/infrastructure condition changed | **NOT ESTABLISHED.** No support finding, remediation record or newly available causal telemetry was supplied or found in the reviewed project history/documents. |
| Who/what resolved or changed it | **UNKNOWN.** No responsible party or support reference evidenced. |
| Change timestamp | **UNKNOWN.** Observation timestamp is not a remediation timestamp. Database read observation: 2026-10-07 16:38:08.765706 UTC. |
| Shared TEST/live infrastructure change | Shared managed backend remains in use. Current server size **Mini**; database start time **2026-08-31 10:29:55.528116 UTC**. These observations do not exclude unrecorded gateway/Auth/PostgREST/pooler changes or prove a complete infrastructure change history. No infrastructure change performed in this check. |
| Application/schema/security change | Git review from F1 `32b0693b9` through the preliminary documentation revision found only AML documentation/roadmap changes, not application source or migrations. This is source evidence only; absence of out-of-band hosted security/settings changes is **not independently established**. No application/schema/security change performed. |
| Current Git HEAD | At the start of this check, before roadmap documentation: **4f919f105f1838349f5d323f5fb56a28eccd9acf**, clean working tree. Subsequent report/roadmap edits are documentation-only and can advance the managed revision. |
| Current deployment/backend state | Publish settings report **published/public**. Public site GET returned **200**; existing asset `/assets/index-BpxcnL6P.js` returned **200**, SHA-256 **4fec1e1277cf43c6a070014112f146cda45956cbe37dd5f4974579ea0f701e23**. Asset contains the configured shared managed-backend host. Exact deployment-to-source commit mapping is **unverified**. Backend reachable; Auth 112 ms, database 111 ms, Auth→database 312 ms in one managed status check. |

Managed health snapshot: database and pooler up, memory **64%**, connections **15/60**, pool clients **1/200**, data disk **17%**, no recent exhaustion alerts returned, restarts since boot **0**. These are isolated health observations. F1 also had healthy idle responses before the third-run stall; current idle health does **not** establish deterministic request-path recovery or eliminate the observability gap.

The owner was asked for the support/change reference, responsible party, timestamp and environment impact; that question was skipped. No safe default can invent these facts. **Prerequisite blocked: evidence of the qualifying platform change/finding is missing.** Spec 12, Spec 15, full AML suite, regression, security scan, load probes, backend verifiers, new residue/protected-state certification, publication and live persona smoke were **not run**. Frozen F2 integrity evidence is retained as historical evidence, not freshly reverified. No external communication or notification-producing sweep occurred.

**AML-CLOSE-08 = CONDITIONAL PASS. UPGRADE_NOT_YET_JUSTIFIED.** No automatic compute upgrade is recommended or authorised. Certification remains paused until the qualifying change/finding is evidenced. Completed functional development stays closed; AML-CLOSE-09 not started.

## EH. Platform remediation evidence intake instruction — 2026-10-07 16:44 UTC

Supplied document: `AML-CLOSE-08_-_PLATFORM_REMEDIATION_EVIDENCE_pasted.md`, titled **AML-CLOSE-08 — PLATFORM REMEDIATION EVIDENCE INTAKE**. It specifies evidence requirements and stop boundaries, but supplies no concrete support finding, change record or remediation evidence. The conditional evidence-intake step therefore cannot proceed to substantive validation. This entry records that absence and the owner instruction only; no new platform query, test, scan, probe or operational action was performed.

### Supplied evidence matrix

| Required fact | Supplied evidence |
|---|---|
| 1. Support/change reference | **UNKNOWN** |
| 2. Platform/provider responsible | **UNKNOWN** |
| 3. Exact change or diagnosis | **UNKNOWN** |
| 4. Change/remediation timestamp | **UNKNOWN** |
| 5. Whether TEST/live shared infrastructure changed | **UNKNOWN** |
| 6. Whether database compute changed | **UNKNOWN** |
| 7. Whether gateway/Auth/PostgREST/pooler configuration changed | **UNKNOWN** |
| 8. Whether application/schema/security configuration changed | **UNKNOWN** |
| 9. Whether the change was provider-side and outside Git | **UNKNOWN** |
| 10. Expected impact on the previously observed request stalls and Auth 504 | **UNKNOWN** |

The upload timestamp is not a remediation timestamp. The known backend provider and previously observed Mini compute do not identify who performed a remediation or whether a change occurred. EG's healthy idle observations and documentation-only Git changes are not remediation evidence.

### Comparison against recorded F1 symptoms

| Historical symptom (not rerun) | Connection to supplied change/diagnosis |
|---|---|
| Cheap REST maximum approximately 19.2 s (recorded 19.19 s) | **UNKNOWN** — no change/diagnosis supplied |
| Auth HTTP 504 after 45.4 s | **UNKNOWN** — no change/diagnosis supplied |
| Profile read approximately 9.7 s | **UNKNOWN** — no change/diagnosis supplied |
| Roles read approximately 7.0 s | **UNKNOWN** — no change/diagnosis supplied |
| Security-context calls unfinished beyond 20 s | **UNKNOWN** — no change/diagnosis supplied |
| Database connections peak 40/60 | **UNKNOWN** — no relevant capacity/change evidence supplied |
| Pool clients 1/200 observation | **UNKNOWN** — no relevant pooler/change evidence supplied |
| No observed long-running SQL | **UNKNOWN** — no causal diagnosis supplied; sampled absence is not proof of no SQL execution |
| No observed database waits in the failure window | **UNKNOWN** — no causal diagnosis supplied |
| Pooler `EAUTHQUERY auth_query secret check timed out` | **UNKNOWN** — no provider finding or remediation supplied; the recorded event occurred during run 2, not the final run-3 failure |

### PREREQUISITE NOT SATISFIED

Evidence remains insufficient: this upload is an evidence-intake instruction, not evidence that the managed request-path blocker was remediated, materially changed, diagnosed by support or made materially more observable. No facts inferred. **AML-CLOSE-08 = CONDITIONAL PASS — CERTIFICATION FROZEN. UPGRADE_NOT_YET_JUSTIFIED.**

Spec 12, Spec 15, full AML suite, regression, security scans, load probes, publication and resizing were not performed. No application/schema/security/settings/account/data changes, external communications or notification sweeps occurred. Frozen F2 evidence and the two inactive TEST drafts remain undisturbed, not freshly recertified. Concrete platform evidence is required before intake validation; a separate owner certification-resumption decision is required even if a future intake finds the prerequisite satisfied. **STOP. AML-CLOSE-09 not started.**

## EI. Validate new platform evidence only — owner upload 2026-10-07 16:47 UTC

Reviewed the complete supplied file `AML-CLOSE-08_-_VALIDATE_NEW_PLATFORM_EVIDENCE_pasted.md`. It states that new platform/support evidence has been supplied, but contains only validation instructions, the historical failure symptoms and stop conditions. It supplies no support response, change record, diagnosis, remediation timestamp or new telemetry. No separate supporting record accompanies this turn. The assertion that evidence exists is not direct evidence of a qualifying change; the upload time is not a remediation time. This is document-only validation, not a new platform investigation or certification attempt.

### Required evidence record

| Required item | Supported value |
|---|---|
| 1. Support/change reference | **UNKNOWN** |
| 2. Responsible provider/team | **UNKNOWN** |
| 3. Exact diagnosis or remediation | **UNKNOWN** |
| 4. Remediation/change timestamp | **UNKNOWN** |
| 5. TEST/live shared-infrastructure impact | **UNKNOWN** |
| 6. Database-compute impact | **UNKNOWN** |
| 7. Gateway/Auth/PostgREST/pooler impact | **UNKNOWN** |
| 8. Application/schema/security impact | **UNKNOWN** |
| 9. Whether the change occurred outside Git | **UNKNOWN** |
| 10. Expected impact on historical request stalls/Auth 504 | **UNKNOWN** |

### Comparison with recorded F1 failure (historical, not rerun)

| Recorded observation | Supplied evidence addressing it |
|---|---|
| Cheap REST 19.19 s | **UNKNOWN** |
| Auth HTTP 504 after 45.4 s | **UNKNOWN** |
| Profile 9.72 s | **UNKNOWN** |
| Roles 6.98 s | **UNKNOWN** |
| Security/context requests unfinished at 20 s | **UNKNOWN** |
| DB peak 40/60 connections | **UNKNOWN** |
| Pool clients 1/200 | **UNKNOWN** |
| No observed long-running SQL | **UNKNOWN** |
| No observed DB waits | **UNKNOWN** |
| Pooler `EAUTHQUERY auth_query secret check timed out` | **UNKNOWN** |

F1's sampled absence of long SQL/waits does not prove no SQL execution, and the pooler event was recorded during run 2 rather than the final run-3 failure. No supplied finding identifies the causal layer, establishes remediation or materially improves observability. EG's prior healthy idle snapshot remains insufficient and has not been repeated.

### PREREQUISITE NOT SATISFIED

**AML-CLOSE-08 remains CONDITIONAL PASS — CERTIFICATION FROZEN.** No tests (including Spec 12/15), scans, load probes, platform/backend queries, publication, resizing, application/schema/security/data changes or external communications were performed for this validation. The two inactive TEST drafts were not touched; protected-state evidence remains historical, not freshly verified. Documentation only was updated. Concrete qualifying evidence is still required, followed by a separate owner instruction before any certification resumption. **STOP. AML-CLOSE-09 not started.**

## EJ. Concrete platform evidence intake — owner upload 2026-10-07 16:52 UTC

Reviewed the entire `AML-CLOSE-08_-_CONCRETE_PLATFORM_EVIDENCE_INTAKE_pasted.md`. This turn supplies one instructional document, not a provider support response, incident/change ticket, remediation notice, managed-service change record, telemetry, confirmed configuration/resource change or substantive provider diagnosis. Its statement that concrete evidence has been supplied is unsupported by its contents. The document itself explicitly says an instruction asserting that evidence exists is not evidence. No remediation or causal finding is inferred from the upload timestamp or prior idle health.

### Exact evidence record

| Requested item | Supplied value |
|---|---|
| 1. Support/change reference | **UNKNOWN** |
| 2. Provider/team | **UNKNOWN** |
| 3. Exact diagnosis | **UNKNOWN** |
| 4. Exact remediation/change | **UNKNOWN** |
| 5. Timestamp | **UNKNOWN** |
| 6. TEST/live shared-infrastructure impact | **UNKNOWN** |
| 7. Database-compute impact | **UNKNOWN** |
| 8. Gateway/Auth/PostgREST/pooler impact | **UNKNOWN** |
| 9. Application/schema/security impact | **UNKNOWN** |
| 10. Expected impact on recorded request stalls | **UNKNOWN** |

### Historical blocker comparison

| Recorded F1 symptom (not rerun) | Classification of supplied platform evidence |
|---|---|
| Cheap REST 19.19 s | **UNKNOWN** |
| Auth 504 after 45.4 s | **UNKNOWN** |
| Profile 9.72 s | **UNKNOWN** |
| Roles 6.98 s | **UNKNOWN** |
| Security/context calls unfinished after 20 s | **UNKNOWN** |
| DB peak 40/60 | **UNKNOWN** |
| Pool clients 1/200 | **UNKNOWN** |
| No observed long-running SQL | **UNKNOWN** |
| No observed DB waits | **UNKNOWN** |
| Pooler `EAUTHQUERY auth_query secret check timed out` | **UNKNOWN** |

No substantive platform evidence is available to classify as directly explaining, plausibly addressing or not addressing any symptom. Historical observations are not new telemetry. Sampled absence of long SQL/waits is not proof of no SQL execution; the pooler timeout was recorded during run 2, not the final run-3 failure.

### PREREQUISITE NOT SATISFIED

The evidence remains instructional and does not establish a material diagnosis, remediation, platform change or materially improved observability sufficient to justify another certification attempt. **AML-CLOSE-08 = CONDITIONAL PASS — CERTIFICATION FROZEN.** Qualifying substantive evidence remains the blocker; even a future satisfied prerequisite requires separate owner certification authorisation.

Document review and documentation updates only. No Spec 12, Spec 15, full AML suite, regression, security scan, backend/platform query, load probe, publish, live smoke, infrastructure resize, AML functionality/schema/security/data change or external communication occurred. Two inactive TEST drafts remain untouched; no fresh protected-state certification is claimed. **STOP. AML-CLOSE-09 not started.**

---

## AML-CLOSE-08F3 — Controlled Request-Path Diagnostic

Owner-authorised bounded diagnostic (brief `AML-CLOSE-08F3 — CONTROLLED REQUEST-PATH DIAGNOSTIC & PLATFORM ESCALATION`). Not a recertification. No code, schema, RLS, Auth, pooler, timeout or capacity change; no publish; no Spec 15; no full suite; no AML-CLOSE-09.

### 1. Baseline (2026-10-07 17:10 UTC)
| Item | Value |
|---|---|
| Git HEAD | `fb86ccf336f22dc36077fd5b22cd05a9bafeae9f` |
| Deployed frontend version | UNKNOWN (not discoverable from sandbox) |
| Managed backend | Lovable Cloud project (shared TEST/live instance) |
| Compute size | Mini (per F1/F2 record; not re-read) |
| DB start time | 2026-08-31 10:29:55 UTC (no restart since) |
| DB connections | 23 / 60 (1 active, 14 idle) |
| Pool clients | NOT EXPOSED in this run |
| Memory | NOT EXPOSED in this run |
| Platform warnings | none; status check: auth 106 ms, database 107 ms, auth→database 330 ms |

### 2. Requests executed (one officer session, sequential steps, `aml_supervision_officer` TEST persona)
1. Anonymous cheap REST control `GET /rest/v1/regulators?select=id&limit=1` → 200, 182–196 ms.
2. Real login UI → `POST /auth/v1/token`.
3. Profile, `user_roles`, `user_dynamic_roles`, `roles` reads.
4. `rpc/sec_get_user_context`.
5. Navigate `/supervision/aml/assessments` → `aml_portfolio`, `aml_assessment_page`; "New AML/CFT assessment" control rendered (page ready in 3.14 s incl. network idle).
6. Dashboard read models already in the journey (`supervisory_work_queue`, `supervisory_dashboard_operational_summary`, `sup_dashboard_summary`).

### 3–4. Request timing and correlation (selected; full 71-request capture in sandbox `/tmp/browser/f3/recs.json`, tokens not stored)
| UTC start | ms | HTTP | Method | Endpoint | sb-request-id | cf-ray |
|---|---|---|---|---|---|---|
| 17:11:28.496 | 195 | 200 | GET | /rest/v1/regulators | 01a11759-4447-7c44-8f1c-1afcc6425b23 | a46e86739b0e65f9-AMS |
| 17:11:28.844 | 401 | 200 | POST | /auth/v1/token | 01a11759-456b-72ef-803c-7cedfa6cd82b | a46e86756b3e0ae3-AMS |
| 17:11:29.389 | 89 | 200 | GET | /rest/v1/profiles | 01a11759-4792-7e26-bc23-005ea49329df | a46e8678df180ae3-AMS |
| 17:11:29.396 | 155 | 200 | GET | /rest/v1/user_roles | 01a11759-479e-75a4-8b76-ec7d65d7c0ac | a46e8678ef330ae3-AMS |
| 17:11:29.748 | 93 | 200 | GET | /rest/v1/roles | 01a11759-48fb-7292-b4f8-2452ef79e6e5 | a46e867b198d0ae3-AMS |
| 17:11:29.938 | 392 | 200 | POST | rpc/sec_get_user_context | 01a11759-49c5-7fbb-a17a-88845d26ad92 | a46e867c5ac60ae3-AMS |
| 17:11:31.050 | 1210 | 200 | POST | rpc/supervisory_work_queue | 01a11759-4e19-7e36-b0c8-019e028ce370 | a46e86834b9f0ae3-AMS |
| 17:11:31.050 | 1447 | 200 | POST | rpc/supervisory_dashboard_operational_summary | 01a11759-4e15-7f2b-af8d-62d7aca6ec3f | a46e86833b980ae3-AMS |
| 17:11:31.052 | 1089 | 200 | POST | rpc/sup_dashboard_summary | 01a11759-4e1b-77fa-962c-9e3b08d3a504 | a46e86834ba40ae3-AMS |
| 17:11:34.825 | 781 | 200 | POST | rpc/aml_portfolio | 01a11759-5ced-7da5-a6d7-2f164ea83108 | a46e869aea770ae3-AMS |
| 17:11:34.835 | 284 | 200 | POST | rpc/aml_assessment_page | 01a11759-5cf8-7f97-9a33-6c520340af45 | a46e869b0a8d0ae3-AMS |

No `x-request-id`/trace ID header returned; `sb-request-id` and `cf-ray` are the available correlation IDs. PostgreSQL backend PID, per-request SQL duration and pre-/in-/post-SQL split: NOT EXPOSED. Expected non-stall statuses: pre-login anonymous `currencies`/`monetary_config_resolve` 401; officer `supervisory_assessment_orphan_cases` 403 (lacks approval authority). No retries observed. No 5xx.

### 5. DB observations
Diagnostic: 23 connections, 0 lock waits. Spec 12 window (17:11:53–17:21:24 UTC, 180 samples @3 s): connections 32–35/60 peak 35; active client statements other than the monitor 0 at every sample; lock waits 0; longest active client statement 0 s; no wait events. `pg_stat_statements` deltas not captured.

### 6. Managed-service observations
Gateway, Auth, PostgREST and pooler latency, CPU, I/O, network, concurrency, queue depth, throttling: NOT EXPOSED. Pooler log search (last 20 min) for `EAUTHQUERY`/timeout/FATAL: 0 rows. Edge and Auth log queries returned 0 rows for the window — treated as NOT EXPOSED, not as zero.

### 7. First stop-condition event
None. Max cheap REST 196 ms; Auth 401 ms; profile/security max 392 ms; no 5xx; no `EAUTHQUERY`; navigation never blocked.

### 8. Request-path timeline
Browser → Gateway (CONFIRMED HEALTHY in this run) → Auth (CONFIRMED HEALTHY, 401 ms) → PostgREST (CONFIRMED HEALTHY, end-to-end ≤1.45 s) → Pooler (NOT OBSERVABLE beyond absent errors) → PostgreSQL (CONFIRMED HEALTHY: no waits/long SQL) → client (CONFIRMED HEALTHY). Healthy applies only to this window; the F1 failure window remains NOT OBSERVABLE at gateway/Auth/PostgREST/pooler layers.

### 9. Root-cause classification
**L. UNKNOWN_DUE_TO_OBSERVABILITY_GAP** (secondary candidates, unproven: I. SHARED_MANAGED_PROJECT_CAPACITY, F. POOLER given the historical `EAUTHQUERY`).

### 10. Stall reproduced
No. Controlled requests healthy, so per §I one controlled Spec 12 run was executed: **9 passed (6.9 min)**, one worker, no parallel tests, setup and teardown passed; protected 00830/00836/00838 timestamps unchanged; TEST policy retired by teardown. **STALL NOT REPRODUCED IN THIS RUN — REMEDIATION NOT PROVEN.** Spec 15 and certification not run.

### 11. Application defect proven
No. No duplicate-request storm, refresh loop or uncontrolled retry observed (dashboard reads issued once per navigation).

### 12. Additional platform telemetry required
Yes — pre-SQL queue time, pooler auth-query latency and gateway/Auth/PostgREST timings for the F1 window are needed to explain the earlier stall.

### 13. Support escalation document
Not created: §J applies only when the stall reproduces. Existing `docs/aml/AML-CLOSE-08-infrastructure-stall-support-pack.md` remains the owner's escalation pack for the F1 window.

### STALL NOT REPRODUCED — REMEDIATION NOT PROVEN

AML-CLOSE-08 remains **CONDITIONAL PASS**. Not PASS. Not published. Not resized. AML-CLOSE-09 not started. Stopped after F3.
