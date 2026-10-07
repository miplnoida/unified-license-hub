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
No email/SMS/webhook path in the SLA/escalation functions; none sent.

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
