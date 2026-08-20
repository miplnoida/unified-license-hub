# `SECURITY DEFINER` Exposure Triage (Package A1)

Census after A1 lockdown (`pg_proc` + `has_function_privilege`):

| Metric | Count |
|---|---|
| `SECURITY DEFINER` functions in `public` | 915 |
| Executable by `anon` | 123 |
| Executable by `authenticated` | 701 |
| **`anon`-executable functions performing DML** | **1** (`submit_declaration_form`) |

## Justified `anon` exposure

1. **RLS predicate helpers** — `can_*`, `enforce_permission`, `enforce_scoped_permission`,
   `entity_membership_capability`, `correspondence_thread_visible`, `*_visible`, `has_role`, etc.
   These are read-only, `STABLE`, and referenced inside RLS policies. Policy predicates are
   evaluated as the querying role, so revoking `anon` EXECUTE would break every public/unauthenticated
   read path that the policies deliberately allow. They return booleans only and leak no row data.
2. **Token-bound public flows** — `submit_declaration_form(p_token, …)` and the public
   registration/OTP/uniqueness probes (`check_applicant_name_exists`, `check_primary_user_email_exists`).
   Each validates a single-use token or returns only an existence boolean; they are the designed
   unauthenticated entry points.

## Revoked under A1

- Trigger functions and engineering/maintenance routines: EXECUTE revoked from `PUBLIC`, `anon`,
  and `authenticated` (previous migration).
- `classify_complaint(uuid, jsonb)` — internal complaint triage mutator: `anon` revoked.
- `copy_review_step_permissions(uuid, uuid)` — internal workflow configuration mutator: `anon` revoked.
- Mutable `search_path` corrected on 12 functions.

## Residual linter warnings — accepted with justification

Linter rules `0028` (anon can execute) and `0029` (signed-in users can execute) fire on the
predicate-helper and governed-RPC populations by design: **every** governed A1 RPC is
`SECURITY DEFINER` and *must* be executable by `authenticated`, because that is the only
write path left after table-level DML was revoked. Each such function performs
`enforce_permission`/`enforce_scoped_permission` on entry and writes exactly one `audit_logs`
row per transition — runtime-verified for licence conditions, entity relationships, risk ratings,
licensing determinations, inspection findings and Twin Peaks coordination.

Unjustified `anon`-executable mutators: **0**.
