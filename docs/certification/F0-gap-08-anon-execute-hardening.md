# GAP-F0-08 — Anonymous Function EXECUTE Hardening

Track A — F0 Platform Foundation, Pass B5.
Date: 2026-08-27. Status: **CLOSED (with one documented environment-constrained residual).**

## 1. Objective

Reduce the set of `public`-schema routines executable by the PostgREST `anon`
role to the smallest explicitly justified set, and make that closure durable.

## 2. Baseline (before)

| Metric | Count |
| --- | --- |
| Routines in `public` | 2,887 |
| Executable by `anon` | 1,306 |
| — project-owned | 201 |
| — `pgtap` (extension, in `public`) | 1,074 |
| — `pg_trgm` (extension, in `public`) | 31 |
| `SECURITY DEFINER` + anon-executable | 119 |

Default privileges (`pg_default_acl`) granted `EXECUTE` to `anon` on every new
function created in `public`, so the exposure regrew with each migration.

## 3. Requirement analysis

The only legitimate anonymous execution requirements were derived from the real
pre-authentication surface, not from what happened to be granted:

- **Public routes** (`src/routes/publicRoutes.tsx`) and every component they
  render were scanned for `.rpc(...)` calls.
- **Unauthenticated edge functions** — only three run with `verify_jwt = false`
  (`public-registry`, `developer-api`, `screening-sandbox`); none of them calls a
  database routine with the anon key, so none contributes a requirement.
- **RLS helper functions** — every policy that applies to `anon` (explicit
  `TO anon` plus `TO public`) was extracted. The policies anon can actually
  satisfy (reference data, OTP insert, registration configs, complaint intake
  config, non-sensitive site settings, registration storage/file uploads) have
  constant or column-only qualifiers and call **no** functions. The
  helper-calling policies (`has_permission`, `has_role`, `is_super_admin`,
  `is_internal_staff`, `has_scoped_permission`, `can_read_*`, …) protect
  internal tables that are never read on an unauthenticated journey.
  → `PUBLIC_RLS_HELPER_REQUIRED` is **empty**.
- **Default expressions / triggers** — trigger functions are not privilege-checked
  at fire time; the tables whose column defaults call generators are not
  anon-insertable.

### Certified allowlist (8 routines)

| Routine | Journey |
| --- | --- |
| `get_active_captcha` | Login/registration captcha configuration |
| `check_applicant_name_exists` | Registration duplicate-applicant guard |
| `check_primary_user_email_exists` | Registration duplicate primary-user guard |
| `get_declaration_invitation_public` | Token-scoped F&P declaration landing |
| `verify_declaration_identity` | Token-scoped declaration identity check |
| `get_fp_declaration_form_public` | Token-scoped declaration questionnaire |
| `submit_declaration_form` | Token-scoped declaration submission |
| `get_public_complaint_tracking_v2` | Account-free complaint tracking |

Everything else was classified `INTERNAL_ONLY` and revoked.

## 4. Remediation applied

1. `public.sec_anon_execute_allowlist` — governed registry (function name,
   classification, justification), RLS-enabled, read-only to signed-in users.
2. Revoked `EXECUTE` from `anon` on every non-allowlisted `public` routine, and
   dropped blanket `PUBLIC` grants where the owner permitted it (explicit grants
   to `authenticated` / `service_role` / `postgres` preserved first).
3. Re-granted `EXECUTE` to `anon` only for the eight allowlisted routines.
4. `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM anon` so future
   routines are closed by default; new public RPCs must be granted deliberately
   and registered.
5. `public.sec_anon_executable_functions` — certification view enumerating what
   remains anon-executable, flagging non-allowlisted rows as defects.

## 5. Result (after)

| Metric | Count |
| --- | --- |
| Project routines executable by `anon` | **8** (all allowlisted) |
| Project `SECURITY DEFINER` routines executable by `anon` | **8** (all allowlisted) |
| Previously exposed project routines revoked | 193 |
| Extension routines still anon-executable | 1,105 (residual, see §6) |

Live verification against the deployed API with the anon key:

- `rpc/get_active_captcha` → `200` (public journey intact)
- `rpc/get_public_complaint_tracking_v2` → `200 {"found": false}`
- `rpc/is_super_admin` → `42501 permission denied for function is_super_admin`
- Public reference reads (`countries`, `master_data_items`,
  `registration_form_configs`, `site_settings`) → `200` (unchanged)

## 6. Residual — RES-F0-08-01 (ENVIRONMENT_CONSTRAINED)

`pgtap` (1,074 routines) and `pg_trgm` (31 routines) are installed **in
`public`** and owned by `supabase_admin`. The migration role (`postgres`) is not
a member of `supabase_admin`, so `REVOKE`/`ALTER EXTENSION SET SCHEMA`/
`DROP EXTENSION` on them all fail with `insufficient_privilege`. The revoke loop
therefore skips them.

Risk assessment: these are `SECURITY INVOKER`, own no data, and read nothing the
caller cannot already read. With the project surface closed, anon holds no
`EXECUTE` on any routine a pgTAP helper could usefully invoke, and the anon role
retains no table privileges beyond the existing public policies. Classified
**LOW** and accepted for this pass; closing it requires a platform-level action
(relocating `pgtap` out of `public`, or removing it from the hosted database).

## 7. Regression gates

- `scripts/verify-anon-execute.sql` — fails CI when any project routine becomes
  anon-executable without a registry entry, or when a registry entry goes stale.
  Run: `npm run verify:anon-execute`.
- `src/test/anonExecuteAllowlist.test.ts` — static gate pinning the eight
  allowlisted routines and proving each declared caller really invokes it.
- `scripts/anon-execute-allowlist.json` — checked-in snapshot of the registry.

Full suite: **1,266 tests / 138 files passing.** Anonymous-execute gate: PASS
(8 allowlisted, 0 defects).
