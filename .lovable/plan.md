## Problem

`fee_configurations` has 9 rows, but only 6 show up in **Admin → Fee Management**. Three rows have `regulator_id = NULL` (legacy / pre-multi-regulator records), and the loader at `src/pages/admin/FeeManagement.tsx:129` filters strictly:

```ts
let query = supabase.from('fee_configurations').select('*').order(...);
if (activeRegulatorId) query = query.eq('regulator_id', activeRegulatorId);
```

`.eq('regulator_id', activeRegulatorId)` excludes the NULL rows, so they never render — the admin sees an incomplete list.

## Fix

Treat rows with `regulator_id IS NULL` as **global** fees that are visible under every regulator (matching how other admin lists in the project handle legacy unscoped rows). One small change in `loadFees`:

```ts
let query = supabase.from('fee_configurations').select('*').order('created_at', { ascending: false });
if (activeRegulatorId) {
  query = query.or(`regulator_id.eq.${activeRegulatorId},regulator_id.is.null`);
}
```

No other changes:
- No migration (the 3 NULL rows stay as global; if the user later wants to assign them to a specific regulator they can edit them from the UI).
- No change to `fee_rules` or `fee_types` (neither currently filters by regulator).
- No change to RLS, fee resolution logic, payments, or the create-fee form (UUID `"null"` issue from earlier turns is unrelated).

## Verification

- Open **Admin → Fee Management** with any regulator active → list should now show 9 rows (the 3 previously-hidden global ones plus the 6 regulator-scoped ones).
- Switch the active regulator → the 3 NULL/global rows stay visible; the 6 scoped rows are filtered to that regulator.
