## Goal
Show the "Screenshot 2" totals summary (18 reconciliation metrics: Total Assets, Total Liabilities, Total Equity, Total Income, Total Expenses, Pre-tax Profit, etc.) on the **admin** Return Detail review page. No other behavior changes.

## Changes

### 1. `src/components/returns/AccountingReconciliationPanel.tsx`
- Add optional prop `summaryOnly?: boolean`.
- When `summaryOnly` is true:
  - Hide the top-right pass/fail badge.
  - Hide the three check pills grid.
  - Hide the failure hint text.
  - Render only the totals summary table (the "screenshot 2" content).
  - Card title changes to "Accounting Totals".
- Default (existing licensee Fill/Review usage) behavior unchanged.

### 2. `src/pages/returns-mgmt/ReturnDetail.tsx` (admin)
- Import `AccountingReconciliationPanel`.
- In the right-side sidebar, directly below the existing `ReturnValidationAndRatiosPanel` (line ~790), render:
  ```tsx
  <AccountingReconciliationPanel
    allData={valuesByForm}
    forms={orderedForms as any}
    summaryOnly
  />
  ```
- `orderedForms` already carries `form_templates.name`, which is what `detectFormRoles` matches against (Balance Sheet / P&L), so no reshaping needed.

## Not changed
- `FillReturnPage` (licensee submit gate) — untouched; keeps full panel with checks and blocking behavior.
- Reconciliation logic in `src/lib/returnsAccountingReconciliation.ts` — untouched.
- Tests — untouched.
