## Problem

Creating a fee in Admin → Fee Management fails with:

> invalid input syntax for type uuid: "null"

## Cause

In `src/pages/admin/FeeManagement.tsx` (`handleSave`, line ~299), the duplicate-check query does:

```ts
.eq('regulator_id', activeRegulatorId || null as any)
```

When `activeRegulatorId` is empty (no active regulator selected, or super-admin context where the context value is `null`), PostgREST serializes this as `regulator_id=eq.null`, and Postgres tries to cast the literal string `"null"` to UUID → the exact error shown.

The sector/sub-sector lines right below already handle this correctly using `.is(col, null)` when the value is empty. The `regulator_id` filter just missed that pattern.

## Fix

One-line behavior change in `src/pages/admin/FeeManagement.tsx`:

Replace:
```ts
.eq('regulator_id', activeRegulatorId || null as any);
```
with the conditional pattern used for sector/sub-sector:
```ts
let dupQuery = supabase
  .from('fee_configurations' as any)
  .select('id, fee_type, category_id, service_id, form_id');
dupQuery = activeRegulatorId
  ? dupQuery.eq('regulator_id', activeRegulatorId)
  : dupQuery.is('regulator_id', null);
```

No other code, schema, or workflow changes. Non-renewal fee creation, edit, and the existing sector/sub-sector duplicate logic stay identical.

## Verification

- Create a fee with no active regulator → succeeds (or returns a real duplicate message, never the UUID cast error).
- Create a fee with an active regulator → still scoped correctly.
- Duplicate guard still blocks identical (regulator + sector + sub-sector + scope + fee type) combos.
- Build + tsgo pass.
