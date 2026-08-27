# F0-B7 — Security Delta Remediation

**VERDICT: F0-B7 READY TO RETRY F0-C**

Scope: only the three defects that stopped F0-C, plus the mandated
`current_user` pattern census. No RBAC, RLS, workflow, audit or authority model
was redesigned. F0-C was not re-run; F1 was not started.

Authoritative input:
`docs/certification/F0-platform-foundation-E2E-certification-freeze-2026-08-28.md`.

---

## A. Root cause

Inside a `SECURITY DEFINER` routine `current_user` is the **owner** (`postgres`),
so every guard of the form `current_user IN ('service_role','postgres',…)` is
unconditionally true. Authorization must be derived from the **request**, not
from the executing role.

Two request-identity helpers were introduced (invoker security, `STABLE`,
`search_path` pinned, `EXECUTE` revoked from `PUBLIC`, granted to
`authenticated` / `service_role`):

| Helper | Semantics |
| --- | --- |
| `public.request_role()` | Role asserted by the API request (`request.jwt.claim.role`, else `request.jwt.claims ->> 'role'`); `NULL` for direct database sessions. |
| `public.is_trusted_service_request()` | TRUE only when the request role is `service_role`, or — with no request context at all — the `session_user` is a privileged direct session (`postgres`, `supabase_admin`, `app_certification_runner`, `sandbox_exec%`). `session_user` and the JWT claim are **not** rewritten by `SECURITY DEFINER`. |

This mirrors the already-certified `workflow_resolve_actor` (GAP-F0-16) pattern.

## B. Defects fixed

| ID | Severity | Fix | State |
| --- | --- | --- | --- |
| DEF-F0-C-01 | CRITICAL | `public.file_upload_record_scan` guard is now `public.is_trusted_service_request() OR public.is_super_admin(auth.uid())`. Verdict recording is restricted to the trusted scanning worker (service role), privileged direct sessions, and super-admin break-glass. All other value checks (verdict domain, mandatory provider for `clean`, quarantine on adverse verdicts, scan-event + `audit_logs` writes) are unchanged. | CLOSED |
| DEF-F0-C-02 | HIGH | `public.prudential_ewi_evaluate` guard is now `public.is_trusted_service_request() OR public.can_read_prudential_entity(auth.uid(), _entity_id)` — canonical prudential scope preserved, only the vacuous branch replaced. Body untouched (guard rewritten in place from `pg_get_functiondef`, with a post-condition asserting no `current_user` remains). | CLOSED |
| DEF-F0-C-03 | MEDIUM | `EXECUTE` revoked from `PUBLIC`, `anon` and `authenticated` on every non-extension trigger function in `public` (the only holder was `file_uploads_scan_status_guard()`). Triggers fire under the table owner and are never a client entry point. | CLOSED |
| DEF-F0-C-04 (found in census) | MEDIUM | `public.entity_identity_snapshot_append_only()` — the append-only integrity trigger guarded on `current_user IN ('postgres','supabase_admin')` while itself being `SECURITY DEFINER`, so it always allowed. Switched to `SECURITY INVOKER` so `current_user` is the real invoking role: governed definer write paths still pass, direct client DML does not. | CLOSED |
| DEF-F0-C-05 (found in census) | LOW | Eight conduct authority helpers used `auth.uid() IS NULL AND current_user IN (…)`, which collapsed to “no JWT ⇒ trusted”. Replaced with `public.is_trusted_service_request()`. Not exploitable before the fix (`anon` held no `EXECUTE`), fixed as the same defect class. | CLOSED |

## C. `current_user` pattern census

19 `public` `SECURITY DEFINER` routines matched `current_user` (the F0-C report
counted 17; the two extra are name-only matches on
`can_current_user_access_licensee`). All were individually reviewed.

| Routine | Class |
| --- | --- |
| `file_upload_record_scan(uuid,text,text,text)` | **DEFECT_FIXED** (DEF-F0-C-01) |
| `prudential_ewi_evaluate(uuid,date)` | **DEFECT_FIXED** (DEF-F0-C-02) |
| `entity_identity_snapshot_append_only()` | **DEFECT_FIXED** (DEF-F0-C-04) |
| `can_approve_conduct_closure(uuid)` | **DEFECT_FIXED** (DEF-F0-C-05) |
| `can_approve_conduct_intelligence()` | **DEFECT_FIXED** (DEF-F0-C-05) |
| `can_approve_thematic_closure(uuid)` | **DEFECT_FIXED** (DEF-F0-C-05) |
| `can_manage_conduct_intelligence()` | **DEFECT_FIXED** (DEF-F0-C-05) |
| `can_manage_conduct_investigation(uuid)` | **DEFECT_FIXED** (DEF-F0-C-05) |
| `can_manage_thematic_review(uuid)` | **DEFECT_FIXED** (DEF-F0-C-05) |
| `can_view_conduct_intelligence()` | **DEFECT_FIXED** (DEF-F0-C-05) |
| `conduct_signal_disposition_guard()` | **DEFECT_FIXED** (DEF-F0-C-05) |
| `workflow_resolve_actor(uuid)` | **SAFE** — reads the JWT role claim first; the `current_user` fallback can never equal `service_role` in a definer chain. GAP-F0-16 contract unchanged. |
| `can_current_user_access_licensee(uuid,uuid)` | **NOT_AUTHORIZATION** — name-only match; body uses `auth.uid()`. |
| `can_user_access_licensee(uuid,uuid,uuid)` | **NOT_AUTHORIZATION** — match is in a code comment. |
| `can_view_complaint_rfi(uuid)` | **NOT_AUTHORIZATION** — calls `can_current_user_access_licensee`. |
| `is_complaint_rfi_entity_user(uuid)` | **NOT_AUTHORIZATION** — same. |
| `complaint_representation_submit(uuid,text,uuid[],text)` | **NOT_AUTHORIZATION** — same. |
| `conduct_intel_log_export(uuid,text)` | **NOT_AUTHORIZATION** — same. |
| `entity_license_entitlements(uuid)` | **NOT_AUTHORIZATION** — same. |

