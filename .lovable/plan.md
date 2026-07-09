## Root cause

`return_data_revisions` has RLS policies but **no `GRANT` privileges** to any Data API role. PostgREST needs an explicit `GRANT SELECT ... TO authenticated` (RLS alone is not enough) — without it, the client-side query returns zero rows for every user, including admins.

Confirmed via DB inspection:
- Two revisions exist for the current return (`submitted` + `resubmitted`), so the licensee's resubmission was captured correctly.
- `information_schema.role_table_grants` shows no grants on `public.return_data_revisions`.
- The frontend disables **Compare Versions** when `revisions.length < 2`; since the client sees 0 rows, the button is always disabled.

The same GRANT gap likely affects `snapshot_return_revision` RPC callers using anon/authenticated JWT — worth verifying.

## Fix

Single migration adding the missing grants:

```sql
GRANT SELECT ON public.return_data_revisions TO authenticated;
GRANT ALL    ON public.return_data_revisions TO service_role;
```

No code changes to `useReturnRevisions`, `ReturnDetail.tsx`, or the compare dialog. RLS policies already restrict row visibility correctly to admins, stakeholders, PPoC, and external users; adding the grant only unblocks PostgREST from rejecting the request outright.

## Verification

After migration:
1. Reload `/admin/returns/queue/87a20403-...` as admin — badge next to **Compare Versions** should show `2`, button enabled.
2. Open dialog — confirm the resubmitted vs. submitted diff renders.
3. Licensee side (`/entity/returns/:id/view`) still works (policy already covers stakeholders).