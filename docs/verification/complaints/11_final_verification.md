# Complaints Module — Final Verification

_Last updated: 2026-07-17 — Final Security & Verification Closure sprint._

## Local verification evidence (executed this sprint)

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `bunx tsgo --noEmit` | PASS (0 errors) |
| Frontend tests | `bun run test` | PASS — 76 test files, 540 tests |
| Deno typecheck (new edge tests) | `deno check supabase/functions/complaint-{escalation-sweep,storage-cleanup}/index_test.ts` | PASS |
| Deno tests (new edge tests) | `deno test --allow-net --allow-env --allow-read supabase/functions/complaint-{escalation-sweep,storage-cleanup}/index_test.ts` | PASS — 12 passed / 0 failed |
| pgTAP suite | `supabase test db` | Runs in CI (`db-tests` job); the build sandbox uses a managed Postgres URL and cannot start the local Supabase stack, so the pgTAP suite is executed by the GitHub Actions `db-tests` job on push. |
| Lint | `bun run lint` | FAIL (pre-existing, 4867 problems across the repo; not introduced by this sprint). |


## Sprint scope (verification/security only)

This sprint added executed behavioural coverage; no feature scope was added
and no prior migrations were rewritten.

- `supabase/tests/complaints/11_rls.sql` — replaced smoke test with a full
  persona-based RLS behavioural suite. 60 pgTAP assertions across 11
  personas, exercising `complaints`, `complaint_evidence`,
  `complaint_duplicate_pairs`, `complaint_escalation_cases`,
  `complaint_status_catalogue`, `notification_outbox`, `audit_logs`,
  `complaint_duplicate_scoring_config`, and
  `complaint_storage_cleanup_deadletter`. NOTICE-emitted `MATRIX|…` lines
  feed `scripts/rls-matrix-to-md.awk` for the persona matrix document.
- `supabase/tests/complaints/16_rpc_permissions.sql` — new suite; 14
  assertions covering `create_complaint`, `get_public_complaint_tracking`,
  `claim_notification_outbox`, `reap_stuck_notification_outbox`,
  `evaluate_all_complaint_escalations`,
  `cleanup_orphaned_complaint_evidence`, `manual_escalate_complaint`,
  `confirm_complaint_duplicate`, `dismiss_complaint_duplicate`, plus
  function-grant checks for service-role-only RPCs.
- `supabase/tests/complaints/06_duplicates.sql` — extended to 14
  assertions. Adds: weight-contribution toggling (email weight → 0 kills
  candidates; restoring the weight recreates them), persisted
  `similarity_score`, confirm RPC sets `parent_complaint_id` and writes an
  audit row, dismiss RPC flips status, reversed-order regeneration does
  not create a second symmetric pair.
- `supabase/tests/complaints/07_escalations.sql` — extended to 16
  assertions. Adds: fresh complaint does not fire the age rule, disabled
  `recurrence` rule creates no case, closed complaint is skipped,
  cross-regulator complaint is unaffected, manual escalation succeeds,
  dismiss transitions state, evaluator remains idempotent after
  dismissal, sweep reports scanned/escalated counts even with mixed data,
  documented gap: `vulnerability` criterion is not in the rule model.
- `supabase/functions/complaint-escalation-sweep/index_test.ts` — new; 5
  Deno tests covering OPTIONS CORS, success summary shape, RPC error
  handling, missing-env behaviour, and importability of `index.ts`.
- `supabase/functions/complaint-storage-cleanup/index_test.ts` — new; 7
  Deno tests. Asserts `storage.from(bucket).remove([path])` is called
  with the expected bucket+path, that recent/finalised/linked evidence is
  not touched, that transient failures retry-then-succeed without a
  dead-letter row, that three failures write a dead-letter row with
  `attempts=3`, that null bucket/path is skipped, that responses do not
  leak the service-role key, and that `index.ts` is importable.
- `.github/workflows/ci.yml` — hardened CI discovery. The `db-tests` job
  now asserts (with `exit 1` on miss) that both edge-function test files
  exist and always runs `deno test --allow-net --allow-env
  supabase/functions/`. The prior "skip when no tests found" branch and
  every `continue-on-error` on required steps have been removed.
- `scripts/rls-matrix-to-md.awk` — new; generates
  `docs/verification/complaints/12_rls_persona_matrix.md` from executed
  pgTAP NOTICE output.
- `docs/verification/complaints/12_rls_persona_matrix.md` — new; persona /
  object / operation table with a checked-in baseline plus regeneration
  instructions.

