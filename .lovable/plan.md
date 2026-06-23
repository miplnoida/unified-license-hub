## Goal
Hide Min and Max cap inputs in the Fee Management dialog. They're not needed in this app.

## Change (single file: `src/pages/admin/FeeManagement.tsx`)

1. **Remove the Min and Max input cells** from the Fee Type Amounts row (lines ~688–698) so each row only shows: Calculation Type + Amount (and currency note).
2. **Drop the Min/Max validation branches** in `handleSave` (lines ~265–271). Keep only the `amount >= 0` check.
3. **Persist sane defaults** when building the row (lines ~337–338): always save `min_amount: 0` and `max_amount: null`. This keeps the existing DB schema untouched.
4. **Edit-mode prefill** (lines ~226–227): stop reading min/max into state. The `FeeTypeRow` state will keep `minAmount`/`maxAmount` as `''` internally so nothing else breaks, but those fields are no longer surfaced or edited.

## Out of scope
- No DB migration (columns stay; new rows write defaults).
- No changes to listings, calculation logic elsewhere, Free/Paid toggle, or any other module.
- No styling changes beyond removing the two cells.
