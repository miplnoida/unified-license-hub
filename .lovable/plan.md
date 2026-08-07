# Phase 1 Verification — Execution Plan

## Constraint that shapes this plan

The `db-tests` CI lane needs the Supabase CLI plus Docker (`supabase start`, `supabase db reset`, `supabase test db`). Neither is available in this sandbox, and I cannot create branches or push commits (git state is managed by Lovable's GitHub sync, not by me). The managed database I can reach with `psql` runs a restricted role that cannot execute the service-role-only functions — which is exactly the security behaviour you asked to preserve, so it must not be relaxed.

So the behavioural pgTAP gates can only be proved by a real GitHub Actions run of the existing `db-tests` job. This plan therefore splits the work into: everything I can execute now, and the one lane you trigger.

## Part A — Lanes I run in this environment (no code changes)

1. Re-run the live ACL/security proof script to confirm the 16/16 result still holds (`psql` assertions on grants, function ACLs, redaction).
2. Frontend lane, exactly as CI defines it: `bunx tsgo --noEmit`, `bun run lint`, `bun run build`, `bun run test` (full vitest suite, not a subset).
3. RBAC-oracles and rule-engine lanes: the `scripts/verify-*.mjs` oracles plus their vitest groups.
4. Edge-function lane: `deno test --allow-net --allow-env --allow-read supabase/functions/`.
5. UI smoke via headless browser: decision cockpit renders, `DecisionGatesPanel` ready vs not-ready, `DecisionDocumentPreview` success and error paths, SLA Manager/monitor renders.
6. Static pre-flight of the Phase 1 pgTAP files (SQL parse/lint, fixture and helper references, required-file list matching `ci.yml`) so the CI run is not wasted on trivial breakage.

Any genuine defect a failing test exposes gets fixed narrowly in the responsible Phase 1 behaviour, with a regression test, then the affected group and full lane rerun. No new Phase 1 functionality otherwise.

## Part B — The `db-tests` lane (needs you to trigger it)

You push the current Phase 1 implementation to a branch via GitHub sync (or I can prepare the branch content and you sync it). The existing `db-tests` job then proves the remaining gates:

- ADM-SLA-001 — open, start/due timestamps, pause on RFI/waiting, no active-time accrual while paused, resume, retained pause total, breach + `breached_at`, escalation dispatch, no duplicate tier on repeat sweep, completion, reconstructable history.
- LIC-DEC-001 — final approve through the real workflow action path: blocked with a stable `DECISION_GATES_UNMET` failure and no advancement while a gate is open; succeeds exactly once after all gates resolve. No substitution of a direct `decision_gate_status()` call.
- LIC-DEC-002 — v1 issuance persisted with content/merge data/decision/rationale/conditions/actor/timestamp; v2 appended with v1 untouched; certificate stores certificate output (not letter HTML); missing mandatory values rejected with no row; UPDATE/DELETE denied on the client path.
- AUD-SEC-001 — denial event from the failed approval carries actor, type, severity, module, action, resource, reason, timestamp, correlation id; UPDATE/DELETE denied.
- AUD-OVR-001 — valid override persists original/replacement/justification/actor/object/timestamp; empty and whitespace-only justification rejected with no row; second override appended without overwriting the first; UPDATE/DELETE denied.

## Part C — Reading results and closing

Once the run exists I read the job outcome and logs through the GitHub connector (or you paste the run URL/log), map each assertion to the required report table, fix only genuinely failing Phase 1 behaviour, and rerun the affected group plus the full lane.

Final output is the required table (FRD ID / ACL-Security / Behavioural / Audit Evidence / Immutability / CI Result / Final State) with branch name, commit SHA, job names, exact failures, exact fixes, and rerun results. `PHASE 1 VERIFIED — READY FOR PHASE 2` only if every gate passes; otherwise `PHASE 1 NOT YET VERIFIED` with the failing assertions named. Phase 2 is not started either way.

## Security guardrails held throughout

No grants of service-role functions to `authenticated`/`anon`, no RLS disabling, no weakened function authorization, no removal of append-only triggers or policies, no frontend bypass of production authorization.
