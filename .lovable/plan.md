## Problem

When publishing a return form template from Admin → Form Management → Returns, the toast shows:

> Failed to update status: oldSections.map is not a function

Root cause: some existing published `form_versions.schema_snapshot` rows are stored as an **object** with shape `{ sections: [...] }` instead of a bare array. The publish path assumes an array:

```ts
// src/hooks/useFormTemplates.ts
const publishedSections = (lastPublished?.schema_snapshot || []) as FormSection[]; // still object
...
classifySchemaChange(publishedSections, draftSections)
  → const oldSectionIds = new Set(oldSections.map(s => s.id)); // crash
```

DB confirms: `form_versions.schema_snapshot` for the return template `d6e04a93-…` published row is jsonb type `object` with key `sections`, while the draft row is `array`.

## Fix

Normalize `schema_snapshot` to a `FormSection[]` at the read sites in `src/hooks/useFormTemplates.ts` so the publish flow never hands a non-array to `classifySchemaChange` (or to the `newSections`/`publishedSections` variables it uses later).

### Steps

1. Add a small helper in `useFormTemplates.ts`:
   ```ts
   function normalizeSchemaSnapshot(raw: unknown): FormSection[] {
     if (Array.isArray(raw)) return raw as FormSection[];
     if (raw && typeof raw === 'object' && Array.isArray((raw as any).sections)) {
       return (raw as any).sections as FormSection[];
     }
     return [];
   }
   ```

2. In the publish path of `useUpdateTemplateStatus` (around lines 970–971), replace:
   ```ts
   const draftSections     = (latestDraft.schema_snapshot     || []) as FormSection[];
   const publishedSections = (lastPublished?.schema_snapshot  || []) as FormSection[];
   ```
   with:
   ```ts
   const draftSections     = normalizeSchemaSnapshot(latestDraft?.schema_snapshot);
   const publishedSections = normalizeSchemaSnapshot(lastPublished?.schema_snapshot);
   ```

3. Defensive-guard the top of `classifySchemaChange` so any future call from elsewhere can't crash the same way:
   ```ts
   oldSections = Array.isArray(oldSections) ? oldSections : [];
   newSections = Array.isArray(newSections) ? newSections : [];
   ```

### Out of scope

- No schema migration. Existing object-shaped `schema_snapshot` rows are left alone; the next publish will overwrite the row with an array-shaped snapshot via the existing insert path, which already writes an array. If the user wants a one-off data cleanup migration later we can add it.
- No changes to the FormBuilder editor or Return Configuration UI.

### Verification

- Re-attempt publishing the previously-failing return form template — expect the success toast and a new `form_versions` row inserted with `schema_snapshot` as a JSON array.
- Publishing forms that already have an array-shaped `schema_snapshot` continues to work unchanged.
