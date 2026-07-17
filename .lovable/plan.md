# Complaints Module — Final Security & Verification Closure

Scope: verification and security only. No new features. No migration rewrites.

## 1. Persona RLS Matrix (pgTAP)

Replace `supabase/tests/complaints/11_rls.sql` (smoke) with a behavioural suite. Split into files so each stays focused and CI failures are attributable:

- `11_rls_fixtures.sql` — seed regulators (2), licensees (2/regulator), personas in `auth.users` + `profiles` + `user_roles` + `licensee_users`, complaints (A, B, licensee-1, licensee-2, cross-reg), evidence, duplicate pairs, escalation cases, workflow_instances, approval_actions, notification_outbox rows, audit_logs, file_uploads. Export IDs via `set_config('test.*', ...)`.
- `11_rls_anon.sql` — anon SELECT/INSERT/UPDATE/DELETE denied on internal tables; `get_public_complaint_tracking` returns redacted row only.
- `11_rls_complainants.sql` — complainant A cannot see B's complaint/evidence/audit/outbox; can read own.
- `11_rls_licensee.sql` — primary vs secondary licensee user isolation; cross-licensee denial.
- `11_rls_staff.sql` — intake officer, investigator, supervisor, enforcement officer, regulator admin — allowed reads/writes per policy; cannot mutate audit_logs, cannot write status catalogue, cannot read scoring_config / deadletter (admin-only), cannot invoke service-only RPCs.
- `11_rls_cross_regulator.sql` — reg-B staff cannot see reg-A complaints, evidence, duplicate pairs, escalation cases, workflow_instances, notifications.
- `11_rls_service_role.sql` — boundary checks only where required (outbox claim, cleanup deadletter writes).

Personas set JWT via `set_local role authenticated; set_local "request.jwt.claims" = '{"sub":"...","role":"authenticated"}'`.

Assertions use `throws_ok` / `lives_ok` / `results_eq` / row-count comparisons — never just `relrowsecurity`.

Covered objects (per persona × op): `complaints, complaint_evidence, complaint_duplicate_pairs, complaint_duplicate_clusters, complaint_escalation_cases, complaint_status_catalogue, workflow_instances, approval_actions, notification_outbox, audit_logs, file_uploads, complaint_duplicate_scoring_config, complaint_storage_cleanup_deadletter`.

## 2. RPC Permission Tests

New `supabase/tests/complaints/16_rpc_permissions.sql`. For each of:

```
create_complaint, finalize_complaint_with_attachments,
execute_complaint_workflow_action, generate_complaint_duplicate_candidates,
confirm_complaint_duplicate, dismiss_complaint_duplicate,
manual_escalate_complaint, dismiss_complaint_escalation,
evaluate_complaint_escalations, evaluate_all_complaint_escalations,
cleanup_orphaned_complaint_evidence, get_public_complaint_tracking,
claim_notification_outbox, reap_stuck_notification_outbox
```

assert: authorised persona succeeds (`lives_ok`), unauthorised fails (`throws_ok` on permission or app-level exception), cross-regulator call fails, service-only functions raise for `authenticated`. Public tracking returns only whitelisted columns (assert column set).

## 3. Duplicate Behavioural Tests

Extend `supabase/tests/complaints/06_duplicates.sql`:

- Assert weight contributions by toggling scoring_config (set email weight to 0 → no pair; restore → pair). Same for licensee/subject/description weights.
- Assert `similarity_score` and score-component columns persisted on the pair.
- Assert threshold change flips candidate creation.
- Phone match (if column exists — else skip with `SKIP`).
- Confirm RPC: sets `parent_complaint_id`, writes `audit_logs` row (`action='confirm_duplicate'`), enqueues `notification_outbox` row.
- Dismiss RPC: sets `status='dismissed'`; re-running generator does not recreate.
- Cross-regulator confirm → `throws_ok`.
- Unauthorised persona confirm → `throws_ok`.
- Reversed complaint pair order → symmetric uniqueness holds (no second pair).

## 4. Escalation Behavioural Tests

Extend `supabase/tests/complaints/07_escalations.sql`. For each supported criterion (`age`, `sla`, `harm`, `risk_rating`, `volume`, and `vulnerability` if the rule model supports it — otherwise `SKIP` with reason):

- matching complaint → case created
- non-matching → no case
- disabled rule → no case
- duplicate active case prevented (`uq_escalation_active_kind`)
- dismiss transitions state; reopen only when allowed
- audit row written; notification_outbox row written
- closed/resolved complaint skipped
- wrong-regulator complaint unaffected
- manual escalation succeeds
- evaluator idempotent (second run: 0)
- `evaluate_all_complaint_escalations` with one deliberately invalid rule/complaint — assert valid complaints still processed (savepoint per iteration).

