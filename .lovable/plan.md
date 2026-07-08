## Problem

Runtime form rendering keys values by `fieldName` from `form_versions.schema_snapshot` (JSONB). The previous fix deduped `form_fields` rows but never rewrote the snapshots, so existing published versions (v1.0 and v2.0 of "Balance Sheet", and any other affected template) still contain two entries sharing the same `fieldName` — causing values to bleed between the two 1.3.1 rows.

Confirmed in DB: snapshot for version `dead2bcf-…` (v1.0) contains two `line_1_3_1_col_1` items with different labels.

## Fix

**Single DB migration** that rewrites `form_versions.schema_snapshot` in place:

For every row in `form_versions`:
1. Walk each section in the snapshot array.
2. Within each section's `fields` array, track seen `fieldName` values.
3. On a duplicate, rename to `<original>_b`, `_c`, … (matching the suffix scheme already used in `form_fields` and in `FileImport.tsx`), preserving the first occurrence so any existing saved values on the first field remain intact.
4. Write the mutated JSONB back.

Implemented as a PL/pgSQL DO block using `jsonb_set` / `jsonb_array_elements`, so it handles every affected version (not just Balance Sheet) in one pass.

## Verification

After the migration, this query must return 0 rows:

```sql
SELECT fv.id, s->>'id' AS section_id, f->>'fieldName' AS field_name, count(*)
FROM form_versions fv,
     jsonb_array_elements(fv.schema_snapshot) s,
     jsonb_array_elements(s->'fields') f
GROUP BY 1,2,3
HAVING count(*) > 1;
```

Then reload the Balance Sheet return in the licensee portal and confirm the two 1.3.1 rows accept independent values.

## Out of scope

- No code changes (importer + form_fields dedupe are already fixed).
- No touching of previously submitted `return_form_data` — values remain attached to whichever `fieldName` they were saved under.
- `application_form_versions` snapshots are not touched (returns issue only); can be added later if the same symptom shows up for applications.