## Problem

On the admin Return Detail view, the "Accounting Totals" summary card (screenshot 2) never renders even though it was wired in. On the licensee "Review & Submit" view the same card shows correctly.

Root cause: `AccountingReconciliationPanel` expects each form as `{ formId, templateName }`, and returns `null` when neither a Balance Sheet nor a P&L form is detected. The licensee page (`FillReturnPage.tsx`) maps its list into that shape, but the admin page (`ReturnDetail.tsx`) passes the raw `orderedForms` objects (`form_id`, `form_templates.name`), so `detectFormRoles` sees empty names, finds no BS/P&L, and the panel bails out.

## Fix (admin-only, presentation change)

In `src/pages/returns-mgmt/ReturnDetail.tsx`, at the `<AccountingReconciliationPanel ... />` usage (~line 798), map `orderedForms` to the shape the panel expects — same mapping the licensee page already uses:

```tsx
<AccountingReconciliationPanel
  allData={valuesByForm}
  forms={orderedForms.map((cf: any) => ({
    formId: cf.form_id,
    templateName: cf.form_templates?.name,
  }))}
  summaryOnly
/>
```

No changes to reconciliation logic, licensee flow, validation gating, or any other admin functionality. `summaryOnly` stays on so the admin sidebar shows only the 18-row totals table without the pass/fail badges or check pills.

## Verification

- Open an admin Return Detail for a return that has Balance Sheet and P&L forms filled (e.g., FinCorp Commercial Bank quarterly return). The "Accounting Totals" card should appear in the right sidebar below the ratios panel, listing Total Assets, Total Liabilities, Total Equity, Total Income, Total Expenses, Pre-tax Profits, and the other summary rows.
- Confirm the licensee "Review & Submit" panel still renders the full reconciliation view (with pass/fail badges) unchanged.