## 5. Edge Function: Escalation Sweep Tests

New `supabase/functions/complaint-escalation-sweep/index_test.ts` (Deno). Import via dotenv per project convention. Cases:

- successful RPC invocation (mocked `admin.rpc`) → returns `{ok:true, scanned, escalated, duration_ms}` HTTP 200.
- RPC error → response `{ok:false, error}` HTTP 200 (matches current pattern).
- Missing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` → surfaces failure.
- OPTIONS → CORS 200.
- Consumes response bodies to avoid leak warnings.

Document cron: job name, schedule (`*/15 * * * *`), target function, verify via `supabase--read_query` on `cron.job` (no secrets in doc).

## 6. Edge Function: Storage Cleanup Tests

New `supabase/functions/complaint-storage-cleanup/index_test.ts`. Mock Supabase client (`storage.from(bucket).remove`) and `rpc('cleanup_orphaned_complaint_evidence')`. Assert:

- Stale orphan → `remove([path])` called with expected bucket+path; DB row deleted.
- Recent staged / finalised / linked evidence → not returned by RPC, so no removal call.
- First two removals fail, third succeeds → no dead-letter row.
- Three failures → dead-letter insert with `attempts=3`, `last_error` populated.
- Successful retry → dead-letter not written.
- Idempotency: same object processed twice in one run → single `remove` call.
- Malformed bucket/path → handled without throwing, logged to dead-letter or skipped safely.
- Unauthorised HTTP caller → rejected (function requires service-role env; if it accepts anonymous calls, add auth check — verification-only, no scope creep).
- Assert response body does NOT contain service-role key or env values.

## 7. CI Discovery Hardening

Edit `.github/workflows/ci.yml` (verification change, not feature):

- Replace the `compgen -G` guard with an explicit `test -f` check on:
  ```
  supabase/functions/complaint-escalation-sweep/index_test.ts
  supabase/functions/complaint-storage-cleanup/index_test.ts
  ```
  Fail (`exit 1`) if either is missing.
- Always run `deno test --allow-net --allow-env supabase/functions/`; drop the "no tests found; skipping" branch.
- No `continue-on-error` on required steps.

## 8. Evidence Documents

- New `docs/verification/complaints/12_rls_persona_matrix.md` — generated table. Approach: add a final pgTAP block that emits `NOTICE` lines `PERSONA|OBJECT|OP|EXPECT|ACTUAL|ASSERTION` and pipe `supabase test db` output through a small awk script (committed under `scripts/`) to produce the markdown table. Include every persona × every listed object × op.
- Update `docs/verification/complaints/11_final_verification.md`:
  - baseline SHA (previous) + final SHA (final)
  - migration file list (unchanged, references only)
  - assertion counts: duplicates, escalation, RLS, edge fn, frontend
  - `pgtap` result summary, `supabase db reset` result
  - Frontend: `bun run test` summary
  - CI workflow run URL — left as `TBD post-push` per user direction; local reproduction commands listed verbatim
  - remaining limitations (only the observable-GitHub-run gate)
  - link to `12_rls_persona_matrix.md`
  - reclassify RLS from Fixed(baseline) → Fixed only after matrix passes.

## 9. Local Execution Gate

Before finalising docs, run in the sandbox:

```
bun install --frozen-lockfile
bunx tsgo --noEmit
bun run lint
bun run build
bun run test
# DB tests via psql against the managed DB is not possible; document that
# supabase test db must be run against a local `supabase start`. Where the
# sandbox cannot run `supabase start`, capture pgTAP by executing each test
# file through psql inside a transaction with ROLLBACK and record output.
deno test --allow-net --allow-env supabase/functions/
```

Capture stdout/stderr into `docs/verification/complaints/artifacts/` for reproducibility.

## Non-goals

- No new features, no migration rewrites, no RLS policy changes unless a persona test proves a real gap. If a gap is found, fix the policy in a targeted migration and re-run — but do not broaden scope.
- No secrets in docs.

## Deliverables checklist

- [ ] `11_rls_*.sql` split suite replacing smoke
- [ ] `16_rpc_permissions.sql`
- [ ] Expanded `06_duplicates.sql`, `07_escalations.sql`
- [ ] `complaint-escalation-sweep/index_test.ts`
- [ ] `complaint-storage-cleanup/index_test.ts`
- [ ] `.github/workflows/ci.yml` hardened discovery
- [ ] `12_rls_persona_matrix.md` (generated)
- [ ] `11_final_verification.md` updated with counts + local artefacts
- [ ] `scripts/rls-matrix-to-md.awk` (or similar) generator
- [ ] Artefact logs under `docs/verification/complaints/artifacts/`