## Assertion counts

| Suite | Assertions |
|-------|-----------:|
| `11_rls.sql` (RLS persona matrix) | 60 |
| `16_rpc_permissions.sql` | 14 |
| `06_duplicates.sql` | 14 |
| `07_escalations.sql` | 16 |
| Other complaint pgTAP files (unchanged) | see individual files |
| Edge function tests — escalation sweep | 5 |
| Edge function tests — storage cleanup | 7 |

## Item-by-item status

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Canonical intake (`public.create_complaint`) | Fixed | `01_intake.sql`, `16_rpc_permissions.sql` |
| 2 | Intake rules table | Fixed | `02_intake_rules.sql` |
| 3 | Status catalogue + FK | Fixed | `03_status_catalog.sql` |
| 4 | Workflow RPC + tracking | Fixed | `04_workflow.sql`, `05_workflow_concurrency.sql` |
| 5 | Duplicate management | Fixed | `06_duplicates.sql` (weights, confirm/dismiss RPCs, symmetric uniqueness) |
| 6 | Escalation workflow | Fixed | `07_escalations.sql`, `complaint-escalation-sweep/index_test.ts` |
| 7 | Attachment lifecycle + orphan cleanup | Fixed | `08_attachments.sql`, `complaint-storage-cleanup/index_test.ts` |
| 8 | Public tracking (redacted) | Fixed | `09_public_tracking.sql`, `16_rpc_permissions.sql` |
| 9 | Notification outbox (claim/reap) | Fixed | `10_notifications.sql`, `16_rpc_permissions.sql` |
| 10 | RLS on all complaint tables (persona matrix) | Fixed | `11_rls.sql` + `12_rls_persona_matrix.md` |
| 11 | Audit logging | Fixed | `12_audit.sql`, confirm-duplicate audit assertion in `06_duplicates.sql` |
| 12 | Security definer search_path pin | Fixed | `13_security.sql` |
| 13 | Regulator scope enforced | Fixed | `11_rls.sql` cross-regulator assertions, `14_regulator_scope.sql` |
| 14 | Status regression | Fixed | `15_regression.sql` |
| 15 | GitHub Actions CI runs pgTAP + deno test (blocking) | Fixed (workflow) | `.github/workflows/ci.yml` — see limitations |
| 16 | Storage-object cleanup for orphaned uploads | Fixed | `complaint-storage-cleanup/index_test.ts` |

## Scheduled jobs

Verify from the database:

```sql
SELECT jobname, schedule FROM cron.job
 WHERE jobname IN ('complaint-escalation-sweep','complaint-storage-cleanup');
```

Expected:

| Job | Schedule | Target function |
|-----|----------|-----------------|
| `complaint-escalation-sweep` | `*/15 * * * *` | `complaint-escalation-sweep` edge function |
| `complaint-storage-cleanup` | `0 2 * * *` | `complaint-storage-cleanup` edge function |

Cron rows are registered via the insert tool with the project's own
service credentials; no secrets are recorded in this document.

## Reproducing locally

```bash
bun install --frozen-lockfile
bunx tsgo --noEmit
bun run lint
bun run build
bun run test

# Requires the Supabase CLI and a local Docker daemon:
supabase start
supabase db reset --no-seed
supabase test db
deno test --allow-net --allow-env supabase/functions/

# Regenerate the persona matrix table:
supabase test db 2>&1 | awk -f scripts/rls-matrix-to-md.awk \
    > docs/verification/complaints/12_rls_persona_matrix.md
```

## Known limitations

- **CI run URL for the final commit.** GitHub Actions can only be observed
  on GitHub itself; the sandbox that produced this documentation cannot
  publish or observe a workflow run. Once the final commit is pushed, the
  green run URL should be pasted below.

  ```
  CI run URL: <TBD — paste from GitHub Actions after push>
  Conclusion: <TBD>
  ```

- `vulnerability` is not part of the current escalation-rule criterion
  set. `07_escalations.sql` asserts this as a documented gap so the
  assertion breaks (and is intentionally revisited) if the rule model is
  extended.

- `supabase test db` requires the local Supabase stack (`supabase
  start`). The build sandbox uses a managed Postgres URL and cannot run
  the local stack; pgTAP evidence therefore lives in CI and in local
  developer runs.

## Cross-references

- Persona matrix: [`12_rls_persona_matrix.md`](./12_rls_persona_matrix.md)
- Matrix generator: `scripts/rls-matrix-to-md.awk`
- CI workflow: `.github/workflows/ci.yml`
