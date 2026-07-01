## Problem

When a licensee user creates a return, PostgREST runs:

```sql
WITH pgrst_source AS (
  INSERT INTO returns_filed (...) VALUES (...) RETURNING *
)
SELECT * FROM pgrst_source AS returns_filed
```

The final `SELECT` triggers the `SELECT` RLS policy `external_returns_filed_select_capability_gate` against the newly-inserted row. Its `USING` clause calls:

```sql
external_can_access_return_filed(auth.uid(), id, 'can_view_status')
external_can_access_return_filed(auth.uid(), id, 'can_submit_returns')
```

That helper re-queries the base table:

```sql
SELECT 1 FROM returns_filed r WHERE r.id = _return_id AND …
```

Inside the same INSERT statement Postgres uses the statement's own snapshot — the just-inserted row is not visible to that lookup, so the helper returns `false`, the `USING` clause is `false`, and Postgres reports:

> new row violates row-level security policy "external_returns_filed_select_capability_gate"

`INSERT WITH CHECK` uses the sibling helper `external_can_access_return_filed_values(...)` that receives the row's columns directly, which is why the INSERT gate passes but the SELECT gate fails.

## Fix

Rewrite the `external_returns_filed_select_capability_gate` policy to use the values-based helper (same one the INSERT gate uses), so it operates on the row columns already available in the policy context and doesn't re-query `returns_filed`.

### Migration

Drop and recreate the policy:

```sql
DROP POLICY IF EXISTS external_returns_filed_select_capability_gate
  ON public.returns_filed;

CREATE POLICY external_returns_filed_select_capability_gate
  ON public.returns_filed
  FOR SELECT
  USING (
    (NOT public.has_external_role(auth.uid()))
    OR public.external_can_access_return_filed_values(
         auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, 'can_view_status'
       )
    OR public.external_can_access_return_filed_values(
         auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, 'can_submit_returns'
       )
  );
```

Same effective access, but evaluable against the newly-inserted row.

### Out of scope

- Do not touch the INSERT / UPDATE gates — they already use the values helper and work correctly.
- No changes to `has_portal_capability`, `has_external_role`, or the helper functions.
- Do not alter internal/admin policies (`Users manage own returns`, PPOC policies) — they already work.

### Verification

- Bharat (`bharatd@yopmail.com`, licensee_primary with `returns_management.submit`) can create a new return without the RLS error.
- Existing reads of prior returns still respect capability — the values-based check evaluates the same way for existing rows.
- Internal roles are unaffected because the first `NOT has_external_role(...)` branch short-circuits.
