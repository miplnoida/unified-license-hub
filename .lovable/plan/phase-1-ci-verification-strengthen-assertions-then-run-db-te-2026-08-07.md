# Phase 1 CI Verification — Strengthen Assertions, Then Run db-tests

## Constraint I must state up front

I cannot push branches or start GitHub Actions runs from this environment: repository git state and CI execution are outside my control, and the sandbox has no Supabase CLI, Docker, or pgtap. So the db-tests run itself has to be triggered on your side. Per your answer, I will first extend the Phase 1 test assets to cover every acceptance item you listed, then you trigger CI once and I close out on the results.

No production grant, RLS policy, SECURITY DEFINER guard, or service-role restriction will be touched. No Phase 1 feature code changes unless a CI assertion proves a real defect.

## Step 1 — Extend the three Phase 1 pgTAP files

Current coverage is 63 assertions across the three files, but several of your acceptance items are not yet asserted. I will add exactly those, keeping every existing assertion intact and updating each `plan(n)`.

`01_sla_runtime.sql` (ADM-SLA-001) — add:
- `due_at` correctness: assert `due_at` equals `sla_add_duration(started_at, sla_hours, calendar_profile_id)` for the opened stage.
- `started_at` persisted and non-null on open.
- accumulated pause duration across two pause/resume cycles is monotonically increasing.
- `breached_at` persisted and non-null after `sla_stage_mark_breached`.
- event trail contains the ordered sequence `started, paused, resumed, breached, completed`.
- escalation dispatch: after `sla_stage_mark_escalated`, an escalation record/event exists.
- idempotency: a second escalation sweep on the same stage creates no additional dispatch row.
- completion: terminal state persisted and no further transitions accepted.

`02_decision_gates_artifacts.sql` (LIC-DEC-002) — add:
- letter v1 issuance via `issue_decision_artifact` with persisted rendered content plus required metadata.
- second issuance yields v2 while v1 row bytes remain unchanged.
- certificate artifact persists certificate-specific content and does not contain decision-letter body markers.
- missing required merge fields cause issuance to be rejected.
- `UPDATE` and `DELETE` against an issued artifact are refused (behavioural, not just ACL).

`03_audit_appendonly.sql` (AUD-SEC-001 / AUD-OVR-001) — add:
- a real Phase 1 denial (unauthorised `issue_decision_artifact` attempt) produces a security event with correct actor and source.
- `UPDATE` and `DELETE` on `security_event_logs` refused behaviourally.
- actor spoofing prevented (caller cannot claim a different actor id).
- override registry: authorised override retains original value and replacement; blank/whitespace justification rejected; mandatory justification enforced; a second override appends a new row rather than overwriting; `UPDATE`/`DELETE` refused; actor spoofing prevented.

## Step 2 — Add the LIC-DEC-001 edge-function integration test

New file `supabase/functions/tests/phase1_decision_gate_test.ts`, run by the existing db-tests Deno step against the local stack:
- seed an application with an unresolved mandatory decision gate;
- call `perform-workflow-action` with a final `approve` as an authorised approver;
- assert refusal with a stable gate-failure code, that the workflow instance and application status did not advance, and that a denial security event was written;
- resolve the gate, repeat the same call, assert it succeeds exactly once (a repeat call does not double-advance).

A companion pgTAP assertion in `02_decision_gates_artifacts.sql` locks the DB-level contract that `perform_workflow_transition` refuses while a gate is unresolved.

## Step 3 — Wire the new assets into CI

In `.github/workflows/ci.yml`, extend the existing "Assert required edge-function tests exist" list with the new Phase 1 test file so the db-tests job fails fast if it is ever removed. The three Phase 1 SQL files are already asserted and are picked up by `supabase test db`.

## Step 4 — You trigger CI, I close out

Push current main to a branch (suggested `phase1/verification`) and run the CI workflow, then paste the run URL or the db-tests log here. I will then:
- report per-file results for the three Phase 1 SQL files and the edge test;
- name any exact failing assertion and classify it as test debt or a real Phase 1 defect;
- fix only real Phase 1 defects, update the regression assertion, and ask for a rerun;
- produce the required FRD-ID table with branch name, commit SHA, workflow name, and job reference, and output either `PHASE 1 VERIFIED — READY FOR PHASE 2` or `PHASE 1 NOT YET VERIFIED` with the remaining assertions.

Phase 2 will not be started.

## Technical notes

- All new pgTAP assertions run in the service-role context that `supabase test db` already provides; nothing is granted to `anon`/`authenticated` to make them executable.
- Escalation-dedupe assertion targets the sweep path already present in the SLA runtime; if no dedupe guard exists, that is a real Phase 1 defect and I will fix it narrowly in the sweep function only.
- Existing pgTAP files remain append-only in structure: no assertion is deleted or weakened, only added, with `plan(n)` adjusted.
