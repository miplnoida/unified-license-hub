# Approval memo: database write grants for seven returns / appeals tables

## Why this memo exists

Six of these tables already carry row-level-security **write** policies, which
means writes were intended to be possible for authorised officers. But the
signed-in app role (`authenticated`) has no table-level **INSERT / UPDATE /
DELETE** grant on them, so the database refuses the write *before* row-level
security is ever consulted. The intended policies can therefore never be
exercised, and the screens that write to these tables fail.

This was proven live in the browser, not inferred:

- Screen: **Returns → Manage Validations** (`/admin/returns/validations`).
- Action: select a return configuration, **Add Rule**, fill Name / Expression /
  Error Message, **Save**.
- Result: two HTTP **403** responses
  (`/rest/v1/return_validation_rules`), the dialog stays open, nothing is
  stored, and the user is shown the raw database text
  **“permission denied for table return_validation_rules”**.

A source scan of every direct browser write found 52 written tables; these seven
are the ones whose grant does not match the write the app performs.

## Exact SQL to be applied

```sql
-- Table-level DML for the signed-in app role only.
-- No new roles, no grants to `anon`, no policy created / altered / dropped,
-- no RLS disabled. Row-level security remains the row-level boundary.

GRANT INSERT, UPDATE, DELETE ON TABLE public.return_validation_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.return_due_dates        TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.return_form_data        TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.return_comments         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.return_requests         TO authenticated;
GRANT INSERT              ON TABLE public.license_appeal_events      TO authenticated;
```

## What row-level security will still require after the grants

The grant only makes the write *reachable*; the existing policies still decide
row by row, and they are unchanged:

| Table | Existing write condition (unchanged) |
| --- | --- |
| `return_validation_rules` | Super Admin **or** `returns_management.manage_config` |
| `return_due_dates` | Super Admin **or** `returns_management.manage_config` |
| `return_form_data` | insert/update: `can_mutate_return_filed(caller, return_id)`; delete: Super Admin **or** `returns_management.delete` |
| `return_comments` | insert: can read the filed return **and** (Super Admin **or** `returns_management.edit` **or** `returns_management.workflow_action` **or** `can_mutate_return_filed`); update: `can_mutate_return_filed`; delete: Super Admin **or** `returns_management.delete` |
| `return_requests` | insert: `returns_management.workflow_action` **or** `can_mutate_return_filed`; update: `returns_management.workflow_action` **or** Super Admin; delete: Super Admin only |
| `license_appeal_events` | insert: `can_read_license_appeal(caller, appeal_id)` |

So an officer without the relevant returns permission still cannot write, and no
user can touch a return or appeal they are not entitled to see.

## Security impact

- **Widens**: the ability to *attempt* a write on six returns/appeal tables for
  any signed-in user; row-level policies remain the actual gate.
- **Does not widen**: read access (already granted), `anon` access (no grant),
  write scope beyond the policies above, or any configuration-table lockdown.
- **Not included**: `audit_logs`. That table has **no INSERT policy at all**, so
  a browser insert is deliberately impossible. The fix there is code (write the
  audit entry server-side), not a grant — it is excluded from this SQL.

## Rollback

```sql
REVOKE INSERT, UPDATE, DELETE ON TABLE public.return_validation_rules FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.return_due_dates        FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.return_form_data        FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.return_comments         FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.return_requests         FROM authenticated;
REVOKE INSERT              ON TABLE public.license_appeal_events      FROM authenticated;
```

## Acceptance checks after approval

1. `/admin/returns/validations` → Add Rule → Save succeeds, the rule appears in
   the table, and `config_change_log` / audit evidence is written where the
   design requires it.
2. A returns officer **without** `returns_management.manage_config` still cannot
   save a validation rule (policy still refuses).
3. A primary user can save return form data and post a comment on a return they
   are entitled to; a user with no relationship to that return still cannot.
4. Appeal event logging stops failing silently.
5. No change to protected AML records, FSRA policy or the Rodney Bay demo data.

---

## Owner decision — 2026-11-25

**Keep on hold.** The six INSERT/UPDATE/DELETE grants were NOT applied. The Returns validation, due-date, form-data, comment and request screens and appeal event logging remain unable to save; users keep seeing the raw permission-denied message. Do not re-ask or apply without a new owner instruction.
