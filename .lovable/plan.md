# Fix: "invalid input value for enum return_workflow_status: ''" on Request Edit

## Root cause

In the `request_return_edit` RPC (added last turn), the status guard reads:

```sql
IF upper(coalesce(v_return.workflow_status, '')) NOT IN ('SUB','VAL') THEN
```

`returns_filed.workflow_status` is of enum type `return_workflow_status`. `coalesce(enum, '')` forces Postgres to cast the text literal `''` to the enum, which fails because `''` is not one of the enum labels (`TEMP/WIP/SUB/VAL/TBR/REJ`). Postgres raises `invalid input value for enum return_workflow_status: ""` even when the row's status is non-null, causing every licensee "Request Edit" submission to fail.

`decide_return_edit_request` doesn't have this pattern, so admin decisions are unaffected.

## Fix

New migration that recreates `public.request_return_edit(uuid, text)` with the enum coerced to text before coalescing:

```sql
IF upper(coalesce(v_return.workflow_status::text, '')) NOT IN ('SUB','VAL') THEN
```

Everything else in the RPC (auth check, ownership check, duplicate-pending guard, insert into `return_edit_requests`, audit log write) stays identical.

## Verification

- Re-run typecheck (no FE changes).
- Manually invoke `request_return_edit` on a `SUB` return via the licensee UI; confirm success and a pending row appears with a `applicant_edit_requested` audit entry.
- Confirm the admin Allow/Deny path still works end-to-end (unchanged RPC).

## Out of scope

- No frontend changes.
- No changes to `decide_return_edit_request`, `return_edit_requests` table, RLS, or existing TBR/resubmit flow.
