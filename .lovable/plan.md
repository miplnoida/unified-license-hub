## Change
In `src/lib/returnsAccountingReconciliation.ts`, treat a check as passing when LHS, RHS, and Diff are all 0 — even if the underlying required fields are empty.

### Checks A and B
Change the `ok` condition from:
```
ok: !skipped && !missing && diff === 0
```
to:
```
ok: !skipped && diff === 0 && (!missing || (lhs === 0 && rhs === 0))
```
Because missing values are coerced to 0 for LHS/RHS display, when all inputs are blank both sides are 0 and diff is 0 → the check now passes. Any non-zero value on one side (partial fill) still fails as before.

### Check C (BS ↔ P&L link)
`lhs`, `rhs`, `diff` are already all 0 whenever it isn't skipped. Change:
```
ok: !skipped && !missing
```
to:
```
ok: !skipped
```
so an all-empty state (both forms present, no values) passes.

### Reason text
When the check is `ok` via the all-zero path, clear `reason` so no "Empty required value(s)" message is shown.

## Not changed
- `passed = checks.every(c => c.skipped || c.ok)` line stays.
- No UI, no test, no other files.
- Partial fills (e.g. Total Assets = 4,999.99 while Liab/Equity empty → RHS 0) still fail.

## Test update
Update the "form present but total fields empty" case in `src/test/returnsAccountingReconciliation.test.ts` to assert `passed: true` / `ok: true` for the all-empty scenario, matching the new rule. Keep the partial-fill failure case.
