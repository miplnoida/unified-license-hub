## Fix "Could not find the 'licensees' column of 'prudential_assessments'"

### Root cause
`src/hooks/usePrudentialSupervision.ts` selects `*, licensees(name)` from `prudential_assessments`. The FK to `licensees` is on the column `entity_id`, not `licensees`, so PostgREST can't resolve the embed by that alias and reports it as a missing column.

### Change
In `src/hooks/usePrudentialSupervision.ts` (lines 247 and 261), change the embed to explicitly reference the foreign key column:

```ts
.select('*, licensees:entity_id(name)')
```

This keeps the returned shape (`row.licensees.name`) identical, so no consumer code changes are needed.

### Scope
- One file, two lines.
- No DB migration (schema is correct; the FK already exists).
- No impact on other prudential features.