`MODULE_CARRY_FORWARD`: none. No routine in this pattern was deferred.

Post-fix census: the only remaining `SECURITY DEFINER` routine with a
`current_user` authorization predicate is `workflow_resolve_actor` (SAFE, and
explicitly allowlisted in the new gate).

## D. Negative / positive test evidence

Executed against the live database; probe writes were reverted (test file back to
`pending_scan`, probe scan events deleted).

| Test | Expected | Result |
| --- | --- | --- |
| `is_trusted_service_request()` with `role=service_role` claim | true | **true** |
| `is_trusted_service_request()` as applicant `07851875…` | false | **false** |
| Applicant forged `clean` verdict via `file_upload_record_scan` | DENIED | **DENIED `42501 not_authorized: scan verdicts are recorded by the scanning worker only`** |
| Forged verdict makes file downloadable | impossible | **N/A — verdict never recorded; file remains `pending_scan`, `file_upload_release_state` fail-closed unchanged** |
| Applicant `prudential_ewi_evaluate` (`can_read_prudential_entity` = false) | DENIED | **DENIED `not authorised to evaluate early warning indicators for this entity`** |
| Trusted service `file_upload_record_scan(...,'clean','commissioned-av')` | allowed | **ALLOWED** (`pending_scan → clean`, reverted afterwards) |
| Trusted service / authorized prudential caller `prudential_ewi_evaluate` | allowed | **ALLOWED** |
| Conduct authority helper as applicant | false | **false** |
| Ordinary signed-in write to `entity_identity_snapshots` | DENIED | **DENIED `42501` (RLS first gate; append-only trigger now also effective)** |
| `anon` EXECUTE on `file_uploads_scan_status_guard()` | denied | **false (revoked)** |
| Anon-executable project routines | 8 certified | **8, 0 defects** |

## E. Regression matrix

| Gate | Result |
| --- | --- |
| Frontend Vitest | **1266 / 1266 PASS** (138 files) |
| Build | OK |
| Typecheck (`tsgo`) | clean |
| `verify:hardening` | **31 PASS / 0 FAIL / 0 SKIP** |
| `verify:anon-execute` | **PASS** — 8 allowlisted, 0 defects, 1105 extension-owned residual |
| `verify:definer-guards` (new) | **PASS** |
| `verify-edge-authz` | PASS (user 47 / worker 27 / webhook 1 / machine 1 / public 7) |
| `verify-atomic-authz` | PASS |
| `verify-rbac-parity` | PASS (0 missing in DB / UI) |
| `verify-authz-centralized` | PASS (1382 files) |
| `verify-runtime-ownership` | PASS |
| `verify-no-alias-namespaces` | PASS |
| `verify-breadcrumb-coverage` | PASS (336 covered, 0 uncovered) |
| `verify-traceability` | PASS (every cited artefact exists) |
| Convergence B–G (pgTAP, `app_certification_runner`) | **59 ok / 0 not ok / 0 errors** (G = 23/23) |

New permanent regression gate: `scripts/verify-definer-guards.sql`
(`npm run verify:definer-guards`) fails when any project `SECURITY DEFINER`
routine authorizes on `current_user`, when the request-identity helpers are
missing, or when a trigger function becomes callable by `anon`/`authenticated`.

Supabase linter output after the migration is unchanged in class from the
accepted baseline (`0010` security-definer views, `0011` 8 legacy mutable
search_paths, `0014` `pgtap`/`pg_trgm` in `public`, `0028`/`0029` definer-RPC
executability) — see `docs/rbac/secdef-exposure-triage.md`; no new class.

## F. Remaining blocker

| ID | Severity | Status | Note |
| --- | --- | --- | --- |
| RES-F0-15-01 | HIGH | **OPEN — environment / operational** | No malware-scanning provider is commissioned: `FILE_SCAN_PROVIDER_URL` is unset and the secret inventory holds no file-inspection credential. Nothing was faked or mocked. `process-queue` remains fail-closed (`scan_error`, file not released). Secure upload/storage cannot be scored ≥ 4.8 until a real provider is provisioned by the product owner. |
| RES-F0-08-01 | LOW | ACCEPTED | 1105 anon-executable routines are extension-owned (`pgtap`, `pg_trgm`), `SECURITY INVOKER`, owned by `supabase_admin`, not alterable by the migration role. Unchanged. |

## G. Verdict

**F0-B7 READY TO RETRY F0-C** — DEF-F0-C-01, DEF-F0-C-02 and DEF-F0-C-03 are
closed, two further defects of the same class found by the census are closed, the
full census is classified with no carry-forward, and every regression gate is
green. F0-C should be retried with secure upload/storage still
environment-blocked on RES-F0-15-01. F1 not started.
