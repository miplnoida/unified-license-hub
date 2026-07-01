## Problem

Submit fails with "Validation engine unavailable: Edge Function returned a non-2xx status code". Edge logs show a 404 from `evaluate-return-prudential`.

Root cause is a schema mismatch in `supabase/functions/evaluate-return-prudential/index.ts` line 203:

```ts
.select("id, licensee_id, return_configuration_id, period_end")
```

The actual `returns_filed` table has **no** `licensee_id` column (it uses `entity_id` and `on_behalf_of_licensee_id`) and **no** `period_end` column (it's `period_end_date`). The failing select makes `rfErr` truthy, so the function returns `{ error: "Return not found" }` with status 404, which the client surfaces as the generic "Validation engine unavailable" toast.

## Fix

Edit `supabase/functions/evaluate-return-prudential/index.ts` only:

- Change the `returns_filed` select to real column names:
  ```ts
  .select("id, entity_id, on_behalf_of_licensee_id, return_configuration_id, period_end_date")
  ```
- No other code paths in the function reference `rf.licensee_id` or `rf.period_end`, so no downstream changes are needed. (`cfg = rf.return_configuration_id` is the only field actually used later.)

## Verification

- Re-run submit on the licensee return page. Expect a 2xx response from `evaluate-return-prudential` and the pre-submit validation flow to proceed (either "Submission Blocked" with rule errors, or continue to the SUB status transition).
- Recheck edge logs to confirm the 404 stops recurring.

No database migration, no client-side changes, no other functions affected.
