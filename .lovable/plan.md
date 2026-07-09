## Problem

The reconciliation panel shows "All checks pass" even when Total Liabilities / Total Equity / all P&L totals are empty, so `handleSubmit`'s gate lets the return through. Root cause is in `src/lib/returnsAccountingReconciliation.ts`:

- Each check sets `skipped: true` whenever any required value is missing.
- `passed = checks.every(c => c.skipped || c.ok)` — so "missing values" is treated as a pass.

The user's rule is exact-match with zero tolerance and "all of the above" must block. Missing values on a form that IS present must therefore fail, not skip.

## Fix (single file: `src/lib/returnsAccountingReconciliation.ts`)

1. Change skip semantics: a check is only `skipped` when the corresponding form (BS or P&L) is not part of the return at all. If the form is present but values are missing, the check is a **failure** (`ok: false`, `skipped: false`) with a clear `reason` like "Total Liabilities is empty".
   - Missing values are treated as `0` for the LHS/RHS display so the diff is meaningful, but the check still fails because required inputs are absent.
2. Check C (BS ↔ P&L link): fails when either form is present but its required totals are missing; only skipped when one of the two forms is absent.
3. Keep `passed = checks.every(c => c.skipped || c.ok)` — now correct because missing-value cases no longer set `skipped`.

## UI impact (no other file changes needed)

`AccountingReconciliationPanel` already renders `ok/skipped/failed` states and the top-right badge derives from `result.passed`, so once the lib returns `passed: false` for the screenshot scenario:
- Badge flips to red "Blocks submit".
- The three check pills turn red with the "empty" reason.
- `FillReturnPage.handleSubmit` SweetAlert fires and aborts submission.

## Tests

Update `src/test/returnsAccountingReconciliation.test.ts`:
- Replace the "skips checks when required forms are missing" case to assert:
  - Form absent → check is `skipped` and result still `passed` (unchanged behavior when neither form is on the return).
  - **New**: Form present but total fields empty → check is NOT skipped, `ok:false`, `passed:false`.

No changes to `FillReturnPage.tsx`, the panel, or any workflow / prudential logic.
