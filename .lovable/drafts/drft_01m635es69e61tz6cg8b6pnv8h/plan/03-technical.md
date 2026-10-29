## Technical details

**Staged migration (additive, `CREATE OR REPLACE` of `public.get_application_list_page`, same signature/return):** add one more `UNION` branch to `linked_applications`:

```sql
UNION
SELECT DISTINCT a.id AS application_id
FROM access_scope sc
JOIN public.applications a ON a.entity_id = sc.target_licensee_id
```

`access_scope` is unchanged (internal: none; external: own `profiles.licensee_id` or active `ppoc_entity_mappings`). Because of `DISTINCT`/`UNION`, no duplicate rows. The internal-user draft exclusion and all filters stay as they are.

**Security impact:** external users get read access through this RPC only to applications whose `entity_id` matches an institution they are already scoped to. No RLS, grant, role or table change. Opening application detail still goes through the existing access checks. If detail access turns out to be denied for these rows, I'll report that and won't widen anything else.

**Tests:** extend the existing SQL regression for this RPC with these cases: a member sees the entity's INITIAL application; a member of another entity cannot see it; the owner still sees their own applications; no duplicates. Re-run the applications-list Vitest suite.

**Verification:** check read-only as `rbc_primary_user@yopmail.com` once the change is applied (not possible inside the draft before you accept it). Then open the Pre-licensing tab in the browser and confirm `APP-2026-002011` appears. No publishing without your approval.
