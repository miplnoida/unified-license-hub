# Hardening verification

Idempotent end-to-end checks for RLS, workflow RPCs, and the application
list/CSV export. Runs against the live project DB; safe to re-run (seeds and
cleans up its own fixtures).

## Run

```bash
npm run verify:hardening
```

Exit code `0` = all acceptance checks passed. Non-zero = at least one failed
(the failing check name is printed).

## Setup

The script needs the standard PostgreSQL environment variables:

| Var          | Example                               |
|--------------|---------------------------------------|
| `PGHOST`     | `aws-1-eu-west-1.pooler.supabase.com` |
| `PGPORT`     | `6543`                                |
| `PGDATABASE` | `postgres`                            |
| `PGUSER`     | `postgres.<project-ref>`              |
| `PGPASSWORD` | (DB password)                         |

- **Lovable Cloud sandbox**: variables are pre-set; just run `npm run verify:hardening`.
- **Local Supabase**: `supabase start`, then export the values from
  `supabase status` (or `supabase db url`).

The DB user must have `BYPASSRLS` (sandbox/postgres role) so the script can
seed and clean fixtures across multiple users in one transaction.

## What it covers

31 checks across three layers:

**RLS / security (10):**
applicant cannot insert audit logs · applicant cannot insert notifications ·
workflow-locked columns are trigger-protected · `user_roles` writes require
`super_admin` · signup metadata cannot grant internal roles ·
`authenticated` cannot EXECUTE service-only RPCs (`perform_workflow_transition`,
`perform_final_workflow_approval`) · documents bucket upload is path-scoped ·
documents read is ownership-scoped · applications read is applicant-scoped.

**Workflow (12):** wrong approver rejected · `request_info` and `delegate`
rejected · `send_back` from first step rejected · stale step / stale instance
rejected · empty `allowed_actions` rejected · non-final approve advances one
step · `escalate` from last step rejected · final approve creates
license + licensee · final-approve retry is idempotent (no duplicate license,
licensee, or `approve_final` action) · `request_resubmission` pauses workflow ·
resubmission resumes workflow.

**List / export (6):** applicant sees only own apps · applicant cannot read
another applicant's app via the list RPC · internal users see `in_progress` ·
internal users do NOT see drafts · pagination caps at `page_size` rows ·
status filter is honored (CSV export uses the same RPC, so the filter +
permission contract carries over).

## Adding a check

Append to `scripts/verify-hardening.sql` inside the `DO $verify$` block.
Increment `v_pass` on success, `v_fail` on failure, and `v_skip` if a
prerequisite is missing. The block raises an exception at the end whenever
`v_fail > 0`, which surfaces as a non-zero exit code from
`npm run verify:hardening`.
