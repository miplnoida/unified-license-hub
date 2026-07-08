## Plan

1. **Patch the actual rendered snapshot source**
   - Add one database migration that rewrites `form_versions.schema_snapshot` for every version.
   - The previous DB fix updated `section.fields`, but the live renderer uses `section.rows[*].fields` when rows exist. The affected Balance Sheet v1.0 snapshot still has duplicate `fieldName` values inside `rows`, including the two 1.3.1 fields.

2. **Deduplicate both snapshot shapes in the same pass**
   - For each section, walk `rows[*].fields` in visual order and rename duplicate `fieldName`s to `_b`, `_c`, etc.
   - Rebuild `section.fields` from the corrected row fields so both structures match.
   - Preserve the first occurrence unchanged so existing saved values remain attached to the original field.

3. **Do not alter submitted values directly**
   - Leave `return_form_data` untouched. Existing values remain under their current field names.
   - The duplicated second field will now save independently under its corrected `_b`/`_c` key instead of sharing the first field’s value.

4. **Verify against the affected URL/data**
   - Run read-only checks after migration to confirm zero duplicate `fieldName`s remain in either `schema_snapshot[*].fields` or `schema_snapshot[*].rows[*].fields`.
   - Specifically check the Balance Sheet v1.0 version used by return `b100bd21-b90e-4cbf-b59f-20794db3e208` and confirm the two 1.3.1 rows have distinct keys.