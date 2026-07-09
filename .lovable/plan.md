## Scope

Two changes on the licensee-side Fill Return flow only. No admin/workflow logic touched.

---

## 1. Step 1 selector — show licensee's actual sector/sub-sector

**File:** `src/pages/entity/returns/CreateReturnPage.tsx` (lines 293–299 block).

Currently the info card renders `selectedConfig.sectors?.name || 'All'` — meaning "All" is displayed whenever the return config is un-scoped (multi-sector template). This is confusing because the return will actually be filed against the licensee's own sector.

**Fix:** join the active `licenseeScope` (already fetched, lines 67–78) with `sectors` / `sub_sectors` names via a small extra query, and render:

- `Sector: <licensee's sector name>`
- `Sub-Sector: <licensee's sub-sector name>` (fallback to `—` if the licensee has none)
- Keep `Return Type: <config.return_type>` as-is.

Fallback: if `licenseeScope` hasn't resolved yet, keep the existing config-level label.

---

## 2. Pre-submit accounting reconciliation gate

**File:** `src/pages/entity/returns/FillReturnPage.tsx`, inside `handleSubmit` (around line 383, immediately after `handleSave(true)` succeeds and BEFORE the `evaluate-return-prudential` invoke at line 398).

### 2a. New helper `src/lib/returnsAccountingReconciliation.ts`

Pure function that takes:
- the return's form data (already in memory as `allData` — same shape used by `computeAllRatios`),
- the list of forms on the return (already loaded via `configForms`),
- the templates behind each form (so we know which one is Balance Sheet vs P&L via `sheet_name` / `tab_name`).

Returns `{ passed: boolean, checks: Array<{ label, lhs, rhs, diff, ok }> }`.

**Three checks, all with exact-match tolerance (`diff === 0` after rounding to 2 decimals):**

| # | Rule | LHS | RHS |
|---|------|-----|-----|
| A | Balance Sheet balances | `BS.line_1_col_1` (Total Assets) | `BS.line_2_col_1 + BS.line_3_col_1` (Liabilities + Capital) |
| B | P&L reconciles | `PnL.line_4_col_1 − PnL.line_5_col_1` (Total Income − Total Expenses) | `PnL.line_10_col_1` (Pre-tax Profit) |
| C | BS ↔ P&L link | derived BS Total Income + Pre-tax Profits (`PnL.line_4_col_1`, `PnL.line_10_col_1`) | direct P&L values | (always equal by definition today, kept for completeness / future divergence) |

Form-template detection: Balance Sheet form = template whose name matches `/balance ?sheet/i`; P&L form = template whose name matches `/p&?l|profit.*loss/i`. Reuse the `templateById` lookup pattern already in `ViewReturnPage.tsx`.

Values are read via the same `formId.fieldKey → col_1` grammar the ratio engine uses (`resolveTokens` from `src/lib/returnsRatios.ts` — extract & reuse).

### 2b. Gate in `handleSubmit`

After save, before prudential eval:

```ts
const reconciliation = evaluateAccountingReconciliation(allData, configForms, templateById);
if (!reconciliation.passed) {
  await Swal.fire({
    title: 'Submission Blocked — Accounting Mismatch',
    html: renderReconciliationTable(reconciliation.checks),  // Ratios-style table like screenshot 2
    icon: 'error',
    confirmButtonText: 'Fix and Resubmit',
  });
  return;
}
```

Runs before `evaluate-return-prudential` so a mismatch aborts without a server round-trip.

### 2c. Always-visible reconciliation panel

New component `src/components/returns/AccountingReconciliationPanel.tsx`, rendered on the **Review** tab of `FillReturnPage` alongside the existing validation/ratios panel. Layout matches screenshot 2:

```
| Total Assets            | 2,30,064 |
| Total Equity            |   28,507 |
| Debt/Borrowings         |   11,347 |
| Capital Base            |   19,271 |
| NPLs                    |        0 |
| PDLs                    |        0 |
| Gross Loans             | 1,06,091 |
| Provisions              |    1,574 |
| Average Assets          | 2,30,064 |
| Average Equity          |   28,507 |
| Income Assets           | 2,05,649 |
| Average Income Assets   | 1,02,824 |
| Total Income            |    6,187 |
| Pre-tax Profits         |    1,360 |
| Interest Margin         |    3,732 |
| Gross Income            |    5,569 |
| Operating Expenses      |    3,760 |
| Liquid Assets           |   68,645 |
| Prescribed Liabilities  | 1,76,780 |
```

Values computed live using the same helper. Above the table, three status pills for checks A/B/C (green ✓ or red ✗ with the diff). Values right-aligned, 2-decimal, `text-xs`.

Row-to-formula mapping (from the worksheet — all references use current form data, no historical averages persisted so cross-period rows fall back to current-period values):

| Row | Formula |
|---|---|
| Total Assets | `BS.line_1_col_1` |
| Total Equity | `BS.line_3_col_1` |
| Debt/Borrowings | sum of BS deposit/borrowing sub-lines available on template |
| NPLs | `BS.line_1_5_1_3_2_col_1` |
| PDLs | `BS.line_8_4_col_1` |
| Gross Loans | `BS.line_1_4_col_1` |
| Provisions | `BS.line_3_3_3_4_col_1` |
| Liquid Assets | `BS.line_1_1_col_1` |
| Prescribed Liabilities | `BS.line_2_1_col_1` |
| Total Income | `PnL.line_4_col_1` |
| Pre-tax Profits | `PnL.line_10_col_1` |
| Interest Margin | `PnL.line_4_1_col_1 − PnL.line_5_1_col_1` |
| Efficiency inputs (Operating Expenses, Gross Income) | `PnL.line_5_col_1`, `PnL.line_4_col_1` |
| Average Assets / Equity / Income Assets | current-period value (no time-series yet) |

Rows whose source line codes don't exist on the current template render as `—` and don't block submit.

---

## Technical Details

- No DB schema changes.
- No edge function changes.
- New file: `src/lib/returnsAccountingReconciliation.ts` (pure logic + unit-testable).
- New file: `src/components/returns/AccountingReconciliationPanel.tsx`.
- Edited: `src/pages/entity/returns/CreateReturnPage.tsx`, `src/pages/entity/returns/FillReturnPage.tsx`.
- Reuses `resolveTokens`/`safeEval` from `src/lib/returnsRatios.ts` — no duplication of the formula parser.
- Tolerance: exact (rounded to 2 dp per user's answer).
- Unit test: `src/test/returnsAccountingReconciliation.test.ts` covering pass, BS-mismatch, and P&L-mismatch cases.

No changes to admin views, workflow, prudential engine, or ratio storage.